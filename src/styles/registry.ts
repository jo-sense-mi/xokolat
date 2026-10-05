// STYLE LISTS — one per medium, living in app data, all of it the user's.
//
// ⚠️ THERE IS NO SHIPPED SEED ANY MORE (2026-08-16). This app used to ship `styles/image.json`
// and copy it into app data on first read. It does not: a style is CONTENT, content lives in the
// library, and a list that arrived with the app is a list that cannot be corrected or added to
// without a release. A fresh install therefore shows NO styles, and the first one arrives through
// ⤓ (src/library/take.ts) or from ✨ xoko. An empty list is a real state and the surfaces say so.
//
// The seed was already only a seed — copied once, never read again, and before that briefly layer
// 1 of a two-layer read with an `xk:` / `user:` namespace, which meant forking a style before you
// could edit it (DECISIONS.md). Both are gone for the same reason: everything here is the one
// user's.
//
// ⚠️ A style list belongs to the SECTION that uses it (PLAN §4c): image styles under 🖼 images,
// pack styles under 🏷 packs. There is no central registry to navigate to, which is the whole
// reason the old `workbench` group is gone.
//
//   <data>/styles/<medium>.json       the list, and the only one there is
//
// The slug IS the id. There is one list, so there is nothing to disambiguate against and no
// namespace to carry.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'

import { knobFor, knobProblem } from '../inference/knobs.ts'
import { resolveIn } from '../paths.ts'
import type { Roots } from '../paths.ts'
import type { Medium } from '../types/medium.ts'
import { MEDIA, isMedium } from '../types/medium.ts'
import type { ParamValue, Params } from '../types/request.ts'
import type {
  CompositionStyle, CompositionStyleFile, StyleFile, Style, ResolvedStyle,
} from '../types/style.ts'
import type { Ctx } from '../validate.ts'
import { SLUG, asArray, asEnum, asNumber, asObject, asString, asStringArray, ctx, issue, noStrayKeys } from '../validate.ts'

export const STYLE_DIR = 'styles'

/** Reserved everywhere a style is accepted, so a token never forces a decision (PLAN §7):
 *  `random` means "pick a curated one for me". A style list may not define it. */
export const RESERVED_STYLES = ['random'] as const

export interface LoadedStyles {
  readonly medium: Medium
  readonly styles: readonly ResolvedStyle[]
  readonly issues: readonly string[]
}

/** Every field a style may carry. ⚠️ EXPORTED BECAUSE IT IS THE FORMAT AND THE LIBRARY IS HELD TO
 *  IT: xoko.lat's `check.mjs` reads this list to refuse publishing a style this parser would then
 *  reject on arrival. It kept its own copy until 2026-08-22, and the copy went stale the day
 *  `seed` was added — eight voices published that the app would have thrown away. */
export const STYLE_KEYS = ['slug', 'label', 'notes', 'compositions', 'collections', 'tags', 'positive', 'negative', 'seed', 'params'] as const

/**
 * The settings a style may carry — CHECKED AGAINST WHAT THE MEDIUM CAN BE ASKED FOR.
 *
 * ⚠️ THE KNOB TABLE IS THE AUTHORITY (src/inference/knobs.ts), not a second list here. A style is
 * content and it arrives from the library; letting it name any key at all would make it a request
 * format nobody validates, able to set a step count or a checkpoint the person never chose. So the
 * only keys that survive are the ones the app already knows how to send for this medium, at values
 * the same checker a render uses would accept — and an unknown one is refused BY NAME, because a
 * `keyScale` that should have been `keyscale` is a typo somebody wants to hear about rather than a
 * genre that silently plays in C.
 */
function parseStyleParams(c: Ctx, v: unknown, path: string, medium: Medium): Params | undefined {
  const o = asObject(c, v, path)
  if (!o) return undefined
  const out: Record<string, ParamValue> = {}
  for (const [key, value] of Object.entries(o)) {
    const knob = isMedium(medium) ? knobFor(medium, key) : undefined
    if (!knob) {
      issue(c, `${path}.${key}`, `${medium} has no ${JSON.stringify(key)} to set`)
      continue
    }
    const problem = knobProblem(knob, value)
    if (problem) {
      issue(c, `${path}.${key}`, problem)
      continue
    }
    out[key] = value as ParamValue
  }
  return Object.keys(out).length ? out : undefined
}

