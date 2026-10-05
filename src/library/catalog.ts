// WHAT THE LIBRARY HAS — the catalogs, fetched, merged, and answered against this machine.
//
// ⚠️ THIS IS THE OTHER HALF OF ⤓, AND IT IS THE HALF THAT MAKES IT USABLE. Taking by pasting an
// id is fine for the person who wrote the id; it is useless for everyone else, who has no way to
// find out what exists. So the app reads the library's own catalogs and shows them — searchable,
// filterable, and with the one question a catalog cannot answer written beside every row: *can I
// run this, here, now?*
//
// ⚠️ THE SITE PUBLISHES THE ITEMS; THIS APP ANSWERS ABOUT THEM. Nothing here re-decides what a
// workflow is or what it is called — the catalog says. What is added is `app`: whether it is already
// installed, whether it can be taken at all, and which of the files it names this machine has not
// got. That split is why a new field on the site does not need a release here.
//
// ⚠️ CACHED, BUT NOT LIKE THE ENGINE CATALOG. `/api/engines` caches until you press ↻ because a
// cold Draw Things scan is ~40 seconds. This is two small JSON files over HTTP, so it refreshes
// itself after a few minutes — a library that stayed stale for a whole session would be a library
// where the thing you just published is not there.
//
// ⚠️ AND A FAILURE IS CACHED AS A FAILURE. The rows survive a blink, but the problem rides with
// them and the "read at" clock moves only on a clean fetch. Stamp a failed fetch and the next five
// minutes answer from the cache with the problem already thrown away — an empty shelf under `read
// at 13:27`, which is the app claiming it looked and there was nothing there.

import { cachedCatalog } from '../inference/catalog.ts'
import { SERVICE_PRESETS } from '../inference/presets.ts'
import { loadInferenceRegistry } from '../inference/registry.ts'
import type { Roots } from '../paths.ts'
import { loadCompositions } from '../compositions/registry.ts'
import { StyleError, loadStyles, readDraft } from '../styles/registry.ts'
import type { Medium } from '../types/medium.ts'
import type { ResolvedStyle } from '../types/style.ts'
import { resolveLibrary } from './origin.ts'
import { CATALOGS, getJson } from './take.ts'

/** How long a fetched catalog is reused. Short enough that publishing something and going to look
 *  for it works; long enough that flipping between sections is not a request per press. */
const FRESH_MS = 5 * 60 * 1000

/** What this machine can say about one published item. */
export interface ItemState {
  /** Already in this app — by workflow slug on its service, or by style slug in its list. */
  readonly installed: boolean
  /** False when pressing ⤓ could only fail, and `why` says so in a sentence. */
  readonly takeable: boolean
  readonly why: string | null
  /**
   * THE SERVICE THIS TAKE WOULD ALSO INSTALL — `null` when the service is already here.
   *
   * ⚠️ IT IS NOT A WARNING, IT IS A DISCLOSURE (2026-08-23). A workflow whose service is missing
   * used to be `takeable: false` and now brings the service with it (`takeWorkflow`), which is the
   * only way the one act the map names can be the whole act. But a take that quietly changed what
   * this app connects to would be a take nobody could audit — so the row says whose machine is
   * about to be added, before the press rather than in the receipt.
   */
  readonly brings: string | null
  /** Of the files this item names, the ones its service does not report having. */
  readonly missing: readonly string[]
  /** ⚠️ Whether the service was ever asked what it has. `missing: []` from a service nobody has
   *  talked to is no news, not good news, and every surface has to be able to tell them apart. */
  readonly asked: boolean
}

/** One row of the library, as this app shows it. A projection of the site's catalog — named
 *  fields rather than a pass-through, so what the UI draws is a thing this file agreed to. */
