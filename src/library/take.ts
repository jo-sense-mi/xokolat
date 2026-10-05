// TAKING ONE THING FROM THE LIBRARY — fetch, read the envelope, and hand it to a writer that
// already exists. This is the other half of `payload.ts`, and the two are deliberately separate:
// that one is pure and knows what a published file IS, this one touches the disk and knows where
// things GO.
//
// ⚠️ TWO SOURCES, AND ONLY TWO (2026-08-22). `take` means "put this in my app", and the two
// places a thing can come from are:
//
//   a SERVICE PRESET   shipped in code (src/inference/presets.ts) — a transport this build has an
//                      adapter for. Named, never described: what arrives is an id off a fixed
//                      list, exactly what ＋ on the 🔌 page writes when you pick one.
//   the LIBRARY        workflows and styles published at xoko.lat, read through payload.ts.
//
// ⚠️ THE PRESET IS TRIED FIRST, AND IT NEVER TOUCHES THE NETWORK. A machine with no library — a
// train, a site that is not running — can still be given its first service, which is the one act
// an empty app cannot do without. The two namespaces cannot collide: a preset is one word, every
// library id has a `/` in it.
//
// ⚠️ AND THIS IS WHY A SERVICE IS NOT PUBLISHED. How to REACH something is the app's own and
// ships with it; a downloaded file that could write a transport would be a downloaded file
// choosing what this process connects to (payload.ts). Naming one from the shipped list gives
// xoko — and a paste box — the ＋ button without giving anybody the fields behind it.
//
// ⚠️ IT TAKES FROM *THE* LIBRARY, NOT FROM A URL. `XOKOLAT_LIBRARY` says where the library is
// (src/library/origin.ts); what arrives here names an ITEM in it — a catalog id, or a link that
// resolves under that origin. A general fetcher would mean this process opening any address a page
// hands it, which is a bigger promise than "install things from the library" needs to make. It also
// makes the mistake we will actually make readable: pointed at a local site and pasting an
// xoko.lat link is a sentence, not a mystery.
//
// ⚠️ AND THE CATALOG IS HOW AN ID BECOMES A PATH. The site publishes `path` for every item, so
// following it is one fewer thing to agree about — the app never rebuilds a URL out of an id and
// a folder layout it would then have to be told about every time the site moved one.
//
// ⚠️ A WORKFLOW MERGES, AND THAT IS THE WHOLE TRICK OF THIS FILE. `saveService` patches at the
// FIELD level and replaces the whole list WITHIN a field — post `workflows: [one]` and everything
// else you had taken is gone. So the effective list (shipped ← yours) is read, the new one is
// dropped in by slug, and the whole list goes back. `engines` the same, by file.

import { loadComposition, saveComposition } from '../compositions/registry.ts'
import { loadInferenceRegistry } from '../inference/registry.ts'
import { cachedCatalog, serviceFiles } from '../inference/catalog.ts'
import type { Missing } from '../inference/workflows.ts'
import { resolveWorkflows } from '../inference/workflows.ts'
import { SERVICE_PRESETS } from '../inference/presets.ts'
import type { ServicePreset } from '../inference/presets.ts'
import { saveService } from '../inference/services.ts'
import type { Roots } from '../paths.ts'
import { forgetSwatch } from '../styles/probe.ts'
import { loadStyles, saveStyle } from '../styles/registry.ts'
import type { Composition } from '../types/composition.ts'
import type { InferenceRow } from '../types/inference.ts'
import type { Engine } from '../types/inference.ts'
import type { Medium } from '../types/medium.ts'
import { MEDIA } from '../types/medium.ts'
import type { Workflow } from '../types/workflow.ts'
import { resolveLibrary } from './origin.ts'
import type { Payload } from './payload.ts'
import { PayloadError, readPayload } from './payload.ts'

/**
 * The catalogs the library publishes, in the order an id is looked for.
 *
 * ⚠️ TWO, BECAUSE THE SITE HAS TWO SHELVES — things that can be asked for, and how they should
 * look. This is the only fact about the site's layout the app holds, and it is the entry point
 * rather than a pattern: every path below it comes out of the catalog itself.
 */
export const CATALOGS = ['/library/index.json', '/styles/index.json'] as const

/** A published file is a few kilobytes. Anything claiming otherwise is not one. */
const MAX_BYTES = 1024 * 1024
const TIMEOUT_MS = 15_000