function parseStyle(c: Ctx, v: unknown, path: string, medium: Medium): Style | undefined {
  const o = asObject(c, v, path)
  if (!o) return undefined
  noStrayKeys(c, o, path, STYLE_KEYS)
  const slug = asString(c, o['slug'], `${path}.slug`, { pattern: SLUG })
  const label = o['label'] === undefined ? undefined : asString(c, o['label'], `${path}.label`)
  const notes = o['notes'] === undefined ? undefined : asString(c, o['notes'], `${path}.notes`)
  const comps = o['compositions'] === undefined ? undefined : asStringArray(c, o['compositions'], `${path}.compositions`)
  // ⚠️ WRITTEN BY THE TAKE, NOT PUBLISHED. A style on xoko.lat carries no `collections` — the
  // collection carries the style — so this only ever arrives on a style that is already yours, and
  // it is what makes your own shelf group the way the shelf you took it from did.
  //
  // ⚠️ AND IT IS THE ONLY AXIS (2026-08-30). There was a second one, `category`: a CLOSED
  // vocabulary of three image techniques, declared in the app, refused by name at this line. It
  // was the app owning CONTENT — the one thing it does not do — and it was images-only, so five
  // of the six media were filed by a field that could never have a value. One open axis, named by
  // whoever publishes or writes the style: a collection called `painted` is a collection.
  const sets = o['collections'] === undefined ? undefined : asStringArray(c, o['collections'], `${path}.collections`)
  const tags = o['tags'] === undefined ? undefined : asStringArray(c, o['tags'], `${path}.tags`)
  const positive = o['positive'] === undefined ? undefined : asString(c, o['positive'], `${path}.positive`)
  const negative = o['negative'] === undefined ? undefined : asString(c, o['negative'], `${path}.negative`)
  const seed = o['seed'] === undefined
    ? undefined
    : asNumber(c, o['seed'], `${path}.seed`, { int: true, min: 0 })
  const params = o['params'] === undefined
    ? undefined
    : parseStyleParams(c, o['params'], `${path}.params`, medium)
  if (!slug) return undefined
  if ((RESERVED_STYLES as readonly string[]).includes(slug)) {
    return issue(c, `${path}.slug`, `${JSON.stringify(slug)} is reserved — it already means "pick one for me"`)
  }
  // ⚠️ SETTINGS COUNT AS DOING SOMETHING (2026-08-23). This used to demand words full stop, which
  // is right for a look and wrong for a genre that is mostly a tempo and a key: refusing one would
  // be refusing a style whose whole effect is real and measurable.
  if (!tags?.length && !positive && !params) {
    return issue(c, path, 'a style that adds no words and sets nothing does nothing')
  }
  return {
    slug,
    ...(label === undefined ? {} : { label }),
    ...(notes === undefined ? {} : { notes }),
    ...(comps === undefined ? {} : { compositions: comps }),
    ...(sets === undefined ? {} : { collections: sets }),
    ...(tags === undefined ? {} : { tags }),
    ...(positive === undefined ? {} : { positive }),
    ...(negative === undefined ? {} : { negative }),
    ...(seed === undefined ? {} : { seed }),
    ...(params === undefined ? {} : { params }),
  }
}

/** Validate one style FILE's parsed JSON. `expect` is the medium its filename claims. */
export function parseStyleFile(c: Ctx, v: unknown, expect: Medium): StyleFile | undefined {
  const o = asObject(c, v, '')
  if (!o) return undefined
  noStrayKeys(c, o, '', ['medium', 'styles'] satisfies readonly (keyof StyleFile)[])
  const medium = asEnum(c, o['medium'], 'medium', MEDIA)
  if (medium && medium !== expect) {
    issue(c, 'medium', `says ${medium} but the file is the ${expect} style list`)
  }
  const arr = asArray(c, o['styles'], 'styles')
  if (!medium || !arr) return undefined
  const styles: Style[] = []
  const seen = new Set<string>()
  for (const [i, entry] of arr.entries()) {
    const style = parseStyle(c, entry, `styles[${i}]`, expect)
    if (!style) continue
    if (seen.has(style.slug)) {
      issue(c, `styles[${i}].slug`, `duplicate slug ${JSON.stringify(style.slug)} in the same file`)
      continue
    }
    seen.add(style.slug)
    styles.push(style)
  }
  return { medium, styles }
}

