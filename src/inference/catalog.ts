// WHAT THE ENGINE ACTUALLY HAS — asked once, cached, and never asked on a poll.
//
// The 🔌 shelf refreshes every 15 seconds. A cold Draw Things catalog takes ~40s (it scans tens
// of GB of checkpoints), so reading it on the shelf path would mean the shelf is either always
// stale or always blocking. Instead: the shelf reads the CACHE and says plainly when the cache
// is empty, and one explicit endpoint does the asking.
//
// A failure is remembered so the shelf can SAY so, but it is not sticky: the next real read
// tries again. `refresh: true` re-asks a successful one, which is the honest answer to "I just
// downloaded a checkpoint".

import type { Roots } from '../paths.ts'
import type { InferenceRow } from '../types/inference.ts'
import { connect, fetchCatalog } from './draw-things/client.ts'
import type { CatalogEntry } from './draw-things/client.ts'
import type { CatalogEngine } from './engines.ts'
import { listModels } from './openai/adapter.ts'
import type { ServiceFiles } from './workflows.ts'

export interface ServiceCatalog {
  readonly engine: string
  /** Null until it has been asked once — which is NOT the same as "it has nothing". */
  readonly engines: readonly CatalogEngine[] | null
  readonly askedAt: string | null
  readonly error: string | null
  /** ⚠️ LISTED NOW, NOT COUNTED (2026-08-12). They were two numbers, on the honest grounds that a
   *  list implies we can use them and we could not. A workflow carries `controls` and `loras` BY NAME
   *  now, so the names are what the workflow editor offers and what the requirements check reads —
   *  and `null` still means the service was never asked, which is not "it has none". */
  readonly loras: readonly string[] | null
  readonly controlNets: readonly string[] | null
}

const NEVER_ASKED = (engine: string): ServiceCatalog => ({
  engine, engines: null, askedAt: null, error: null, loras: null, controlNets: null,
})

/** The cached value plus the vendor's own entries, which the render path needs whole: a
 *  non-builtin model has to be echoed back to the server as a `MetadataOverride`, and the
 *  projection above drops the fields that override is made of. ONE cache for both readers — the
 *  ~40s cold scan is paid once, by whoever asks first. */
interface Held {
  readonly view: ServiceCatalog
  readonly raw: readonly CatalogEntry[]
  /** ⚠️ THE CONTROL AND LORA ENTRIES, WHOLE — not counted like the view above. A workflow with an
   *  IP-Adapter needs three facts from this entry (`modifier`, `version`, `global_average_pooling`)
   *  before the configuration can be built at all, and the non-builtin ones have to be echoed back
   *  in the same `MetadataOverride` as the model. */
  readonly controlNets: readonly CatalogEntry[]
  readonly loras: readonly CatalogEntry[]
}

const cache = new Map<string, Held>()

/** Whatever is known right now, without asking anything. The shelf's read. */
export function cachedCatalog(id: string): ServiceCatalog {
  return cache.get(id)?.view ?? NEVER_ASKED(id)
}

/** The vendor entry for one model, for the adapter. Undefined when unknown — the adapter renders
 *  anyway and says so, because a missing catalog entry is not a missing model. */
export function catalogEntry(id: string, file: string): CatalogEntry | undefined {
  return cache.get(id)?.raw.find((m) => m.file === file)
}

/** The same, for the OTHER two catalogs a workflow can name. `what` is the vendor's own key. */
export function catalogExtra(
  id: string, what: 'controlNets' | 'loras', file: string,
): CatalogEntry | undefined {
  return cache.get(id)?.[what].find((e) => e.file === file)
}

/** What the service reports having, beyond its checkpoints — the lists the requirements check asks
 *  "is it there?" against. Null when the catalog has never been read (or could not be): absent
 *  evidence, not evidence of absence, which is the same rule `resolveEngines` follows one level
 *  down. */
export function serviceFiles(id: string): ServiceFiles {
  const view = cachedCatalog(id)
  return { controlNets: view.controlNets, loras: view.loras }
}

/** Exported for tests, and for a registry reload — a row whose endpoint changed must not keep
 *  answering with the old endpoint's models. */
export function forgetCatalog(id?: string): void {
  if (id === undefined) cache.clear()
  else cache.delete(id)
}

/**
 * Ask the engine, or return what was already asked. One gRPC engine exists and Draw Things is
 * it; a second transport dispatches on `row.transport.kind` here rather than growing a branch
 * in the HTTP layer.
 */
