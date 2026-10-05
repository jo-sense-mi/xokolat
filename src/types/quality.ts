// QUALITY — how good a master is written, per medium.
//
// ⚠️ IMAGES ONLY, AND THE TABLE IS NOT A SCAFFOLD (2026-08-23). It was keyed by medium against the
// day music would want a bitrate and video a CRF, and it grew a settings section of its own to
// hold the general case — one card, one medium, on a page called 🖼 media that xoko described to
// somebody as a disk-usage report. Nothing but image has a second way to be written: audio comes
// out of a graph at whatever its save node was published with, and a mesh is bytes. The map stays
// keyed by medium because that is what it IS, but the general case is not built for and the
// control lives in 🖼 images, beside the press it affects.
//
// ⚠️ A SETTING THAT NAMES A MEDIUM BELONGS IN THAT MEDIUM'S SECTION. That is the rule this move
// establishes: global settings keeps only what has no medium — where files live, which library,
// which brain. Everything else is a control on the page where you would look for it.
//
// ⚠️ THE LEVEL NAMES ARE THE THING ITSELF NOW. They were `balanced` and `exact`, which is how a
// vendor describes a slider it does not want to explain — nobody can tell from `balanced` what
// they are getting or what it costs. `webp-q92` and `lossless` are what actually happens, they are
// the words somebody would search for, and the size is beside them. The id is what a provenance
// record stores, so it says which encode a master got rather than which adjective was selected.

import type { Medium } from './medium.ts'

export interface QualityLevel {
  readonly id: string
  readonly label: string
  /** One short line, shown under the choice. The RATIONALE lives in DECISIONS.md — a settings
   *  section gets a word and a number, never a paragraph. */
  readonly note: string
}

export interface QualityScale {
  readonly levels: readonly QualityLevel[]
  readonly fallback: string
}

export const QUALITY: Readonly<Partial<Record<Medium, QualityScale>>> = {
  image: {
    fallback: 'webp-q92',
    levels: [
      { id: 'webp-q92', label: 'WebP q92', note: 'lossy, about 110 kB a picture. Right for almost everything.' },
      { id: 'lossless', label: 'WebP lossless', note: 'about 620 kB. Every pixel as the engine made it — line art, cutouts, print.' },
    ],
  },
}

/** The media that have something to choose, in `MEDIA` order. */
export const MEDIA_WITH_QUALITY = Object.keys(QUALITY) as readonly Medium[]

export const scaleFor = (medium: Medium): QualityScale | null => QUALITY[medium] ?? null

/** Is `level` a level this medium declares? Anything else is refused rather than clamped — the
 *  same discipline as `caps` (PLAN §4). */
export function isQualityLevel(medium: Medium, level: string): boolean {
  return scaleFor(medium)?.levels.some((l) => l.id === level) ?? false
}

/** What a medium is written at, given the user's choices. Unset is the normal case. */
export function qualityFor(
  chosen: Readonly<Partial<Record<Medium, string>>>, medium: Medium,
): string {
  const picked = chosen[medium]
  if (picked && isQualityLevel(medium, picked)) return picked
  return scaleFor(medium)?.fallback ?? 'webp-q92'
}
