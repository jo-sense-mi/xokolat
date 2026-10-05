// YOUR NUMBERS FOR SOMEONE ELSE'S CHECKPOINT — `<data>/registries/engine-params.json`.
//
// ⚠️ A SPARSE PATCH, NEVER A ROW. The registry's user layer REPLACES a shipped service whole
// (src/inference/registry.ts), and that is right for a service: a half-overridden `caps` is a
// capability nobody declared. It is exactly wrong for a knob. What is stored here is ONLY the
// fields you actually moved — so ↺ is a DELETE and the shipped number comes back on its own.
// There is no copy of the shipped value anywhere, which is why nothing can drift from it.
//
// ⚠️ ONLY WHAT THE APP KNOWS HOW TO SEND. The editable set is the medium's KNOB VOCABULARY
// (src/inference/knobs.ts), plus anything the registry declared for that checkpoint on top. It was
// the shipped keys ALONE until 2026-08-07, which was a rule with a fatal case: a service the user
// added declares nothing, every checkpoint on it is `discovered`, and the editor drew an empty
// panel. The rule was right to refuse an invented knob and wrong about who declares one — the app
// knows its own wire format, and that table is the authority.
//
// ⚠️ AND ONLY WHAT THE CHECKPOINT CAN ACTUALLY DO. `steps` on a step-distilled model is refused
// here rather than at render time: a stored 20 that every render rejects is a setting that looks
// applied and is not.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { resolveIn } from '../paths.ts'
import type { Roots } from '../paths.ts'
import type { Caps } from '../types/caps.ts'
import type { Medium } from '../types/medium.ts'
import type { ParamValue, Params } from '../types/request.ts'
import { asObject, asParams, ctx } from '../validate.ts'
import { knobFor, knobProblem, knobsFor } from './knobs.ts'

/** Where the patch lives, relative to the app-data root. Its own file rather than a section of
 *  the registry: one is the machine's shape, the other is your taste, and they are edited by
 *  different things at different times. */
export const TUNING_FILE = 'registries/engine-params.json'

/** `<service id>/<engine file>` — the same pair that names a master. */
export const tuningKey = (service: string, file: string): string => `${service}/${file}`

export interface LoadedTuning {
  /** key → the fields that were moved. Absent key means nothing was. */
  readonly byEngine: ReadonlyMap<string, Params>
  readonly issues: readonly string[]
}

export const NO_TUNING: LoadedTuning = { byEngine: new Map(), issues: [] }

export class TuningError extends Error {
  readonly status = 400

  constructor(message: string) {
    super(message)
    this.name = 'TuningError'
  }
}

