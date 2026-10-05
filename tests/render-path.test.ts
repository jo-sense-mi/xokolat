// The rest of the render path: the tensor decode, the knob rules, run naming, and the lane.
// Everything here is deterministic and offline — the real engine is exercised by rendering,
// not by `npm run check` (PLAN §14).

import assert from 'node:assert/strict'
import test from 'node:test'

import { MINIMAL_CAPS } from '../src/inference/caps.ts'
import { ParamError, resolveImageKnobs } from '../src/inference/params.ts'
import { HEADER_BYTES, NoiseError, decodeTensor, looksLikeNoise } from '../src/inference/draw-things/tensor.ts'
import { Queue } from '../src/jobs/lane.ts'
import { cellName, masterRel, mintRunId, slugify, stamp } from '../src/content/run.ts'
import { composePrompt, missingRef, refusedRef, styleParams, tagsFromText } from '../src/jobs/generate.ts'
import { styleParamFor } from '../src/styles/param.ts'
import type { Caps } from '../src/types/caps.ts'

// ── the tensor ────────────────────────────────────────────────────────────────────────────

/** A ccv tensor: 68-byte header of uint32s, then Float16 NHWC in [-1, 1]. */
function tensor(width: number, height: number, channels: number, pixel: (i: number) => number): Buffer {
  const buf = Buffer.alloc(HEADER_BYTES + width * height * channels * 2)
  const view = new DataView(buf.buffer, buf.byteOffset)
  view.setUint32(5 * 4, 1, true) // N
  view.setUint32(6 * 4, height, true)
  view.setUint32(7 * 4, width, true)
  view.setUint32(8 * 4, channels, true)
  for (let i = 0; i < width * height * channels; i++) {
    view.setFloat16(HEADER_BYTES + i * 2, pixel(i), true)
  }
  return buf
}

test('a tensor decodes to 8-bit pixels, clamped at both ends', () => {
  const decoded = decodeTensor(tensor(2, 1, 3, (i) => [-1, 0, 1, -2, 0.5, 2][i] ?? 0))
  assert.equal(decoded.width, 2)
  assert.equal(decoded.height, 1)
  assert.equal(decoded.channels, 3)
  // [-1, 1] → [0, 255]; an overshoot clamps rather than wrapping, or a bright pixel speckles.
  assert.deepEqual([...decoded.data], [0, 127, 255, 0, 191, 255])
})

test('a NaN first pixel is the failure §13.1 exists for, and it is named', () => {
  assert.throws(() => decodeTensor(tensor(2, 2, 3, () => Number.NaN)), NoiseError)
})

test('a compressed response says which flag is missing', () => {
  const buf = tensor(2, 2, 3, () => 0)
  buf.writeUInt32LE(1012247, 0)
  assert.throws(() => decodeTensor(buf), /--no-response-compression/)
})

test('noise is told apart from a picture', () => {
  // A real render: smooth, neighbouring pixels close together.
  const smooth = decodeTensor(tensor(32, 32, 3, (i) => Math.sin(i / 400)))
  assert.equal(looksLikeNoise(smooth), false)
  // Static: every pixel independent of the last.
  const random = decodeTensor(tensor(32, 32, 3, () => Math.random() * 2 - 1))
  assert.equal(looksLikeNoise(random), true)
})

// ── the knobs ─────────────────────────────────────────────────────────────────────────────

const CAPS: Caps = {
  negatives: true, idiom: 'prose', words: [20, 120], resolution: [512, 1536],
  stepsLocked: null, batch: false,
}

test('a knob outside caps is REJECTED, never clamped', () => {
  assert.throws(() => resolveImageKnobs(CAPS, { width: 2048, height: 1024 }), ParamError)
  assert.throws(() => resolveImageKnobs(CAPS, { width: 1024, height: 256 }), ParamError)
  try {
    resolveImageKnobs(CAPS, { width: 4096, height: 1024 })
    assert.fail('should have thrown')
  } catch (err) {
    // The message has to name the knob and the band, because the person reading it is holding
    // a UI that offered them the value.
    assert.equal((err as ParamError).param, 'width')
    assert.match((err as Error).message, /between 512 and 1536/)
  }
})

