// The HTTP surface. `node:http` and no framework, until something concretely requires one —
// and when that happens, write down what forced it (PLAN §14).
//
// The route layout is deliberately not fixed by the plan ("silence there is delegation"), so
// it is fixed here:
//
//   /api/status                     what the server resolved, and what it could not read
//   /api/inference                  the 🔌 shelf — every SERVICE, its caps, whether it is there,
//                                   and the vocabulary its editor is built from. Polled; a plain
//                                   TCP probe; never asks a service anything.
//   /api/inference           POST   add a service, change one, or `{ id, remove: true }` to drop
//                                   your row. A sparse patch over what the app ships. Answers with
//                                   the whole shelf.
//   /api/engines[?refresh=1|<id>]   the 🔌 catalogue — what each service can be asked for,
//                                   declared facts merged with what it reports and with your own
//                                   numbers. THE one endpoint that asks a service, and the only
//                                   slow one. `refresh` re-asks everything, or one service by id.
//   /api/engines             POST   retune ONE checkpoint: a sparse patch over what it declares
//                                   it runs at, `null` per field to reset one. Answers with the
//                                   whole catalogue, so the page never has to merge it itself.
//   /api/styles/comp/<slug>         a composition's OWN styles — what it says to its text steps
//                                   and which media style it names per medium. POST saves one,
//                                   POST …/delete removes one. No swatches: a chain style has no
//                                   cheap probe, because probing it is running the chain.
//   /api/styles/<medium>            a medium's styles, each with its swatch on the asked-for
//                                   (service, model) — that pair is the grid, so it is a query
//   /api/styles/<medium>/preview POST  what a DRAFT style would send on this grid's model:
//                                   the composed prompt, the negative, and which of the two
//                                   channels was read. Composed server-side, by the same
//                                   function a render calls.
//   /api/library[?refresh=1]        📚 the library — every published workflow and composition, each
//                                   told what THIS machine says about it: installed, takeable, and
//                                   which files it is missing. Cached a few minutes; `refresh`
//                                   re-asks the site. ⚠️ NO STYLES — see below
//   /api/library/styles/<medium>    ❖ what xoko.lat publishes for one medium, parsed through this
//                                   app's own style reader and marked `installed`. A style has no
//                                   `needs`, so it is not a row on the shelf above; the section
//                                   you are standing in is the filter
//   /api/take                POST   ⤓ install `{ what }` — one id, or a LIST of them (a collection
//                                   in one press; each entry an id or `{ id, collections }`). A
//                                   SERVICE, named off the
//                                   shipped preset list (no network, and the one act an empty app
//                                   cannot start without), or a catalog id / link for a workflow or
//                                   style from the library. Fetched, read, and handed to the writer
//                                   a hand-typed one meets. Answers with what landed and what it
//                                   still needs
//   /api/install             POST   ＋ install what a chain WROTE — `{ composition, run, document }`.
//                                   The document is the published envelope: a composition and the
//                                   workflows it needs. Goes in through the same writer a ⤓ take
//                                   does, and answers with the same shape, so the nav and 🔌 are
//                                   right without a reload
//   /api/compositions               🧩 the chains on this machine, each resolved against what is
//                                   installed: which workflow would answer each step, whether it is
//                                   `exact` or a substitute, and what is still needed
//   /api/compositions        POST   `{ slug, forget: true }` — 🗑 one. Answers with the list
//   /api/manifest[?rebuild=1]       the index — a derived cache, rebuilt explicitly
//   /api/generate            POST   one request (§4) → one run → N jobs
//   /api/text                POST   ONE press to a writing model — `{ service, workflow, prompt,
//                                   says }` → the words back. NOT xoko (no persona, no session, no
//                                   transcript) and NOT a run (nothing written or indexed): it is
//                                   the `text` step of a chain, which is a press like any other
//   /api/xoko                POST   ✨ one question to the armed brain: it may stop to READ this
//                                   app (`▶ look:`) before answering, and what comes back is prose
//                                   plus the presses it wants made. NOT a run — nothing is
//                                   written, indexed or kept, and nothing it asked for is
//                                   rendered here (src/xoko/)
//   /api/queue                      the ▶ band: every job, its state and its log tail
//   /api/queue/<id>/cancel   POST   stop one
//   /api/secret              POST   set ONE api key, or `{ id, value: null }` to forget it.
//                                   WRITE-ONLY: no route returns a stored key. Answers with the
//                                   shelf, where the row now says `set`
//   /api/stars                      every starred asset's key
//   /api/star                POST   ★ or un-★ one asset
//   /api/preview             POST   🧊 keep the still a mesh drew of itself, beside the master —
//                                   `{ path, png }`, the picture made by the browser's own renderer
//   /api/delete              POST   remove one asset, and prune the husk it leaves
//   /api/rename              POST   name one RUN (`{ path, title }`) — a field in run.json, never
//                                   a file move; empty goes back to the name read off the ask
//   /api/settings                   the ⚙ group: where your WORK lands (`files` — not the
//                                   library, which is xoko.lat), and what quality each medium is
//                                   written at (levels included, so the UI hardcodes none)
//   /api/settings            POST   patch one: move the files folder (new work only — nothing is
//                                   moved) or set a medium's quality
//   /api/reveal              POST   show an asset OR a named root in the OS file manager
//   /content/<path>                 the assets themselves, from the content root
//   everything else                 a file from web/

import { stat, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'

import { PREVIEW_SUFFIX, buildIndex } from '../content/index.ts'
import { BuildError, bind, bindShape } from '../builds/bind.ts'
import { ChainError, patchChainRun, startChainRun } from '../compositions/chain.ts'
import { ImportError, importImage } from '../content/import.ts'
import { RevealError, reveal } from '../content/reveal.ts'
import { RemoveError, removeAsset } from '../content/remove.ts'
import { forgetStar, readStars, setStar } from '../content/stars.ts'
import { CHAIN_DIR, MASTER_EXT, chainRel, renameRun } from '../content/run.ts'
import { CompositionError, deleteComposition, loadCompositions } from '../compositions/registry.ts'
import { candidates, resolveComposition } from '../compositions/resolve.ts'
import { isBind } from '../types/composition.ts'
import { saysFor } from '../compositions/says.ts'
import { cachedCatalog, readCatalog, serviceFiles } from '../inference/catalog.ts'
import { capsFor, declaredEngine, defaultEngineFile, resolveEngines } from '../inference/engines.ts'
import { MINIMAL_CAPS } from '../inference/caps.ts'
import { knobsFor, settableKnobs } from '../inference/knobs.ts'
import { ParamError } from '../inference/params.ts'
import { loadInferenceRegistry } from '../inference/registry.ts'
import { ServiceError, WRITABLE, removeService, saveService } from '../inference/services.ts'
import {
  TuningError, checkPatch, readTuning, tunedByFile, tuningKey, writeTuning,
} from '../inference/tuning.ts'
import type { InferenceRow } from '../types/inference.ts'
import { TRANSPORT_KINDS } from '../types/inference.ts'
import { IDIOMS } from '../types/caps.ts'
import {
  CONTROL_INPUT_TYPES, CONTROL_MODES, REF_SLOTS, TARGET_BLOCKS, WORKFLOW_INPUTS,
} from '../types/workflow.ts'
import { loadKinds, mediaOf, soleMedium } from '../inference/kinds.ts'
import { SERVICE_PRESETS } from '../inference/presets.ts'
import { readShelf } from '../inference/shelf.ts'
import { textAdapterFor } from '../inference/text.ts'
import { resolveWorkflows } from '../inference/workflows.ts'
import type { ResolvedWorkflow } from '../inference/workflows.ts'
import { RequestError, startRun, styleSend } from '../jobs/generate.ts'
import { readLibrary, readLibraryStyles } from '../library/catalog.ts'
import { PayloadError, readWritten } from '../library/payload.ts'
import { installPayload, take, takeMany } from '../library/take.ts'
import type { Queue } from '../jobs/lane.ts'
import { parseGenerationRequest } from '../jobs/request.ts'
import {
  StyleError, deleteCompositionStyle, deleteStyle, loadCompositionStyles, loadStyles, readDraft,
  saveCompositionStyle, saveStyle,
} from '../styles/registry.ts'
import {
  PROBE, askFor, forgetSwatch, queueSwatch, readSwatch, saveAsk, swatchRel,
} from '../styles/probe.ts'
import type { SwatchTarget } from '../styles/probe.ts'
import { axesFor } from '../styles/axes.ts'
import { contentLockedByEnv, defaultContentRoot, resolveIn, PathEscapeError } from '../paths.ts'
import { installId } from '../install.ts'
import type { Roots } from '../paths.ts'
import { SecretError, saveSecret, secretsSet } from '../secrets.ts'
import { checkContentRoot, ensureContentRoot, readSettings, writeSettings } from '../settings.ts'
import { MEDIA_WITH_QUALITY, isQualityLevel, qualityFor, scaleFor } from '../types/quality.ts'
import type { Caps } from '../types/caps.ts'
import type { Manifest } from '../types/manifest.ts'
import { MEDIA, isMedium } from '../types/medium.ts'
import type { Medium } from '../types/medium.ts'
import { ctx } from '../validate.ts'
import { FOLD, LOOKS_WITHOUT_A_WORD, XOKO, holdings, look, readAnswer, stalePublished } from '../xoko/index.ts'
import type { Act } from '../xoko/index.ts'
import {
  foldPoint, listSessions, newSession, readSession, removeSession, sessionChars, titleFrom,
  writeSession,
} from '../sessions.ts'
import type { Session, Turn } from '../sessions.ts'
import { sendJson, sendText, serveFile } from './static.ts'

/** How much transcript travels with a question, and how much of one turn. Bounded because a
 *  command-line brain re-reads all of it every press.
 *
 *  ⚠️ THIS CEILING SURVIVES COMPACTION and is not negotiable by it. Folding is a way to keep more
 *  of what was said inside a budget; it is not permission to remove the budget. A session that
 *  somehow outgrows this still hits the wall rather than quietly spending more. */
const TURNS = 12
const TURN_CHARS = 4000

/**
 * HOW MUCH OF THE APP TRAVELS WITH A QUESTION, and how many times one question may stop to read.
 *
 * ⚠️ THE MAP IS BROWSER-COMPOSED AND THEREFORE CAPPED HERE. web/lib/xoko-map.js builds it from the
 * same registries the nav is drawn from, which is the only place that knows what is on screen — but
 * "the only place that knows" is not "trusted to be small", and an uncapped block would be a page
 * deciding what every press costs.
 *
 * ⚠️ AND THREE HOPS, BECAUSE A LOOP THAT CANNOT END IS NOT A FEATURE. Each hop is another whole
 * invocation of the brain with the transcript attached; three is enough to orient (what is in the
 * library → what is installed → answer) and few enough that a brain which has decided to browse
 * runs out rather than the person's plan does.
 */
const MAP_CHARS = 4000

/**
 * HOW THE PREVIOUS TURN'S OWN ▶ LINES WENT — the browser's report, read as a stranger's input.
 *
 * ⚠️ THIS IS THE LOOP CLOSING, AND IT IS THE MOST EXPENSIVE THING THAT WAS MISSING. Everything but
 * `look` is performed in the browser, under the reply, and the answer was never returned — so xoko
 * wrote six lines, was told nothing, and next turn did the only thing a brain in that position can:
 * it narrated the outcome it expected and then reasoned from it. What came out was fluent, specific
 * and entirely invented — "neither workflow found a home; the library builds them for a service that
 * answers to a different internal name here" — about six installs, three of which were over the cap
 * and never attempted at all, explained by a mechanism that does not exist.
 *
 * ⚠️ IT IS BOUNDED AND RE-READ LIKE ANY OTHER INPUT. It arrives from a browser, so the shape is
 * checked rather than trusted, every string is clipped, and only the last turn's worth is taken —
 * a growing ledger of every press ever made would be the queue in the conversation, which is a
 * different thing from knowing whether the last thing you asked for happened.
 */
const DID_ROWS = 8
const DID_CHARS = 200

function readDid(v: unknown): string {
  if (!Array.isArray(v) || !v.length) return ''
  const rows = v.slice(0, DID_ROWS).flatMap((row) => {
    if (!row || typeof row !== 'object') return []
    const r = row as Record<string, unknown>
    const verb = typeof r['verb'] === 'string' ? r['verb'].slice(0, 20) : ''
    const what = typeof r['what'] === 'string' ? r['what'].slice(0, DID_CHARS) : ''
    if (!verb) return []
    const note = typeof r['note'] === 'string' ? r['note'].slice(0, DID_CHARS) : ''
    // ⚠️ THE NOTE IS PRINTED ON A SUCCESS TOO (2026-08-23). It used to be the failure channel
    // only, so every press that worked came back as `— done` and the one thing worth confirming —
    // WHICH workflow answered and what it was actually set to — was the one thing not said. A brain
    // that cannot check its own press describes the one it meant to make.
    return [r['ok'] === true
      ? `  ✓ ${verb} ${what} — ${note || 'done'}`
      : `  ✕ ${verb} ${what} — ${note || 'did not happen'}`]
  })
  if (!rows.length) return ''
  return ['— the ▶ lines in your last reply, and how each one actually went. This is the only'
    + ' report you get and it is the whole of it: say what it says, and never explain a failure'
    + ' it does not explain —', ...rows].join('\n')
}
const MAX_HOPS = 3

/** ⚠️ ONLY TO TELL TWO OF THEM APART IN THE ▶ BAND. A `runId` on a render names the folder it will
 *  write; words write no folder, so this names the press and nothing else. */
let wordJobs = 0

/**
 * WHEN A CONVERSATION GETS FOLDED, in characters of transcript.
 *
 * ⚠️ CHARACTERS, BECAUSE THERE IS NO TOKENIZER HERE. ~4 chars a token is a rule of thumb and this
 * number is roughly 10k tokens of context — enough that a working conversation is never
 * interrupted, small enough that nobody is quietly paying for forty exchanges on every press.
 *
 * ⚠️ AND IT IS CHECKED BEFORE THE ASK, NOT AFTER. Folding afterwards would mean the expensive turn
 * is the one that already went out.
 */
const FOLD_CHARS = 40_000
/** How many exchanges stay verbatim behind a fold. */
const FOLD_KEEP = 4

export interface AppOptions {
  readonly roots: Roots
  readonly queue: Queue
  /** What was wrong with the library folder at startup, if anything. Surfaced rather than
   *  thrown: the settings that fix it are inside the app. */
  readonly contentIssue?: string | null
}

/** Bodies are small JSON requests; anything larger is not something this API takes. */
const MAX_BODY = 256 * 1024

/** …except an upload, which is the one endpoint that carries pixels. A phone photograph is
 *  routinely 10–15 MB; this is generous enough not to refuse one and small enough that a mistake
 *  is not a memory event. */
const MAX_UPLOAD = 64 * 1024 * 1024

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > MAX_BODY) throw new RequestError('that request body is too large', 413)
    chunks.push(chunk as Buffer)
  }
  if (!chunks.length) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf-8'))
  } catch (err) {
    throw new RequestError(`the request body is not JSON: ${(err as Error).message}`)
  }
}

