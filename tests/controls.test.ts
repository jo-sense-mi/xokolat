// CONTROLS AND HINTS — the check the plan said to write FIRST, and for the reason it gave: this
// stretch cannot be finished by argument. A control that is subtly wrong does not fail; it renders,
// and the picture is merely not the one you asked for. So the configuration this app builds is
// compared, field by field, against the one the reference implementation builds for the same workflow
// (tests/fixtures/dt-configuration.json — see its own comment for where those bytes came from).
//
// It is the same standard the tensor encoder was held to, and that one caught two things a
// self-consistent test never would: the 16F datatype word and the RGB channel count.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { buildConfiguration, hintChannel } from '../src/inference/draw-things/config.ts'
import type { ControlConfig, LoraConfig, RenderConfig, Sampler } from '../src/inference/draw-things/config.ts'
import { encodeHint } from '../src/inference/draw-things/tensor.ts'
import type { ControlInputType, ControlMode, RefSlot, TargetBlocks } from '../src/types/workflow.ts'
import type { FieldTypes, Fields } from './flatbuffer-read.ts'
import { readNested, readTable, rootOf } from './flatbuffer-read.ts'

const HERE = dirname(fileURLToPath(import.meta.url))

interface CatalogEntry {
  readonly file: string
  readonly modifier?: string
  readonly version?: string
  readonly global_average_pooling?: boolean
}

interface CaseControl {
  readonly file: string
  readonly from: RefSlot
  readonly inputType: ControlInputType
  readonly weight?: number
  readonly mode?: ControlMode
  readonly start?: number
  readonly end?: number
  readonly targetBlocks?: TargetBlocks
  readonly downSamplingRate?: number
}

interface Case {
  readonly name: string
  readonly config: {
    readonly model: string
    readonly version: string
    readonly width: number
    readonly height: number
    readonly seed: number
    readonly steps: number
    readonly cfg: number
    readonly sampler: string
    readonly seedMode?: string
    readonly strength?: number
    readonly imageGuidance?: number
    readonly clipSkip?: number
    readonly shift?: number
    readonly guidanceEmbed?: number
    readonly controls?: readonly CaseControl[]
    readonly loras?: readonly LoraConfig[]
  }
  readonly python: string
}

const fixture = JSON.parse(readFileSync(join(HERE, 'fixtures/dt-configuration.json'), 'utf-8')) as {
  readonly catalog: { readonly controlNets: readonly CatalogEntry[]; readonly loras: readonly CatalogEntry[] }
  readonly cases: readonly Case[]
}

const controlEntry = (file: string): CatalogEntry | undefined =>
  fixture.catalog.controlNets.find((e) => e.file === file)

/** The fields either side could set on `GenerationConfiguration`, and how to read each. Anything
 *  outside this table is reported by index rather than skipped. */
const ROOT: FieldTypes = {
  1: 'u16', 2: 'u16', 3: 'u32', 4: 'u32', 5: 'f32', 6: 'f32', 7: 'str', 8: 'i8',
  16: 'f32', 17: 'i8', 18: 'u32', 19: 'tables', 20: 'tables',
  29: 'u32', 30: 'u32', 33: 'u32', 34: 'u32', 39: 'u32', 40: 'u32', 49: 'f32',
  69: 'bool', 70: 'f32', 71: 'bool',
}

const CONTROL: FieldTypes = {
  0: 'str', 1: 'f32', 2: 'f32', 3: 'f32', 4: 'bool', 5: 'bool', 6: 'f32', 7: 'i8', 8: 'strs',
  9: 'i8',
}

const LORA: FieldTypes = { 0: 'str', 1: 'f32', 2: 'i8' }

/**
 * One buffer, flattened to something two implementations can be compared on: every field either
 * wrote, with the nested Control and LoRA tables read through.
 *
 * ⚠️ AN ABSENT VECTOR AND AN EMPTY ONE ARE THE SAME ANSWER HERE, and it is the ONE normalisation
 * this comparison makes. The reference writes `controls: []` and `loras: []` on every render,
 * including a plain text-to-image; xokolat omits the field when there is nothing in it. A reader
 * cannot tell the two apart — both mean "no controls" — so they are read as `[]` on both sides and
 * the four bytes are not defended.
 */
function fields(bytes: Uint8Array): Record<string, unknown> {
  const root = readTable(bytes, rootOf(bytes), ROOT)
  const nested = (index: number, types: FieldTypes): Fields[] =>
    readNested(bytes, root[index], types)
  const controls = nested(19, CONTROL)
  const loras = nested(20, LORA)
  const scalars: Record<string, unknown> = {}
  for (const [index, value] of Object.entries(root)) {
    if (index !== '19' && index !== '20') scalars[index] = value
  }
  return { ...scalars, controls, loras }
}

/** The case's controls, as the adapter assembles them: the workflow's entry plus what the catalog
 *  says about the file. The same join the render path does, and the reason it is done here too is
 *  that getting it wrong is exactly the failure this test is for. */
const controlsOf = (c: Case): ControlConfig[] => (c.config.controls ?? []).map((control) => ({
  ...control,
  info: {
    modifier: controlEntry(control.file)?.modifier,
    version: controlEntry(control.file)?.version,
    globalAveragePooling: controlEntry(control.file)?.global_average_pooling,
  },
}))

