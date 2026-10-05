// The ccv codec, both directions.
//
// ⚠️ THIS IS THE ONLY HONEST CHECK AVAILABLE FOR THE ENCODE. What proves an init image is
// acceptable to Draw Things is a render, and a test cannot fire one. What a test CAN pin is that
// the writer and the reader are inverse, and that the header carries the values ccv itself
// defines — which is where a wire format goes wrong silently, because the decoder never reads
// those three words back.

import assert from 'node:assert/strict'
import test from 'node:test'

import { fit } from '../src/inference/draw-things/adapter.ts'
import { HEADER_BYTES, decodeTensor, encodeTensor } from '../src/inference/draw-things/tensor.ts'

const ramp = (width: number, height: number, channels: 1 | 3 | 4) => {
  const data = Buffer.allocUnsafe(width * height * channels)
  for (let i = 0; i < data.length; i++) data[i] = (i * 7) % 256
  return { data, width, height, channels }
}

/**
 * ⚠️ ±1, AND THE SLACK IS THE DECODER'S. `decodeTensor` TRUNCATES `(v + 1) × 127.5` into a byte
 * rather than rounding, so a value that encodes to 0.00390625 comes back as 127 rather than 128.
 * That is a pre-existing property of reading a REAL render — where a half-step means nothing — and
 * it is left alone here rather than quietly changing what every existing picture decodes to.
 */
const near = (got: Buffer, want: Buffer, what: string): void => {
  for (let i = 0; i < want.length; i++) {
    assert.ok(Math.abs((got[i] ?? -99) - (want[i] ?? 0)) <= 1,
      `${what}: byte ${i} came back ${got[i]} instead of ${want[i]}`)
  }
}

test('an image survives the round trip it will make on the wire', () => {
  for (const channels of [1, 3, 4] as const) {
    const before = ramp(9, 5, channels)
    const after = decodeTensor(encodeTensor(before))
    assert.equal(after.width, before.width)
    assert.equal(after.height, before.height)
    assert.equal(after.channels, channels)
    assert.equal(after.data.length, before.data.length)
    near(after.data, before.data, `${channels}ch`)
  }
})

test('the header says what ccv says it says', () => {
  const tensor = encodeTensor(ramp(3, 2, 3))
  const head = new DataView(tensor.buffer, tensor.byteOffset, HEADER_BYTES)
  const word = (i: number): number => head.getUint32(i * 4, true)
  assert.equal(word(0), 0, 'not the fpzip magic — we send uncompressed')
  assert.equal(word(1), 0x1, 'CCV_TENSOR_CPU_MEMORY')
  assert.equal(word(2), 0x02, 'CCV_TENSOR_FORMAT_NHWC')
  assert.equal(word(3), 0x20000, 'CCV_16F — 0x40000 is CCV_QX, and the decoder would never say so')
  assert.equal(word(5), 1, 'N: one image')
  assert.deepEqual([word(6), word(7), word(8)], [2, 3, 3], 'H, W, C — in that order')
  assert.equal(tensor.length, HEADER_BYTES + 3 * 2 * 3 * 2)
})

test('the extremes land on the extremes, because the range is the thing that shifts', () => {
  const { data } = decodeTensor(encodeTensor({
    data: Buffer.from([0, 128, 255]), width: 3, height: 1, channels: 1,
  }))
  // [0, 255] → [-1, 1] → back. Black and white are the ends of the range and must be EXACT: a
  // scale that is off by a factor comes back washed out rather than failing, which is exactly the
  // kind of bug a render does not report.
  assert.equal(data[0], 0)
  assert.equal(data[2], 255)
  near(data, Buffer.from([0, 128, 255]), 'midpoint')
})

test('a buffer too small for what it claims is refused, not read past', () => {
  assert.throws(() => encodeTensor({ data: Buffer.alloc(4), width: 8, height: 8, channels: 3 }))
})

// ── the picture, as the wire needs it ─────────────────────────────────────────────────────

test('a reference is cover-cropped to the render and always RGB', async () => {
  // ⚠️ RGBA IS THE TRAP. The header declares the channel count and the server sizes the tensor
  // from it, so a PNG with alpha would arrive as C=4 where the model expects three — not an error
  // anywhere, just a reference that quietly does nothing.
  const rgba = { data: Buffer.alloc(40 * 30 * 4, 200), width: 40, height: 30, channels: 4 as const }
  const out = await fit(rgba, 64, 64)
  assert.equal(out.channels, 3)
  assert.equal(out.width, 64)
  assert.equal(out.height, 64)
  assert.equal(out.data.length, 64 * 64 * 3)

  // Greyscale is the same story pointed the other way: one channel is not three.
  const grey = { data: Buffer.alloc(20 * 20, 90), width: 20, height: 20, channels: 1 as const }
  assert.equal((await fit(grey, 64, 64)).channels, 3)

  // Already right — handed straight back, because a re-encode is loss for nothing.
  const exact = { data: Buffer.alloc(64 * 64 * 3, 12), width: 64, height: 64, channels: 3 as const }
  assert.equal(await fit(exact, 64, 64), exact)
})
