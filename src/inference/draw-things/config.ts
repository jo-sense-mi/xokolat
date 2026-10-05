// The `configuration` field: Draw Things' whole parameter set, FlatBuffer-encoded.
//
// Field INDICES are declaration order in the server's schema (`GenerationConfiguration`) and
// are verified against the generated reader's vtable offsets — field i lives at voffset
// 4 + 2i, so `model` at voffset 18 is index 7. They are facts of the wire format; the names
// and the grouping below are ours.
//
// ⚠️ DEFAULTS ARE OMITTED FROM THE WIRE (see flatbuffer.ts). Every default in the table below
// is therefore load-bearing: get one wrong and the field silently reverts to the server's idea
// of it instead of ours.

import { CONTROL_INPUT_TYPES, CONTROL_MODES, LORA_MODES } from '../../types/workflow.ts'
import type { Control, ControlInputType, Lora, TargetBlocks } from '../../types/workflow.ts'
import { FlatBufferBuilder } from './flatbuffer.ts'

/** Draw Things' sampler list, in enum order — the index IS the wire value. */
export const SAMPLERS = [
  'DPM++ 2M Karras', 'Euler A', 'DDIM', 'PLMS', 'DPM++ SDE Karras', 'UniPC', 'LCM',
  'Euler A Substep', 'DPM++ SDE Substep', 'TCD', 'Euler A Trailing', 'DPM++ SDE Trailing',
  'DPM++ 2M AYS', 'Euler A AYS', 'DPM++ SDE AYS', 'DPM++ 2M Trailing', 'DDIM Trailing',
  'UniPC Trailing', 'UniPC AYS', 'TCD Trailing',
] as const

export type Sampler = (typeof SAMPLERS)[number]

export const SEED_MODES = ['Legacy', 'TorchCpuCompatible', 'ScaleAlike', 'NvidiaGpuCompatible'] as const

export type SeedMode = (typeof SEED_MODES)[number]

/** Field indices, named. Only the ones xokolat sets — the rest of the ~90 keep their defaults. */
const F = {
  startWidth: 1, startHeight: 2, seed: 3, steps: 4, guidanceScale: 5, strength: 6, model: 7,
  sampler: 8, imageGuidanceScale: 16, seedMode: 17, clipSkip: 18,
  originalImageHeight: 29, originalImageWidth: 30,
  targetImageHeight: 33, targetImageWidth: 34,
  negativeOriginalImageHeight: 39, negativeOriginalImageWidth: 40,
  shift: 49, controls: 19, loras: 20,
  speedUpWithGuidanceEmbed: 69, guidanceEmbed: 70, resolutionDependentShift: 71,
} as const

/** The schema's own defaults for the fields we touch. */
const D = {
  strength: 0, sampler: 0, imageGuidanceScale: 1.5, seedMode: 0, clipSkip: 1, shift: 1,
  speedUpWithGuidanceEmbed: true, guidanceEmbed: 3.5, resolutionDependentShift: true,
} as const

/** `Control`, in declaration order — the same rule as F above, on the nested table. */
const C = {
  file: 0, weight: 1, guidanceStart: 2, guidanceEnd: 3, noPrompt: 4, globalAveragePooling: 5,
  downSamplingRate: 6, controlMode: 7, targetBlocks: 8, inputOverride: 9,
} as const

const CONTROL_FIELDS = 10

const CD = {
  weight: 1, guidanceStart: 0, guidanceEnd: 1, globalAveragePooling: true, downSamplingRate: 1,
  controlMode: 0, inputOverride: 0,
} as const

/** `LoRA`: file · weight · mode. ⚠️ Its weight default is 0.6, not 1 — a workflow asking for 1.0
 *  must therefore WRITE it, and one asking for 0.6 must not. */
const L = { file: 0, weight: 1, mode: 2 } as const

const LORA_FIELDS = 3

const LD = { weight: 0.6, mode: 0 } as const

/** The number of fields in the table. The vtable is trimmed to the last one actually set, so
 *  this only has to be at least as large as the highest index used. */
const FIELD_COUNT = 86

