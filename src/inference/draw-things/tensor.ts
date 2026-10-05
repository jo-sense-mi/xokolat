// The ccv tensor codec — how Draw Things hands pixels back.
//
// A generated image arrives as a libnnc/ccv tensor: a 68-byte header of uint32s, then the
// pixels as Float16 in NHWC order, normalised to [-1, 1]. Not PNG, not JPEG — raw planes.
//
// Header (the reader consumes 17 uint32 = 68 bytes; a writer sets the first 9):
//   [0] type magic — 0 here; 1012247 marks an fpzip-compressed payload
//   [1] CCV_TENSOR_CPU_MEMORY   [2] CCV_TENSOR_FORMAT_NHWC   [3] datatype (CCV_16F)
//   [4] reserved   [5] N   [6] H   [7] W   [8] C
//
// This is the cost the plan accepted when it chose TypeScript (§3.13): numpy made the decode a
// line, and here it is a DataView. It is also the whole of it — `sharp` takes raw RGB from
// here on.

export const HEADER_BYTES = 68
export const FPZIP_MAGIC = 1012247

/**
 * The header words a WRITER has to set. From ccv itself (`lib/ccv.h`, `lib/nnc/ccv_nnc_tfb.h`) and
 * cross-checked against the ComfyUI bridge's encoder — NOT inferred from the tensors the server
 * sends, because the decoder below never reads these three back and a wrong constant would be
 * invisible until a render came back wrong.
 *
 * ⚠️ THE DATATYPE IS THE TRAP. The codes share a nibble — 32F is 0x04000, 16F is 0x20000, and
 * 0x40000 is CCV_QX — and the server's `Tensor(data:)` sizes each element from this field. Declare
 * 32F while packing Float16 and it misparses into an empty tensor: the reference is silently
 * ignored and the render simply comes back as though nothing had been attached.
 *
 * The 17 words are one wrapper word, then `ccv_nnc_tensor_param_t`: type · format · datatype ·
 * reserved, then `dim[12]` = N H W C and nine zeroes.
 */
const CCV_TENSOR_CPU_MEMORY = 0x1
const CCV_TENSOR_FORMAT_NHWC = 0x02
const CCV_16F = 0x20000

export interface DecodedImage {
  readonly data: Buffer
  readonly width: number
  readonly height: number
  readonly channels: 1 | 3 | 4
}

export class NoiseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NoiseError'
  }
}

/**
 * ccv tensor → raw 8-bit pixels, ready for `sharp`.
 *
 * ⚠️ The NaN check is not defensive programming — it is §13.1's silent failure caught in the
 * one place it can be. An engine outside the logged-in GUI session renders static and exits 0;
 * the pixels are the only place that shows.
 */
export function decodeTensor(tensor: Buffer): DecodedImage {
  if (tensor.length < HEADER_BYTES) {
    throw new Error(`response is ${tensor.length} bytes, too short to be a ccv tensor`)
  }
  const head = new DataView(tensor.buffer, tensor.byteOffset, HEADER_BYTES)
  if (head.getUint32(0, true) === FPZIP_MAGIC) {
    throw new Error(
      'the response is fpzip-compressed: start the server with --no-response-compression',
    )
  }
  const height = head.getUint32(6 * 4, true)
  const width = head.getUint32(7 * 4, true)
  const channels = head.getUint32(8 * 4, true)
  if (channels !== 1 && channels !== 3 && channels !== 4) {
    throw new Error(`unexpected channel count ${channels} in the response tensor`)
  }
  const count = width * height * channels
  const needed = HEADER_BYTES + count * 2
  if (tensor.length < needed) {
    throw new Error(`response says ${width}×${height}×${channels} but carries ${tensor.length - HEADER_BYTES} bytes of pixels`)
  }

  const pixels = new DataView(tensor.buffer, tensor.byteOffset + HEADER_BYTES, count * 2)
  if (Number.isNaN(pixels.getFloat16(0, true))) {
    throw new NoiseError('the first pixel is NaN — the render failed and returned garbage')
  }

  const out = Buffer.allocUnsafe(count)
  for (let i = 0; i < count; i++) {
    // [-1, 1] → [0, 255], clamped: a model can overshoot slightly and wrapping would speckle.
    const v = (pixels.getFloat16(i * 2, true) + 1) * 127.5
    out[i] = v < 0 ? 0 : v > 255 ? 255 : v
  }
  return { data: out, width, height, channels }
}

/**
 * raw 8-bit pixels → ccv tensor, the other direction: an INIT IMAGE for img2img.
 *
 * ⚠️ THE PIXELS ARE SENT, NOT A FILE. There is no JPEG or PNG anywhere on this wire — the field
 * the server reads (`ImageGenerationRequest.image`) is the same tensor shape it hands back, so an
 * uploaded photo is decoded by `sharp` first and arrives here as planes.
 *
 * Round-tripped in tests against `decodeTensor`, which is the only honest check available without
 * firing a render: the two are inverse and the header is what the server parses.
 */