/** What a workflow needs and whether the machine has it — the answer that makes a take worth
 *  pressing, because "you have SDXL, you are missing this adapter" is actionable and "saved" is
 *  not. */
export interface Check {
  readonly state: 'known' | 'discovered' | 'declared'
  readonly missing: readonly Missing[]
  /**
   * ⚠️ WHETHER THE SERVICE WAS EVER ASKED. `missing: []` from a service nobody has talked to is
   * not good news, it is no news — and a take that said "ready" on the strength of a probe that
   * never happened would be the app guessing on the one screen that exists to stop it.
   */
  readonly asked: boolean
}

export interface Took {
  readonly type: 'workflow' | 'style' | 'service' | 'composition'
  /** The URL actually fetched, so a take from the wrong library is visible after the fact — or,
   *  for a service, the plain fact that it did not come off a network at all. */
  readonly from: string
  readonly slug: string
  readonly label: string
  /** True when something of this name was already here and has been replaced. */
  readonly replaced: boolean
  /** workflow: where it landed, and the checkpoint that came with it (if any). */
  readonly service?: string
  readonly engine?: string | null
  readonly check?: Check
  /** style: which list it joined. */
  readonly medium?: Medium
  /** composition: how long the chain is, what came with it, and what did not. */
  readonly steps?: number
  /** The services that had to be added for the bundled workflows to land — said out loud, because
   *  a take that quietly changed what this app connects to would be a take you cannot audit. */
  readonly added?: readonly string[]
  readonly bundled?: readonly string[]
  readonly blocked?: readonly { readonly id: string; readonly why: string }[]
}

const isMedium = (m: string): m is Medium =>
  (MEDIA as readonly string[]).includes(m)

/** Everything under `library` and nothing else — matched on a path boundary, so a lookalike
 *  origin (`xoko.lat.example.com`) is a stranger rather than a prefix. */
const under = (url: string, library: string): boolean =>
  url === library || url.startsWith(`${library}/`)

/** One JSON file off the library. Shared with `catalog.ts`: reaching the library is one act with
 *  one set of failure sentences, whether what comes back is a catalog or a thing to install. */
export async function getJson(url: string, what: string): Promise<unknown> {
  let res: Response
  try {
    res = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    // The library being unreachable is the ordinary failure — a laptop on a train, a local site
    // that is not running — so it says which address failed rather than what threw.
    throw new PayloadError(`could not reach ${url} — ${(err as Error).message}`, 502)
  }
  if (!res.ok) {
    throw new PayloadError(
      res.status === 404 ? `${url} is not there` : `${url} answered ${res.status}`,
      res.status === 404 ? 404 : 502,
    )
  }
  const text = await res.text()
  if (text.length > MAX_BYTES) throw new PayloadError(`${url} is too big to be ${what}`, 502)
  try {
    return JSON.parse(text)
  } catch {
    // Almost always an HTML error page or a site index — the byte count is the tell.
    throw new PayloadError(`${url} did not answer with JSON (${text.length} bytes)`, 502)
  }
}