/** Read the patch. A missing file is the normal case and reads as "nothing moved". */
export async function readTuning(roots: Roots): Promise<LoadedTuning> {
  const path = resolveIn(roots.data, TUNING_FILE)
  let text: string
  try {
    text = await readFile(path, 'utf-8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return NO_TUNING
    return { byEngine: new Map(), issues: [`${path}: ${(err as Error).message}`] }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    return { byEngine: new Map(), issues: [`${path}: not valid JSON — ${(err as Error).message}`] }
  }
  const c = ctx(path)
  const byEngine = new Map<string, Params>()
  const root = asObject(c, parsed, '')
  const engines = root?.['engines'] === undefined ? {} : asObject(c, root['engines'], 'engines')
  for (const [key, value] of Object.entries(engines ?? {})) {
    const params = asParams(c, value, `engines[${JSON.stringify(key)}]`)
    // ⚠️ A ROTTED KEY IS KEPT, NOT DROPPED. The service may simply not be running, or the
    // checkpoint may be on the other machine — and silently forgetting the numbers you set for a
    // model you still own is worse than carrying a line nothing reads today.
    if (params && Object.keys(params).length) byEngine.set(key, params)
  }
  return { byEngine, issues: c.issues }
}

/** What one engine actually runs at. Empty when nothing was moved. */
export const tunedFor = (tuning: LoadedTuning, service: string, file: string | null): Params =>
  (file ? tuning.byEngine.get(tuningKey(service, file)) : undefined) ?? {}

/** One service's patches, re-keyed by engine file — the shape `resolveEngines` merges. */
export function tunedByFile(tuning: LoadedTuning, service: string): Map<string, Params> {
  const prefix = `${service}/`
  const out = new Map<string, Params>()
  for (const [key, params] of tuning.byEngine) {
    if (key.startsWith(prefix)) out.set(key.slice(prefix.length), params)
  }
  return out
}

export interface Patch {
  /** Fields to store. */
  readonly set: Params
  /** Fields to forget — `↺`, which restores the shipped value by having none of its own. */
  readonly unset: readonly string[]
}

/** Which knobs may be moved on one checkpoint: the medium's vocabulary, plus anything the
 *  registry declared for it that the vocabulary does not know about. The second half is why a
 *  registry can describe a knob this build cannot spell — it stays editable, and the adapter that
 *  reads it decides what it means. */
export function editableKnobs(medium: Medium | null, shipped: Params): readonly string[] {
  const known = knobsFor(medium).map((k) => k.key)
  return [...known, ...Object.keys(shipped).filter((k) => !known.includes(k))]
}

/**
 * Check one edit against what the app can send and what the checkpoint can do.
 *
 * `null` means ↺ that field. Everything else must be a knob of this medium (or one the registry
 * declared for this checkpoint), inside the range that knob has.
 */
export function checkPatch(shipped: Params, caps: Caps, medium: Medium | null, want: unknown): Patch {
  if (!want || typeof want !== 'object' || Array.isArray(want)) {
    throw new TuningError('params is an object of knob → value (or null to reset one)')
  }
  const set: Record<string, ParamValue> = {}
  const unset: string[] = []
  const entries = Object.entries(want as Record<string, unknown>)
  if (!entries.length) throw new TuningError('nothing to change')

  for (const [key, value] of entries) {
    const knob = knobFor(medium, key)
    const was = shipped[key]
    if (!knob && was === undefined) {
      throw new TuningError(
        `nothing here sends a ${JSON.stringify(key)} — a knob has to be one this app knows how to put on the wire`,
      )
    }
    if (value === null) { unset.push(key); continue }
    if (knob) {
      const bad = knobProblem(knob, value)
      if (bad) throw new TuningError(bad)
    } else if (typeof value !== typeof was) {
      // Declared by the registry and unknown to this build: the shipped value is the only thing
      // that says what shape it is, and a knob that changes type is two knobs sharing a name.
      throw new TuningError(`${key} is a ${typeof was} on this checkpoint (got ${JSON.stringify(value)})`)
    }
    // A locked step count is a fact about the checkpoint, not a default it prefers. Storing 20
    // for a 4-step distilled model would be a setting every render then refuses.
    if (key === 'steps' && caps.stepsLocked !== null) {
      throw new TuningError(`this checkpoint runs a fixed ${caps.stepsLocked} steps — that is not a number it has`)
    }
    set[key] = value as ParamValue
  }
  return { set, unset }
}

/**
 * Apply one engine's patch and write the file back.
 *
 * ⚠️ AN EMPTY ENTRY IS REMOVED, not stored as `{}`. "I reset all of them" and "I never touched
 * this one" are the same state, and a file that can spell it two ways is a file that will.
 */
export async function writeTuning(
  roots: Roots, key: string, patch: Patch,
): Promise<Params> {
  const { byEngine } = await readTuning(roots)
  const next = new Map(byEngine)
  const merged: Record<string, ParamValue> = { ...(next.get(key) ?? {}), ...patch.set }
  for (const k of patch.unset) delete merged[k]
  if (Object.keys(merged).length) next.set(key, merged)
  else next.delete(key)

  const path = resolveIn(roots.data, TUNING_FILE)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify({
    $comment: 'Your numbers, over the shipped ones. ONLY the fields you moved are here — delete a'
      + ' field (or the whole entry) and the checkpoint\'s own value comes back. Keyed'
      + ' <service id>/<engine file>. Written by the app; hand-editable.',
    engines: Object.fromEntries([...next].sort(([a], [b]) => a.localeCompare(b))),
  }, null, 2)}\n`, 'utf-8')
  return merged
}
