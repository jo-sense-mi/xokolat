// The Draw Things adapter: a resolved request in, pixels out.

import sharp from 'sharp'

import type { Adapter, RawImage, RenderInput, RenderOutput } from '../adapter.ts'
import { catalogEntry, catalogExtra, readCatalog } from '../catalog.ts'
import { capsFor } from '../engines.ts'
import { knobFallback } from '../knobs.ts'
import { ParamError, resolveImageKnobs, usedParams } from '../params.ts'
import type { Control } from '../../types/workflow.ts'
import type { CatalogEntry, HintProto, ServiceClient } from './client.ts'
import { connect, generateImage } from './client.ts'
import type { ControlConfig, Sampler, SeedMode } from './config.ts'
import { SAMPLERS, SEED_MODES, buildConfiguration, hintChannel } from './config.ts'
import { decodeTensor, encodeHint, encodeTensor } from './tensor.ts'

/**
 * Raw pixels at exactly `width × height`, cover-cropped, and ALWAYS THREE CHANNELS.
 *
 * ⚠️ RGB, NEVER RGBA. The header declares the channel count and the server sizes the tensor from
 * it, so a PNG with an alpha channel would arrive as a C=4 tensor where the model expects three —
 * which is not an error anywhere, just a reference that does nothing. Every reference encoder for
 * this protocol converts to RGB first; ours has to as well.
 *
 * Cover-crop rather than fit-inside because the request already decided the frame: letterboxing
 * would put grey bars into the latents.
 */
export async function fit(image: RawImage, width: number, height: number): Promise<RawImage> {
  if (image.width === width && image.height === height && image.channels === 3) return image
  const { data, info } = await sharp(image.data, {
    raw: { width: image.width, height: image.height, channels: image.channels },
  })
    .resize({ width, height, fit: 'cover', position: 'centre' })
    .removeAlpha()
    .toColourspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height, channels: info.channels as 1 | 3 | 4 }
}

/** One client per endpoint, for the life of the process — reconnecting per render is pure
 *  latency. The CATALOG is not cached here: `src/inference/catalog.ts` holds the one cache the
 *  shelf and the render path share, so the ~40s cold scan is paid once between them. */
const clients = new Map<string, ServiceClient>()

function clientFor(host: string, port: number): ServiceClient {
  const key = `${host}:${port}`
  let client = clients.get(key)
  if (!client) {
    client = connect(host, port)
    clients.set(key, client)
  }
  return client
}

/**
 * The metadata the server needs for files it did not ship with — one echo, three catalogs.
 *
 * ⚠️ WITHOUT THIS A CONTROL SIMPLY DOES NOTHING. The server looks a control file up by name and, for
 * one it has no built-in record of, needs to be told what it is (its version, its modifier) in the
 * same request — so an IP-Adapter you downloaded renders exactly like no IP-Adapter at all until
 * its entry rides along. Built-in ("official") entries are omitted: sending ours back overwrites a
 * good record with a worse one.
 */
function overrideFor(entries: {
  readonly model: CatalogEntry | undefined
  readonly controlNets: readonly CatalogEntry[]
  readonly loras: readonly CatalogEntry[]
}): Record<string, Buffer> | undefined {
  const mine = (e: CatalogEntry): boolean => !('official' in e)
  const out: Record<string, Buffer> = {}
  const models = entries.model && mine(entries.model) ? [entries.model] : []
  const controlNets = entries.controlNets.filter(mine)
  const loras = entries.loras.filter(mine)
  if (models.length) out['models'] = Buffer.from(JSON.stringify(models), 'utf-8')
  if (controlNets.length) out['controlNets'] = Buffer.from(JSON.stringify(controlNets), 'utf-8')
  if (loras.length) out['loras'] = Buffer.from(JSON.stringify(loras), 'utf-8')
  return Object.keys(out).length ? out : undefined
}

/**
 * WHICH SLOT IS THE PICTURE THE RENDER BEGINS FROM. Everything else attached is read by a control.
 *
 * ⚠️ TWO CHANNELS, NOT ONE (2026-08-12). `image` on the request is the init image — img2img's noise
 * source, Kontext's in-context canvas — and it is only ever the `ref` slot, and only when no control
 * has claimed that slot. The pictures a control reads ride `hints` instead: a different message,
 * with its own channel name and its own weights. A workflow that attached a style reference used to
 * be refused by name here; now the refusal is narrower, and `mask` is the last slot still without a
 * wire: the request's own `mask` field exists and nothing in this app paints one.
 */