async function readList(file: string, medium: Medium, issues: string[]): Promise<Style[]> {
  let text: string
  try {
    text = await readFile(file, 'utf-8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') issues.push(`${file}: ${(err as Error).message}`)
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
  const list = parseStyleFile(c, parsed, medium)
  issues.push(...c.issues)
  return [...(list?.styles ?? [])]
}

/**
 * A medium's styles. One file, one layer, and no file is the ordinary first-run state — not an
 * error and not something to fill in on the user's behalf.
 */
export async function loadStyles(roots: Roots, medium: Medium): Promise<LoadedStyles> {
  const issues: string[] = []
  const styles = (await readList(resolveIn(roots.data, `${STYLE_DIR}/${medium}.json`), medium, issues))
    .map((s) => ({ ...s, medium }))
  return { medium, styles, issues }
}

// ── WRITING ────────────────────────────────────────────────────────────────────
//
// ⚠️ EVERY style is editable and deletable. There is one list and it is the user's; the shipped
// file is only where it started. The install directory is never written — an update replaces it.
//
// ⚠️ Rewritten whole, write-then-rename. The file is a handful of entries and there is one
// writer (this process); a crash mid-write must not leave a truncated file where the user's
// whole style list used to be.

/** What a caller may set. `slug` addresses the entry; everything else is the entry. */
export type StyleDraft = Style

export class StyleError extends Error {
  readonly status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'StyleError'
    this.status = status
  }
}

async function readForWrite(roots: Roots, medium: Medium): Promise<Style[]> {
  const file = resolveIn(roots.data, `${STYLE_DIR}/${medium}.json`)
  let parsed: unknown
  try {
    parsed = JSON.parse(await readFile(file, 'utf-8'))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw new StyleError(`your ${medium} styles could not be read: ${(err as Error).message}`, 500)
  }
  const c = ctx(file)
  const parsedFile = parseStyleFile(c, parsed, medium)
  // ⚠️ A file we cannot fully vouch for is NOT silently replaced — that would delete entries the
  // user wrote by hand because one of them has a typo.
  if (c.issues.length || !parsedFile) {
    throw new StyleError(`your ${medium} styles have a problem, so nothing was changed: ${c.issues.join('; ')}`, 409)
  }
  return [...parsedFile.styles]
}

async function writeList(roots: Roots, medium: Medium, styles: readonly Style[]): Promise<void> {
  const dir = resolveIn(roots.data, STYLE_DIR)
  await mkdir(dir, { recursive: true })
  const file = resolveIn(dir, `${medium}.json`)
  const body: StyleFile = { medium, styles: [...styles].sort((a, b) => a.slug.localeCompare(b.slug)) }
  const tmp = `${file}.tmp`
  await writeFile(tmp, `${JSON.stringify(body, null, 2)}\n`)
  await rename(tmp, file)
}

/** Check a draft WITHOUT saving it — what the editor's live preview needs, so "what would be
 *  sent" is composed from exactly what a save would store, and a draft that would be refused says
 *  so while you are typing rather than when you press the button. */
export function readDraft(medium: Medium, draft: unknown): ResolvedStyle {
  const c = ctx('style')
  const style = parseStyle(c, draft, '', medium)
  if (!style || c.issues.length) throw new StyleError(c.issues.join('; ') || 'that is not a style')
  return { ...style, medium }
}

/** Add or replace one style. Returns the whole list, as the UI needs it anyway and a second read
 *  would be a second chance to disagree. */