/**
 * WHAT THE SERVICE SAYS ABOUT A CONTROL FILE — from its own catalog, never from the workflow.
 *
 * ⚠️ THREE FIELDS OF THE WIRE ARE DECIDED BY THIS AND NOT BY THE WORKFLOW, which is why it has to be
 * carried this far down. An IP-Adapter's InstantStyle blocks exist only on the families that have
 * those blocks (`modifier: shuffle` on v1 or SDXL); `downSamplingRate` means something only to a
 * tile/blur/lowquality control; and `globalAveragePooling` defaults to TRUE in the schema, so every
 * control whose catalog entry does not claim it must say `false` OUT LOUD or silently get pooling
 * it was never meant to have.
 */
export interface ControlInfo {
  readonly modifier?: string | undefined
  readonly version?: string | undefined
  readonly globalAveragePooling?: boolean | undefined
}

/** One control, as the configuration carries it: the workflow's entry plus what the catalog knows.
 *  (`from` comes along and is ignored here — which slot fed the picture is the adapter's business,
 *  and by this point the picture is already a tensor on a channel.) */
export type ControlConfig = Control & { readonly info?: ControlInfo }

export type LoraConfig = Lora

/** InstantStyle, per model family: the attention blocks each selector names. `All` is the empty
 *  list — "do not restrict" — and it is still WRITTEN, as an empty vector. */
const BLOCKS: Record<string, Record<TargetBlocks, readonly string[]>> = {
  'sdxl_base_v0.9': {
    All: [],
    Style: ['up_blocks.0.attentions.1'],
    'Style and Layout': ['down_blocks.2.attentions.1', 'up_blocks.0.attentions.1'],
  },
  v1: {
    All: [],
    Style: ['up_blocks.1'],
    'Style and Layout': ['down_blocks.2', 'mid_block', 'up_blocks.1'],
  },
}

/** The controls whose hint is degraded on purpose, and the only ones `downSamplingRate` reaches. */
const DOWN_SAMPLED = ['tile', 'blur', 'lowquality']

/**
 * WHICH CHANNEL A CONTROL'S PICTURE RIDES. Not one channel per control type: the server has five
 * named ones and everything it has no special reading for arrives as `custom`.
 *
 * ⚠️ `Canny` IS `custom`, which is why `canny` never appears as a hint type even though it appears
 * as an input type — an edge map is just a picture, and the model was trained on the drawing.
 */
const HINT_CHANNELS: Partial<Record<ControlInputType, string>> = {
  Depth: 'depth', Scribble: 'scribble', Pose: 'pose', Color: 'color', Shuffle: 'shuffle',
}

export const hintChannel = (inputType: ControlInputType): string =>
  HINT_CHANNELS[inputType] ?? 'custom'

export interface RenderConfig {
  /** The checkpoint filename as the server's catalog reports it. */
  readonly model: string
  /** The catalog's `version` for that model (`flux1`, `sdxl_base_v0.9`, …). It selects which
   *  model-conditional fields mean anything — never guessed from the filename. */
  readonly version: string | null
  readonly width: number
  readonly height: number
  readonly seed: number
  readonly steps: number
  readonly cfg: number
  readonly sampler: Sampler
  readonly seedMode?: SeedMode
  readonly strength?: number
  /** How hard an EDIT model is held to the picture you attached. Kontext's own knob; inert on
   *  everything else, which is why it is only sent when something asked for it. */
  readonly imageGuidance?: number
  readonly clipSkip?: number
  readonly shift?: number
  readonly guidanceEmbed?: number
  readonly controls?: readonly ControlConfig[]
  readonly loras?: readonly LoraConfig[]
}

const SDXL_VERSIONS = ['sdxl_base_v0.9', 'sdxl_refiner_v0.9']
/** Families that read a resolution-dependent sampling shift. */
const RES_SHIFT_VERSIONS = [
  'flux1', 'sd3', 'hidream_i1', 'qwen_image', 'z_image', 'flux2', 'flux2_4b', 'flux2_9b',
]

/** Draw Things measures the canvas in 64-pixel units. A size that is not a multiple of 64 is a
 *  size the engine cannot render, so it is a rejection upstream, never a silent round here. */