test('a locked step count is not a suggestion', () => {
  const locked: Caps = { ...CAPS, stepsLocked: 4 }
  assert.equal(resolveImageKnobs(locked, {}).steps, 4)
  assert.throws(() => resolveImageKnobs(locked, { steps: 30 }), /fixed 4 steps/)
})

test('a negative prompt to an engine that has none is refused, not dropped', () => {
  assert.throws(
    () => resolveImageKnobs({ ...CAPS, negatives: false }, { negative: 'blurry' }),
    /say what you DO want/,
  )
  // …and an engine that HAS one takes it.
  assert.equal(resolveImageKnobs(CAPS, { negative: 'blurry' }).negative, 'blurry')
})

test('an undeclared engine gets the minimum, and the minimum still renders', () => {
  const knobs = resolveImageKnobs(MINIMAL_CAPS, {})
  assert.equal(knobs.width, 1024)
  assert.ok(knobs.seed >= 0 && knobs.seed <= 0xffff_ffff)
})

// ── naming ────────────────────────────────────────────────────────────────────────────────

test('the server derives the slug, and it can only ever be a folder name', () => {
  assert.equal(slugify('coffee before 9am'), 'coffee-before-9am')
  assert.equal(slugify('cafè amb xocolata'), 'cafe-amb-xocolata')
  // §15 rule 2: a model that names a file is a model that can name `../`.
  assert.equal(slugify('../../etc/passwd'), 'etc-passwd')
  assert.equal(slugify('  ...  '), 'untitled')
  assert.equal(slugify('日本語だけ'), 'untitled')
  assert.ok(slugify('a'.repeat(200)).length <= 48)
  assert.match(mintRunId('coffee before 9am'), /^coffee-before-9am-\d{8}-\d{6}$/)
  assert.match(stamp(new Date('2026-08-02T12:43:00')), /^20260802-\d{6}$/)
})

test('a master is named for what made it, and never by a model', () => {
  // ⚠️ UNCONDITIONAL. The name used to depend on its SIBLINGS — plain `draw-things-grpc` when one
  // engine answered, `--<stem>` when two did — so the same checkpoint had two possible paths and
  // a path could not be read. One rule, whatever else was ticked.
  assert.equal(
    cellName('draw-things-grpc', 'flux_2_klein_4b_i8x.ckpt'),
    'draw-things-grpc--flux-2-klein-4b-i8x',
  )
  // Two checkpoints on one service — the comparison this app is for — cannot collide. Without
  // this both jobs wrote `01.webp` into one folder and the second silently won (2026-08-07).
  assert.notEqual(
    cellName('draw-things-grpc', 'sdxl_turbo.ckpt'),
    cellName('draw-things-grpc', 'flux_2_klein_4b_i8x.ckpt'),
  )
  // Only a service that offers no checkpoint at all falls back to its own id.
  assert.equal(cellName('draw-things-grpc', null), 'draw-things-grpc')
  // A model name is not a path, and the filename is built from it — same rule as everywhere else.
  assert.equal(cellName('svc', '../../etc/passwd.ckpt'), 'svc--etc-passwd')
})

test('masters are the run folder\'s own children — no cell folder to hold a count', () => {
  assert.equal(
    masterRel('image', 'small-cat-20260807-173336', 'draw-things-grpc', 'sd_xl_base_1.0.ckpt'),
    'media/image/small-cat-20260807-173336/draw-things-grpc--sd-xl-base-1-0.webp',
  )
  // The extension follows the medium, from the one map that names files.
  assert.equal(
    masterRel('music', 'a-song-20260807-173336', 'svc', null),
    'media/music/a-song-20260807-173336/svc.mp3',
  )
})

