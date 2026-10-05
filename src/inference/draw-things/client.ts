// The Draw Things gRPC adapter — Phase 0 half: connect, and ask the server what it has.
// Rendering (the FlatBuffer configuration and the ccv pixel decode) lands with commit 3.
//
// `@grpc/grpc-js` + `@grpc/proto-loader` are PURE JS — no native build, which is most of why
// gRPC was affordable here at all (PLAN §14). The channel is insecure on purpose: this talks to
// 127.0.0.1, and the server runs `--no-tls`.

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { credentials, loadPackageDefinition } from '@grpc/grpc-js'
import type { Client, ClientReadableStream, ServiceError } from '@grpc/grpc-js'
import { loadSync } from '@grpc/proto-loader'

const PROTO = join(dirname(fileURLToPath(import.meta.url)), 'imageService.proto')

/** One catalog entry as the server reports it: everything it says, plus the fields we read. */
export interface CatalogEntry {
  readonly file: string
  readonly name?: string
  readonly version?: string
  /** Present on the server's built-in models. Their metadata must NOT be echoed back in a
   *  `MetadataOverride` — the server already knows them. */
  readonly official?: unknown
  /** ⚠️ CONTROL ENTRIES ONLY, and in the vendor's own spelling because this object is echoed back
   *  verbatim in the override. `modifier` is what kind of control it is (`shuffle` for every
   *  IP-Adapter, `tile`/`blur`/`lowquality` for the degrading ones) and decides which fields of the
   *  configuration mean anything for it — see `ControlInfo` in ./config.ts. */
  readonly modifier?: string
  readonly global_average_pooling?: boolean
}

export interface Catalog {
  readonly models: readonly CatalogEntry[]
  readonly loras: readonly CatalogEntry[]
  readonly controlNets: readonly CatalogEntry[]
  readonly upscalers: readonly CatalogEntry[]
  readonly textualInversions: readonly CatalogEntry[]
}

const EMPTY_CATALOG: Catalog = {
  models: [], loras: [], controlNets: [], upscalers: [], textualInversions: [],
}

const CATALOG_KEYS = ['models', 'loras', 'controlNets', 'upscalers', 'textualInversions'] as const

/** Big enough for the FIRST Echo after a cold start, which scans the whole models directory —
 *  tens of GB, ~40s on the dev box. Later calls are instant. A short timeout here is exactly
 *  what makes the first render after a service start fail for no visible reason. */
export const CATALOG_TIMEOUT_MS = 180_000

interface EchoReply {
  readonly message?: string
  readonly override?: Readonly<Record<string, Buffer>>
}

export interface GenerateRequest {
  readonly prompt: string
  readonly negativePrompt: string
  /** The INIT IMAGE, as a ccv tensor (src/inference/draw-things/tensor.ts). Absent for a render
   *  from words alone; present the moment a reference is attached, and then `strength` in the
   *  configuration decides how much of it survives. */
  readonly image?: Buffer
  /**
   * THE CONTROL PICTURES — grouped by channel, each carrying its own blend weight.
   *
   * ⚠️ THE PAIRING IS POSITIONAL, and that is the whole protocol here: the Nth tensor on a channel
   * belongs to the Nth control in the configuration that reads that channel. `sdxl-story-slide`
   * sends two `shuffle` tensors for two IP-Adapter controls, and swapping them swaps which picture
   * is the subject and which is the style — with no error anywhere.
   *
   * ⚠️ AND THE WEIGHT HERE IS NOT THE CONTROL'S STRENGTH. This one is the blend weight AMONG the
   * pictures on a channel (a moodboard of three references); how hard the control pulls on the
   * render is `weight` on the control in the configuration.
   */
  readonly hints?: readonly HintProto[]
  readonly configuration: Uint8Array
  readonly override?: Record<string, Buffer>
  readonly user: string
  readonly device: string
  readonly scaleFactor: number
}

