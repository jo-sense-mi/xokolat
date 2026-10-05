// The hand-written FlatBuffer encoder (src/inference/draw-things/flatbuffer.ts).
//
// The buffer produced by this exact code was checked once against the reference FlatBuffers
// reader — the generated Python `GenerationConfiguration` parsed it field for field (model,
// 16×12 units, seed, steps, cfg, sampler 10, seedMode 2, strength 1, resolution-dependent
// shift on, guidance embed 2.5, everything untouched at its schema default). That cross-check
// cannot run here (it is a Python dependency, and `npm run check` never leaves the repo), so
// this test carries a small INDEPENDENT reader instead: it walks the vtable the way the server
// does, rather than trusting the writer's own bookkeeping.

import assert from 'node:assert/strict'
import test from 'node:test'

import { buildConfiguration, SAMPLERS, SEED_MODES } from '../src/inference/draw-things/config.ts'
import { FlatBufferBuilder } from '../src/inference/draw-things/flatbuffer.ts'

/** A reader, written from the format rather than from the writer above it. */
class Reader {
  readonly #view: DataView
  readonly #table: number

  constructor(bytes: Uint8Array) {
    this.#view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    this.#table = this.#view.getUint32(0, true) // root offset, from the start of the buffer
  }

  /** Where field `index` lives, or 0 when it was left at its default. */
  #field(index: number): number {
    const vtable = this.#table - this.#view.getInt32(this.#table, true)
    const voffset = 4 + index * 2
    if (voffset >= this.#view.getUint16(vtable, true)) return 0
    const rel = this.#view.getUint16(vtable + voffset, true)
    return rel === 0 ? 0 : this.#table + rel
  }

  int8(index: number, dflt: number): number {
    const at = this.#field(index)
    return at === 0 ? dflt : this.#view.getInt8(at)
  }

  bool(index: number, dflt: boolean): boolean {
    const at = this.#field(index)
    return at === 0 ? dflt : this.#view.getInt8(at) !== 0
  }

  uint16(index: number, dflt: number): number {
    const at = this.#field(index)
    return at === 0 ? dflt : this.#view.getUint16(at, true)
  }

  uint32(index: number, dflt: number): number {
    const at = this.#field(index)
    return at === 0 ? dflt : this.#view.getUint32(at, true)
  }

  float32(index: number, dflt: number): number {
    const at = this.#field(index)
    return at === 0 ? dflt : this.#view.getFloat32(at, true)
  }

  string(index: number): string | null {
    const at = this.#field(index)
    if (at === 0) return null
    const start = at + this.#view.getUint32(at, true)
    const length = this.#view.getUint32(start, true)
    return new TextDecoder().decode(new Uint8Array(
      this.#view.buffer, this.#view.byteOffset + start + 4, length,
    ))
  }
}

const F = {
  startWidth: 1, startHeight: 2, seed: 3, steps: 4, guidanceScale: 5, strength: 6, model: 7,
  sampler: 8, imageGuidanceScale: 16, seedMode: 17, clipSkip: 18, shift: 49, speedUp: 69,
  guidanceEmbed: 70,
  resDptShift: 71, originalWidth: 30, targetWidth: 34,
} as const

test('a configuration reads back exactly as it was written', () => {
  const r = new Reader(buildConfiguration({
    model: 'flux_1_schnell_q8p.ckpt', version: 'flux1',
    width: 1024, height: 768, seed: 7, steps: 4, cfg: 1,
    sampler: 'Euler A Trailing', seedMode: 'ScaleAlike', guidanceEmbed: 2.5,
  }))
  assert.equal(r.string(F.model), 'flux_1_schnell_q8p.ckpt')
  // Draw Things measures the canvas in 64-pixel units.
  assert.equal(r.uint16(F.startWidth, 0), 16)
  assert.equal(r.uint16(F.startHeight, 0), 12)
  assert.equal(r.uint32(F.seed, 0), 7)
  assert.equal(r.uint32(F.steps, 0), 0 + 4)
  assert.equal(r.float32(F.guidanceScale, 0), 1)
  assert.equal(r.float32(F.strength, 0), 1)
  assert.equal(r.int8(F.sampler, 0), SAMPLERS.indexOf('Euler A Trailing'))
  assert.equal(r.int8(F.seedMode, 0), SEED_MODES.indexOf('ScaleAlike'))
  assert.equal(r.bool(F.resDptShift, true), true)
  // Asking for a guidance embed turns OFF the model's own speed-up: they are one knob read
  // twice, and the schema default is `true`.
  assert.equal(r.bool(F.speedUp, true), false)
  assert.equal(r.float32(F.guidanceEmbed, 3.5), 2.5)
})