/** id → the path the catalog publishes for it. */
async function findInCatalogs(id: string, library: string): Promise<string> {
  // ⚠️ THE ID, AND ENOUGH OF THE ROW TO RECOGNISE IT BY. A miss is answered from `hay`, and what
  // somebody types is as often what a thing IS ("a music workflow") as what it is called.
  const known: { id: string; hay: string }[] = []
  for (const catalog of CATALOGS) {
    const body = await getJson(`${library}${catalog}`, 'a catalog') as {
      items?: readonly { id?: unknown; path?: unknown; title?: unknown; medium?: unknown }[]
    }
    for (const item of body.items ?? []) {
      if (typeof item?.id !== 'string') continue
      if (item.id === id && typeof item.path === 'string') return item.path
      const media = Array.isArray(item.medium) ? item.medium : [item.medium]
      known.push({
        id: item.id,
        hay: [item.id, item.title, ...media].filter((x) => typeof x === 'string').join(' '),
      })
    }
  }
  // ⚠️ THE NEAR MISSES, NOT THE WHOLE LIST. Thirty-two ids is a wall; the two that share a word
  // with what was typed is an answer.
  //
  // ⚠️ AND IT MATCHES WORDS, NOT SUBSTRINGS (2026-08-22). It was `k.includes(word)`, which needed
  // the tail of the id to have been typed exactly — so an id assembled out of the person's own
  // sentence ("a flux.2 klein t2i workflow" → `flux.2-klein-t2i`) matched nothing at all, and what
  // came back was a lecture about services while `draw-things-grpc/klein-t2i` sat two lines down
  // the same catalog. Sharing two words is enough to name it, and naming it is the difference
  // between a turn spent and a turn that installs the thing that was meant. The row's title and
  // medium count too, so "a music workflow" reaches the one workflow that makes music even though it
  // shares no word with its id.
  //
  // ⚠️ AND THE EXAMPLE BELOW IS A SHAPE, NEVER A REAL ID. What the library publishes is the
  // library's; the app knows the FORM of an id and nothing about what is on the shelf.
  // ⚠️ AND IT DOES NOT SPLIT AT DIGITS. Tried, reverted the same hour: `model3d` → `model` + `3d`
  // is what you want, but the same rule cuts `t2i` into three pieces of one character and the
  // best match in the catalog stops matching at all. A description that says "3d" therefore does
  // not reach the mesh workflow, and that is the cheaper of the two failures.
  const words = (s: string): string[] =>
    s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1)
  const wanted = new Set(words(id))
  const near = known
    .map((k) => ({ id: k.id, score: new Set(words(k.hay).filter((w) => wanted.has(w))).size }))
    .filter((x) => x.score > 0)
    // Most words in common first; alphabetical after that, so the same miss always answers the
    // same way rather than in catalog order.
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, 3)
    .map((x) => x.id)
  // ⚠️ AND A ONE-WORD MISS IS READ AS A SERVICE. Every library id has a `/` in it, so a bare word
  // went to the shipped list — but saying only that made the SHAPE of the mistake invisible: a
  // brain told "services are not published" concluded the service was misnamed and invented an
  // explanation for it. The shape comes first now, and the shipped list second.
  const services = id.includes('/')
    ? ''
    : ' — every published id names its service first, in the form service/name. A bare word is'
      + ' read as a service, and services are not published: they ship with the app —'
      + ` ${SERVICE_PRESETS.map((p) => p.suggest).join(', ')}`
  throw new PayloadError(
    `${library} publishes nothing called ${JSON.stringify(id)}`
      + (near.length ? ` — did you mean ${near.join(', ')}?` : '') + services,
    404,
  )
}