export function toUnits(px: number, what: string): number {
  if (!Number.isInteger(px) || px < 64 || px % 64 !== 0) {
    throw new Error(`${what} must be a whole multiple of 64 pixels (got ${px})`)
  }
  return px / 64
}

/**
 * One `Control` table. Written BEFORE the configuration that points at it — the buffer is built
 * backwards, so a table can only reference something already behind it.
 *
 * ⚠️ THE CONDITIONS ARE THE BRIDGE'S, NOT INVENTED HERE. Three fields are gated on what the catalog
 * says the control file IS (see `ControlInfo`), and getting one of those gates wrong is invisible:
 * the render succeeds and the control quietly does something else.
 */
function buildControl(b: FlatBufferBuilder, control: ControlConfig): number {
  const info = control.info ?? {}
  const inputType = control.inputType ?? 'Unspecified'
  const inputIndex = CONTROL_INPUT_TYPES.indexOf(inputType)
  if (inputIndex < 0) throw new Error(`unknown control input type ${JSON.stringify(inputType)}`)
  const modeIndex = CONTROL_MODES.indexOf(control.mode ?? 'Balanced')
  if (modeIndex < 0) throw new Error(`unknown control mode ${JSON.stringify(control.mode)}`)

  // InstantStyle applies to an IP-Adapter (`shuffle`) on a family that HAS the blocks, and to
  // nothing else — asking for `Style` on a ControlNet is a request the wire cannot carry, so it is
  // dropped here rather than sent as a selector the server will read as something else.
  const family = info.modifier === 'shuffle' ? BLOCKS[info.version ?? ''] : undefined
  const blocks = family && control.targetBlocks ? family[control.targetBlocks] : undefined

  // ⚠️ AN INVARIANT, NOT A CHECK ON INPUT. A control with no file is the model's own channel and
  // contributes a hint tensor only — the adapter never puts one in the configuration, because a
  // control entry naming nothing would send the server looking for a file called "".
  if (control.file === undefined) {
    throw new Error('a control with no file belongs on the hint channel alone, not in the configuration')
  }
  const file = b.createString(control.file)
  const blockOffsets = blocks?.map((name) => b.createString(name))
  const blocksVector = blockOffsets ? b.createOffsetVector(blockOffsets) : 0

  b.startObject(CONTROL_FIELDS)
  b.addOffset(C.file, file)
  b.addFloat32(C.weight, control.weight ?? CD.weight, CD.weight)
  b.addFloat32(C.guidanceStart, control.start ?? CD.guidanceStart, CD.guidanceStart)
  b.addFloat32(C.guidanceEnd, control.end ?? CD.guidanceEnd, CD.guidanceEnd)
  // ⚠️ FALSE IS THE LOAD-BEARING VALUE HERE. The schema default is `true`, so a control the catalog
  // does not describe as globally pooled has to say so explicitly or inherit pooling nobody asked
  // for. Only a control that IS pooled leaves the field alone.
  if (!info.globalAveragePooling) {
    b.addBool(C.globalAveragePooling, false, CD.globalAveragePooling)
  }
  if (control.downSamplingRate !== undefined
    && (DOWN_SAMPLED.includes(info.modifier ?? '') || DOWN_SAMPLED.includes(inputType.toLowerCase()))) {
    b.addFloat32(C.downSamplingRate, control.downSamplingRate, CD.downSamplingRate)
  }
  b.addInt8(C.controlMode, modeIndex, CD.controlMode)
  // `All` is an EMPTY vector rather than an absent field: the selector was made, and it selects
  // everything. Absent would mean the workflow never spoke. (An empty vector still has a real
  // offset — it is the length word — so this is not the 0 that `addOffset` treats as nothing.)
  if (blocks) b.addOffset(C.targetBlocks, blocksVector)
  b.addInt8(C.inputOverride, inputIndex, CD.inputOverride)
  return b.endObject()
}

function buildLora(b: FlatBufferBuilder, lora: LoraConfig): number {
  const modeIndex = LORA_MODES.indexOf(lora.mode ?? 'All')
  if (modeIndex < 0) throw new Error(`unknown lora mode ${JSON.stringify(lora.mode)}`)
  const file = b.createString(lora.file)
  b.startObject(LORA_FIELDS)
  b.addOffset(L.file, file)
  b.addFloat32(L.weight, lora.weight ?? 1, LD.weight)
  b.addInt8(L.mode, modeIndex, LD.mode)
  return b.endObject()
}