export interface LibraryItem {
  readonly id: string
  readonly type: 'workflow' | 'style' | 'composition'
  readonly title: string
  /** The verb (`t2i`) or the shelf (`drawn`), and the plain-words version of it. */
  readonly kind: string | null
  readonly kindFace: string | null
  /**
   * A COMPOSITION'S FAMILY, VERBATIM — `one-offs`, `mascots`, `books`, `capabilities`.
   *
   * ⚠️ THE APP LEARNS EXACTLY ONE VALUE OF IT AND NOTHING ELSE (2026-09-05). `capabilities` is the
   * family of the chain that makes new chains, which is not a thing you make something WITH — what
   * comes out of it is another row in this very list — and in a shelf of otherwise-identical cards
   * nothing said so. The library owns the vocabulary and grows it; carrying the string rather than a
   * `special: true` is what keeps that true, because a boolean would be this app's opinion about
   * somebody else's list.
   *
   * Null for a workflow and a style, neither of which has one.
   */
  readonly family: string | null
  readonly media: readonly string[]
  /**
   * WHAT IT TAKES — `prompt`, and whichever pictures it needs attached.
   *
   * ⚠️ IT IS HERE SO THAT "WHAT WOULD MAKE THIS MEDIUM USABLE" CAN BE ANSWERED HONESTLY
   * (2026-08-24). The catalog said what a workflow MAKES and never what it needed, so the map
   * recommended a workflow whose only input is a picture to somebody who wanted to type a
   * sentence, and the take succeeded and changed nothing. Two workflows can make one medium and be
   * opposite kinds of act.
   *
   * Empty for a style and a composition, which take nothing.
   */
  readonly inputs: readonly string[]
  readonly service: string | null
  readonly serviceLabel: string | null
  readonly where: readonly string[]
  readonly model: string | null
  readonly modelFace: string | null
  readonly memory: number | null
  readonly needs: readonly string[]
  readonly notes: string | null
  readonly url: string | null
  readonly added: string | null
  readonly app: ItemState
}

export interface LibraryView {
  readonly origin: string | null
  readonly items: readonly LibraryItem[]
  readonly at: string | null
  /** Why there is nothing to show. A library you cannot reach is an ordinary state — a train, a
   *  local site that is not running — and it is a sentence, not an empty list. */
  readonly issue: string | null
}

type Raw = Record<string, unknown>

interface Cached {
  readonly origin: string
  readonly rows: readonly { catalog: string; item: Raw }[]
  /** The collections that rode the styles catalog — headers, not takeable things. */
  readonly sets: readonly Raw[]
  /** When these rows last came back CLEAN — null while every attempt so far has failed. It is what
   *  the "read at" line says, so only a clean fetch may move it. */
  readonly at: number | null
  /** What the last attempt hit, kept WITH the rows so a reopen still says it rather than the
   *  request that happened to hit the problem being the only one that knew. */
  readonly issue: string | null
  /** When the last attempt happened, clean or not. Staleness is measured from this, so a library
   *  that is down is retried on the same rhythm as one that is up rather than on every press. */
  readonly triedAt: number
}