export function encodeTensor({ data, width, height, channels }: DecodedImage): Buffer {
  const count = width * height * channels
  if (data.length < count) {
    throw new Error(`${width}×${height}×${channels} needs ${count} bytes, got ${data.length}`)
  }
  const out = Buffer.alloc(HEADER_BYTES + count * 2)
  const head = new DataView(out.buffer, out.byteOffset, HEADER_BYTES)
  head.setUint32(1 * 4, CCV_TENSOR_CPU_MEMORY, true)
  head.setUint32(2 * 4, CCV_TENSOR_FORMAT_NHWC, true)
  head.setUint32(3 * 4, CCV_16F, true)
  head.setUint32(5 * 4, 1, true)          // N — one image
  head.setUint32(6 * 4, height, true)
  head.setUint32(7 * 4, width, true)
  head.setUint32(8 * 4, channels, true)
  const pixels = new DataView(out.buffer, out.byteOffset + HEADER_BYTES, count * 2)
  for (let i = 0; i < count; i++) {
    // [0, 255] → [-1, 1], the range the model's VAE encoder expects.
    pixels.setFloat16(i * 2, (data[i] ?? 0) / 127.5 - 1, true)
  }
  return out
}

/**
 * The same encode, for a CONTROL HINT rather than an init image — and the difference is real
 * (`imagecodec.py` in the gRPC bridge, which this mirrors):
 *
 *   depth · scribble   collapse to ONE luminance channel. A depth map is a single number per pixel;
 *                      three copies of it is a tensor of the wrong shape.
 *   pose               min–max normalised into [0.5, 1] — the skeleton is drawn on black, and the
 *                      model was trained on the normalised range, not on the drawing.
 *   everything else    RGB, exactly like an init image. IP-Adapter (`shuffle`) is this case, which
 *                      is why the fifteen workflows that matter most take the plain path.
 *
 * ⚠️ THE FLOATS ARE COMPUTED ONCE. Going through 8-bit on the way (grey, then re-encode) would
 * round twice for no reason, and the second rounding is not one anybody could see or debug.
 */
export function encodeHint(image: DecodedImage, hintType: string): Buffer {
  const { data, width, height, channels } = image
  const grey = hintType === 'depth' || hintType === 'scribble'
  const pixels = width * height
  const outChannels = grey ? 1 : channels
  const count = pixels * outChannels
  const out = Buffer.alloc(HEADER_BYTES + count * 2)
  const head = new DataView(out.buffer, out.byteOffset, HEADER_BYTES)
  head.setUint32(1 * 4, CCV_TENSOR_CPU_MEMORY, true)
  head.setUint32(2 * 4, CCV_TENSOR_FORMAT_NHWC, true)
  head.setUint32(3 * 4, CCV_16F, true)
  head.setUint32(5 * 4, 1, true)
  head.setUint32(6 * 4, height, true)
  head.setUint32(7 * 4, width, true)
  head.setUint32(8 * 4, outChannels, true)
  const view = new DataView(out.buffer, out.byteOffset + HEADER_BYTES, count * 2)

  if (grey) {
    for (let i = 0; i < pixels; i++) {
      const at = i * channels
      const luma = channels === 1
        ? (data[at] ?? 0)
        : 0.299 * (data[at] ?? 0) + 0.587 * (data[at + 1] ?? 0) + 0.114 * (data[at + 2] ?? 0)
      view.setFloat16(i * 2, luma / 127.5 - 1, true)
    }
    return out
  }

  if (hintType === 'pose') {
    let lo = 255
    let hi = 0
    for (let i = 0; i < count; i++) {
      const v = data[i] ?? 0
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
    const span = hi - lo
    for (let i = 0; i < count; i++) {
      // → [0.5, 1] of the range, then through the same [0,255] → [-1,1] mapping as everything else.
      const scaled = span > 0 ? ((data[i] ?? 0) - lo) / span : 0
      view.setFloat16(i * 2, (scaled / 2 + 0.5) * 2 - 1, true)
    }
    return out
  }

  for (let i = 0; i < count; i++) view.setFloat16(i * 2, (data[i] ?? 0) / 127.5 - 1, true)
  return out
}

/**
 * Is this image just noise? A uniform-random image has a signature: neighbouring pixels are
 * uncorrelated, so the mean absolute difference between them lands near ⅓ of the range, while
 * any real render — even a bad one — is far smoother.
 *
 * This is the canary's test (PLAN §13), kept beside the decode because it reads the same
 * buffer. It answers the failure mode a health check cannot see: TCP up, exit 0, pixels static.
 */
export function looksLikeNoise({ data, width, height, channels }: DecodedImage): boolean {
  if (width < 8 || height < 8) return false
  let total = 0
  let samples = 0
  // One row in four is plenty, and keeps this a few milliseconds on a 1536² image.
  for (let y = 0; y < height; y += 4) {
    const row = y * width * channels
    for (let x = 1; x < width; x++) {
      total += Math.abs((data[row + x * channels] ?? 0) - (data[row + (x - 1) * channels] ?? 0))
      samples++
    }
  }
  if (!samples) return false
  // Uniform random over 0..255 gives ≈85; photographic and illustrated content sits well under
  // 20. The threshold is deliberately far from both, so it never fires on a busy image.
  return total / samples > 50
}