export async function saveStyle(
  roots: Roots, medium: Medium, draft: unknown,
): Promise<LoadedStyles> {
  // ⚠️ `medium` is dropped before storing. It is context — which list this came from — and the
  // file already says it once at the top; written into an entry it is a stray key that the very
  // next read refuses, taking the user's whole list down with it.
  const { medium: _from, ...style } = readDraft(medium, draft)
  const current = await readForWrite(roots, medium)
  const next = current.filter((s) => s.slug !== style.slug)
  next.push(style)
  await writeList(roots, medium, next)
  return loadStyles(roots, medium)
}

/** Remove one style. Any of them — see the note above. */
export async function deleteStyle(
  roots: Roots, medium: Medium, slug: string,
): Promise<LoadedStyles> {
  const current = await readForWrite(roots, medium)
  if (!current.some((s) => s.slug === slug)) {
    throw new StyleError(`there is no style called ${JSON.stringify(slug)}`, 404)
  }
  await writeList(roots, medium, current.filter((s) => s.slug !== slug))
  return loadStyles(roots, medium)
}

// ── 🧩 A COMPOSITION'S OWN STYLES ──────────────────────────────────────────────
//
// ⚠️ THE SECOND SCOPE, AND THE FIRST THAT IS NOT A MEDIUM (2026-08-29). A style belongs to
// whatever presses ▶; a composition presses ▶. See `CompositionStyle` in src/types/style.ts for
// what it can say that a media style cannot, and why it NAMES media styles rather than holding
// copies of them.
//
//   <data>/styles/compositions/<slug>.json
//
// ⚠️ ONE FILE PER COMPOSITION, the same shape as the composition folder beside it — taking a chain
// and taking a style for it are a write of one file each, and neither can reach the other's.
//
// ⚠️ AND `uses` IS NOT CHECKED AGAINST THE MEDIA LISTS HERE. A chain style naming `jazz-noir` on a
// machine that has not taken it yet is not a broken file: it is a style that arrived before the one
// it names, which is the ordinary order things come out of 📚 in. The picker shows what it names and
// says which of them are missing; a parser that refused would make taking them in the wrong order an
// error instead of a step.

export const COMPOSITION_STYLE_DIR = `${STYLE_DIR}/compositions`

/** Every field a composition style may carry. ⚠️ EXPORTED BECAUSE IT IS THE FORMAT — the same
 *  contract `STYLE_KEYS` is for a media style. */
export const COMPOSITION_STYLE_KEYS = ['slug', 'label', 'notes', 'says', 'uses'] as const

export interface LoadedCompositionStyles {
  readonly composition: string
  readonly styles: readonly CompositionStyle[]
  readonly issues: readonly string[]
}

function parseUses(c: Ctx, v: unknown, path: string): Record<string, string> | undefined {
  const o = asObject(c, v, path)
  if (!o) return undefined
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(o)) {
    // The KEY is a medium and the closed list is the authority — `pictures: 'ink'` is a typo
    // somebody wants to hear about, not a channel that silently reaches nothing.
    const medium = asEnum(c, key, `${path}.${key}`, MEDIA)
    const slug = asString(c, value, `${path}.${key}`, { pattern: SLUG })
    if (medium && slug) out[medium] = slug
  }
  return Object.keys(out).length ? out : undefined
}

function parseCompositionStyle(c: Ctx, v: unknown, path: string): CompositionStyle | undefined {
  const o = asObject(c, v, path)
  if (!o) return undefined
  noStrayKeys(c, o, path, COMPOSITION_STYLE_KEYS)
  const slug = asString(c, o['slug'], `${path}.slug`, { pattern: SLUG })
  const label = o['label'] === undefined ? undefined : asString(c, o['label'], `${path}.label`)
  const notes = o['notes'] === undefined ? undefined : asString(c, o['notes'], `${path}.notes`)
  const says = o['says'] === undefined ? undefined : asString(c, o['says'], `${path}.says`)
  const uses = o['uses'] === undefined ? undefined : parseUses(c, o['uses'], `${path}.uses`)
  if (!slug) return undefined
  if ((RESERVED_STYLES as readonly string[]).includes(slug)) {
    return issue(c, `${path}.slug`, `${JSON.stringify(slug)} is reserved — it already means "pick one for me"`)
  }
  // The same rule the media list keeps: a style that shapes nothing does nothing.
  if (!says && !uses) {
    return issue(c, path, 'a chain style that says nothing and names no styles does nothing')
  }
  return {
    slug,
    ...(label === undefined ? {} : { label }),
    ...(notes === undefined ? {} : { notes }),
    ...(says === undefined ? {} : { says }),
    ...(uses === undefined ? {} : { uses }),
  }
}