/**
 * The raw bytes of an upload.
 *
 * ⚠️ NO MULTIPART. The browser sends the file as the body and its NAME in a header, so there is
 * no boundary parser here and no dependency for one — a form encoding exists to carry several
 * fields, and this carries one file. The name is a label (it becomes a slug, never a path) and the
 * type is decided by opening the bytes, not by believing the sender (src/content/import.ts).
 */
async function readRawBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > MAX_UPLOAD) throw new RequestError('that file is too large to import', 413)
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks)
}

/** The only folders the browser may ask to have opened, by name. A whitelist rather than a path
 *  is what keeps `/api/reveal` inside §15 rule 1. */
const ROOT_KEYS = { files: 'content', data: 'data', install: 'install' } as const

export function createHandler({ roots: initial, queue, contentIssue = null }: AppOptions) {
  // ⚠️ MUTABLE, deliberately: the library can be moved while the app is running, and every
  // reader below closes over this binding rather than a copy. `install` and `data` never change
  // — only `content` does, and only through `/api/settings`.
  let roots = initial
  let libraryIssue = contentIssue
  const web = resolveIn(initial.install, 'web')

  // The index is a derived cache, so it is held in memory and refreshed when a job finishes —
  // the factory's behaviour. A page load never triggers a walk.
  let manifest: Manifest = { generatedAt: new Date(0).toISOString(), media: [], chains: [] }
  let refreshing: Promise<void> | null = null

  const refresh = (full = false): Promise<void> => {
    const pending = refreshing ?? buildIndex(roots, { full })
      .then(({ manifest: next, read }) => {
        manifest = next
        if (read) process.stdout.write(`index · ${next.media.length} group(s), ${read} master(s) read\n`)
      })
      .catch((err: unknown) => { process.stderr.write(`✗ index: ${(err as Error).message}\n`) })
      .finally(() => { refreshing = null })
    refreshing = pending
    return pending
  }

  void refresh()
  queue.onFinished(() => { void refresh() })

  async function status(): Promise<unknown> {
    const registry = await loadInferenceRegistry(roots)
    const tuning = await readTuning(roots)
    const styles = await Promise.all(MEDIA.map((m) => loadStyles(roots, m)))
    return {
      ok: registry.issues.length === 0 && !tuning.issues.length
        && styles.every((p) => !p.issues.length),
      roots,
      // Which install this is, so the browser can drop what it remembers about a different one —
      // see src/install.ts. It is the first thing the front end asks for, before it reads a
      // single stored key.
      install: await installId(roots),
      // So `npm run stop` can find this process on an OS with no `lsof` (scripts/serve.ts).
      pid: process.pid,
      inference: { count: registry.rows.length, ids: registry.rows.map((r) => r.id), layers: registry.layers },
      styles: Object.fromEntries(styles.map((p) => [p.medium, p.styles.length])),
      queue: {
        running: queue.list().filter((j) => j.state === 'running').length,
        queued: queue.list().filter((j) => j.state === 'queued').length,
      },
      media: manifest.media.length,
      issues: [...registry.issues, ...tuning.issues, ...styles.flatMap((p) => p.issues)],
    }
  }

  /**
   * The 🔌 SHELF — one row per service, whether it is there, and the WORDS ITS EDITOR IS MADE OF.
   *
   * ⚠️ THE VOCABULARY TRAVELS WITH IT. Every list the add-a-service form offers — the transports,
   * the prompt idioms, the reference roles, and which fields may be written at all — is the
   * server's, arriving here. (The roles left on 2026-09-06 with the dropdown that read them.) A browser-side copy of any of them is how a seventh
   * transport ships half-known, and how a form ends up offering a field the writer refuses.
   */
  async function shelf(): Promise<unknown> {
    const registry = await loadInferenceRegistry(roots)
    const kinds = await loadKinds(roots)
    return {
      // ⚠️ NAMES ONLY. The shelf is told WHICH keys exist so a card can say "set" or "not set";
      // no path in this app returns a stored key (src/secrets.ts).
      services: await readShelf(registry, await secretsSet(roots), kinds.kinds),
      // ⚠️ THE 🔌 picker offers one row per kind of output — including the kinds nothing installed
      // makes yet, which is the useful half of the answer.
      media: MEDIA,
      // ⚠️ AND NOTHING FOR WORDS (2026-08-30). There used to be a `brain: 'text'` here, so the
      // engine menu could draw a ✨ band beside the media bands and arm a `chat` workflow on it.
      // Words are not a medium you pick and not a capability this shelf serves: an LLM connects to
      // xoko, in ✨ xoko, and that is the only place. The text rows are still in `services` —
      // ✨ reads them, 🔌 filters them out — because the shelf's question is "what does this
      // machine have", and the answer includes what xoko is thinking with.
      vocab: {
        transports: TRANSPORT_KINDS,
        idioms: IDIOMS,
        // ⚠️ THE WORDS THE FIELD ALREADY USES, AND THEY ARE A REGISTRY NOW (2026-08-12). A row
        // each — the word plus the one line saying what it means — in the order a picker should
        // offer them. The browser draws these; it does not decide what they are, and it no longer
        // keeps two private copies of the glosses (shell.js and the 🔌 page each had one, and
        // they disagreed about `i2i`).
        kinds: kinds.kinds,
        inputs: WORKFLOW_INPUTS,
        refs: REF_SLOTS,
        // ⚠️ THE CONTROL VOCABULARIES ARE INDEXED LISTS (src/types/workflow.ts) — a word's POSITION
        // is its value on the wire. The form offers them so a workflow cannot name one the encoder
        // would have to invent a number for.
        controlTypes: CONTROL_INPUT_TYPES,
        controlModes: CONTROL_MODES,
        targetBlocks: TARGET_BLOCKS,
        // What a service that has declared nothing yet is offered as a starting point — MINIMAL,
        // not permissive, and the same constant every unstated row already gets (PLAN §4).
        capsDefault: MINIMAL_CAPS,
        // What a page may set on a row. The form draws itself from this, so it cannot offer a
        // field `saveService` would refuse — see src/inference/services.ts for why it is short.
        writable: WRITABLE,
        // ⚠️ WHAT A NEW SERVICE CAN BE — the shapes with an adapter behind them, and only those.
        // Picking one fills the transport, the port and the call shape, so the person is left with
        // the only question they can actually answer: where is it.
        presets: SERVICE_PRESETS,
      },
      issues: [...registry.issues, ...kinds.issues],
    }
  }

  /**
   * The 🔌 CATALOGUE — every service's engines, declared facts merged with what it reports (§4)
   * and with the numbers you retuned them to.
   *
   * The one endpoint allowed to be slow. It asks a service the first time it is called for that
   * service and caches the answer; `refresh` re-asks one that already answered — `1` for all of
   * them, or a service id for just that card's ↻. A cold Draw Things catalog is a ~40s scan,
   * which is exactly why `/api/inference` — the POLLED one — never comes near this.
   *
   * Every service in one answer rather than one call per service: there are three of them, the
   * 🔌 section wants them all, and the ✍ dock wants one — two shapes from one payload beats two
   * endpoints that drift.
   */
  async function engines(refresh: string | null): Promise<unknown> {
    const registry = await loadInferenceRegistry(roots)
    const tuning = await readTuning(roots)
    // ⚠️ THE KIND SAYS WHICH MEDIUM A WORKFLOW ANSWERS FOR, and that is the only way to know it on a
    // service that answers for four (one ComfyUI declares no medium of its own). It is needed here
    // to work out what each workflow can be ASKED for — see `settable` below.
    const { kinds } = await loadKinds(roots)
    const mediumOf = new Map(kinds.map((k) => [k.slug, k.medium]))
    // ⚠️ WHICH OF THESE 📚 HAS SINCE REPLACED — `null` when 📚 could not be asked (see
    // `stalePublished`). A workflow is taken once and then never revisited, so an installed row and
    // a current row are indistinguishable on this page; the day the library replaced six music
    // workflows with one, the machine went on offering the six and every screen agreed. This is the
    // one field that can tell them apart, and it costs a cached read.
    const stale = await stalePublished(roots)
    const services = await Promise.all(registry.rows.map(async (row) => {
      // ⚠️ ONE CARD'S ↻ ASKS ONE SERVICE. Re-scanning every engine because one of them was
      // restarted is a ~40s wait for an answer nobody asked about.
      const catalog = await readCatalog(row, {
        refresh: refresh === '1' || refresh === row.id, roots,
      })
      return {
        id: row.id,
        label: row.label ?? row.id,
        role: row.role ?? 'generator',
        // What it makes, read off its workflows (../inference/kinds.ts) — a list, because one
        // ComfyUI makes five, and empty until it has a workflow at all.
        media: mediaOf(row, kinds),
        // ⚠️ THE KNOBS THIS SERVICE'S CHECKPOINTS CAN BE SET TO, with their kind, range and unset
        // value. The ⚙ editor is DERIVED from this: it works on a checkpoint nobody declared —
        // which is every checkpoint on a service you added — and a knob the app cannot send never
        // appears, because the table that lists them is the table the adapter reads.
        // ⚠️ THE SOLE MEDIUM, NOT THE UNION. This table draws a CHECKPOINT's ⚙ editor, and a
        // service serving five media would put a tempo and a key on an SDXL file. `null` for a
        // multi-medium service is what a ComfyUI has always had here.
        knobs: knobsFor(soleMedium(row, kinds)),
        // The DECLARED rows are a real answer even when the service could not be asked, and
        // `catalog.error` says why there is nothing beside them.
        engines: resolveEngines(
          row, catalog.engines, tunedByFile(tuning, row.id),
          new Set(registry.patchedEngines.get(row.id) ?? [])),
        // ⚠️ WHAT CAN ACTUALLY BE ASKED FOR — the workflows, which is what the picker is built from
        // (src/inference/workflows.ts). `engines` above is the level below it: what each file
        // wants and whether it is there. The 🔌 page shows both; the composer only ever shows this.
        workflows: resolveWorkflows(row, catalog.engines, tunedByFile(tuning, row.id),
          new Set(registry.patchedWorkflows.get(row.id) ?? []), serviceFiles(row.id))
          // ⚠️ WHAT THIS ONE WORKFLOW CAN BE ASKED FOR — the medium's knob table narrowed to the
          // holes this workflow actually declares (src/inference/knobs.ts). Attached HERE rather
          // than inside `resolveWorkflows`, which has no kinds map and therefore no medium.
          //
          // ⚠️ AND IT IS THE WHOLE KNOB, NOT A LIST OF KEYS. Whatever draws a control needs the
          // range, the choices and the sentence anyway; sending names and making the browser hold
          // a second copy of the table is how the two get to disagree.
          .map((workflow) => ({
            ...workflow,
            settable: settableKnobs(mediumOf.get(workflow.kind), workflow.graph, workflow.params, workflow.knobs),
            stale: !!stale?.has(`${row.id}/${workflow.slug}`),
          })),
        catalog: {
          askedAt: catalog.askedAt,
          error: catalog.error,
          reports: catalog.engines?.length ?? null,
          loras: catalog.loras,
          controlNets: catalog.controlNets,
        },
      }
    }))
    return { services, issues: tuning.issues }
  }

  /**
   * RETUNE ONE CHECKPOINT — the ⚙ band of the 🔌 section.
   *
   * ⚠️ A KNOB OF THIS MEDIUM, and nothing more. `caps` are deliberately not writable HERE: editing
   * "this model reads a negative prompt" does not give it one, it only makes the app lie to
   * itself. What IS writable is what the checkpoint RUNS AT — a preference, and reasonable people
   * differ about 16 steps.
   *
   * ⚠️ IT NO LONGER MATTERS WHETHER THE REGISTRY DESCRIBED THE CHECKPOINT (2026-08-07). It used to
   * 404 on one that declared nothing, which meant every checkpoint on a service you added — all of
   * them, always. What may be set comes from the knob table now (src/inference/knobs.ts).
   */
  async function tune(body: unknown): Promise<unknown> {
    const o = body as { service?: unknown; file?: unknown; params?: unknown }
    if (typeof o.service !== 'string' || !o.service) throw new RequestError('which service?')
    if (typeof o.file !== 'string' || !o.file) throw new RequestError('which engine? (file)')
    const registry = await loadInferenceRegistry(roots)
    const row = registry.rows.find((r) => r.id === o.service)
    if (!row) throw new RequestError(`no service ${JSON.stringify(o.service)}`, 404)
    const patch = checkPatch(
      declaredEngine(row, o.file)?.params ?? {}, capsFor(row, o.file),
      soleMedium(row, (await loadKinds(roots)).kinds), o.params)
    await writeTuning(roots, tuningKey(row.id, o.file), patch)
    // The whole catalogue back, from cache: the page redraws from one shape and never merges an
    // answer into what it was already showing.
    return engines(null)
  }

  /**
   * ADD A SERVICE, CHANGE ONE, OR DROP YOUR ROW — the ⚙ band of a service card.
   *
   * One endpoint for all three because they are one act on one file: what my layer says about
   * this id. The answer is the whole shelf, so the page redraws from one shape.
   */
  async function service(body: unknown): Promise<unknown> {
    const o = body as { id?: unknown; remove?: unknown }
    const done = o.remove === true
      ? await removeService(roots, o.id)
      : await saveService(roots, body)
    return { ...(await shelf() as object), saved: done }
  }

  /**
   * ✨ WHAT XOKO THINKS WITH — resolved once, here, for every caller that needs words.
   *
   * ⚠️ NOBODY NAMES IT ANY MORE (2026-08-30). It took a service and a workflow from the browser,
   * because the brain used to be an engine armed in 🔌 like any checkpoint, and words used to be a
   * medium with a `chat` workflow on it. Both are gone: an LLM CONNECTS TO XOKO, in ✨ xoko, and
   * there is one connection. So this reads the registry and answers — a page cannot pick a
   * different brain for one question, and there is no workflow layer left to disagree with.
   *
   * ⚠️ ONE BRAIN, TWO SURFACES. ✨ asks it questions and a chain's `text` step asks it to write;
   * both are xoko, and they must not be able to disagree about which model that is. The chain used
   * to name its own service and workflow off the composition file, which is how a published `mascot`
   * reached for `ollama/prompt-smith` on a machine where xoko was Claude Code — a second brain,
   * installed for the occasion, that had never heard of this app.
   *
   * The MODEL is the connection's own default — the one pinned on the ✨ card, or the first the
   * brain publishes (src/inference/engines.ts).
   */
  async function brainFor(): Promise<{ row: InferenceRow; model: string | null }> {
    const registry = await loadInferenceRegistry(roots)
    // ⚠️ THE ROLE IS THE TEST, and there is exactly one row that can pass it (2026-08-30). It used
    // to be `role: 'generator' && medium: 'text'` — a writing model wearing a medium so it could
    // sit on a shelf of things that make output you keep.
    const row = registry.rows.find((r) => r.role === 'brain')
    if (!row) {
      throw new RequestError(
        'xoko is not connected to anything yet — connect it in ✨ xoko, to whatever you already '
        + 'have: a client on this machine you have signed into, a model running here, or an '
        + 'endpoint you hold a key for', 409)
    }
    // ⚠️ NULL IS ALLOWED AND MEANS "AS YOU CONFIGURED IT". Some command-line clients publish a
    // model list this build can name and some take no model flag at all; for those, asking the
    // client as it stands is the honest ask, and inventing an id to pass would not be. The endpoint
    // adapter refuses a null itself, where the field is genuinely required.
    return { row, model: defaultEngineFile(row, cachedCatalog(row.id).engines) }
  }

  /**
   * ✍️ ONE PRESS TO A WRITING MODEL — the `text` step of a chain, and nothing else.
   *
   * ⚠️ IT IS NOT XOKO, AND THE DIFFERENCE IS THE WHOLE REASON IT EXISTS. xoko has a persona, a
   * transcript, a fold, a map of your app and four verbs it may use; a chain's text step has a job
   * and one sentence. Routing a step through `/api/xoko` would give the step xoko's system prompt —
   * so a step asked to write a prompt could answer with `▶ make image:` and start a render nobody
   * asked for.
   *
   * ⚠️ AND IT IS NOT A RUN. Nothing is written to the content root, indexed, or given provenance:
   * words that exist to become the next step's input are not an artifact you keep. The day a chain
   * wants to KEEP its text — a character sheet, a caption file — that is a run, through `startRun`,
   * like everything else you keep.
   *
   * ⚠️ THE INSTRUCTION IS COMPOSED HERE, from the step and the workflow (src/compositions/says.ts),
   * and never sent by the browser. A page that could set a system prompt is a page that decides
   * what this process asks a model, and the composed one is the same string whichever surface ran
   * the chain.
   */
  async function text(body: unknown): Promise<unknown> {
    const o = body as { prompt?: unknown; says?: unknown; sees?: unknown }
    const prompt = typeof o.prompt === 'string' ? o.prompt.trim() : ''
    if (!prompt) throw new RequestError('a text step needs something to work from')

    // ⚠️ THE BRAIN IS XOKO'S, NOT THE STEP'S (2026-08-24). A composition names no engine for words
    // — the parser refuses one — so there is nothing to look up here and nothing a downloaded chain
    // can install by writing a slug.
    const { row, model } = await brainFor()
    // ⚠️ `says` FROM THE BROWSER IS THE STEP'S OWN FIELD, not a free-form system prompt: it came
    // off a composition this app parsed and stored, and it goes through the same composer a
    // step with none does — so the floor (answer with the thing, not about it) is never skipped.
    const system = saysFor(typeof o.says === 'string' ? { says: o.says } : {})
    // Same shape: a step that declares none is exactly the single-shot this has always been.
    const sees = Array.isArray(o.sees)
      ? o.sees.filter((x): x is string => typeof x === 'string')
      : []

    /**
     * ⚠️ A STEP MAY GO AND READ THIS MACHINE FIRST (`MakeStep.sees`, 2026-08-31).
     *
     * Every text step until now was single-shot, which was right while a step's job was to WRITE
     * something — a brief, a caption, a page of markup. It is wrong the moment a step's job depends
     * on facts only this process holds: what services are installed, what 📚 already publishes,
     * what a ComfyUI node's widgets really are. A chain that cannot ask those can only guess at
     * them, and guessing is the one thing a workflow must never do about a graph.
     *
     * ⚠️ THE LOOKS ARE THE STEP'S OWN DECLARED LIST, not "whatever it asks for". A composition
     * names what it needs to see when it is published; anything else it writes is left in the
     * answer, unanswered, where the person can read it. Read-only either way — `look()` writes
     * nothing, ever (src/xoko/look.ts).
     *
     * ⚠️ AND `▶ make` LINES STAY DEAD HERE. This reads ONLY the look verbs out of the answer; the
     * whole reason `/api/text` exists apart from `/api/xoko` is that a step asked to write a prompt
     * must not be able to start a render nobody asked for.
     */
    const talk = textAdapterFor(row)
    const sight = { roots, manifest }

    /**
     * ⚠️ IT IS A JOB, LIKE EVERY OTHER STEP OF A CHAIN (2026-09-01), AND UNTIL TODAY IT WAS THE
     * ONLY ONE THAT WAS NOT.
     *
     * A step that renders goes through the queue: the request that starts it returns in
     * milliseconds with an id, and the work is the server's. A step that WRITES held one HTTP
     * request open for the whole of it — four spawned processes and several minutes — and the
     * server did the work inside that request. So the connection WAS the run: a browser two rooms
     * away over Tailscale blinked mid-step, and everything the step had done went with it, leaving
     * a run folder holding nothing but the sentence that started it.
     *
     * Nothing about the chain moves here. The loop is still the browser's — that is what makes a
     * chain something you can watch and interrupt (web/lib/chain.js), and it is unchanged. What
     * moves is only the WORK, to where the work of every other step already was.
     *
     * ⚠️ AND THE ANSWER COMES BACK OFF THE QUEUE, not out of this response. Words have no file to
     * be read back off the index, so the job `produce`s them and whoever is waiting reads them off
     * `/api/queue` — which means the waiting is a poll rather than a held socket, and a poll
     * survives everything a socket does not.
     *
     * ⚠️ ⏹ IS NOW A REAL CANCEL. It used to be the socket closing, which was neat and meant the
     * only way to stop a step was to abandon the page. A job has an id and the ▶ band already has
     * a ✕ for it.
     */
    const short = prompt.replace(/\s+/g, ' ').slice(0, 48)
    return {
      job: queue.add({
        label: `${row.label ?? row.id} · words · ${short}`,
        // ⚠️ FAST, NOT SERIAL. The serial lane exists because there is one GPU; asking a model on
        // somebody else's machine — or a client on this one — competes with a render for nothing.
        lane: 'fast',
        runId: `words-${++wordJobs}`,
        engine: row.id,
        run: async ({ signal, log, produce }) => {
          /**
           * ⚠️ WHAT IT CAN READ WITHOUT ASKING IS SIMPLY IN FRONT OF IT (2026-09-01).
           *
           * `sees` used to mean only "may ask for", so a step declaring `workflows` and `library`
           * answered with two ▶ lines, was given 3.5KB, and was asked again — three extra spawned
           * processes to deliver something smaller than the step's own instructions. Those two
           * answer with nothing after them and are always wanted, so they ride along with the
           * question, exactly as the map does for xoko (web/lib/xoko-map.js).
           *
           * ⚠️ THEY STAY ASKABLE ANYWAY. A word NARROWS these lists, and the pre-run one is
           * unnarrowed — so a step that wants `▶ look: library sticker` can still spend a hop on
           * it. Nothing is taken away; the common case simply stops costing a round trip.
           */
          const handed = sees.filter((t) => LOOKS_WITHOUT_A_WORD.includes(t))
          const given = handed.length
            ? await Promise.all(handed.map((t) => look(sight, { target: t, about: '' })))
            : []
          if (given.length) log(`read ${handed.join(', ')} first — ${given.join('').length} chars`)

          const history: { said: string; answered: string }[] = []
          let ask = given.length ? [...given, prompt].join('\n\n') : prompt
          let hops = 0
          for (;;) {
            /**
             * ⚠️ IT STREAMS, AND NOBODY IS WATCHING — which is the point (2026-09-04).
             *
             * Nothing here needs the deltas: the answer is read whole below, and the browser is
             * polling the queue rather than holding a socket. What streaming buys is EVIDENCE OF
             * LIFE. `--output-format text` buffers, so a client writes nothing at all until it is
             * finished, and the run timeout — which restarts on every byte (src/inference/cli/
             * run.ts) — could only ever be measuring total duration. The composition builder's
             * `shape` step, the longest single answer this app asks for, was killed mid-write at
             * 180 seconds after the survey before it had already been paid for.
             *
             * So the step asks for the streaming argv and throws the pieces away. A model that has
             * been emitting for four minutes is not hung; the one that has said nothing for ninety
             * seconds is, and that is now the only thing the number means.
             */
            const answer = await talk.ask({
              row, roots, model, prompt: ask, history, system, signal, log,
              onDelta: () => {},
            })
            const read = readAnswer(answer.text)
            const wanted = sees.length
              ? read.looks.filter((l) => sees.includes(l.target))
              : []
            if (!wanted.length || hops >= MAX_HOPS) {
              // ⚠️ `read.say` AND NOT `answer.text`. A step that looked something up on its way
              // here has its own ▶ lines in the reply; what the next step is handed is the prose it
              // wrote, which is the thing it was asked for.
              produce((sees.length ? read.say : answer.text).trim())
              return
            }
            hops += 1
            log(`hop ${hops}: ${wanted.map((l) => l.target).join(', ')}`)
            const seen = await Promise.all(wanted.map((l) => look(sight, l)))
            history.push({ said: ask, answered: answer.text })
            ask = [
              ...seen,
              `The step asked for: ${JSON.stringify(prompt.slice(0, 400))}`,
              hops >= MAX_HOPS ? 'That is the last thing you can look up — answer now.' : '',
            ].filter(Boolean).join('\n\n')
          }
        },
      }).id,
      service: row.id,
      model,
    }
  }

  /**
   * 🧩 THE COMPOSITIONS ON THIS MACHINE, EACH RESOLVED — the chain, and what would run it.
   *
   * ⚠️ RESOLVED HERE AND NOT IN THE BROWSER. Which workflow answers a step is the same question the
   * ⤓ requirements check answers, off the same registry and the same cached catalogs; a
   * browser-side copy of that rule would be a second opinion about whether a chain can run, and it
   * would disagree the first time either was fixed.
   *
   * ⚠️ AND FROM THE CACHE, never a fresh probe. A cold Draw Things scan is ~40 seconds, and opening
   * a shelf must not cost one.
   */
  async function compositions(): Promise<unknown> {
    const [registry, kinds, loaded] = await Promise.all([
      loadInferenceRegistry(roots), loadKinds(roots), loadCompositions(roots),
    ])
    const mediumOf = (kind: string): Medium | null =>
      kinds.kinds.find((k) => k.slug === kind)?.medium ?? null
    const pool = candidates(
      registry.rows, (id) => cachedCatalog(id).engines, serviceFiles, mediumOf)
    return {
      compositions: loaded.compositions.map((one) => resolveComposition(one, pool)),
      issues: [...loaded.issues, ...registry.issues],
    }
  }

  /**
   * 🧩 BIND ONE CHAIN'S RESULT — the last step of a composition, and the only press in this app
   * that reaches no engine at all (src/builds/bind.ts).
   *
   * ⚠️ IT IS NOT `/api/generate`, AND THAT IS THE CORRECTION THIS WHOLE ROUTE IS (2026-08-24).
   * Binding went through the ordinary press for one day: a `builtin` service, a `bind` workflow, a
   * `book` medium, a `parts` input. Four inventions to file one PDF, and the medium was a product
   * name in a list of materials. A generate is "one ask, one service, one asset on a shelf"; this
   * is "the thing the chain was for", and it belongs to the chain.
   *
   * ⚠️ THE CONTAINER AND THE PAPER COME OFF THE STEP, NOT OFF THE WIRE. The browser says which
   * composition ran and which assets it made; what to do with them is read from the composition on
   * disk. So a request cannot ask this to write a shape the chain does not declare.
   */
  async function build(body: unknown): Promise<unknown> {
    const o = body as {
      composition?: unknown; run?: unknown; step?: unknown; parts?: unknown; captions?: unknown
    }
    if (typeof o.composition !== 'string') throw new RequestError('which composition?')
    if (typeof o.run !== 'string') throw new RequestError('which run of it?')
    if (typeof o.step !== 'string') throw new RequestError('which step?')
    const { compositions: all } = await loadCompositions(roots)
    const one = all.find((c) => c.slug === o.composition)
    if (!one) throw new RequestError(`there is no composition called ${JSON.stringify(o.composition)} here`, 404)
    const step = one.steps.find((x) => x.id === o.step)
    if (!step || !isBind(step)) {
      throw new RequestError(`${JSON.stringify(o.step)} is not a bind step of ${one.slug}`)
    }
    const parts = Array.isArray(o.parts) ? o.parts.filter((x): x is string => typeof x === 'string') : []
    const captions = Array.isArray(o.captions)
      ? o.captions.filter((x): x is string => typeof x === 'string') : []
    try {
      const made = await bind(roots, {
        composition: one.slug,
        run: o.run,
        step: step.id,
        ...bindShape(step),
        parts,
        captions,
      })
      // The book is on disk and the run it belongs to is already in the index — but without this
      // the card that would show it is one refresh behind, which for the last step of a chain means
      // the thing you were waiting for appears to have gone nowhere.
      await refresh(true)
      return made
    } catch (err) {
      if (err instanceof BuildError) throw new RequestError(err.message, err.status)
      if (err instanceof ChainError) throw new RequestError(err.message, err.status)
      throw err
    }
  }

  /**
   * ＋ INSTALL WHAT A CHAIN WROTE — the composition builder's whole point, and a take that never
   * touched the network.
   *
   * ⚠️ IT IS A BUTTON AND NOT A STEP, WHICH IS THE CORRECTION (2026-09-04). This was `binds:
   * 'registry'` for four days: the last step of the chain filed the document as it ran. That put
   * the one act that changes the app at the end of a run, where it could happen exactly once — so
   * a document the parsers refused was a dead run. The survey, the node reads and the whole
   * written composition were sitting there, one key name away from working, with nothing to press.
   * A button can be pressed again.
   *
   * ⚠️ THE DOCUMENT IS THE PUBLISHED ENVELOPE, and it goes in through `installPayload` — the same
   * writer a ⤓ take uses. So a composition written here brings its workflows exactly as a published
   * one does: each through the ordinary workflow door, a missing service added from the shipped
   * preset list, one that will not land reported rather than swallowed. There is no second
   * installer with a second opinion about what a composition may bring with it.
   *
   * ⚠️ AND IT ANSWERS LIKE A TAKE, because the same thing happened: the whole shelf, the library,
   * and the whole chain list, so the nav has the new row and 🔌 has its workflows without a reload
   * (web/lib/shell.js → `tookShelf`).
   */
  async function install(body: unknown): Promise<unknown> {
    const o = body as { composition?: unknown; run?: unknown; document?: unknown }
    if (typeof o.composition !== 'string') throw new RequestError('which composition wrote it?')
    if (typeof o.run !== 'string') throw new RequestError('which run of it?')
    if (typeof o.document !== 'string') throw new RequestError('install what? there is no document')

    // Trimmed, stamped and held to every rule a downloaded file meets (src/library/payload.ts).
    const took = await installPayload(roots, readWritten(o.document), 'written here')
    // ⚠️ ON THE RUN, because the installed thing keeps no memory of where it came from. Without
    // this the card would describe some words instead of the chain it added to the nav.
    await patchChainRun(roots, o.composition, o.run, { installed: `composition ${took.slug}` })
    await refresh(true)
    return {
      ...(await shelf() as object),
      took,
      library: await readLibrary(roots),
      ...(await compositions() as object),
    }
  }

  /**
   * 🧩 ONE RUN OF ONE CHAIN — start it, or record what one of its `text` steps wrote.
   *
   * ⚠️ THE RUN IS MINTED HERE AND THE BROWSER NEVER NAMES ONE (§15 rule 2). ▶ asks for a run, gets
   * a slug the server derived from the sentence, and quotes it back on every press of that chain —
   * which is how twelve presses and a bound PDF end up in ONE folder instead of thirteen.
   *
   * ⚠️ AND WHAT A `text` STEP WROTE IS A FIELD ON THE RUN, not an asset. There is no 📝 shelf and
   * there will not be one; the brief a chain wrote is part of the story of the picture beside it,
   * exactly as lyrics are part of the song.
   */
  async function chain(body: unknown): Promise<unknown> {
    const o = body as {
      composition?: unknown; run?: unknown; step?: unknown; text?: unknown; title?: unknown
      items?: unknown; picked?: unknown; failed?: unknown
    }
    if (typeof o.composition !== 'string') throw new RequestError('which composition?')
    const { compositions: all } = await loadCompositions(roots)
    const one = all.find((c) => c.slug === o.composition)
    if (!one) throw new RequestError(`there is no composition called ${JSON.stringify(o.composition)} here`, 404)
    const text = typeof o.text === 'string' ? o.text : ''
    try {
      if (o.run === undefined) {
        const record = await startChainRun(roots, {
          composition: one.slug,
          text,
          ...(typeof o.title === 'string' ? { title: o.title } : {}),
        })
        return { run: record.runId, path: chainRel(one.slug, record.runId) }
      }
      if (typeof o.run !== 'string') throw new RequestError('which run of it?')

      /**
       * ⚠️ WHY IT STOPPED IS A PATCH LIKE ANY OTHER, and `null` clears it (2026-09-04). A step
       * about to be tried again clears the record before it runs, so a run never shows yesterday's
       * reason beside today's attempt.
       */
      if (o.failed !== undefined) {
        const f = o.failed as { step?: unknown; why?: unknown } | null
        const record = await patchChainRun(roots, one.slug, o.run, {
          failed: f && typeof f.step === 'string' && typeof f.why === 'string'
            ? { step: f.step, why: f.why }
            : null,
        })
        await refresh(true)
        return { run: record.runId, failed: record.failed ?? null }
      }

      if (typeof o.step !== 'string') throw new RequestError('which step?')

      // 🖼 WHICH ONE YOU CHOSE, so a resumed run does not stop and ask again.
      if (typeof o.picked === 'string') {
        const record = await patchChainRun(roots, one.slug, o.run, {
          picked: { step: o.step, master: o.picked },
        })
        return { run: record.runId, picked: record.picked ?? [] }
      }

      // ⚠️ THE ANSWERS AS WELL AS THE TEXT, when a step produced several. See `ChainWrote.items`.
      const items = Array.isArray(o.items)
        ? o.items.filter((x): x is string => typeof x === 'string')
        : null
      const record = await patchChainRun(roots, one.slug, o.run, {
        wrote: { step: o.step, text, ...(items && items.length > 1 ? { items } : {}) },
      })
      return { run: record.runId, wrote: record.wrote ?? [] }
    } catch (err) {
      if (err instanceof ChainError) throw new RequestError(err.message, err.status)
      throw err
    }
  }

  /** 🗑 Forget one. ⚠️ THE CHAIN ONLY — what it made is yours and stays in the content root. */
  async function composition(body: unknown): Promise<unknown> {
    const o = body as { slug?: unknown; forget?: unknown }
    if (o.forget !== true) throw new RequestError('the only thing you can do to a composition here is forget it')
    if (typeof o.slug !== 'string') throw new RequestError('which composition?')
    await deleteComposition(roots, o.slug)
    return compositions()
  }

  /**
   * ✨ ASK XOKO — one question, and everything that has to happen before it can be answered.
   *
   * ⚠️ IT IS A LOOP NOW (2026-08-22), AND THAT IS THE WHOLE CHANGE. It used to be one invocation:
   * question in, prose out, and a brain that could not see the app it lived in — it knew only the
   * breadcrumb of where you were standing, so "what is in the library?" was a thing it had to
   * decline. Now a reply may end in `▶ look:` lines; those are answered HERE, from disk, and the
   * brain is asked again with what came back. Up to MAX_HOPS times, and then it answers with what
   * it has.
   *
   * ⚠️ THE OTHER THREE VERBS DO NOT HAPPEN HERE, and it matters that they never do. `go`, `take`
   * and `make` go back to the browser and are pressed there — the section's own ▶, the same ⤓ the
   * 📚 page calls, the same routing a click does. So everything xoko causes is a press you can
   * watch, and this process keeps exactly one power it did not have before: reading.
   *
   * ⚠️ NOT A RUN, still, and deliberately not on the generate path. A press of ▶ mints a run id,
   * writes a master, indexes it and records provenance, because a picture is a thing you keep. An
   * answer is not.
   *
   * ⚠️ AND THE BROWSER NAMES A SERVICE, exactly as it does for a render — the armed brain is the
   * ✨ tab's own choice in the same 🔌 menu, and there is no second place an engine is picked.
   */
  async function xoko(
    body: unknown, signal: AbortSignal,
    onDelta: (text: string) => void,
    onLooked: (targets: readonly string[]) => void,
  ): Promise<unknown> {
    const o = body as {
      text?: unknown; about?: unknown; map?: unknown
      turns?: unknown; session?: unknown; picked?: unknown
    }
    const said = typeof o.text === 'string' ? o.text.trim() : ''
    if (!said) throw new RequestError('say something first — there is nothing else to go on')

    // ⚠️ THE SESSION IS THE TRANSCRIPT WHEN THERE IS ONE, and what the browser sent is ignored.
    // Two sources of truth for one conversation is one too many, and the file is the one that
    // survives a reload. A request with no session id still works and still keeps nothing — that
    // is the one-off ask, and it is what every caller did before today.
    const wanted = typeof o.session === 'string' ? o.session : null
    let session: Session | null = wanted
      ? (await readSession(roots, wanted) ?? { ...newSession(), id: wanted })
      : null

    const { row, model: thinks } = await brainFor()

    // ⚠️ FOLDED BEFORE THE ASK, NOT AFTER. Folding afterwards means the expensive turn is the one
    // that already went out — the whole point is that this question is the cheap one.
    let folded = false
    if (session && sessionChars(session.turns) > FOLD_CHARS) {
      session = await fold(session, row, thinks, signal)
      folded = true
    }

    // ⚠️ THE TRANSCRIPT IS BOUNDED HERE rather than trusted — including a session's own, which this
    // process wrote but which is still a file on a disk. It is also the thing on screen, so the
    // person can see exactly what the brain is being told; a command-line client re-reads all of it
    // every turn, and an unbounded one is a slow answer that gets slower.
    const turns = (session ? session.turns : (Array.isArray(o.turns) ? o.turns : []) as unknown[])
      .filter((t): t is Turn =>
        !!t && typeof t === 'object'
        && typeof (t as { said?: unknown }).said === 'string'
        && typeof (t as { answered?: unknown }).answered === 'string')
      .slice(-TURNS)
      .map((t) => ({ said: t.said.slice(0, TURN_CHARS), answered: t.answered.slice(0, TURN_CHARS) }))

    // ⚠️ THE FRAMING IS FIXED AND EVERYTHING ELSE IS NOT. Who xoko is rides in the argv of a
    // command-line brain (src/xoko/prompt.ts); the MAP of what this app currently holds and where
    // the person is standing are browser-composed, so they ride on stdin with the question — one
    // place for text this process wrote, another for text it was handed.
    //
    // ⚠️ AND THE MAP IS THE BROWSER'S BECAUSE THE BROWSER IS WHERE THE APP IS. Which workflow is
    // armed for a medium lives in the person's own storage, per capability; the nav is a registry
    // in a module this process never loads. Rebuilding either here would be a second opinion about
    // what is on screen, and the screen would win.
    const about = typeof o.about === 'string' ? o.about.trim().slice(0, 120) : ''
    const did = (o as { did?: unknown }).did
    const map = typeof o.map === 'string' ? o.map.trim().slice(0, MAP_CHARS) : ''
    // ⚠️ THE ONE LINE OF THE MAP THE BROWSER CANNOT WRITE. Everything else on the map is on
    // screen; whether the library answers is a fact about a socket, and this process is the side
    // holding it. Cached, so it is not a request per question (src/library/catalog.ts).
    // ⚠️ THE OTHER THING ONLY THE BROWSER KNOWS — which style the ⚙ picker has in force. Slugs
    // arrive; `holdings` turns them into the look's own words on that medium's line, because the
    // words are the style file's and this process is the side that reads it.
    const picked = new Map<string, string>()
    if (o.picked && typeof o.picked === 'object') {
      for (const [medium, slug] of Object.entries(o.picked as Record<string, unknown>)) {
        if (typeof slug === 'string' && slug) picked.set(medium, slug.slice(0, 80))
      }
    }
    const here = [map, await holdings(roots, picked)].filter(Boolean).join('\n')
    const asked = [
      here ? `— what this app holds right now —\n${here}` : '',
      // ⚠️ HOW YOUR OWN LAST LINES WENT — the loop, closed (2026-08-23). See `readDid`.
      readDid(did),
      about ? `— I am looking at: ${about} —` : '',
      said,
    ].filter(Boolean).join('\n\n')

    const talk = textAdapterFor(row)
    const sight = { roots, manifest }
    const history = [...turns]
    let prompt = asked
    let say = ''
    let acts: readonly Act[] = []
    let model: string | null = thinks
    let hops = 0

    for (;;) {
      const answer = await talk.ask({
        row, roots, model: thinks, prompt, history, system: XOKO, signal, onDelta,
      })
      model = answer.model
      // ⚠️ THE PROSE AND THE ACTIONS COME OUT OF ONE ANSWER — a directive line is a line of the
      // reply, not a second channel, which is why a brain that gets the shape wrong produces a turn
      // you can read instead of a silence (src/xoko/grammar.ts).
      const read = readAnswer(answer.text)
      say = read.say
      acts = read.acts
      if (!read.looks.length || hops >= MAX_HOPS) break
      hops += 1

      // ⚠️ SAID OUT LOUD, MID-ANSWER. The browser is streaming this reply; without a marker, a
      // question that takes three hops looks like a brain that wrote a paragraph and then replaced
      // it. What it went to read is part of the answer.
      onLooked(read.looks.map((l) => l.target))
      const seen = await Promise.all(read.looks.map((l) => look(sight, l)))

      // The exchange that just happened, verbatim — so the next hop can see what it asked for as
      // well as what came back. The map rides in `asked` and therefore appears exactly once.
      history.push({ said: prompt, answered: answer.text })
      prompt = [
        ...seen,
        // ⚠️ THE QUESTION IS REPEATED EVERY HOP, and it is one line. Three hops in, the most recent
        // thing a brain has read is two screens of catalog, and what it drifts into is answering
        // the catalog — the first real conversation ended with two services installed because
        // somebody said hello. The transcript still holds the original ask; this keeps it in front.
        `They asked: ${JSON.stringify(said.slice(0, 200))}`,
        // ⚠️ THE LAST HOP SAYS SO. Without it a brain that has budgeted four lookups spends its
        // final turn asking for the fourth, and the person gets a reply that is only a ▶ line.
        hops >= MAX_HOPS
          ? 'That is the last thing I can look up for this question — answer them now.'
          : '',
      ].filter(Boolean).join('\n\n')
    }

    // ⚠️ ONLY THE WORDS ARE KEPT. What got made is a fact about this app's queue, not about the
    // conversation, and re-reading it to the brain next turn would teach it to talk about ▶. The
    // hops are not kept either: what was looked up is in the answer, in prose, which is the form
    // the next turn can actually use.
    let kept = null
    if (session) {
      const grown: Session = {
        ...session,
        title: session.turns.length ? session.title : titleFrom(said),
        turns: [...session.turns, { said, answered: say }],
      }
      kept = await writeSession(roots, grown)
    }

    return {
      text: say,
      // ⚠️ NOT RENDERED HERE, NOT INSTALLED HERE, NOT NAVIGATED HERE. These go back to the browser,
      // which presses them exactly as if you had done it — same payload builder, same armed workflow,
      // same ⤓ endpoint, same queue. There is no second path for any of the three, and therefore
      // no second opinion about what a press means.
      acts,
      model,
      service: row.id,
      label: row.label ?? row.id,
      // What the bar prints beside the title: how long this conversation is and what it costs to
      // carry. `folded` is said out loud because a fold changed what the brain knows.
      session: kept,
      folded,
    }
  }

  /**
   * FOLD THE OLD HALF OF A CONVERSATION INTO ONE SUMMARY TURN.
   *
   * ⚠️ IT IS ASKED OF THE SAME BRAIN THAT IS ABOUT TO ANSWER, which is the only choice that keeps
   * this honest: a fold performed by a different model is a paraphrase by a stranger, and the
   * summary is the thing every later turn is built on.
   *
   * ⚠️ AND A FAILED FOLD CHANGES NOTHING. If the brain refuses, times out, or answers nothing, the
   * session comes back exactly as it went in — carrying too much is a cost, and losing the middle
   * of a conversation to a failed summary is damage.
   */
  async function fold(
    session: Session, row: InferenceRow, model: string | null, signal: AbortSignal,
  ): Promise<Session> {
    const { older, recent } = foldPoint(session.turns, FOLD_KEEP)
    if (older.length < 2) return session
    try {
      const answer = await textAdapterFor(row).ask({
        row,
        roots,
        model,
        prompt: older.map((t) => `You: ${t.said}\nxoko: ${t.answered}`).join('\n\n'),
        system: FOLD,
        signal,
      })
      const text = answer.text.trim()
      if (!text) return session
      const summary: Turn = {
        said: `(${older.length} earlier exchanges, folded)`,
        answered: text,
        summary: true,
      }
      return await writeSession(roots, { ...session, turns: [summary, ...recent] })
        .then(() => ({ ...session, turns: [summary, ...recent] }))
    } catch {
      return session
    }
  }

  /**
   * ✕ / ⌄ / ⌥ — the three things you do to a conversation that is not the one you are having.
   *
   * ⚠️ ONE ENDPOINT, BECAUSE THEY ARE ONE OBJECT. A list, one transcript, and a delete are three
   * readings of the same file, and three routes would be three places to get the id check wrong.
   */
  async function sessions(query: URLSearchParams): Promise<unknown> {
    const id = query.get('id')
    if (!id) return { sessions: await listSessions(roots) }
    const one = await readSession(roots, id)
    if (!one) throw new RequestError(`no conversation called ${JSON.stringify(id)}`, 404)
    return { session: one, chars: sessionChars(one.turns) }
  }

  async function session(body: unknown): Promise<unknown> {
    const o = body as { id?: unknown; forget?: unknown; fold?: unknown }
    const id = typeof o.id === 'string' ? o.id : null

    // ⚠️ NEW IS A READ, NOT A WRITE. An empty conversation is not written until it has something
    // in it, so opening the bar and closing it again leaves nothing behind — the same rule as a
    // render that was never pressed.
    if (!id) return { session: newSession() }

    if (o.forget === true) {
      return { forgot: await removeSession(roots, id), sessions: await listSessions(roots) }
    }

    // ⌥ — fold it NOW, whatever it costs, because you asked. The automatic one has a budget; this
    // one is a person deciding the conversation has a long tail they no longer need verbatim.
    if (o.fold === true) {
      const one = await readSession(roots, id)
      if (!one) throw new RequestError(`no conversation called ${JSON.stringify(id)}`, 404)
      const { row, model } = await brainFor()
      const after = await fold(one, row, model, new AbortController().signal)
      if (after.turns.length === one.turns.length) {
        throw new RequestError('there is not enough here to fold yet', 409)
      }
      return { session: after, chars: sessionChars(after.turns) }
    }

    const one = await readSession(roots, id)
    if (!one) throw new RequestError(`no conversation called ${JSON.stringify(id)}`, 404)
    return { session: one, chars: sessionChars(one.turns) }
  }

  async function generate(body: unknown): Promise<unknown> {
    const c = ctx('request')
    const request = parseGenerationRequest(c, body)
    if (!request) throw new RequestError(c.issues.join('; ') || 'that is not a generation request')
    const registry = await loadInferenceRegistry(roots)
    // Read fresh rather than cached in a binding beside `roots`: it is one tiny JSON read per
    // press, and a second piece of mutable state is a second thing that can drift.
    const { settings: stored } = await readSettings(roots.data)
    return startRun(
      { roots, queue, registry, quality: qualityFor(stored.quality, request.medium) }, request,
    )
  }

  /**
   * The ⚙ group, in one payload: 📁 library and 🖼 media.
   *
   * ⚠️ The LEVELS travel with it, so the media section renders whatever `src/types/quality.ts`
   * declares and hardcodes nothing. Adding a medium's scale is then a one-row change that the UI
   * picks up for free.
   */
  async function settings(): Promise<unknown> {
    const { settings: stored } = await readSettings(roots.data)
    return {
      files: {
        path: roots.content,
        data: roots.data,
        install: roots.install,
        default: defaultContentRoot(),
        /** True when XOKOLAT_CONTENT is set: the dev override wins, and saying so beats silently
         *  ignoring what the user picked. */
        locked: contentLockedByEnv(),
        custom: stored.contentRoot !== null,
        issue: libraryIssue,
      },
      media: MEDIA_WITH_QUALITY.map((medium) => ({
        medium,
        chosen: qualityFor(stored.quality, medium),
        levels: scaleFor(medium)?.levels ?? [],
      })),
    }
  }

  /**
   * Change a setting. A PATCH: whichever of `files` / `quality` is present is applied and the rest
   * is left alone, so the UI never has to send back settings it did not touch.
   *
   * ⚠️ `files` IS THE FOLDER YOUR WORK LANDS IN, and it was called `library` until 2026-08-16 —
   * that word now means the xoko.lat catalog (`/api/library`), and one word could not mean both.
   *
   * ⚠️ Moving it moves NO FILES — new work goes to the new place, and the answer says so. The index is fully rebuilt afterwards because its cache is keyed by content-root-relative
   * path: every entry in it describes the old root, and none of them are stale by mtime.
   */
  async function setSettings(body: unknown): Promise<unknown> {
    const o = body as { files?: unknown; medium?: unknown; quality?: unknown }
    if (o.files === undefined && o.medium === undefined) {
      throw new RequestError('nothing to change (files, or medium + quality)')
    }
    const { settings: stored } = await readSettings(roots.data)
    let next = stored
    let previous: string | null = null

    if (o.medium !== undefined) {
      const medium = o.medium
      if (typeof medium !== 'string' || !isMedium(medium)) {
        throw new RequestError(`no such medium: ${JSON.stringify(medium)}`)
      }
      if (typeof o.quality !== 'string' || !isQualityLevel(medium, o.quality)) {
        const offered = (scaleFor(medium)?.levels ?? []).map((l) => l.id).join(', ')
        throw new RequestError(`${medium} is written at one of: ${offered || 'nothing yet'}`)
      }
      next = { ...next, quality: { ...next.quality, [medium]: o.quality } }
    }

    if (o.files !== undefined) {
      if (contentLockedByEnv()) {
        throw new RequestError('XOKOLAT_CONTENT is set, so that folder is fixed for this run', 409)
      }
      if (typeof o.files !== 'string') throw new RequestError('which folder? (files)')
      const dir = o.files.trim()
      const bad = checkContentRoot(roots, dir)
      if (bad) throw new RequestError(bad)
      const cannot = await ensureContentRoot(dir)
      if (cannot) throw new RequestError(cannot)
      previous = roots.content
      next = { ...next, contentRoot: dir }
    }

    await writeSettings(roots.data, next)
    if (previous !== null && next.contentRoot) {
      roots = { ...roots, content: next.contentRoot }
      libraryIssue = null
      await refresh(true)
    }
    return { ...(await settings() as object), previous, moved: false }
  }

  /** The (service, workflow, model) a swatch belongs to, and what that model wants. */
  interface Grid {
    readonly target: SwatchTarget
    readonly row: InferenceRow
    readonly caps: Caps
    /** ⚠️ WHAT WOULD ANSWER A PRESS FOR THIS MEDIUM — null only when nothing is armed at all,
     *  which the shoot refuses and the read draws as an empty grid. */
    readonly workflow: ResolvedWorkflow | null
  }

  /**
   * WHICH GRID — the (service, workflow) a swatch belongs to, and the model that workflow runs on.
   *
   * The browser sends what its 🔌 band is showing, because the grid it is drawing is that
   * workflow's grid. Falling back to this medium's default is for a caller that has no opinion; a
   * caller that HAS one must never be quietly overridden, or the picture it gets back is of an
   * engine it is not using.
   *
   * ⚠️ THE WORKFLOW PICKS THE MODEL, NOT THE OTHER WAY AROUND (2026-08-29). It used to resolve a
   * checkpoint and stop there, which reads as harmless and is not: the workflow is the unit you
   * plug, and on a graph service it carries the whole ask. A `model` in the payload is now only a
   * fallback for a caller that named no workflow and nothing is armed.
   */
  async function swatchTarget(
    medium: Medium, want: { inference?: unknown; model?: unknown; workflow?: unknown },
  ): Promise<Grid | null> {
    const registry = await loadInferenceRegistry(roots)
    const { kinds } = await loadKinds(roots)
    const generator = (r: InferenceRow) => (r.role ?? 'generator') === 'generator'
    // ⚠️ ONE THAT CAN ACTUALLY ANSWER (2026-09-06). This was `!r.medium || r.medium === medium` —
    // and a ComfyUI declared no medium, so it matched EVERYTHING: ask for a music swatch on a
    // machine whose ComfyUI holds only image workflows and it was picked, then failed there. What a
    // service makes is what its workflows make, so that is what this asks.
    const row = typeof want.inference === 'string'
      ? registry.rows.find((r) => r.id === want.inference)
      : registry.rows.find((r) => generator(r) && mediaOf(r, kinds).includes(medium))
    // ⚠️ NULL, NOT A REFUSAL (2026-08-30). This threw `no inference service to render a swatch
    // with`, which is a true sentence about SHOOTING one and was being said in answer to READING
    // the style list — so a cleared install flashed a red error in the top bar for every media
    // section you walked into, about a picture nobody had asked for. A machine with nothing
    // installed has no grid; it still has styles, and they are still worth showing. The shoot path
    // does the refusing, where somebody actually pressed something.
    if (!row) return null
    const catalog = cachedCatalog(row.id).engines
    const tuning = await readTuning(roots)
    const all = resolveWorkflows(
      row, catalog, tunedByFile(tuning, row.id), new Set(), serviceFiles(row.id))
    // ⚠️ THE KIND SAYS WHICH MEDIUM A WORKFLOW ANSWERS FOR — the same check `startRun` makes, and
    // the reason ComfyUI needs one: a single row there makes pictures, songs, voices and meshes,
    // so "the default" without this is whichever kind sorted first.
    const mediumOf = new Map(kinds.map((k) => [k.slug, k.medium]))
    const asked = typeof want.workflow === 'string' && want.workflow ? want.workflow : null
    const workflow = (asked ? all.find((w) => w.slug === asked) : null)
      ?? all.filter((w) => mediumOf.get(w.kind) === medium).find((w) => w.isDefault)
      ?? null
    const model = workflow?.model
      ?? (typeof want.model === 'string' && want.model ? want.model : defaultEngineFile(row, catalog))
    // The caps come along because the idiom is a MODEL fact and everything this page shows about
    // wording — which channel is read, whether there is a negative at all — depends on it.
    return {
      target: { medium, service: row.id, model },
      row,
      caps: workflow?.caps ?? capsFor(row, model),
      workflow,
    }
  }

  /**
   * A medium's style list, each entry told what the grid knows about it: a picture, a recorded
   * failure, or neither. Plus the style axes — shipped reference the editor folds open.
   *
   * `stat` rather than opening the file: the view needs to know *if* there is a picture and
   * whether it has changed, not what is in it. `at` doubles as the cache-buster on the <img>,
   * so a re-rolled swatch is not served from the browser's memory of the old one.
   */
  async function styles(medium: Medium, grid: Grid | null): Promise<unknown> {
    // With nothing installed there is no model to have shot anything on — so every cell is
    // swatchless, `sends` is composed against the minimum every undescribed engine already gets,
    // and `shotOn` says so by being absent rather than by naming a service that is not there.
    const target = grid?.target ?? null
    const caps = grid?.caps ?? MINIMAL_CAPS
    const workflow = grid?.workflow ?? null
    const loaded = await loadStyles(roots, medium)
    const ask = await askFor(roots, medium)
    // ⚠️ THE WORKFLOW RIDES ON THE PICTURE'S OWN URL. The model in a swatch path is the WORKFLOW's
    // model now, so a cell fetched without it would be resolved against this medium's default
    // workflow — and a grid you are looking at because you armed something else would serve 404s
    // from another checkpoint's folder.
    const where = target
      ? `inference=${encodeURIComponent(target.service)}`
        + `&model=${encodeURIComponent(target.model ?? '')}`
        + (workflow ? `&workflow=${encodeURIComponent(workflow.slug)}` : '')
      : ''
    const NO_SWATCH = { at: null, tookMs: null, prompt: null, error: null } as const
    const withSwatch = await Promise.all(loaded.styles.map(async (s) => {
      const cell = target ? await readSwatch(roots, target, s.slug) : NO_SWATCH
      return {
        ...s,
        swatch: cell.at === null ? null : `/api/styles/${medium}/swatch/${s.slug}?${where}&v=${cell.at}`,
        tookMs: cell.tookMs,
        // The sentence the picture was made from, read back off the master. Visible in ⓘ while
        // the subject is being tuned — a probe that draws the chick twice is a WORDING bug, and
        // you cannot see a wording bug without the wording.
        prompt: cell.prompt,
        // ⚠️ And what it WOULD send now, on this grid's model. The two together are the only way
        // to see that an edit landed: `prompt` is history, `sends` is the present, and a pair
        // that differ means the swatch is stale. `sends.reads` names the channel — the answer to
        // "I edited the words and the picture came back identical".
        sends: ask ? styleSend(ask, { ...s, medium }, caps) : null,
        error: cell.error,
      }
    }))
    return {
      ...loaded,
      styles: withSwatch,
      axes: axesFor(medium),
      /**
       * THE PROBE — the sentence every cell in this grid was judged on, and the medium's own words
       * for it. Shipped vocabulary (src/styles/probe.ts), sent rather than duplicated in the
       * browser: `subject` is right for a picture, `line` for a voice, and calling both of them
       * "subject" is what made the voice grid unreadable.
       */
      probe: {
        ask,
        word: PROBE[medium].ask,
        noun: PROBE[medium].noun,
        hint: PROBE[medium].hint,
        // What the app ships with, so the bar can offer ↺ reset only when it would DO something —
        // and name the sentence it would go back to before you press it.
        shipped: PROBE[medium].seed,
      },
      // ⚠️ The idiom and the negative channel ride WITH the grid, because they are model facts
      // and the editor's labels are only true of one model at a time.
      shotOn: target
        ? {
          inference: target.service, model: target.model,
          idiom: caps.idiom, negatives: caps.negatives,
        }
        : null,
    }
  }

  /**
   * SET A KEY, OR FORGET ONE (`value: null`).
   *
   * ⚠️ WRITE-ONLY, AND THERE IS NO READ. The answer is the shelf, where the row now says `set` —
   * which is the only thing about a stored key this app will ever tell a browser (src/secrets.ts).
   */
  async function setSecret(body: unknown): Promise<unknown> {
    const o = body as { id?: unknown; value?: unknown }
    if (typeof o.id !== 'string' || !o.id) throw new RequestError('which key? (id)')
    if (o.value !== null && typeof o.value !== 'string') {
      throw new RequestError('value is the key, or null to forget it')
    }
    await saveSecret(roots, o.id, o.value === null ? null : o.value.trim())
    return shelf()
  }

  async function star(body: unknown): Promise<unknown> {
    const o = body as { key?: unknown; starred?: unknown }
    if (typeof o.key !== 'string' || !o.key) throw new RequestError('which asset? (key)')
    if (typeof o.starred !== 'boolean') throw new RequestError('starred is true or false')
    return { key: o.key, starred: await setStar(roots, o.key, o.starred) }
  }

  /**
   * ✎ Rename one run. The name is DATA — no file moves, no path is derived from it — which is what
   * makes it safe for a person to type anything into and for xoko to write (src/content/run.ts).
   */
  async function rename(body: unknown): Promise<unknown> {
    const o = body as { path?: unknown; title?: unknown }
    if (typeof o.path !== 'string' || !o.path) throw new RequestError('which run? (path)')
    if (typeof o.title !== 'string') throw new RequestError('title is text — empty goes back to the ask')
    // 🧩 A CHAIN RUN IS RENAMED THE SAME WAY AND IN A DIFFERENT FILE. Same rule either way: the
    // name is a field, no folder moves, and the worst a bad one can do is read badly.
    const parts = o.path.split('/')
    if (parts[0] === CHAIN_DIR && parts.length === 3) {
      const record = await patchChainRun(roots, parts[1]!, parts[2]!, { title: o.title })
      await refresh(true)
      return { path: o.path, title: record.title }
    }
    const record = await renameRun(roots, o.path, o.title)
    await refresh(true)
    return { path: o.path, title: record.title ?? null }
  }

  /**
   * Delete one asset. A REAL delete — no trash, no undo (DECISIONS.md).
   *
   * The index is refreshed before answering, so the feed the browser reloads never shows a card
   * for a file that is gone.
   */
  /**
   * 🧊 KEEP THE STILL A MESH JUST DREW OF ITSELF.
   *
   * ⚠️ THE PICTURE COMES FROM THE BROWSER AND THAT IS THE DESIGN, not a shortcut. Rasterising a
   * `.glb` here would mean a headless GL context or a native crate — a platform-specific binary
   * times three, inside something we have to sign and notarise — for a frame the webview has
   * already drawn (§15.3). The renderer that shows you the mesh is the renderer that makes its
   * thumbnail, so the two can never disagree.
   *
   * ⚠️ THE PATH IS RESOLVED AGAINST THE CONTENT ROOT AND MUST NAME A MASTER THAT EXISTS (§15.2).
   * A png is written BESIDE a file this app made, never at a path a page chose: `resolveIn` refuses
   * an escape, the extension must be the mesh master's, and the master itself has to be on disk —
   * so the only reachable target is the sidecar of a mesh in the library.
   */
  async function keepPreview(body: unknown): Promise<unknown> {
    const o = body as { path?: unknown; png?: unknown }
    if (typeof o.path !== 'string' || !o.path) throw new RequestError('which mesh? (path)')
    if (typeof o.png !== 'string' || !o.png) throw new RequestError('nothing to keep (png)')
    if (!o.path.endsWith(`.${MASTER_EXT.model3d}`)) {
      throw new RequestError(`a preview is kept beside a .${MASTER_EXT.model3d}, not ${o.path}`)
    }
    const master = resolveIn(roots.content, o.path)
    await stat(master)
    const at = `${o.path.slice(0, o.path.lastIndexOf('.'))}${PREVIEW_SUFFIX}`
    // ⚠️ NOT AN INDEX REFRESH. The browser is showing the picture it just made, and the file is
    // picked up by the next ordinary read — a rebuild per mesh in a feed of a hundred would be a
    // hundred rebuilds to display what is already on screen.
    await writeFile(resolveIn(roots.content, at), Buffer.from(o.png, 'base64'))
    return { path: at }
  }

  async function remove(body: unknown): Promise<unknown> {
    const o = body as { path?: unknown; key?: unknown }
    if (typeof o.path !== 'string' || !o.path) throw new RequestError('which file? (path)')
    const key = typeof o.key === 'string' && o.key ? o.key : null
    const result = await removeAsset(roots, o.path, key)
    await refresh(true)
    return result
  }

  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url ?? '/'
    const path = url.split('?')[0] ?? '/'
    const query = new URLSearchParams(url.slice(path.length + 1))
    const method = req.method ?? 'GET'
    try {
      if (method === 'POST') {
        // ⚠️ BEFORE the JSON reader, because this body is not JSON — it is the file itself.
        if (path === '/api/import') {
          const filename = String(req.headers['x-filename'] ?? '').trim()
          if (!filename) throw new RequestError('the upload needs an X-Filename header')
          const medium = String(req.headers['x-medium'] ?? 'image')
          if (!isMedium(medium)) throw new RequestError(`${JSON.stringify(medium)} is not a medium`)
          const imported = await importImage(roots, {
            bytes: await readRawBody(req), filename: decodeURIComponent(filename), medium,
          })
          // The index is refreshed before answering, so the tray can show the thumbnail and the
          // gallery already has the card — an import that is invisible until a reload reads as a
          // failure.
          await refresh(true)
          return sendJson(res, 200, imported)
        }
        const body = await readJsonBody(req)
        if (path === '/api/generate') return sendJson(res, 200, await generate(body))
        // ✍️ ONE PRESS TO A WRITING MODEL — QUEUED, and it answers with a job id. It used to do
        // the work inside this request and use the socket closing as its cancel, which made a
        // four-minute step something a flaky connection could delete. See `text`.
        if (path === '/api/text') return sendJson(res, 200, await text(body))
        // ⚠️ ⏹ IS THE SOCKET CLOSING, and there is no cancel endpoint (2026-08-12). The browser
        // aborts its own fetch; node reports the disconnect; the controller aborts; `run()` kills
        // the child. One wire, no job id, and nothing to leak if the tab is simply closed —
        // whereas a /cancel route would need a handle, a table of them, and a way to expire it.
        //
        // ⚠️ AND IT IS THE ONE ROUTE THAT DOES NOT ANSWER WITH ONE OBJECT. NDJSON: a `{delta}` per
        // piece of the answer, then exactly one `{done}` or `{error}`. Not SSE — this app owns both
        // ends, `EventSource` cannot POST, and `data: ` framing would buy nothing here.
        if (path === '/api/xoko') {
          const stop = new AbortController()
          req.on('close', () => { if (!res.writableEnded) stop.abort() })
          res.writeHead(200, {
            'content-type': 'application/x-ndjson; charset=utf-8',
            'cache-control': 'no-store',
            // Nothing may sit on this and hand it over whole — a buffered stream is a stream that
            // has been turned back into the thing it replaced.
            'x-accel-buffering': 'no',
          })
          const line = (o: unknown): void => { if (!res.writableEnded) res.write(`${JSON.stringify(o)}\n`) }
          try {
            line({ done: await xoko(body, stop.signal,
              (text) => line({ delta: text }),
              // ⚠️ A HOP IS ANNOUNCED ON THE WIRE, not inferred from a gap in the deltas. The
              // browser drops the half-answer that preceded it and prints what was read —
              // otherwise a three-hop question looks like a brain rewriting itself.
              (targets) => line({ looked: targets })) })
          } catch (err) {
            // ⚠️ THE HEADERS ARE ALREADY SENT, so a refusal cannot be a status code any more. It is
            // the last line instead, and the browser reads it the same way it reads the answer.
            line({ error: (err as Error).message })
          }
          return void res.end()
        }
        if (path === '/api/engines') return sendJson(res, 200, await tune(body))
        if (path === '/api/inference') return sendJson(res, 200, await service(body))
        // ⤓ ONE THING FROM THE LIBRARY. The whole shelf comes back with it, exactly as a save
        // does, so the page redraws from one shape and never merges a take into what it was
        // already showing — and 📚 comes back too, because what it says about every row (installed,
        // still missing) is now one row different.
        if (path === '/api/take') {
          const asked = (body as { what?: unknown; collections?: unknown }).what
          // ⚠️ A LIST IS ONE PRESS, NOT N REQUESTS. ❖'s `⤓ take 7` sends the whole collection at
          // once; the loop belongs where the writes are, and one entry failing does not throw away
          // the ones that landed (src/library/take.ts). `took` stays the first, so 📚's receipt
          // line reads the same shape it always did.
          const many = Array.isArray(asked) ? await takeMany(roots, asked) : null
          const took = many
            ? many.took[0] ?? null
            : await take(roots, asked, {
              ...(Array.isArray((body as { collections?: unknown }).collections)
                ? { collections: ((body as { collections: unknown[] }).collections)
                  .filter((x): x is string => typeof x === 'string') }
                : {}),
            })
          return sendJson(res, 200, {
            ...(await shelf() as object), took,
            ...(many ? { tookAll: many.took, failed: many.failed } : {}),
            library: await readLibrary(roots),
            // ⚠️ AND THE CHAINS, ALWAYS. A composition take writes one; a WORKFLOW take can make an
            // existing one runnable, which is a change to a shelf the page is not looking at. One
            // answer that is complete beats a page that has to know when to go and re-ask.
            ...(await compositions() as object),
          })
        }
        // ＋ WHAT A CHAIN WROTE, PUT IN. Answers exactly as ⤓ does — one shape, one redraw.
        if (path === '/api/install') return sendJson(res, 200, await install(body))
        if (path === '/api/compositions') return sendJson(res, 200, await composition(body))
        if (path === '/api/build') return sendJson(res, 200, await build(body))
        if (path === '/api/chain') return sendJson(res, 200, await chain(body))
        // 🧩 A COMPOSITION'S OWN LIST — three segments, so it cannot be confused with a medium's.
        // ⚠️ MATCHED FIRST for exactly that reason: `/api/styles/comp/…` reaching the medium
        // branch would read `comp` as a medium and 404 on a route that is fine.
        const compStyle = /^\/api\/styles\/comp\/([\w-]+)(?:\/(delete))?$/.exec(path)
        if (compStyle?.[1]) {
          const slug = compStyle[1]
          const o = body as { slug?: unknown; style?: unknown }
          if (compStyle[2] === 'delete') {
            if (typeof o.slug !== 'string' || !o.slug) throw new RequestError('which style? (slug)')
            await deleteCompositionStyle(roots, slug, o.slug)
            // A star for something that no longer exists is a key nobody can ever clear.
            await forgetStar(roots, `style:comp:${slug}:${o.slug}`)
            return sendJson(res, 200, await loadCompositionStyles(roots, slug))
          }
          return sendJson(res, 200, await saveCompositionStyle(roots, slug, o.style))
        }
        const styleWrite = /^\/api\/styles\/([^/]+)(?:\/(delete|swatch|ask|preview))?$/.exec(path)
        if (styleWrite?.[1]) {
          const medium = decodeURIComponent(styleWrite[1])
          if (!isMedium(medium)) throw new RequestError(`no styles for ${JSON.stringify(medium)}`, 404)
          const o = body as {
            slug?: unknown; ids?: unknown; inference?: unknown; model?: unknown; style?: unknown
            ask?: unknown; workflow?: unknown
          }
          if (styleWrite[2] === 'delete') {
            if (typeof o.slug !== 'string' || !o.slug) throw new RequestError('which style? (slug)')
            await deleteStyle(roots, medium, o.slug)
            await forgetSwatch(roots, medium, o.slug)
            // A star for something that no longer exists is a key nobody can ever clear.
            await forgetStar(roots, `style:${medium}:${o.slug}`)
            return sendJson(res, 200, await styles(medium, await swatchTarget(medium, o)))
          }
          if (styleWrite[2] === 'ask') {
            // ⚠️ SAVING DELETES NOTHING (2026-08-29). It used to wipe every swatch of the medium,
            // which made the one control this page exists to tune the one nobody dared press. Each
            // cell already knows the sentence it was shot from — `prompt` off its own master
            // against `sends` — so the pictures stay and the grid marks the ones that no longer
            // match. `ask: ''` is ✕ clear, back to the shipped sentence, and just as harmless.
            await saveAsk(roots, medium, o.ask)
            return sendJson(res, 200, await styles(medium, await swatchTarget(medium, o)))
          }
          if (styleWrite[2] === 'preview') {
            // ⚠️ WHAT THIS DRAFT WOULD SEND, composed by the same `styleSend` a render calls —
            // never by the browser. A preview the front end assembled itself would be a second
            // answer to "how is a prompt built", and the first time the two drifted the editor
            // would be confidently showing a sentence nothing ever renders.
            const caps = (await swatchTarget(medium, o))?.caps ?? MINIMAL_CAPS
            const ask = await askFor(roots, medium)
            const draft = readDraft(medium, o.style ?? body)
            return sendJson(res, 200, {
              ask,
              ...styleSend(ask ?? '', draft, caps),
              idiom: caps.idiom, negatives: caps.negatives,
            })
          }
          if (styleWrite[2] === 'swatch') {
            // ⚠️ ONE REQUEST, N JOBS. `▶ shoot 3 missing` is the same endpoint as one card's ↻ —
            // a sweep is a list, not a mode, and the serial lane already stops them racing.
            const ids = Array.isArray(o.ids) ? o.ids.filter((x) => typeof x === 'string') : []
            if (!ids.length) throw new RequestError('which styles? (ids)')
            const known = (await loadStyles(roots, medium)).styles
            const found = ids.map((id) => {
              const style = known.find((s) => s.slug === id)
              if (!style) throw new RequestError(`no style ${JSON.stringify(id)}`, 404)
              return style
            })
            // ⚠️ NOTHING TO PRESS IS A REFUSAL, NOT AN EMPTY RENDER. A swatch is a press, and a
            // medium this machine cannot press is a medium it cannot photograph either. This is
            // the ONE place that refusal belongs — reading the list does not need an engine.
            const grid = await swatchTarget(medium, o)
            if (!grid) {
              throw new RequestError(
                `nothing installed can make ${medium} yet — connect a service on 🔌 first`, 409)
            }
            const { row, workflow } = grid
            if (!workflow) {
              throw new RequestError(
                `${row.id} has nothing that can be asked for ${medium} — take a workflow from 📚`, 409)
            }
            const queued = await Promise.all(
              found.map((s) => queueSwatch({ roots, queue, row, workflow }, medium, s)))
            return sendJson(res, 200, { jobIds: queued.map((q) => q.jobId) })
          }
          // ⚠️ SAVING IS THE WHOLE EDIT. The style the browser sends is the `style` field, so a
          // draft can travel beside the (service, model) whose grid it should come back as.
          const draft = o.style ?? body
          await saveStyle(roots, medium, draft)
          // ⚠️ The old pictures are no longer true of the new words. Dropped rather than kept
          // stale — a swatch that lies about its style is worse than none.
          const slug = (draft as { slug?: unknown }).slug
          if (typeof slug === 'string') await forgetSwatch(roots, medium, slug)
          return sendJson(res, 200, await styles(medium, await swatchTarget(medium, o)))
        }
        if (path === '/api/session') return sendJson(res, 200, await session(body))
        if (path === '/api/secret') return sendJson(res, 200, await setSecret(body))
        if (path === '/api/star') return sendJson(res, 200, await star(body))
        if (path === '/api/preview') return sendJson(res, 200, await keepPreview(body))
        if (path === '/api/delete') return sendJson(res, 200, await remove(body))
        if (path === '/api/rename') return sendJson(res, 200, await rename(body))
        if (path === '/api/settings') return sendJson(res, 200, await setSettings(body))
        if (path === '/api/reveal') {
          // ⚠️ The browser names a ROOT by keyword or an asset by content-relative path. It never
          // sends an absolute path, and it never sends a command (§15 rule 1).
          const o = body as { path?: unknown; root?: unknown }
          if (typeof o.root === 'string') {
            const dir = ROOT_KEYS[o.root as keyof typeof ROOT_KEYS]
            if (!dir) throw new RequestError(`no such root: ${JSON.stringify(o.root)}`)
            await reveal(roots[dir], '.')
            return sendJson(res, 200, { root: o.root })
          }
          if (typeof o.path !== 'string' || !o.path) throw new RequestError('which file? (path)')
          await reveal(roots.content, o.path)
          return sendJson(res, 200, { path: o.path })
        }
        const cancel = /^\/api\/queue\/([^/]+)\/cancel$/.exec(path)
        if (cancel?.[1]) {
          const id = decodeURIComponent(cancel[1])
          return sendJson(res, queue.cancel(id) ? 200 : 404, { id, job: queue.get(id) ?? null })
        }
        return sendJson(res, 404, { error: 'no such endpoint', path })
      }
      if (method !== 'GET' && method !== 'HEAD') {
        return sendText(res, 405, `${method} is not something this server does yet\n`)
      }

      if (path === '/api/status') return sendJson(res, 200, await status())
      if (path === '/api/inference') return sendJson(res, 200, await shelf())
      if (path === '/api/engines') return sendJson(res, 200, await engines(query.get('refresh')))
      // ⚠️ The (service, workflow, model) rides as a QUERY, not as path segments: a model is
      // whatever the engine calls its file, and those in a path are more things to escape.
      const want = {
        inference: query.get('inference') ?? undefined,
        model: query.get('model') ?? undefined,
        workflow: query.get('workflow') ?? undefined,
      }
      const compStyleGet = /^\/api\/styles\/comp\/([\w-]+)$/.exec(path)
      if (compStyleGet?.[1]) {
        return sendJson(res, 200, await loadCompositionStyles(roots, compStyleGet[1]))
      }
      const styleMatch = /^\/api\/styles\/([^/]+)$/.exec(path)
      if (styleMatch?.[1]) {
        const medium = decodeURIComponent(styleMatch[1])
        if (!(MEDIA as readonly string[]).includes(medium) || !isMedium(medium)) {
          return sendJson(res, 404, { error: `no styles for ${JSON.stringify(medium)}` })
        }
        const grid = await swatchTarget(medium as Medium as Medium, want)
        return sendJson(res, 200, await styles(medium as Medium as Medium, grid))
      }
      const swatchGet = /^\/api\/styles\/([^/]+)\/swatch\/([^/]+)$/.exec(path)
      if (swatchGet?.[1] && swatchGet[2]) {
        const medium = decodeURIComponent(swatchGet[1])
        if (!isMedium(medium)) return sendJson(res, 404, { error: 'no such medium' })
        // Served from APP DATA, not the content root — a swatch is not the user's work, so it is
        // deliberately not reachable through /content/ and never lands in the index.
        const grid = await swatchTarget(medium, want)
        if (!grid) return sendText(res, 404, 'no swatch yet\n')
        const rel = swatchRel(grid.target, decodeURIComponent(swatchGet[2]))
        if (await serveFile(res, roots.data, `/${rel}`)) return
        return sendText(res, 404, 'no swatch yet\n')
      }
      // 📚 THE LIBRARY. Every published item, each told what this machine says about it. Cached
      // for a few minutes inside — the section can be opened and left without a request per press,
      // and ↻ is there for the moment after you publish something.
      if (path === '/api/library') {
        return sendJson(res, 200, await readLibrary(roots, { refresh: !!query.get('refresh') }))
      }
      // ❖ THE STYLES XOKO.LAT PUBLISHES FOR ONE MEDIUM — the other half of 📚, off the same cache.
      // Not on the shelf above, on purpose: a style has no `needs`, and the section you are
      // standing in is the filter (src/library/catalog.ts).
      const libStyles = /^\/api\/library\/styles\/([^/]+)$/.exec(path)
      if (libStyles?.[1]) {
        const medium = decodeURIComponent(libStyles[1])
        if (!isMedium(medium)) throw new RequestError(`no styles for ${JSON.stringify(medium)}`, 404)
        return sendJson(res, 200,
          await readLibraryStyles(roots, medium, { refresh: !!query.get('refresh') }))
      }
      // 🧩 THE CHAINS. Each resolved against what is installed, because "can this run here?" is
      // the only question worth asking about a composition you have just taken.
      if (path === '/api/compositions') return sendJson(res, 200, await compositions())
      if (path === '/api/manifest') {
        // A rebuild is EXPLICIT: it opens every master, which is the price of embedding.
        if (query.get('rebuild')) await refresh(true)
        return sendJson(res, 200, { ...manifest, stars: await readStars(roots) })
      }
      if (path === '/api/settings') return sendJson(res, 200, await settings())
      if (path === '/api/queue') return sendJson(res, 200, { jobs: queue.list() })
      if (path === '/api/sessions') return sendJson(res, 200, await sessions(query))
      if (path === '/api/stars') return sendJson(res, 200, await readStars(roots))
      if (path.startsWith('/api/')) return sendJson(res, 404, { error: 'no such endpoint', path })

      // The assets. Served from the CONTENT root, which is outside the install directory —
      // and `serveFile` resolves every path against it before opening anything (§15 rule 2).
      if (path.startsWith('/content/')) {
        if (await serveFile(res, roots.content, path.slice('/content'.length), { req })) return
        return sendText(res, 404, `not found: ${path}\n`)
      }

      if (await serveFile(res, web, url, { req })) return
      sendText(res, 404, `not found: ${url}\n`)
    } catch (err) {
      if (err instanceof RequestError) return sendJson(res, err.status, { error: err.message })
      if (err instanceof ParamError) return sendJson(res, 400, { error: err.message, param: err.param })
      if (err instanceof TuningError) return sendJson(res, err.status, { error: err.message })
      if (err instanceof ServiceError) return sendJson(res, err.status, { error: err.message })
      if (err instanceof PathEscapeError) return sendJson(res, 400, { error: 'that path is not inside the content root' })
      if (err instanceof RevealError) return sendJson(res, 404, { error: err.message })
      if (err instanceof RemoveError) return sendJson(res, err.status, { error: err.message })
      if (err instanceof ImportError) return sendJson(res, err.status, { error: err.message })
      if (err instanceof StyleError) return sendJson(res, err.status, { error: err.message })
      if (err instanceof CompositionError) return sendJson(res, err.status, { error: err.message })
      if (err instanceof PayloadError) return sendJson(res, err.status, { error: err.message })
      if (err instanceof SecretError) return sendJson(res, err.status, { error: err.message })
      // One place turns an unexpected throw into a 500 — a handler that crashes the process
      // takes the queue down with it, which is a far worse outcome than one failed request.
      process.stderr.write(`✗ ${method} ${url}: ${(err as Error).stack ?? String(err)}\n`)
      if (!res.headersSent) sendJson(res, 500, { error: (err as Error).message })
      else res.destroy()
    }
  }
}