function ours(c: Case): Uint8Array {
  const { config } = c
  const render: RenderConfig = {
    model: config.model,
    version: config.version,
    width: config.width,
    height: config.height,
    seed: config.seed,
    steps: config.steps,
    cfg: config.cfg,
    sampler: config.sampler as Sampler,
    ...(config.strength === undefined ? {} : { strength: config.strength }),
    ...(config.imageGuidance === undefined ? {} : { imageGuidance: config.imageGuidance }),
    ...(config.clipSkip === undefined ? {} : { clipSkip: config.clipSkip }),
    ...(config.shift === undefined ? {} : { shift: config.shift }),
    ...(config.guidanceEmbed === undefined ? {} : { guidanceEmbed: config.guidanceEmbed }),
    controls: controlsOf(c),
    loras: config.loras ?? [],
  }
  return buildConfiguration(render)
}

for (const c of fixture.cases) {
  test(`configuration matches the reference — ${c.name}`, () => {
    assert.deepEqual(fields(ours(c)), fields(Buffer.from(c.python, 'hex')))
  })
}

test('every case in the fixture is actually exercised', () => {
  // A fixture that silently lost its cases would make this whole file pass by doing nothing.
  assert.ok(fixture.cases.length >= 11, `${fixture.cases.length} cases`)
  assert.ok(fixture.cases.some((c) => (c.config.controls?.length ?? 0) > 1), 'a two-control case')
  assert.ok(fixture.cases.some((c) => c.config.loras?.length), 'a LoRA case')
})

test('InstantStyle is the difference between keeping a subject and taking a look', () => {
  // The same adapter file, the same weight, two selectors — and if the block names were ever
  // dropped, `Style` would silently become `All` and every style reference would copy the subject.
  const base = fixture.cases.find((c) => c.name.startsWith('sdxl-ref'))
  assert.ok(base)
  const blocksOf = (which: TargetBlocks): unknown => {
    const controls = controlsOf(base).map((control) => ({ ...control, targetBlocks: which }))
    const bytes = buildConfiguration({ ...JSON.parse(JSON.stringify({
      model: base.config.model, version: base.config.version, width: base.config.width,
      height: base.config.height, seed: base.config.seed, steps: base.config.steps,
      cfg: base.config.cfg,
    })) as RenderConfig, sampler: base.config.sampler as Sampler, controls })
    return (fields(bytes)['controls'] as Fields[])[0]?.[8]
  }
  assert.deepEqual(blocksOf('All'), [])
  assert.deepEqual(blocksOf('Style'), ['up_blocks.0.attentions.1'])
  assert.deepEqual(blocksOf('Style and Layout'),
    ['down_blocks.2.attentions.1', 'up_blocks.0.attentions.1'])
})

test('a control on a family with no such blocks gets no selector at all', () => {
  // Asking for `Style` on a ControlNet is a request the wire cannot carry. Sending the selector
  // anyway would be a number the server reads as something else.
  const canny = fixture.cases.find((c) => c.name.startsWith('sdxl-canny'))
  assert.ok(canny)
  const controls: ControlConfig[] = controlsOf(canny).map((c) => ({ ...c, targetBlocks: 'Style' }))
  const bytes = buildConfiguration({
    model: canny.config.model, version: canny.config.version, width: canny.config.width,
    height: canny.config.height, seed: canny.config.seed, steps: canny.config.steps,
    cfg: canny.config.cfg, sampler: canny.config.sampler as Sampler, controls,
  })
  assert.equal((fields(bytes)['controls'] as Fields[])[0]?.[8], undefined)
})

test('global average pooling is written FALSE rather than left to the schema', () => {
  // The schema default is `true`. Every control the server actually reports says false, so leaving
  // the field out would give every one of them pooling nobody asked for — a silent difference.
  const ref = fixture.cases.find((c) => c.name.startsWith('sdxl-ref'))
  assert.ok(ref)
  assert.equal((fields(ours(ref))['controls'] as Fields[])[0]?.[5], false)
})

test('the hint channel is not the input type', () => {
  assert.equal(hintChannel('Shuffle'), 'shuffle')
  assert.equal(hintChannel('Depth'), 'depth')
  // An edge map is just a picture — there is no `canny` channel, which is the trap.
  assert.equal(hintChannel('Canny'), 'custom')
  assert.equal(hintChannel('Lineart'), 'custom')
})

test('a depth hint is one channel, and a shuffle hint is three', () => {
  const image = { data: Buffer.alloc(4 * 4 * 3, 128), width: 4, height: 4, channels: 3 as const }
  const header = (b: Buffer): number[] =>
    [6, 7, 8].map((word) => b.readUInt32LE(word * 4))
  assert.deepEqual(header(encodeHint(image, 'depth')), [4, 4, 1])
  assert.deepEqual(header(encodeHint(image, 'scribble')), [4, 4, 1])
  assert.deepEqual(header(encodeHint(image, 'shuffle')), [4, 4, 3])
  assert.deepEqual(header(encodeHint(image, 'custom')), [4, 4, 3])
  // …and the datatype word stays 16F, which is the one that fails invisibly.
  assert.equal(encodeHint(image, 'depth').readUInt32LE(3 * 4), 0x20000)
})

test('a pose hint is normalised into the top half of the range', () => {
  const data = Buffer.from([0, 0, 0, 255, 255, 255, 128, 128, 128, 64, 64, 64])
  const out = encodeHint({ data, width: 2, height: 2, channels: 3 }, 'pose')
  const at = (i: number): number =>
    new DataView(out.buffer, out.byteOffset + 68).getFloat16(i * 2, true)
  // [-1, 1] is the wire's range; [0.5, 1] of it is [0, 1] here.
  assert.equal(at(0), 0)
  assert.equal(at(3), 1)
  assert.ok(at(6) > 0 && at(6) < 1)
})
