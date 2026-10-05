// Knobs: where they come from, and what happens when one is out of range.
//
// ⚠️ A VIOLATION IS REJECTED WITH A NAMED ERROR, NEVER SILENTLY CLAMPED (PLAN §4). The UI
// builds its controls from `caps`, so a rejection means a bug or a hand-made request — and
// quietly substituting a different value is exactly the silent-wrong-answer failure the plan
// exists to prevent. A user who asked for 2048 and got 1536 without being told has a mystery,
// not a picture.
//
// Precedence, widest to narrowest: the engine ROW's defaults → the chosen MODEL's shipped params
// → YOUR patch for that model → the request's shared `params` → that engine's own `params`.
// Narrower always wins, and only the row's defaults are allowed to be absent.
//
// The model sits between the engine and the request because that is exactly what it is: narrower
// than "Draw Things", wider than "what this person asked for". Putting it there is what makes
// picking klein mean 4 steps and picking SDXL mean 16 without either number being typed.
//
// Your patch sits directly on top of the shipped model params because it is the same KIND of
// fact — what this checkpoint runs at — only yours (src/inference/tuning.ts). It is above the
// shipped number and below the request for the same reason: a knob you set once is a default,
// and a default never outranks the sentence in hand.

import type { Caps } from '../types/caps.ts'
import type { InferenceRow } from '../types/inference.ts'
import type { InferenceSelection, GenerationRequest, ParamValue, Params } from '../types/request.ts'
import { paramsFor } from './engines.ts'
import { STEP_RANGE, knobFallback } from './knobs.ts'

export class ParamError extends Error {
  readonly param: string

  constructor(param: string, message: string) {
    super(message)
    this.name = 'ParamError'
    this.param = param
  }
}

/** Which checkpoint this press is for, before anything is merged. Only the explicit answers —
 *  the fallback to the engine's default model needs the catalog and lives in `startRun`. */
export function askedEngine(
  row: InferenceRow, request: GenerationRequest, choice: InferenceSelection,
): string | null {
  const asked = choice.params?.['model'] ?? request.params?.['model'] ?? row.defaults?.['model']
  return typeof asked === 'string' && asked ? asked : null
}

export function mergeParams(
  row: InferenceRow, request: GenerationRequest, choice: InferenceSelection, model: string | null,
  /** What you retuned this checkpoint to, if anything (src/inference/tuning.ts). Sparse — only
   *  the fields that were moved, so an untouched knob is simply not here. */
  tuned: Params = {},
  /**
   * WHAT THE CHOSEN STYLE BRINGS (src/types/style.ts `params`).
   *
   * ⚠️ ITS PLACE IN THE STACK IS THE WHOLE DESIGN. Above the engine's defaults, because a generic
   * 120 bpm must not beat the genre somebody picked; below `tuned` and the request, because the
   * workflow pins what must not move and a number typed for THIS press is the most specific thing
   * anybody said. Get the order wrong in either direction and one of the two controls stops
   * working while both keep looking like they work.
   */
  styled: Params = {},
): Params {
  return {
    ...row.defaults,
    ...paramsFor(row, model),
    ...styled,
    ...tuned,
    // The resolved model is written in explicitly: it may have come from the engine's default
    // rather than from anything in the request, and the adapter reads it from here.
    ...(model ? { model } : {}),
    ...request.params,
    ...choice.params,
  }
}

function number(params: Params, key: string, fallback: number): number {
  const v = params[key]
  if (v === undefined) return fallback
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new ParamError(key, `${key} must be a number (got ${JSON.stringify(v)})`)
  }
  return v
}

function string(params: Params, key: string): string | undefined {
  const v = params[key]
  if (v === undefined) return undefined
  if (typeof v !== 'string') throw new ParamError(key, `${key} must be a string (got ${JSON.stringify(v)})`)
  return v
}

/** The knobs every image engine shares, resolved and checked. Engine-specific extras stay in
 *  the bag and are the adapter's business. */
export interface ImageKnobs {
  readonly width: number
  readonly height: number
  readonly steps: number
  readonly seed: number
  readonly negative: string
}

/** A seed the user did not choose. 32 bits, because that is what the engines take. */
export const randomSeed = (): number => Math.floor(Math.random() * 0xffff_ffff)

export function resolveImageKnobs(caps: Caps, params: Params): ImageKnobs {
  const [minRes, maxRes] = caps.resolution
  const width = number(params, 'width', 1024)
  const height = number(params, 'height', 1024)
  for (const [name, value] of [['width', width], ['height', height]] as const) {
    if (!Number.isInteger(value) || value < minRes || value > maxRes) {
      throw new ParamError(name, `${name} must be a whole number between ${minRes} and ${maxRes} for this engine (got ${value})`)
    }
  }

  // A locked step count is not a suggestion: a 4-step distilled checkpoint asked for 30 steps
  // does not render better, it renders wrong.
  // The unset value comes from the KNOB TABLE, so what the ⚙ editor shows as the placeholder is
  // the number this line would really use (src/inference/knobs.ts).
  const steps = number(params, 'steps', caps.stepsLocked ?? (knobFallback('image', 'steps') as number))
  if (caps.stepsLocked !== null && steps !== caps.stepsLocked) {
    throw new ParamError('steps', `this engine runs a fixed ${caps.stepsLocked} steps, so ${steps} is not something it can do`)
  }
  const [minSteps, maxSteps] = STEP_RANGE
  if (!Number.isInteger(steps) || steps < minSteps || steps > maxSteps) {
    throw new ParamError('steps', `steps must be a whole number between ${minSteps} and ${maxSteps} (got ${steps})`)
  }

  const seed = number(params, 'seed', randomSeed())
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new ParamError('seed', `seed must be a whole number between 0 and ${0xffff_ffff} (got ${seed})`)
  }

  const negative = string(params, 'negative') ?? ''
  if (negative && !caps.negatives) {
    // Accepting it and dropping it silently is the worst option: the user would keep writing
    // negative prompts that do nothing and never learn why.
    throw new ParamError('negative', 'this engine has no negative prompt — say what you DO want instead')
  }

  return { width, height, steps, seed, negative }
}

/** Everything that was actually used, for the provenance record. Knob values only — the record
 *  keeps `prompt`, `seed` and `model` in their own fields. */
export function usedParams(params: Params, knobs: ImageKnobs): Params {
  const out: Record<string, ParamValue> = { ...params, width: knobs.width, height: knobs.height, steps: knobs.steps }
  delete out['seed']
  delete out['negative']
  return out
}
