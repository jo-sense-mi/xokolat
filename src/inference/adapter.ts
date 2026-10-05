// The ADAPTER BOUNDARY — the thing that buys the right to answer "bundle the engine?" later,
// per engine, with evidence (PLAN §12). An adapter talks to an endpoint; whether that endpoint
// was installed by the user, launched by the app, or bundled inside it is a packaging decision
// that changes no code above this line.

import type { Buffer } from 'node:buffer'

import type { RefSlot } from '../types/workflow.ts'
import type { InferenceRow } from '../types/inference.ts'
import type { Params } from '../types/request.ts'
import type { ResolvedWorkflow } from './workflows.ts'
import { adapter as comfy } from './comfy/adapter.ts'
import { adapter as drawThings } from './draw-things/adapter.ts'
import { adapter as plainHttp } from './http/adapter.ts'

/** Raw pixels, as `sharp` wants them. */
export interface RawImage {
  readonly data: Buffer
  readonly width: number
  readonly height: number
  readonly channels: 1 | 3 | 4
}

/**
 * A reference, RESOLVED — pixels, not a path.
 *
 * ⚠️ THE ADAPTER NEVER TOUCHES THE FILESYSTEM. The request names an asset relative to the content
 * root; resolving that (against the root, §15 rule 2) and decoding it is the job's business, so an
 * adapter for a cloud service cannot be handed a local path it would then have to interpret.
 */
export interface ResolvedRef {
  readonly role: RefSlot
  readonly image: RawImage
  /** Where it came from, for the log line and the error message. Content-root-relative. */
  readonly asset: string
}

export interface RenderInput {
  readonly row: InferenceRow
  /** ⚠️ THE WORKFLOW, resolved. An adapter that only ever renders one checkpoint per service can
   *  read the model out of `params`; one that speaks to a stranger's endpoint needs to know which
   *  knobs are the WORKFLOW's — the merged bag is full of things (width, seed, steps) that mean
   *  nothing there. Optional so nothing that ignores it has to be handed one. */
  readonly workflow?: ResolvedWorkflow
  /** The composed prompt — what actually goes to the engine, style words and all. Empty for a
   *  workflow that declares no `prompt` input: a cutout takes a picture and no words. */
  readonly prompt: string
  /** Already merged and validated (src/inference/params.ts). */
  readonly params: Params
  /** What you brought with the sentence. Empty for `make`, which is most presses. */
  readonly refs?: readonly ResolvedRef[]
  readonly signal?: AbortSignal
  /** Progress for the ▶ queue band's log tail. */
  readonly log?: (line: string) => void
  /**
   * HOW FAR ALONG, 0–1, or `null` for "working, cannot say".
   *
   * ⚠️ OPTIONAL, AND SILENCE IS A REAL ANSWER (PLAN §4). An adapter that has no way to know must
   * not guess — a bar crawling on a timer is a lie about a render that may be stuck. What the
   * queue draws when nothing calls this is the elapsed clock, which is honest.
   */
  readonly progress?: (fraction: number | null) => void
}

/**
 * WHAT AN ENGINE ANSWERED WITH.
 *
 * ⚠️ TWO SHAPES, AND THE SPLIT IS PIXELS VS EVERYTHING ELSE (2026-08-17). This was `RawImage` and
 * nothing else, which is what made every non-image medium unreachable however installed its engine
 * was: an adapter had no way to hand back an mp3. Pixels stay their own shape rather than becoming
 * bytes-with-a-webp-extension, because the app really does decode them — a reference is re-read as
 * pixels, a cutout is composited, and an encoder choice belongs to `quality`, not to whatever the
 * engine happened to emit.
 *
 * ⚠️ AND `bytes` IS A PASS-THROUGH, DELIBERATELY. A voice arrives as an mp3 and is stored as that
 * mp3. Re-encoding it here would be a second lossy pass over something the engine already decided,
 * for no gain — the medium's `quality` scale belongs to the ASK, not to the write.
 */
export type Rendered =
  | { readonly kind: 'image'; readonly image: RawImage }
  | {
    readonly kind: 'bytes'
    readonly data: Buffer
    /** No dot. Checked against the master's own extension before anything is written — an engine
     *  that answered `wav` where the medium stores `mp3` is a bug worth a sentence, not a file
     *  that lies about what is inside it. */
    readonly ext: string
  }

export interface RenderOutput {
  readonly asset: Rendered
  /** What goes into the provenance record — resolved, not requested. */
  readonly model: string | null
  readonly workflow: string | null
  /** Null when nothing about the answer was random — an operator has no seed, and `0` is a number
   *  someone could try to reproduce it with. */
  readonly seed: number | null
  readonly params: Params
}

/** ⚠️ NOT `ImageAdapter` ANY MORE. It was named for the only medium that worked; a name that
 *  says "image" is a name that argues against every row below the first one. */
export interface Adapter {
  render(input: RenderInput): Promise<RenderOutput>
}

/**
 * Which adapter speaks to this row. Dispatch is on the TRANSPORT, not on the id: a user who
 * adds a second Draw Things server with their own id gets the same adapter, which is the whole
 * point of the registry being data.
 */
export function adapterFor(row: InferenceRow): Adapter {
  if (row.transport?.kind === 'grpc') return drawThings
  // ⚠️ ONE ADAPTER, EVERY MEDIUM COMFYUI CAN MAKE. It dispatches on the transport like the others
  // and then has no further opinion: the workflow carries the graph, so a voice, a song and a mesh
  // are the same code path and none of them is named here.
  if (row.transport?.kind === 'comfy') return comfy
  // ⚠️ ONE ADAPTER FOR EVERY PLAIN-HTTP TOOL, and the tool is a registry row. The `call` shape says
  // what one request looks like, so rembg, a FastAPI wrapper and whatever someone writes this
  // afternoon are all the same code and none of them is in this source tree.
  if (row.transport?.kind === 'http' && row.transport.call) return plainHttp
  if (row.transport?.kind === 'http') {
    throw new Error(`${row.id} has no call shape — say what one request looks like in 🔌 settings`)
  }
  throw new Error(`no adapter for ${row.id}: ${row.transport?.kind ?? 'no'} transport is not spoken yet`)
}
