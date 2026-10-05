// Reading `caps` — and the one default in the app that is deliberately unhelpful.

import type { Caps, CapsPatch } from '../types/caps.ts'
import { IDIOMS, STRUCTURED_MODES } from '../types/caps.ts'
import type { Ctx } from '../validate.ts'
import { asBand, asBoolean, asEnum, asNumber, asObject, issue, noStrayKeys } from '../validate.ts'

/**
 * What a row with no `caps` gets: MINIMAL, NOT PERMISSIVE (PLAN §4). An engine that claims
 * nothing gets nothing — no negative prompt, no batching — because the
 * alternative is inferring a capability from a model's name, which is exactly how the two
 * Draw Things engines get confused for each other.
 *
 * The resolution band is the one place this cannot be maximally strict: a band of [512, 512]
 * would refuse every real request and read as a bug rather than as a missing declaration. An
 * engine that can do more says so in its row.
 */
export const MINIMAL_CAPS: Caps = {
  negatives: false,
  idiom: 'prose',
  words: [20, 120],
  resolution: [512, 1024],
  stepsLocked: null,
  batch: false,
}

const CAPS_KEYS = [
  'negatives', 'idiom', 'words', 'resolution', 'stepsLocked', 'batch', 'structured',
] as const

/** Every field is required except `structured` — a half-declared `caps` is the ambiguity the
 *  whole shape exists to remove, so it is an error rather than a merge with the minimum. */
export function parseCaps(c: Ctx, v: unknown, path: string): Caps | undefined {
  const o = asObject(c, v, path)
  if (!o) return undefined
  noStrayKeys(c, o, path, CAPS_KEYS)

  const negatives = asBoolean(c, o['negatives'], `${path}.negatives`)
  const idiom = asEnum(c, o['idiom'], `${path}.idiom`, IDIOMS)
  const words = asBand(c, o['words'], `${path}.words`)
  const resolution = asBand(c, o['resolution'], `${path}.resolution`)
  const batch = asBoolean(c, o['batch'], `${path}.batch`)

  const stepsLocked = o['stepsLocked'] === null
    ? null
    : asNumber(c, o['stepsLocked'], `${path}.stepsLocked`, { int: true, min: 1 })

  const structured = o['structured'] === undefined
    ? undefined
    : asEnum(c, o['structured'], `${path}.structured`, STRUCTURED_MODES)

  if (negatives === undefined || idiom === undefined || !words || !resolution
    || batch === undefined || stepsLocked === undefined) return undefined

  return {
    negatives, idiom, words, resolution, stepsLocked, batch,
    ...(structured === undefined ? {} : { structured }),
  }
}

/**
 * A MODEL's caps: every field optional, because it is a delta over something complete.
 *
 * The asymmetry with `parseCaps` is deliberate and is the whole reason both functions exist. An
 * engine that half-declares has left a capability undeclared and that is an error; a model that
 * half-declares has said "this one differs here and nowhere else", which is the normal case —
 * klein changes `stepsLocked` and `negatives` and nothing else about Draw Things.
 */
export function parseCapsPatch(c: Ctx, v: unknown, path: string): CapsPatch | undefined {
  const o = asObject(c, v, path)
  if (!o) return undefined
  noStrayKeys(c, o, path, CAPS_KEYS)
  if (!Object.keys(o).length) {
    issue(c, path, 'an empty caps patch changes nothing — leave it out instead')
    return undefined
  }

  const patch: Record<string, unknown> = {}
  const put = (key: string, value: unknown): void => {
    if (value !== undefined) patch[key] = value
  }
  if ('negatives' in o) put('negatives', asBoolean(c, o['negatives'], `${path}.negatives`))
  if ('idiom' in o) put('idiom', asEnum(c, o['idiom'], `${path}.idiom`, IDIOMS))
  if ('words' in o) put('words', asBand(c, o['words'], `${path}.words`))
  if ('resolution' in o) put('resolution', asBand(c, o['resolution'], `${path}.resolution`))
  if ('batch' in o) put('batch', asBoolean(c, o['batch'], `${path}.batch`))
  if ('structured' in o) put('structured', asEnum(c, o['structured'], `${path}.structured`, STRUCTURED_MODES))
  if ('stepsLocked' in o) {
    // `null` is a MEANINGFUL patch value — "this engine locks steps, this checkpoint does not"
    // — so it cannot be folded into the absent case the way it can everywhere else.
    patch['stepsLocked'] = o['stepsLocked'] === null
      ? null
      : asNumber(c, o['stepsLocked'], `${path}.stepsLocked`, { int: true, min: 1 })
    if (patch['stepsLocked'] === undefined) delete patch['stepsLocked']
  }
  return Object.keys(patch).length ? (patch as CapsPatch) : undefined
}

/** Engine ← model, in that order. The result is always complete, which is what every consumer
 *  (the param check, the prompt composer, the ⚙ band) is entitled to assume. */
export function applyCapsPatch(base: Caps, patch: CapsPatch | undefined): Caps {
  return patch ? { ...base, ...patch } : base
}