test('a field left alone is absent, and the reader falls back to the schema default', () => {
  const r = new Reader(buildConfiguration({
    model: 'x.ckpt', version: 'flux1', width: 512, height: 512, seed: 1, steps: 4, cfg: 1,
    sampler: 'Euler A Trailing',
  }))
  // Never set, so never written — and the SERVER's default is what applies.
  assert.equal(r.uint32(F.clipSkip, 1), 1)
  assert.equal(r.float32(F.shift, 1), 1)
  assert.equal(r.float32(F.guidanceEmbed, 3.5), 3.5)
  assert.equal(r.bool(F.speedUp, true), true)
})

test('a non-flux model says `false` out loud, because the schema default is `true`', () => {
  const r = new Reader(buildConfiguration({
    model: 'sd_xl_base_1.0.ckpt', version: 'sdxl_base_v0.9', width: 1024, height: 1024,
    seed: 3, steps: 30, cfg: 6, sampler: 'DPM++ 2M Karras',
  }))
  assert.equal(r.bool(F.resDptShift, true), false)
  // SDXL's micro-conditioning: leaving these at 0 is what produces the washed-out render.
  assert.equal(r.uint32(F.originalWidth, 0), 1024)
  assert.equal(r.uint32(F.targetWidth, 0), 1024)
})

test('an edit model carries the two fields that are only about the attached picture', () => {
  const r = new Reader(buildConfiguration({
    model: 'flux_1_kontext_dev_q8p.ckpt', version: 'flux1', width: 1024, height: 1024,
    seed: 7, steps: 28, cfg: 1, sampler: 'Euler A Trailing', strength: 1, imageGuidance: 2.5,
  }))
  // ⚠️ `strength: 1` IS THE POINT for an in-context editor: it reads the picture as context
  // rather than as noise to denoise part-way, so a lower number renders mush. The schema's own
  // default for this field is 0 — "change nothing" — which is why it is always written.
  assert.equal(r.float32(F.strength, 0), 1)
  assert.equal(r.float32(F.imageGuidanceScale, 1.5), 2.5)
  // …and nobody else pays for it: a render from words alone leaves the adherence knob to the
  // server, because it is inert outside the Kontext family.
  const plain = new Reader(buildConfiguration({
    model: 'x.ckpt', version: 'flux1', width: 512, height: 512, seed: 1, steps: 4, cfg: 1,
    sampler: 'Euler A Trailing',
  }))
  assert.equal(plain.float32(F.imageGuidanceScale, 1.5), 1.5, 'unset, so the server decides')
})

test('a size the engine cannot render is refused, not rounded', () => {
  const cfg = {
    model: 'x.ckpt', version: 'flux1', height: 1024, seed: 1, steps: 4, cfg: 1,
    sampler: 'Euler A Trailing' as const,
  }
  assert.throws(() => buildConfiguration({ ...cfg, width: 1000 }), /multiple of 64/)
  assert.throws(() => buildConfiguration({ ...cfg, width: 32 }), /multiple of 64/)
})

test('an unknown sampler is a named error, never a silent index 0', () => {
  assert.throws(() => buildConfiguration({
    model: 'x.ckpt', version: 'flux1', width: 512, height: 512, seed: 1, steps: 4, cfg: 1,
    sampler: 'Definitely Not A Sampler' as never,
  }), /unknown sampler/)
})

test('strings and vectors survive the builder', () => {
  const b = new FlatBufferBuilder(8) // tiny, so the buffer has to grow mid-write
  const long = 'x'.repeat(500)
  const s = b.createString(long)
  b.startObject(2)
  b.addOffset(0, s)
  b.addInt32(1, 42, 0)
  const bytes = b.finish(b.endObject())
  const r = new Reader(bytes)
  assert.equal(r.string(0), long)
  assert.equal(r.uint32(1, 0), 42)
})