const INIT_SLOT = 'ref'

/** The workflow's control, plus the three facts only the service's catalog can supply. A control the
 *  catalog has never heard of gets none of them, which is the honest reading: the server will not
 *  know it either, and the log line above says so. */
const controlConfig = (control: Control, found: CatalogEntry | undefined): ControlConfig => ({
  ...control,
  info: {
    modifier: found?.modifier,
    version: found?.version,
    globalAveragePooling: found?.global_average_pooling,
  },
})

/** How much of the sentence, versus how much of the picture you brought. The schema's own default
 *  is 0, which would mean "change nothing" — so a request WITH a reference and no opinion cannot
 *  fall through to it, and the number comes from the knob table like every other unset value. */
const defaultStrength = (): number => knobFallback('image', 'strength') as number

async function render(input: RenderInput): Promise<RenderOutput> {
  const { row, params, prompt, signal, log } = input
  const refs = input.refs ?? []
  const who = input.workflow?.label ?? row.id
  const controls = input.workflow?.controls ?? []
  // A slot a control reads is spoken for; what is left over is the picture the render starts from.
  const claimed = new Set<string>(controls.map((c) => c.from))
  const spare = refs.filter((r) => !claimed.has(r.role))
  for (const ref of spare) {
    if (ref.role !== INIT_SLOT) {
      throw new ParamError('refs', `${who} has nothing that reads a ${ref.role} picture`)
    }
  }
  if (spare.length > 1) {
    throw new ParamError('refs', `${who} takes one starting image, and ${spare.length} were attached`)
  }
  const init = spare[0] ?? null
  const transport = row.transport
  if (transport?.kind !== 'grpc' || transport.port === 'auto') {
    throw new Error(`${row.id} has no reachable endpoint`)
  }
  const model = params['model']
  if (typeof model !== 'string' || !model) {
    throw new ParamError('model', `${row.id} needs a model: pick one of the checkpoints the server reports`)
  }
  // Caps resolve engine ← MODEL, so the step lock a distilled checkpoint carries is enforced
  // here even for a request that never went near the UI.
  const knobs = resolveImageKnobs(capsFor(row, model), params)
  // ⚠️ THE UNSET VALUES COME FROM THE KNOB TABLE, not from literals here. They were literals, and
  // that made the only honest way to learn what an unset `cfg` does "read the adapter" — which
  // the ⚙ editor cannot do, so its placeholder was a second opinion.
  const sampler = (params['sampler'] ?? knobFallback('image', 'sampler')) as Sampler
  if (!(SAMPLERS as readonly string[]).includes(sampler)) {
    throw new ParamError('sampler', `unknown sampler ${JSON.stringify(sampler)}`)
  }
  const seedMode = (params['seedMode'] ?? knobFallback('image', 'seedMode')) as SeedMode
  if (!(SEED_MODES as readonly string[]).includes(seedMode)) {
    throw new ParamError('seedMode', `unknown seed mode ${JSON.stringify(seedMode)}`)
  }

  const client = clientFor(transport.host, transport.port)

  // The catalog gives the model's VERSION, which decides which model-conditional fields in the
  // configuration mean anything. Never inferred from the filename (PLAN §4: declare, do not
  // infer) — an unknown model simply gets none of them.
  const catalog = await readCatalog(row)
  let entry: CatalogEntry | undefined
  if (catalog.error) log?.(`catalog unavailable (${catalog.error}); rendering without model metadata`)
  else {
    entry = catalogEntry(row.id, model)
    if (!entry) log?.(`${model} is not in the server's catalog — rendering it anyway`)
  }

  // ⚠️ THE INIT IMAGE IS RESIZED TO THE RENDER, here and not in the job. What the latent encoder
  // needs is pixels at the size being rendered; a 4000px photo against a 1024² render is not a
  // preference, it is a shape mismatch. `fill` rather than `inside` because the request already
  // decided the frame — letterboxing would put grey bars into the latents.
  const initTensor = init ? encodeTensor(await fit(init.image, knobs.width, knobs.height)) : null
  if (init) log?.(`starting from ${init.asset} (${init.role})`)

  // ⚠️ THE CONTROL AND ITS PICTURE ARE BUILT TOGETHER, and in workflow order, because the pairing on
  // the wire is positional (see `GenerateRequest.hints`). Two IP-Adapters on one channel are told
  // apart by nothing but the order they were pushed in.
  const hints = new Map<string, { tensor: Buffer; weight: number }[]>()
  const controlConfigs: ControlConfig[] = []
  const controlEntries: CatalogEntry[] = []
  for (const control of controls) {
    const picture = refs.find((r) => r.role === control.from)
    const name = control.file ?? `the model's own ${control.inputType.toLowerCase()} channel`
    if (!picture) {
      throw new ParamError('refs', `${who} needs a ${control.from} picture for ${name}`)
    }
    // ⚠️ NO FILE MEANS NO ENTRY IN THE CONFIGURATION — the picture rides the hint channel alone.
    // That is klein's moodboard: the reference path is inside the checkpoint, so there is nothing
    // to look up in the control catalog and nothing to describe in an override. Pushing an empty
    // control here would name a file the server cannot find and the reference would do nothing.
    if (control.file !== undefined) {
      const found = catalogExtra(row.id, 'controlNets', control.file)
      if (found) controlEntries.push(found)
      else log?.(`${control.file} is not in the server's control list — sending it anyway`)
      controlConfigs.push(controlConfig(control, found))
    }
    const channel = hintChannel(control.inputType)
    const fitted = await fit(picture.image, knobs.width, knobs.height)
    // ⚠️ 1.0, ALWAYS, and it is not the control's strength. This is the blend weight AMONG the
    // pictures on a channel; how hard the control pulls is `weight` in the configuration. One
    // picture per control means there is nothing to blend.
    hints.set(channel, [...(hints.get(channel) ?? []), { tensor: encodeHint(fitted, channel), weight: 1 }])
    log?.(`${name} reads ${picture.asset} (${control.from} → ${channel})`)
  }

  const loras = input.workflow?.loras ?? []
  const loraEntries = loras
    .map((lora) => catalogExtra(row.id, 'loras', lora.file))
    .filter((e): e is CatalogEntry => e !== undefined)

  const strength = typeof params['strength'] === 'number' ? params['strength'] : defaultStrength()
  if (init && (strength <= 0 || strength > 1)) {
    throw new ParamError('strength', `strength is how much of the picture is redrawn, 0–1 (got ${strength})`)
  }

  const configuration = buildConfiguration({
    model,
    version: entry?.version ?? null,
    width: knobs.width,
    height: knobs.height,
    seed: knobs.seed,
    steps: knobs.steps,
    // Left at the config's own default when nothing was attached: a strength on a text-to-image
    // render is a number about a picture that is not there.
    ...(init ? { strength } : {}),
    // Kontext's adherence knob. Sent only when a checkpoint or a press asked for it — it is inert
    // everywhere else, and a field nobody set is a field the server decides.
    ...(typeof params['imageGuidance'] === 'number' ? { imageGuidance: params['imageGuidance'] } : {}),
    cfg: typeof params['cfg'] === 'number' ? params['cfg'] : (knobFallback('image', 'cfg') as number),
    sampler,
    seedMode,
    ...(typeof params['shift'] === 'number' ? { shift: params['shift'] } : {}),
    ...(typeof params['clipSkip'] === 'number' ? { clipSkip: params['clipSkip'] } : {}),
    ...(typeof params['guidanceEmbed'] === 'number' ? { guidanceEmbed: params['guidanceEmbed'] } : {}),
    ...(controlConfigs.length ? { controls: controlConfigs } : {}),
    ...(loras.length ? { loras } : {}),
  })

  log?.(`rendering ${knobs.width}×${knobs.height}, ${knobs.steps} steps, seed ${knobs.seed}`)
  const override = overrideFor({ model: entry, controlNets: controlEntries, loras: loraEntries })
  const hintProtos: HintProto[] = [...hints].map(([hintType, tensors]) => ({ hintType, tensors }))
  const tensor = await generateImage(client, {
    prompt,
    negativePrompt: knobs.negative,
    ...(initTensor ? { image: initTensor } : {}),
    ...(hintProtos.length ? { hints: hintProtos } : {}),
    configuration,
    ...(override ? { override } : {}),
    user: 'xokolat',
    device: 'LAPTOP',
    scaleFactor: 1,
  }, signal)

  const image = decodeTensor(tensor)
  return {
    asset: { kind: 'image', image },
    model,
    workflow: entry?.version ?? null,
    seed: knobs.seed,
    params: usedParams({ ...params, sampler, seedMode }, knobs),
  }
}

export const adapter: Adapter = { render }