export interface HintProto {
  readonly hintType: string
  readonly tensors: readonly { readonly tensor: Buffer; readonly weight: number }[]
}

interface GenerateResponse {
  readonly generatedImages?: readonly Buffer[]
}

/** proto-loader hands back an untyped constructor tree; this is the one place that admits it. */
type ServiceClient = Client & {
  Echo(
    req: { name: string }, options: { deadline: number },
    cb: (err: ServiceError | null, reply: EchoReply) => void,
  ): void
  GenerateImage(req: GenerateRequest): ClientReadableStream<GenerateResponse>
}

let ctor: (new (address: string, creds: ReturnType<typeof credentials.createInsecure>, options?: object) => ServiceClient) | null = null

function serviceCtor() {
  if (!ctor) {
    const pkg = loadPackageDefinition(loadSync(PROTO, {
      keepCase: true, longs: String, enums: String, defaults: true, oneofs: true,
    })) as unknown as Record<string, unknown>
    ctor = pkg['ImageGenerationService'] as typeof ctor
    if (!ctor) throw new Error(`${PROTO} does not define ImageGenerationService`)
  }
  return ctor
}

export function connect(host: string, port: number): ServiceClient {
  return new (serviceCtor())(`${host}:${port}`, credentials.createInsecure(), {
    // A generated image is megabytes of raw tensor; the defaults are far too small.
    'grpc.max_receive_message_length': -1,
    'grpc.max_send_message_length': -1,
  })
}

/**
 * The server's catalog, via Echo.
 *
 * ⚠️ Not a health check — see the note on the RPC in the .proto. Call this when you want the
 * model list, and only then.
 */
export type { ServiceClient }

/**
 * One render. The RPC streams progress and then the finished tensor(s); we keep the last
 * `generatedImages` payload, which is the completed image (earlier ones are previews).
 *
 * `signal` aborts it — a queue with no ✕ is a queue that holds you hostage (PLAN §4). Cancelling
 * a gRPC call tears down the stream; the engine's own work stops with it because it is the only
 * consumer.
 */
export function generateImage(
  client: ServiceClient, req: GenerateRequest, signal?: AbortSignal,
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const stream = client.GenerateImage(req)
    let last: Buffer | null = null
    const onAbort = (): void => {
      stream.cancel()
      reject(new Error('cancelled'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    const finish = (fn: () => void): void => {
      signal?.removeEventListener('abort', onAbort)
      fn()
    }
    stream.on('data', (msg: GenerateResponse) => {
      const image = msg.generatedImages?.at(-1)
      if (image?.length) last = image
    })
    stream.on('error', (err: Error) => finish(() => reject(err)))
    stream.on('end', () => finish(() => {
      if (last) resolve(last)
      else reject(new Error('the engine returned no image'))
    }))
  })
}

export function fetchCatalog(client: ServiceClient, timeoutMs = CATALOG_TIMEOUT_MS): Promise<Catalog> {
  return new Promise<Catalog>((resolve, reject) => {
    client.Echo({ name: 'xokolat' }, { deadline: Date.now() + timeoutMs }, (err, reply) => {
      if (err) return reject(err)
      const out: Record<string, CatalogEntry[]> = {}
      for (const key of CATALOG_KEYS) {
        const raw = reply.override?.[key]
        if (!raw?.length) continue
        try {
          // These bytes fields carry UTF-8 JSON directly. (The ComfyUI bridge base64-decodes
          // them only because it reads them through MessageToJson.)
          const parsed: unknown = JSON.parse(Buffer.from(raw).toString('utf-8'))
          if (Array.isArray(parsed)) out[key] = parsed.filter((e): e is CatalogEntry =>
            typeof e === 'object' && e !== null && typeof (e as CatalogEntry).file === 'string')
        } catch {
          // A catalog we cannot read is not a reason to fail: the render can still name a model.
        }
      }
      resolve({ ...EMPTY_CATALOG, ...out })
    })
  })
}