test('a style reaches the prompt in the idiom the engine asked for', () => {
  const style = {
    id: 'xk:flat', ns: 'xk' as const, medium: 'image' as const, slug: 'flat',
    tags: ['flat vector', 'bold outlines'], positive: 'flat vector illustration',
  }
  // ⚠️ THE STYLE LEADS (2026-08-30). This asserted `cats, flat vector illustration` — the shape
  // that made a papercut press come back a photograph, twelve style words trailing thirty of ask.
  assert.equal(composePrompt('cats', style, CAPS), 'flat vector illustration, cats')
  assert.equal(
    composePrompt('cats', style, { ...CAPS, idiom: 'tags' }),
    'flat vector, bold outlines, cats',
  )
  assert.equal(composePrompt('cats', null, CAPS), 'cats')
})

test('a VOICE goes beside the script, never into it — and it brings its seed', () => {
  // ⚠️ THE ONE MEDIUM WHERE THE PROMPT IS NOT A DESCRIPTION. In 🗣 the sentence is the SCRIPT, so
  // composing a style into it produces a narrator reading the stage direction out loud. The words
  // ride in a param of their own instead (src/styles/param.ts), which is exactly the `voice` hole
  // a voice-design workflow declares beside its `prompt` hole.
  assert.equal(styleParamFor('voice'), 'voice')
  assert.equal(styleParamFor('image'), null, 'a picture composes, the way it always has')
  assert.equal(styleParamFor('music'), null)

  const sailor = {
    medium: 'voice' as const, slug: 'old-sailor',
    positive: 'an old sailor, gravelly and unhurried', seed: 77,
  }
  assert.deepEqual(styleParams('voice', sailor), {
    voice: 'an old sailor, gravelly and unhurried',
    // ⚠️ THE SEED IS HALF THE VOICE. The same description on a fresh number is a different person
    // saying the same line, which is what made 🗣 unable to hold a character.
    seed: 77,
  })

  // A voice that pins no seed simply does not send one, and the run draws its own.
  assert.deepEqual(styleParams('voice', { medium: 'voice' as const, slug: 'any', positive: 'a child' }),
    { voice: 'a child' })
  // An image style is not sent this way at all, whatever it carries.
  assert.deepEqual(styleParams('image', sailor), {})
  assert.deepEqual(styleParams('voice', null), {})
})

test('{prompt} puts the subject where the style wants it, and the style leads without it', () => {
  const anchored = {
    medium: 'image' as const, slug: 'ink',
    tags: ['line art drawing', '{prompt}', 'black ink', 'hatched shadows'],
    positive: 'black ink line art',
  }
  // The whole point: the medium word lands BEFORE the subject, refinements after. On CLIP that
  // is the difference between a style that governs the image and one that decorates it.
  assert.equal(
    composePrompt('a chick on a cake', anchored, { ...CAPS, idiom: 'tags' }),
    'line art drawing, a chick on a cake, black ink, hatched shadows',
  )
  // ⚠️ AND A CHANNEL WITHOUT THE SLOT GETS THE SAME SHAPE BY DEFAULT. This is the whole of the
  // papercut fix: `positive` is the only channel a prose engine reads, no published style put the
  // marker there, so on FLUX every style trailed. An unmarked style now composes as if it had
  // written `{prompt}` after its own words.
  assert.equal(
    composePrompt('a chick on a cake', anchored, CAPS),
    'black ink line art, a chick on a cake',
  )
  assert.equal(
    composePrompt('cats', { medium: 'image' as const, slug: 'x', tags: ['flat vector'] },
      { ...CAPS, idiom: 'tags' }),
    'flat vector, cats',
  )
  // Which makes the marker the way to ask for the OTHER order — including the subject first.
  assert.equal(
    composePrompt('cats', { medium: 'image' as const, slug: 'x', positive: '{prompt}, in soft pastel' },
      CAPS),
    'cats, in soft pastel',
  )
  // The slot is a POSITION, so it never becomes a searchable tag on the asset it made.
  assert.ok(!tagsFromText('cats', anchored).includes('{prompt}'))
})

test('a media run with no builder still gets tags, from the text', () => {
  const tags = tagsFromText('Coffee before 9am and the cat', null)
  assert.deepEqual(tags, ['coffee', 'before', '9am', 'the', 'cat'].filter((t) => t !== 'the'))
  // Descriptive output, never generation input — and normalized lightly, not curated.
  assert.deepEqual(tagsFromText('CATS cats  Cats', null), ['cats'])
})