export async function readCatalog(
  row: InferenceRow,
  /** `roots` only so an endpoint that wants a key can have one read for it — see the openai
   *  adapter. Absent is right for every caller that cannot have keys in play. */
  { refresh = false, roots = null }: { refresh?: boolean; roots?: Roots | null } = {},
): Promise<ServiceCatalog> {
  // Only a SUCCESSFUL read is sticky. A failure is remembered so the shelf can show it without
  // re-probing, but it is never inherited by the next real attempt — a server that was down for
  // one second must not render without model metadata for the life of the process.
  const held = cache.get(row.id)
  if (held && !refresh && !held.view.error) return held.view

  const fail = (error: string): ServiceCatalog => {
    // ⚠️ `models: null`, not `[]`. "I could not ask" and "it has none" are different answers and
    // the whole shelf discipline is that the second is never drawn for the first.
    const view: ServiceCatalog = { ...NEVER_ASKED(row.id), askedAt: new Date().toISOString(), error }
    cache.set(row.id, { view, raw: [], controlNets: [], loras: [] })
    return view
  }

  const transport = row.transport

  // ⚠️ AN OPENAI-COMPATIBLE ENDPOINT KNOWS WHAT IT HAS, and asking is worth it: it is the
  // difference between a brain row listing three models somebody typed into a registry file and
  // one listing what you have actually pulled. The same three states as a checkpoint, one layer up.
  if (transport?.kind === 'openai') {
    try {
      const ids = await listModels(row, roots)
      const view: ServiceCatalog = {
        engine: row.id,
        engines: ids.map((id) => ({ file: id, name: null, version: null, builtin: false })),
        askedAt: new Date().toISOString(),
        error: null,
        loras: [],
        controlNets: [],
      }
      cache.set(row.id, { view, raw: [], controlNets: [], loras: [] })
      return view
    } catch (err) {
      return fail((err as Error).message)
    }
  }

  // ⚠️ A COMMAND HAS NO CATALOG, and that is not a failure of the row. `claude --model` takes what
  // the vendor publishes, not what is on this disk, so the models it declares stand as declared —
  // `engines: null` is exactly what keeps them askable rather than marking them missing.
  // ⚠️ NOT `fail()` (2026-08-21). This branch has always known it was not a failure — the comment
  // above says so — and then returned one anyway, so the card printed a red `could not ask it:` on
  // a service that was working perfectly. There is nothing here to ask and nothing went wrong:
  // `NEVER_ASKED` is that exact state, and the card draws no catalog line for a command at all.
  if (transport?.kind === 'cli') return NEVER_ASKED(row.id)

  // ⚠️ NEITHER DOES A GRAPH SERVER OR A PLAIN HTTP TOOL, AND SAYING SO AS A FAILURE IS THE BUG
  // THAT COST A WHOLE CONVERSATION (2026-08-23). ComfyUI was up, answering, and `ready` on the
  // shelf; this line still wrote `comfyui has no reachable gRPC endpoint to ask` into its catalog,
  // because every transport that was not grpc fell through one branch whose message named the one
  // protocol the row had never claimed to speak. `src/xoko/here.ts` reads `catalog.error` as its
  // reachability test — on purpose, and correctly for a service that CAN be asked — so xoko was
  // told `music — NOT YET … the service is not answering. Nothing here can run until it is up`,
  // refused to try a render five times running, and was right to, because the app had told it so.
  //
  // A row that speaks no catalog protocol is in exactly the state `cli` is in one line above:
  // nothing to ask, nothing went wrong, `NEVER_ASKED`. `NetTransport.call` already says as much
  // for `http` in its own doc — "absent = the row is reachable and unaskable".
  //
  // ⚠️ AND `comfy` IS ASKABLE — this is a stub, not a verdict. ComfyUI publishes `GET /models` and
  // `GET /models/<folder>`, so its checkpoints are one request away. What stops that being read
  // here today is that a comfy workflow's `model` is not always a file: the two voice workflows name
  // `Qwen3-TTS-1.7B`, which is a `model_choice` enum INSIDE the node and is in no folder on disk.
  // Listing the folders without teaching the library that difference would mark both voices
  // `declared`, and `workflowsOn` drops a workflow whose checkpoint is missing — turning a service
  // that says the wrong thing into a service that quietly cannot speak. That fix is a library
  // format change (a workflow saying which folder its model lives in, or that it has no file at
  // all), and it belongs in its own change.
  if (transport?.kind === 'comfy' || transport?.kind === 'http') return NEVER_ASKED(row.id)

  // What is left is genuinely a gRPC row that cannot be reached — and the two ways that happens
  // are different sentences, because "the port is discovered per render" is not a fault.
  if (transport?.kind !== 'grpc') {
    return fail(`${row.id} speaks ${transport?.kind ?? 'nothing'}, which cannot be asked what it has`)
  }
  if (transport.port === 'auto') {
    return fail(`${row.id} has no fixed port to ask — its endpoint is found per render`)
  }

  const client = connect(transport.host, transport.port)
  try {
    const catalog = await fetchCatalog(client)
    const view: ServiceCatalog = {
      engine: row.id,
      engines: catalog.models.map((m) => ({
        file: m.file,
        name: m.name ?? null,
        version: m.version ?? null,
        builtin: 'official' in m,
      })),
      askedAt: new Date().toISOString(),
      error: null,
      loras: catalog.loras.map((e) => e.file),
      controlNets: catalog.controlNets.map((e) => e.file),
    }
    cache.set(row.id, {
      view, raw: catalog.models, controlNets: catalog.controlNets, loras: catalog.loras,
    })
    return view
  } catch (err) {
    return fail((err as Error).message)
  } finally {
    client.close()
  }
}