export function parseCompositionStyleFile(
  c: Ctx, v: unknown, expect: string,
): CompositionStyleFile | undefined {
  const o = asObject(c, v, '')
  if (!o) return undefined
  noStrayKeys(c, o, '', ['composition', 'styles'] satisfies readonly (keyof CompositionStyleFile)[])
  const composition = asString(c, o['composition'], 'composition', { pattern: SLUG })
  if (composition && composition !== expect) {
    issue(c, 'composition', `says ${composition} but the file is ${expect}'s style list`)
  }
  const arr = asArray(c, o['styles'], 'styles')
  if (!composition || !arr) return undefined
  const styles: CompositionStyle[] = []
  const seen = new Set<string>()
  for (const [i, entry] of arr.entries()) {
    const style = parseCompositionStyle(c, entry, `styles[${i}]`)
    if (!style) continue
    if (seen.has(style.slug)) {
      issue(c, `styles[${i}].slug`, `duplicate slug ${JSON.stringify(style.slug)} in the same file`)
      continue
    }
    seen.add(style.slug)
    styles.push(style)
  }
  return { composition, styles }
}

const compFile = (roots: Roots, slug: string): string =>
  resolveIn(roots.data, `${COMPOSITION_STYLE_DIR}/${slug}.json`)

export async function loadCompositionStyles(
  roots: Roots, composition: string,
): Promise<LoadedCompositionStyles> {
  const issues: string[] = []
  const file = compFile(roots, composition)
  let text: string
  try {
    text = await readFile(file, 'utf-8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') issues.push(`${file}: ${(err as Error).message}`)
    return { composition, styles: [], issues }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    return { composition, styles: [], issues: [`${file}: not valid JSON — ${(err as Error).message}`] }
  }
  const c = ctx(file)
  const list = parseCompositionStyleFile(c, parsed, composition)
  return { composition, styles: list?.styles ?? [], issues: [...issues, ...c.issues] }
}

async function writeCompositionList(
  roots: Roots, composition: string, styles: readonly CompositionStyle[],
): Promise<void> {
  await mkdir(resolveIn(roots.data, COMPOSITION_STYLE_DIR), { recursive: true })
  const file = compFile(roots, composition)
  const body: CompositionStyleFile = {
    composition, styles: [...styles].sort((a, b) => a.slug.localeCompare(b.slug)),
  }
  const tmp = `${file}.tmp`
  await writeFile(tmp, `${JSON.stringify(body, null, 2)}\n`)
  await rename(tmp, file)
}

export async function saveCompositionStyle(
  roots: Roots, composition: string, draft: unknown,
): Promise<LoadedCompositionStyles> {
  const c = ctx('style')
  const style = parseCompositionStyle(c, draft, '')
  if (!style || c.issues.length) throw new StyleError(c.issues.join('; ') || 'that is not a style')
  const current = (await loadCompositionStyles(roots, composition)).styles
  await writeCompositionList(roots, composition,
    [...current.filter((s) => s.slug !== style.slug), style])
  return loadCompositionStyles(roots, composition)
}

export async function deleteCompositionStyle(
  roots: Roots, composition: string, slug: string,
): Promise<LoadedCompositionStyles> {
  const current = (await loadCompositionStyles(roots, composition)).styles
  if (!current.some((s) => s.slug === slug)) {
    throw new StyleError(`there is no style called ${JSON.stringify(slug)}`, 404)
  }
  await writeCompositionList(roots, composition, current.filter((s) => s.slug !== slug))
  return loadCompositionStyles(roots, composition)
}
