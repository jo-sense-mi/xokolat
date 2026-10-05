// THE KINDS — what can be asked for, as data (`registries/kinds.json`).
//
// ⚠️ WHY THIS IS NOT A UNION IN A .ts FILE (2026-08-12). It was: `t2i · i2i · edit · style ·
// inpaint`, five words, closed. content-factory's real palette — 23 workflows over 6 checkpoints,
// which is what a machine looks like after a month of use — does not fit in it: `sdxl-face` keeps
// an IDENTITY and is not `style`, `sdxl-canny` follows a SHAPE and is neither of the five, and a
// background remover takes no prompt at all. Every one of those needs a release to exist when the
// list is a type.
//
// ⚠️ AND THE KIND IS THE AXIS EVERYTHING ELSE HANGS OFF. The picker draws one row per kind, the
// 🔌 page groups by kind, and a capability provided by two different services is TWO WORKFLOWS AND
// ONE ROW — which is the whole of the reuse story (NEXT.md — the kind is the portable thing). A cross-service workflow
// would be a dialect translator; a shared kind costs nothing.
//
// ⚠️ ORDER AND MEANING, NOT LEGALITY. A workflow naming a kind nobody described still resolves and
// still runs — it simply has no gloss and sorts after the described ones. Refusing it would put a
// registry file between a user and a service that can genuinely do something this build has never
// heard of, which is the failure the whole layer exists to prevent.

import { readFile } from 'node:fs/promises'

import { resolveIn } from '../paths.ts'
import type { Roots } from '../paths.ts'
import type { InferenceRow } from '../types/inference.ts'
import { MEDIA } from '../types/medium.ts'
import type { Medium } from '../types/medium.ts'
import type { Kind } from '../types/workflow.ts'
import { SLUG, asArray, asEnum, asObject, asString, ctx, issue, noStrayKeys } from '../validate.ts'
import type { Ctx } from '../validate.ts'

/** Where each layer lives, relative to its root — same two-layer story as the services file. */
export const KINDS_FILE = 'registries/kinds.json'

export interface LoadedKinds {
  readonly kinds: readonly Kind[]
  readonly issues: readonly string[]
}

function parseKind(c: Ctx, v: unknown, path: string): Kind | undefined {
  const o = asObject(c, v, path)
  if (!o) return undefined
  noStrayKeys(c, o, path, ['slug', 'face', 'medium'])
  const slug = asString(c, o['slug'], `${path}.slug`, { pattern: SLUG })
  const face = asString(c, o['face'], `${path}.face`)
  // ⚠️ OPTIONAL IN THE PARSER, AND PRESENT ON EVERY SHIPPED ROW. A kind you add without one still
  // works — it lands in the "somewhere else" band rather than being refused, which is the same
  // bargain the whole registry makes: order and meaning, never legality.
  const medium = o['medium'] === undefined
    ? undefined
    : asEnum(c, o['medium'], `${path}.medium`, MEDIA)
  if (!slug || !face) return undefined
  return { slug, face, ...(medium === undefined ? {} : { medium }) }
}

/** One file's rows. Exported for `npm run check`, which validates the shipped list without a
 *  server. */
export function parseKindsFile(c: Ctx, v: unknown): Kind[] {
  const o = asObject(c, v, '')
  if (!o) return []
  noStrayKeys(c, o, '', ['kinds'])
  const arr = asArray(c, o['kinds'], 'kinds')
  if (!arr) return []
  const out: Kind[] = []
  const seen = new Set<string>()
  for (const [i, entry] of arr.entries()) {
    const kind = parseKind(c, entry, `kinds[${i}]`)
    if (!kind) continue
    if (seen.has(kind.slug)) {
      issue(c, `kinds[${i}].slug`, `duplicate kind ${JSON.stringify(kind.slug)} in the same file`)
      continue
    }
    seen.add(kind.slug)
    out.push(kind)
  }
  return out
}

async function readLayer(file: string, issues: string[]): Promise<Kind[]> {
  let text: string
  try {
    text = await readFile(file, 'utf-8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    issues.push(`${file}: ${(err as Error).message}`)
    return []
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    issues.push(`${file}: not valid JSON — ${(err as Error).message}`)
    return []
  }
  const c = ctx(file)
  const kinds = parseKindsFile(c, parsed)
  issues.push(...c.issues)
  return kinds
}

/**
 * The shipped list with yours over it: same slug REPLACES IN PLACE (so a reworded face keeps its
 * position), a new slug is appended.
 */
export async function loadKinds(roots: Roots): Promise<LoadedKinds> {
  const issues: string[] = []
  const shipped = await readLayer(resolveIn(roots.install, KINDS_FILE), issues)
  const mine = await readLayer(resolveIn(roots.data, KINDS_FILE), issues)
  const out = new Map<string, Kind>(shipped.map((k) => [k.slug, k]))
  for (const k of mine) out.set(k.slug, k)
  return { kinds: [...out.values()], issues }
}

/**
 * Every kind in play, described ones first in registry order, then anything a workflow named that
 * nobody described — appended, with an empty face, so it is drawn rather than dropped.
 */
export function kindsInPlay(kinds: readonly Kind[], used: Iterable<string>): Kind[] {
  const known = new Map(kinds.map((k) => [k.slug, k]))
  const extra = [...new Set(used)].filter((slug) => !known.has(slug)).sort()
  return [...kinds, ...extra.map((slug) => ({ slug, face: '' }))]
}

/**
 * WHAT A SERVICE MAKES — read off its workflows, never declared on its row.
 *
 * ⚠️ IT USED TO BE A FIELD, AND THE FIELD COULD NOT BE RIGHT (2026-09-06). `InferenceRow.medium`
 * was one word for a whole service, so one ComfyUI — pictures, songs, voices, meshes, shots — had
 * to leave it blank, and blank was then read as "answers for anything". A music swatch would pick
 * a ComfyUI holding only image workflows and fail there. It was also a QUESTION in ＋ connect, asked
 * of somebody who had just installed a box and could not know which shelf this app files it on.
 *
 * The kind already knows. Every workflow declares one and every kind names its medium, so this is a
 * lookup, not an opinion — and it follows the workflows you take: one music workflow onto a ComfyUI
 * and that service starts saying `music` by itself, with nothing edited.
 *
 * In `MEDIA` order rather than the workflows' — a card that reorders itself when you take something
 * is a card that looks like it changed more than it did.
 */
export function mediaOf(row: InferenceRow, kinds: readonly Kind[]): Medium[] {
  const mediumOfKind = new Map(kinds.map((k) => [k.slug, k.medium]))
  const found = new Set<Medium>()
  for (const rec of row.workflows ?? []) {
    const m = mediumOfKind.get(rec.kind)
    if (m) found.add(m)
  }
  return MEDIA.filter((m) => found.has(m))
}

/**
 * The one medium this service makes, or `null` when it makes several — or none yet.
 *
 * ⚠️ FOR THE KNOB TABLE, and only for it. A checkpoint's ⚙ editor is drawn from `knobsFor(medium)`,
 * and a service serving five media would draw the union: a tempo and a key on an SDXL checkpoint.
 * `null` is what a ComfyUI has always had there, and it stays what it has.
 */
export function soleMedium(row: InferenceRow, kinds: readonly Kind[]): Medium | null {
  const media = mediaOf(row, kinds)
  return media.length === 1 ? media[0]! : null
}