export function buildConfiguration(cfg: RenderConfig): Uint8Array {
  const samplerIndex = SAMPLERS.indexOf(cfg.sampler)
  if (samplerIndex < 0) throw new Error(`unknown sampler ${JSON.stringify(cfg.sampler)}`)
  const seedModeIndex = SEED_MODES.indexOf(cfg.seedMode ?? 'ScaleAlike')
  if (seedModeIndex < 0) throw new Error(`unknown seed mode ${JSON.stringify(cfg.seedMode)}`)

  const b = new FlatBufferBuilder()
  // Strings must be written BEFORE the table that points at them — the buffer is built
  // backwards, so a table can only reference something already behind it. Same for the nested
  // Control and LoRA tables: each is finished, and only then does the configuration point at it.
  const controls = (cfg.controls ?? []).map((control) => buildControl(b, control))
  const controlVector = controls.length ? b.createOffsetVector(controls) : 0
  const loras = (cfg.loras ?? []).map((lora) => buildLora(b, lora))
  const loraVector = loras.length ? b.createOffsetVector(loras) : 0
  const model = b.createString(cfg.model)

  b.startObject(FIELD_COUNT)
  b.addOffset(F.model, model)
  b.addOffset(F.controls, controlVector)
  b.addOffset(F.loras, loraVector)
  b.addInt16(F.startWidth, toUnits(cfg.width, 'width'), 0)
  b.addInt16(F.startHeight, toUnits(cfg.height, 'height'), 0)
  // The server reads a uint32 seed; anything wider is the caller's bug, not something to wrap
  // silently, because a seed that changed is a render nobody can reproduce.
  b.addUint32(F.seed, cfg.seed, 0)
  b.addUint32(F.steps, cfg.steps, 0)
  b.addFloat32(F.guidanceScale, cfg.cfg, 0)
  b.addFloat32(F.strength, cfg.strength ?? 1, D.strength)
  b.addInt8(F.sampler, samplerIndex, D.sampler)
  if (cfg.imageGuidance !== undefined) {
    b.addFloat32(F.imageGuidanceScale, cfg.imageGuidance, D.imageGuidanceScale)
  }
  b.addInt8(F.seedMode, seedModeIndex, D.seedMode)
  if (cfg.clipSkip !== undefined) b.addUint32(F.clipSkip, cfg.clipSkip, D.clipSkip)
  if (cfg.shift !== undefined) b.addFloat32(F.shift, cfg.shift, D.shift)

  const version = cfg.version ?? ''
  if (RES_SHIFT_VERSIONS.includes(version)) {
    b.addBool(F.resolutionDependentShift, true, D.resolutionDependentShift)
    if (cfg.guidanceEmbed !== undefined) {
      // Asking for a specific distilled-guidance value only means something when the model is
      // NOT also speeding up with its own; the two are the same knob read twice.
      b.addBool(F.speedUpWithGuidanceEmbed, false, D.speedUpWithGuidanceEmbed)
      b.addFloat32(F.guidanceEmbed, cfg.guidanceEmbed, D.guidanceEmbed)
    }
  } else {
    // Everything else must say `false` out loud, because the schema default is `true`.
    b.addBool(F.resolutionDependentShift, false, D.resolutionDependentShift)
  }

  if (SDXL_VERSIONS.includes(version)) {
    // SDXL's micro-conditioning: it was trained told what size its crop came from, and leaving
    // these at 0 is what produces the washed-out "it looks like a thumbnail" SDXL render.
    b.addUint32(F.originalImageWidth, cfg.width, 0)
    b.addUint32(F.originalImageHeight, cfg.height, 0)
    b.addUint32(F.targetImageWidth, cfg.width, 0)
    b.addUint32(F.targetImageHeight, cfg.height, 0)
    b.addUint32(F.negativeOriginalImageWidth, Math.floor(cfg.width / 2), 0)
    b.addUint32(F.negativeOriginalImageHeight, Math.floor(cfg.height / 2), 0)
  }

  return b.finish(b.endObject())
}