let cache: Cached | null = null

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)
const num = (v: unknown): number | null => (typeof v === 'number' ? v : null)
const strs = (v: unknown): string[] =>
  (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

/** Fetch both catalogs. One failing does not lose the other — a site mid-deploy should show what
 *  it can rather than nothing at all. */
async function fetchAll(
  origin: string,
): Promise<{ rows: Cached['rows']; sets: readonly Raw[]; issue: string | null }> {
  const rows: { catalog: string; item: Raw }[] = []
  const sets: Raw[] = []
  const problems: string[] = []
  for (const catalog of CATALOGS) {
    try {
      const body = await getJson(`${origin}${catalog}`, 'a catalog') as
        { items?: unknown; collections?: unknown }
      for (const item of (Array.isArray(body.items) ? body.items : [])) {
        if (item && typeof item === 'object') rows.push({ catalog, item: item as Raw })
      }
      // ⚠️ COLLECTIONS RIDE THE STYLES CATALOG rather than having one of their own. A collection is
      // not a thing you take — it is how a shelf of styles is READ — so it travels in the envelope
      // with the styles it groups: one fetch, one clock, nothing to keep in sync. A library that
      // publishes none simply has no headers, which is not a problem to report.
      for (const set of (Array.isArray(body.collections) ? body.collections : [])) {
        if (set && typeof set === 'object') sets.push(set as Raw)
      }
    } catch (err) {
      problems.push((err as Error).message)
    }
  }
  return { rows, sets, issue: problems.length ? problems.join('; ') : null }
}

/** The site's own noun, or the catalog it came from. Styles do not carry one — the shelf they are
 *  published on is the answer. */
function typeOf(catalog: string, item: Raw): LibraryItem['type'] {
  const noun = str(item['noun'])
  if (noun === 'workflow' || noun === 'style' || noun === 'composition') return noun
  return catalog.includes('styles') ? 'style' : 'workflow'
}

/** The rows, fetched or reused. Split out of `readLibrary` because the map line below needs the
 *  same cache and none of the annotation — see `libraryReach`. */
async function heldRows(origin: string, refresh: boolean): Promise<Cached> {
  // Held for another origin is not this library's answer — being pointed somewhere else is a fresh
  // read, not a stale one.
  let held = cache && cache.origin === origin ? cache : null
  if (refresh || !held || Date.now() - held.triedAt > FRESH_MS) {
    const got = await fetchAll(origin)
    const now = Date.now()
    // ⚠️ A FAILED REFRESH KEEPS WHAT WE HAD. Emptying the list because the network blinked would
    // turn "your wifi dropped" into "the library is gone".
    const rows = got.rows.length === 0 && held ? held.rows : got.rows
    const sets = got.rows.length === 0 && held ? held.sets : got.sets
    held = { origin, rows, sets, at: got.issue ? held?.at ?? null : now, issue: got.issue, triedAt: now }
    cache = held
  }
  return held
}

export async function readLibrary(
  roots: Roots,
  /** `files` is the test seam and nothing else — see `filesOf`. */
  { refresh = false, files = filesOf }: { refresh?: boolean; files?: (id: string) => Reported } = {},
): Promise<LibraryView> {
  let origin: string
  try {
    origin = resolveLibrary()
  } catch (err) {
    return { origin: null, items: [], at: null, issue: (err as Error).message }
  }

  const held = await heldRows(origin, refresh)
  // ⚠️ WORKFLOWS AND COMPOSITIONS ONLY — A STYLE IS NOT A THING IN 📚 (2026-08-29). This shelf is
  // organised around `needs`: can I run this, here, now. A style has no `needs` — it is words, and
  // it installs on any machine unconditionally — so it sat here as a permanent "fine" in the one
  // column the shelf exists for. It was also the only row you had to read a chip to know what it
  // was even FOR, when the ❖ band it belongs to already IS that filter. See `readLibraryStyles`.
  const rows = held.rows.filter((r) => typeOf(r.catalog, r.item) !== 'style')
  const items = await annotate(roots, rows, files)
  return {
    origin,
    items,
    at: held.at === null ? null : new Date(held.at).toISOString(),
    issue: held.issue,
  }
}

// ── ❖ THE STYLES, PER MEDIUM ──────────────────────────────────────────────────
//
// ⚠️ THE OTHER HALF OF THE SPLIT ABOVE, AND IT READS THE SAME CACHE. One fetch, two audiences: 📚
// answers "can this machine run it", and this answers "what is published for the medium I am
// standing in". The medium is not a filter the user applies — the section is the filter — which is
// the whole reason a style in 📚 was never findable by anybody who did not already know it existed.
//
// ⚠️ PARSED THROUGH THE APP'S OWN READER, NOT PASSED THROUGH. The app owns what a style may BE
// (src/types/style.ts); the library owns which ones there are. So every published entry goes
// through `readDraft` — the same call ⤓ makes — and a row you can see is a row that would install.
// One that would not says so in place, rather than being a ⤓ that fails after the press.

/** One published style, as ❖ shows it. `style` is null exactly when `issue` is not. */
export interface LibraryStyle {
  readonly id: string
  readonly slug: string
  readonly style: ResolvedStyle | null
  readonly issue: string | null
  /** Already in this medium's list — the row says `taken` instead of offering ⤓. */
  readonly installed: boolean
  readonly url: string | null
  readonly added: string | null
}

/** One published collection: the header a shelf of styles is read under, and taken in one press. */
export interface LibraryCollection {
  readonly slug: string
  readonly title: string
  readonly note: string
  /** In the library's order, which is the curator's — never re-sorted here. */
  readonly styles: readonly string[]
}

export interface LibraryStyleView {
  readonly origin: string | null
  readonly medium: string
  readonly items: readonly LibraryStyle[]
  /**
   * THE HEADERS, IN THE LIBRARY'S ORDER — this medium's only.
   *
   * ⚠️ THE APP NEVER LEARNS WHAT KIND OF GROUPING ONE IS. Technique family, register, tradition,
   * mood — that call is per collection and belongs to whoever wrote it. What arrives is a title, a
   * note and a list, which is all a header needs. A fixed set of collection KINDS would be
   * `category` again: a filing system dressed as a finder.
   */
  readonly collections: readonly LibraryCollection[]
  readonly at: string | null
  /** Why there is nothing to show. Unreachable is a sentence, never an empty list. */
  readonly issue: string | null
}

export async function readLibraryStyles(
  roots: Roots, medium: Medium, { refresh = false }: { refresh?: boolean } = {},
): Promise<LibraryStyleView> {
  let origin: string
  try {
    origin = resolveLibrary()
  } catch (err) {
    return { origin: null, medium, items: [], collections: [], at: null, issue: (err as Error).message }
  }

  const held = await heldRows(origin, refresh)
  const have = new Set((await loadStyles(roots, medium)).styles.map((s) => s.slug))
  const items: LibraryStyle[] = []
  for (const { catalog, item } of held.rows) {
    if (typeOf(catalog, item) !== 'style' || str(item['medium']) !== medium) continue
    const id = str(item['id']) ?? ''
    const slug = str(item['slug']) ?? id.split('/').pop() ?? ''
    let style: ResolvedStyle | null = null
    let issue: string | null = null
    try {
      style = readDraft(medium, item['style'])
    } catch (err) {
      issue = err instanceof StyleError ? err.message : (err as Error).message
    }
    items.push({
      id,
      slug,
      style,
      issue,
      installed: have.has(slug),
      url: str(item['url']),
      added: str(item['added']),
    })
  }
  // ⚠️ ONLY THE SLUGS THAT ARE ACTUALLY HERE. A header promising four and drawing three is worse
  // than no header — and the count on its ⤓ is what somebody presses.
  const slugs = new Set(items.map((i) => i.slug))
  const collections: LibraryCollection[] = []
  for (const set of held.sets) {
    if (str(set['medium']) !== medium) continue
    const slug = str(set['slug'])
    if (!slug) continue
    const styles = strs(set['styles']).filter((x) => slugs.has(x))
    if (!styles.length) continue
    collections.push({ slug, title: str(set['title']) ?? slug, note: str(set['note']) ?? '', styles })
  }
  return {
    origin,
    medium,
    items,
    collections,
    at: held.at === null ? null : new Date(held.at).toISOString(),
    issue: held.issue,
  }
}

/**
 * ONE LINE FOR THE MAP: can anything be taken right now, and roughly what.
 *
 * ⚠️ BECAUSE XOKO KEPT FINDING THE WALL BY WALKING INTO IT (2026-08-22). Its map says what this
 * machine HAS; nothing said what it can GET. So the first real conversation spent four turns
 * recommending a workflow, taking a service, promising a render and failing — and only then
 * discovered the library had been unreachable the whole time. A brain that cannot see a door is
 * not being careful when it walks into it; it is being lied to by its own context.
 *
 * ⚠️ AND IT IS THE COUNTS, NOT THE CATALOG. What belongs in a map is whether the door opens.
 * Which workflows are behind it is ▶ look: library, on purpose — a map that inlined the shelf would
 * be the shelf.
 */
export async function libraryReach(): Promise<string> {
  let origin: string
  try {
    origin = resolveLibrary()
  } catch (err) {
    return `library: cannot be read — ${(err as Error).message}`
  }
  let held: Cached
  try {
    held = await heldRows(origin, false)
  } catch (err) {
    return `library: unreachable (${origin}) — ${(err as Error).message}`
  }
  if (held.issue && held.rows.length === 0) {
    return `library: unreachable (${origin}) — ${held.issue}. Nothing can be taken until it is `
      + 'back; services still can, they ship with the app'
  }
  const tally = new Map<string, number>()
  for (const r of held.rows) {
    const t = typeOf(r.catalog, r.item)
    tally.set(t, (tally.get(t) ?? 0) + 1)
  }
  const counts = [...tally].map(([t, n]) => `${n} ${t}${n === 1 ? '' : 's'}`).join(', ')
  const stale = held.issue ? ' (last read failed — these may be out of date)' : ''
  return `library: reachable at ${origin} — ${counts || 'nothing published'} to take${stale}`
}

/** What this app already has, read once for the whole list rather than per row. */
async function whatIsHere(roots: Roots): Promise<{
  workflows: Map<string, Set<string>>
  services: Set<string>
  compositions: Set<string>
}> {
  const registry = await loadInferenceRegistry(roots)
  const workflows = new Map<string, Set<string>>()
  for (const row of registry.rows) {
    workflows.set(row.id, new Set((row.workflows ?? []).map((r) => r.slug)))
  }
  const chains = await loadCompositions(roots)
  return {
    workflows,
    services: new Set(registry.rows.map((r) => r.id)),
    compositions: new Set(chains.compositions.map((c) => c.slug)),
  }
}

/** What one service reports having. The one thing in this file that needs a live engine, which
 *  is why it is the one thing a test replaces (`readLibrary`'s `files`). */
export interface Reported {
  readonly have: ReadonlySet<string>
  readonly asked: boolean
}

/**
 * Everything a service has told us it has, in one set.
 *
 * ⚠️ FROM THE CACHE, NEVER A FRESH SCAN. Opening the library must not ask three engines what they
 * have; `asked` says whether anybody ever did, and the ⓘ band can send you to 🔌 to find out.
 */
export function filesOf(service: string): Reported {
  const cat = cachedCatalog(service)
  const have = new Set<string>([
    ...(cat.engines ?? []).map((e) => e.file),
    ...(cat.controlNets ?? []),
    ...(cat.loras ?? []),
  ])
  return { have, asked: cat.engines !== null }
}

async function annotate(
  roots: Roots, rows: readonly { catalog: string; item: Raw }[], ask: (id: string) => Reported,
): Promise<LibraryItem[]> {
  const here = await whatIsHere(roots)
  const files = new Map<string, Reported>()

  return rows.map(({ catalog, item }) => {
    const type = typeOf(catalog, item)
    const id = str(item['id']) ?? ''
    const service = type === 'workflow' ? (strs(item['services'])[0] ?? null) : null
    const slug = str(item['slug']) ?? id.split('/').pop() ?? ''
    const medium = str(item['medium'])
    const media = medium ? [medium] : strs(item['medium'])
    const needs = strs(item['needs'])

    if (service && !files.has(service)) files.set(service, ask(service))
    const seen = service ? files.get(service)! : null

    const installed = type === 'workflow'
      ? !!service && !!here.workflows.get(service)?.has(slug)
      : here.compositions.has(slug)

    // ⚠️ WHY IT CANNOT BE TAKEN, IN A SENTENCE, BEFORE THE PRESS. The take path refuses both of
    // these too — but finding out after pressing is finding out too late, and a row that simply
    // failed would read as the app being broken rather than as a thing it cannot do yet.
    // ⚠️ A MISSING SERVICE IS NO LONGER A REFUSAL, it is a second thing the press does. The
    // preset list is shipped and fixed (src/inference/presets.ts) — naming one is the ＋ button,
    // not a network — so a workflow on a service this app knows how to add is takeable, and says
    // what it would add. Only a service with no preset behind it is still a dead end, and now the
    // sentence says which of the two it is.
    const preset = type === 'workflow' && service && !here.services.has(service)
      ? SERVICE_PRESETS.find((x) => x.id === service.toLowerCase() || x.suggest === service.toLowerCase()) ?? null
      : null
    // ⚠️ A COMPOSITION IS TAKEABLE, AND THIS LINE SAID IT WAS NOT FOR TWO DAYS AFTER IT BECAME
    // ONE (2026-08-24). `takeComposition` has existed since compositions landed — it writes the
    // chain and every workflow that rode inline with it — and this string was left behind. It is the
    // sentence `look: library` prints, so xoko read it, believed it, and told somebody the app
    // could not install the two chains it was looking straight at. A capability is not a fact this
    // file gets to hold a second opinion about: what refuses a take is the take.
    const why = type === 'workflow' && (!service || (!here.services.has(service) && !preset))
      ? `no service called ${JSON.stringify(service ?? '?')} in this app, and none it ships`
        + ' knows how to be one'
      : null

    return {
      id,
      type,
      title: str(item['title']) ?? str(item['label']) ?? slug,
      kind: str(item['kind']),
      kindFace: str(item['kindFace']),
      family: str(item['family']),
      media,
      inputs: strs(item['inputs']),
      service,
      serviceLabel: str(item['serviceLabel']),
      where: strs(item['where']),
      model: str(item['model']),
      modelFace: str(item['modelFace']),
      memory: num(item['memory']),
      needs,
      notes: str(item['notes']),
      url: str(item['url']),
      added: str(item['added']),
      app: {
        installed,
        takeable: why === null,
        why,
        brings: preset?.suggest ?? null,
        missing: seen?.asked ? needs.filter((f) => !seen.have.has(f)) : [],
        asked: seen?.asked ?? false,
      },
    }
  })
}

/** Exported for tests, and for the day the origin moves under a running process. */
export function forgetLibrary(): void {
  cache = null
}