/** What was asked for → the URL to fetch. A link must be one of the library's own. */
async function resolveItem(what: string, library: string): Promise<string> {
  if (/^[a-z]+:/i.test(what)) {
    if (!/^https?:\/\//i.test(what)) throw new PayloadError(`${what} is not a link this app follows`)
    let url: string
    try {
      // ⚠️ A HALF-COPIED LINK IS A REFUSAL, NOT A CRASH. `new URL` throws a bare TypeError, which
      // would leave this route as a 500 with a stack in the log for the commonest paste mistake
      // there is.
      url = new URL(what).toString()
    } catch {
      throw new PayloadError(`${what} is not a link — it did not parse as one`)
    }
    if (!under(url, library)) {
      throw new PayloadError(
        `that link is not on the library this app is pointed at (${library})`
          + ' — point XOKOLAT_LIBRARY at it, or paste the item id instead',
      )
    }
    return url
  }
  return `${library}${await findInCatalogs(what.replace(/^\/+/, ''), library)}`
}

/** What a caller may say about the thing beyond its id. */
export interface TakeOptions {
  /**
   * THE COLLECTIONS THIS STYLE CAME IN — the ❖ shelf's own answer, written onto the style.
   *
   * ⚠️ THE CALLER'S, NOT DERIVED HERE, and that is a deliberate call. It is a list of slugs that
   * ends up as grouping data in the user's own style file — no path, no command, nothing
   * privileged — and `asStringArray` checks its shape on the way in. Deriving it would mean this
   * module fetching the styles catalog a second time to learn something the caller read from this
   * app one request ago.
   */
  readonly collections?: readonly string[]
}

/**
 * Take one thing.
 *
 * `what` is a catalog id (`draw-things-grpc/klein-t2i`, `styles/image/ink-linework`) or a link to
 * one on the library this app is pointed at.
 */
export async function take(roots: Roots, what: unknown, opts: TakeOptions = {}): Promise<Took> {
  const asked = typeof what === 'string' ? what.trim() : ''
  if (!asked) throw new PayloadError('take what? an id like draw-things-grpc/klein-t2i, or a link to one')

  // ⚠️ BEFORE THE LIBRARY IS EVEN RESOLVED, let alone fetched. Adding the first service must work
  // on a machine with no network, no library running, and a mistyped XOKOLAT_LIBRARY — which
  // `resolveLibrary()` refuses loudly, one line below. It is the one act an empty app cannot get
  // out of the empty state without, so it depends on nothing.
  const preset = findPreset(asked)
  if (preset) return takeService(roots, preset)

  const library = resolveLibrary()
  const url = await resolveItem(asked, library)
  return installPayload(roots, readPayload(await getJson(url, 'a published file'), url), url, opts)
}

/**
 * PUT AN ALREADY-READ PAYLOAD IN — the half of `take` that touches the disk.
 *
 * ⚠️ IT IS SPLIT OUT BECAUSE THE LIBRARY IS NO LONGER THE ONLY PLACE A PUBLISHED FILE COMES FROM
 * (2026-09-04). A composition written HERE, by the composition builder, is the same envelope as one
 * published at xoko.lat — composition plus the workflows it needs — and it must land the same way:
 * the bundled workflows through `takeWorkflow`, a missing service from the shipped preset list, one
 * that will not land reported rather than swallowed. Anything else would be a second installer,
 * with a second opinion about what a composition is allowed to bring with it.
 *
 * `from` is what the answer says it came from. A fetched file says its URL; a built one says so.
 */
export async function installPayload(
  roots: Roots, payload: Payload, from: string, opts: TakeOptions = {},
): Promise<Took> {
  if (payload.type === 'style') {
    return takeStyle(roots, payload.medium, payload.style, from, opts.collections)
  }
  if (payload.type === 'composition') {
    return takeComposition(roots, payload.composition, payload.workflows, from)
  }
  return takeWorkflow(roots, payload.service, payload.row, from)
}

/** One thing that did not land, with the reason, so a bulk press can report both halves. */
export interface TakeFailure {
  readonly what: string
  readonly error: string
}

/**
 * TAKE SEVERAL, WHICH IS WHAT A COLLECTION IS FOR.
 *
 * ⚠️ ONE PRESS, ONE REQUEST. The alternative was N calls from the browser, each one re-reading the
 * shelf it just changed — and a shelf that redraws four times while you watch. The loop belongs
 * where the writes are.
 *
 * ⚠️ ONE FAILURE DOES NOT TAKE THE REST DOWN. `⤓ take 7` on a library mid-deploy should land the
 * six that are there and say which one was not, rather than throwing away six good writes over the
 * seventh. What comes back is both halves, and the caller says both.
 *
 * Each entry is an id, or `{ id, collections }` for a style that arrived under a header.
 */
export async function takeMany(
  roots: Roots, what: unknown,
): Promise<{ took: Took[]; failed: TakeFailure[] }> {
  if (!Array.isArray(what)) throw new PayloadError('take what? a list of ids')
  const took: Took[] = []
  const failed: TakeFailure[] = []
  for (const entry of what) {
    const id = typeof entry === 'string'
      ? entry
      : (entry && typeof entry === 'object' ? (entry as { id?: unknown }).id : undefined)
    const asked = typeof id === 'string' ? id : ''
    const sets = entry && typeof entry === 'object'
      ? (entry as { collections?: unknown }).collections
      : undefined
    try {
      took.push(await take(roots, asked, {
        ...(Array.isArray(sets) ? { collections: sets.filter((x): x is string => typeof x === 'string') } : {}),
      }))
    } catch (err) {
      failed.push({ what: asked || String(id), error: (err as Error).message })
    }
  }
  return { took, failed }
}

/**
 * A preset by the name anybody would say for it.
 *
 * ⚠️ BOTH ITS ID AND ITS SUGGESTED ROW NAME. `draw-things` is what the ＋ picker calls it;
 * `draw-things-grpc` is what the row ends up called, and therefore the prefix on every workflow the
 * library publishes for it. A brain reading `draw-things-grpc/klein-t2i` and then asking for
 * `draw-things-grpc` is reasoning correctly, and refusing it would be pedantry.
 */
function findPreset(what: string): ServicePreset | null {
  const key = what.toLowerCase()
  return SERVICE_PRESETS.find((p) => p.id === key || p.suggest === key) ?? null
}

/**
 * Add a service from the shipped list — the ＋ button, reachable by name.
 *
 * ⚠️ THE ROW IS THE PRESET'S, FIELD FOR FIELD, and nothing here is composed. It goes through
 * `saveService`, which is the same writer the form posts to and the same parser a hand-edited
 * registry meets. So this cannot produce a row the 🔌 page could not have produced.
 *
 * ⚠️ AND TAKING ONE YOU ALREADY HAVE PUTS THE SHIPPED SHAPE BACK — the same rule the 📚 page
 * states for a workflow. If you moved the port, this moves it back, and says `replaced` so the
 * answer is not silent about it.
 */
async function takeService(roots: Roots, preset: ServicePreset): Promise<Took> {
  const already = (await loadInferenceRegistry(roots)).rows.some((r) => r.id === preset.suggest)
  await saveService(roots, {
    id: preset.suggest,
    label: preset.label,
    role: preset.role,
    transport: preset.transport,
    ...(preset.notes ? { notes: preset.notes } : {}),
  })
  return {
    type: 'service',
    from: 'shipped with this app',
    slug: preset.suggest,
    label: preset.label,
    replaced: already,
    service: preset.suggest,
  }
}

/**
 * ⤓ A COMPOSITION, AND EVERYTHING IT NEEDS TO RUN.
 *
 * ⚠️ THE BUNDLED WORKFLOWS GO IN THROUGH THE ORDINARY DOOR. Each is a whole published file and each
 * is installed by `takeWorkflow` — same merge by slug, same requirements check, same user layer. A
 * composition is therefore never a second way for a workflow to arrive; it is a reason for several
 * of them to arrive at once.
 *
 * ⚠️ AND THE SERVICES THEY SIT ON ARE ADDED, FROM THE SHIPPED LIST, AND SAID OUT LOUD. A workflow is
 * an override on a service row, so on an empty machine every bundled workflow would bounce and you
 * would be handed a chain that cannot run with no clue which of six presets to add. What is added
 * is a row of configuration — a name, a host, a port this build already has an adapter for. It
 * installs nothing, starts nothing and reaches nothing until you press ▶, and it is `added` in the
 * answer so a take is never quietly larger than it looked.
 *
 * ⚠️ A BUNDLED WORKFLOW THAT WILL NOT LAND DOES NOT TAKE THE COMPOSITION DOWN WITH IT. The chain is
 * the thing you asked for and it is saved first; a step whose workflow is missing is a step that
 * says so, which is a fixable state. Refusing the whole take because one of five workflows names a
 * service this build cannot speak would be losing four.
 */
async function takeComposition(
  roots: Roots, composition: Composition,
  bundle: readonly { readonly id: string; readonly payload: { type: 'workflow' | 'style' | 'composition' } }[],
  from: string,
): Promise<Took> {
  const before = await loadComposition(roots, composition.slug)
  await saveComposition(roots, composition)

  const added: string[] = []
  const bundled: string[] = []
  const blocked: { id: string; why: string }[] = []

  for (const entry of bundle) {
    const payload = entry.payload as { type: 'workflow'; service: string; row: InferenceRow }
    try {
      const known = (await loadInferenceRegistry(roots)).rows.some((r) => r.id === payload.service)
      if (!known) {
        const preset = findPreset(payload.service)
        if (!preset) {
          blocked.push({
            id: entry.id,
            why: `this app has no service called ${JSON.stringify(payload.service)} and ships no preset for one`,
          })
          continue
        }
        await takeService(roots, preset)
        added.push(preset.suggest)
      }
      await takeWorkflow(roots, payload.service, payload.row, `${from} → ${entry.id}`)
      bundled.push(entry.id)
    } catch (err) {
      blocked.push({ id: entry.id, why: (err as Error).message })
    }
  }

  return {
    type: 'composition',
    from,
    slug: composition.slug,
    label: composition.label ?? composition.slug,
    replaced: !!before,
    steps: composition.steps.length,
    added,
    bundled,
    blocked,
  }
}

async function takeStyle(
  roots: Roots, medium: string, style: { readonly slug: string; readonly label?: string },
  from: string, collections?: readonly string[],
): Promise<Took> {
  if (!isMedium(medium)) {
    throw new PayloadError(`there is no ${medium} style list to put this in`, 409)
  }
  // ⚠️ `medium` COMES OFF FIRST. It rides on a resolved style as context — which list this is —
  // and the file says it once at the top; written into an entry it is a stray key that the very
  // next read refuses, taking the whole list with it (src/styles/registry.ts).
  const { medium: _from, ...draft } = style as { medium?: unknown } & Record<string, unknown>
  const replaced = (await loadStyles(roots, medium)).styles.some((s) => s.slug === style.slug)
  // ⚠️ THE COLLECTIONS COME FROM THE SHELF, NOT FROM THE FILE. A published style carries none — the
  // collection carries the style — so this is where a set stops being a download filter: your own
  // shelf groups under the same headers you chose from. Cut loose immediately, like everything else
  // a take writes; re-editing the collection on xoko.lat never reaches yours.
  await saveStyle(roots, medium, collections?.length ? { ...draft, collections } : draft)
  // The old picture is not of these words. Same act as saving an edit by hand — a swatch that
  // lies about its style is worse than none.
  if (replaced) await forgetSwatch(roots, medium, style.slug)
  return {
    type: 'style', from, medium, slug: style.slug, label: style.label ?? style.slug, replaced,
  }
}

async function takeWorkflow(
  roots: Roots, service: string,
  row: { readonly workflows?: readonly Workflow[]; readonly engines?: readonly Engine[] },
  from: string,
): Promise<Took> {
  const workflow = row.workflows?.[0]
  if (!workflow) throw new PayloadError(`${from} carries no workflow`)
  const added: string[] = []
  let registry = await loadInferenceRegistry(roots)
  let current = registry.rows.find((r) => r.id === service)
  if (!current) {
    // ⚠️ THE SERVICE COMES WITH IT (2026-08-23). A workflow is an override on a row this app ships,
    // and without the row there is no transport — but the row is not something anybody has to go
    // and find: it is a SHIPPED PRESET, reachable by name, off a fixed list, never a network.
    // `takeComposition` twenty lines up has always done exactly this for its bundled workflows; the
    // single take was the one path that refused instead.
    //
    // ⚠️ AND IT REFUSED WITHOUT NAMING THE FIX, which is how it cost a whole conversation. On an
    // empty machine the map says `▶ take: comfyui/ace-step is the one thing that would` — true of
    // the library, false of this app — so xoko wrote it four times and was told four times that
    // there was no service called comfyui, in a sentence containing no way to get one. Either the
    // map had to stop naming the workflow or the workflow had to bring its service. It brings it: the
    // named act is the whole act, and `added` says out loud what this app now connects to.
    const preset = findPreset(service)
    if (!preset) {
      throw new PayloadError(
        `this app has no service called ${JSON.stringify(service)} to put a workflow on, and ships`
        + ' no preset for one — there is nothing here that could reach it', 404)
    }
    await takeService(roots, preset)
    added.push(preset.suggest)
    registry = await loadInferenceRegistry(roots)
    current = registry.rows.find((r) => r.id === service)
    if (!current) {
      throw new PayloadError(
        `${JSON.stringify(preset.suggest)} was added but is not called ${JSON.stringify(service)}`
        + ' — the workflow names a service this app spells differently', 404)
    }
  }

  const workflows = [...(current.workflows ?? []).filter((r) => r.slug !== workflow.slug), workflow]
  const engine = row.engines?.[0]
  const engines = engine
    ? [...(current.engines ?? []).filter((e) => e.file !== engine.file), engine]
    : null

  await saveService(roots, {
    id: service,
    workflows,
    ...(engines ? { engines } : {}),
  })

  // ⚠️ THE REQUIREMENTS CHECK, FROM THE CACHE. `resolveWorkflows` is the same function the 🔌 page
  // and the picker are built from, so what a take reports is what the app will say about it a
  // second later. The catalog is NOT re-read here: a cold Draw Things scan is ~40 seconds, and
  // making every take wait for one is how a press stops feeling like a press.
  const after = await loadInferenceRegistry(roots)
  const saved = after.rows.find((r) => r.id === service)
  const cached = cachedCatalog(service)
  const resolved = saved
    ? resolveWorkflows(saved, cached.engines, new Map(), new Set(), serviceFiles(service))
      .find((r) => r.slug === workflow.slug)
    : undefined

  return {
    type: 'workflow',
    from,
    service,
    slug: workflow.slug,
    label: workflow.label ?? workflow.slug,
    replaced: (current.workflows ?? []).some((r) => r.slug === workflow.slug),
    ...(added.length ? { added } : {}),
    engine: engine?.file ?? null,
    check: {
      state: resolved?.state ?? 'declared',
      missing: resolved?.missing ?? [],
      asked: cached.askedAt !== null,
    },
  }
}