// ── the lane ──────────────────────────────────────────────────────────────────────────────

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 20))

test('builds run one at a time; the fast lane does not wait behind them', async () => {
  const queue = new Queue()
  const order: string[] = []
  let releaseFirst = (): void => {}
  const blocked = new Promise<void>((r) => { releaseFirst = r })

  queue.add({
    label: 'render 1', lane: 'serial', runId: 'r', engine: 'e',
    run: async () => { order.push('serial-1-start'); await blocked; order.push('serial-1-end') },
  })
  queue.add({
    label: 'render 2', lane: 'serial', runId: 'r', engine: 'e',
    run: async () => { order.push('serial-2') },
  })
  queue.add({
    label: 'zip', lane: 'fast', runId: 'r', engine: null,
    run: async () => { order.push('fast') },
  })

  await settle()
  // The second render has not started, but the zip is already done — waiting behind a render
  // to get a zip is absurd.
  assert.deepEqual(order, ['serial-1-start', 'fast'])
  releaseFirst()
  await settle()
  assert.deepEqual(order, ['serial-1-start', 'fast', 'serial-1-end', 'serial-2'])
})

test('a queued job can be dropped and a running one told to stop', async () => {
  const queue = new Queue()
  let aborted = false
  const running = queue.add({
    label: 'slow', lane: 'serial', runId: 'r', engine: 'e',
    run: ({ signal }) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => { aborted = true; reject(new Error('cancelled')) })
    }),
  })
  const waiting = queue.add({
    label: 'next', lane: 'serial', runId: 'r', engine: 'e', run: async () => {},
  })
  await settle()

  assert.equal(queue.cancel(waiting.id), true)
  assert.equal(queue.get(waiting.id)?.state, 'cancelled')

  assert.equal(queue.cancel(running.id), true)
  await settle()
  assert.equal(aborted, true)
  // Cancelled is not failed: the user asked for this, so it carries no error.
  assert.equal(queue.get(running.id)?.state, 'cancelled')
  assert.equal(queue.get(running.id)?.error, null)
})

test('a failure is recorded with its reason, and the lane keeps going', async () => {
  const queue = new Queue()
  const finished: string[] = []
  queue.onFinished((job) => finished.push(`${job.label}:${job.state}`))
  queue.add({
    label: 'boom', lane: 'serial', runId: 'r', engine: 'e',
    run: async () => { throw new Error('the engine said no') },
  })
  queue.add({ label: 'after', lane: 'serial', runId: 'r', engine: 'e', run: async () => {} })
  await settle()
  assert.deepEqual(finished, ['boom:failed', 'after:done'])
  assert.match(queue.list()[0]?.error ?? '', /the engine said no/)
  assert.equal(queue.outstanding('r'), 0)
})

// ── what you BRING with the sentence ──────────────────────────────────────────────────────

test('a workflow refuses a picture in a slot it does not have, by name', () => {
  // ⚠️ THE SLOTS BELONG TO THE WORKFLOW, not to the checkpoint: the same SDXL file takes a style
  // reference in one workflow and none in another. And it is REFUSED, never dropped — a render
  // that silently ignored the picture would look exactly like one that used it badly.
  assert.equal(refusedRef([{ role: 'ref' }], ['ref'], 'klein · i2i'), null)
  assert.match(refusedRef([{ role: 'look' }], ['ref'], 'klein · i2i') ?? '', /does not take a look/)
  assert.match(refusedRef([{ role: 'ref' }], [], 'klein · t2i') ?? '', /it takes none/)
})

test('…and a slot nothing filled is the same mistake, pointed the other way', () => {
  // Kontext with no picture is not a render from words — it is a render with the model's actual
  // input missing, and finding that out four minutes later is finding it out twice.
  assert.match(missingRef([], ['ref'], 'Kontext edit') ?? '', /needs a ref picture/)
  assert.equal(missingRef([{ role: 'ref' }], ['ref'], 'Kontext edit'), null)
  assert.equal(missingRef([], [], 'klein · t2i'), null)
})
