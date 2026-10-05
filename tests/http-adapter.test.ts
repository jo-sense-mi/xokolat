// THE PLAIN-HTTP ADAPTER — one shape, every small local tool.
//
// The endpoint under test is a stub: what is being defended is that the call this app makes is the
// one the registry describes, because there is no protocol here to fall back on. If the multipart
// field is named wrong or the workflow's knobs do not travel, nothing fails loudly — the tool on the
// other end just does the default thing, and the picture comes back looking almost right.

import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import test from 'node:test'

import sharp from 'sharp'

import { adapterFor } from '../src/inference/adapter.ts'
import type { RawImage, RenderOutput } from '../src/inference/adapter.ts'
import type { ResolvedWorkflow } from '../src/inference/workflows.ts'
import type { InferenceRow, Transport } from '../src/types/inference.ts'

/** A 2×2 red square, as raw planes. */
const pixels: RawImage = { data: Buffer.alloc(2 * 2 * 3, 200), width: 2, height: 2, channels: 3 }

/** The pixels this transport answered with. It only ever renders images — narrowing the union at
 *  every assertion would make these tests about the union rather than about the call. */
function pixelsOf(out: RenderOutput): RawImage {
  if (out.asset.kind !== 'image') throw new Error(`answered ${out.asset.kind}, not pixels`)
  return out.asset.image
}

const workflow = {
  slug: 'cutout', label: 'BiRefNet', kind: 'cutout', model: 'birefnet-general',
  inputs: ['ref'], slots: ['ref'], state: 'known', isDefault: true,
  caps: { negatives: false, idiom: 'prose', words: [0, 0], resolution: [1, 4096], stepsLocked: null, batch: false },
  params: { alphaMatting: true }, notes: null, mine: false,
} as unknown as ResolvedWorkflow

interface Seen { contentType: string; body: Buffer; url: string }

async function stub(answer: (seen: Seen) => { status?: number; type: string; body: Buffer }): Promise<{
  port: number; seen: Seen[]; close: () => Promise<void>
}> {
  const seen: Seen[] = []
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      const got: Seen = {
        contentType: req.headers['content-type'] ?? '',
        body: Buffer.concat(chunks),
        url: req.url ?? '',
      }
      seen.push(got)
      const out = answer(got)
      res.writeHead(out.status ?? 200, { 'content-type': out.type })
      res.end(out.body)
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  return { port, seen, close: () => new Promise((r) => server.close(() => r())) }
}

const rowAt = (port: number, call: Record<string, unknown>): InferenceRow => ({
  id: 'rembg',
  transport: { kind: 'http', host: '127.0.0.1', port, call } as unknown as Transport,
})

const green = (): Promise<Buffer> => sharp({
  create: { width: 4, height: 4, channels: 4, background: { r: 0, g: 180, b: 0, alpha: 0.5 } },
}).png().toBuffer()

test('a form call carries the picture, the checkpoint and the workflow’s knobs', async () => {
  const png = await green()
  const s = await stub(() => ({ type: 'image/png', body: png }))
  try {
    const out = await adapterFor(rowAt(s.port, {
      method: 'POST', path: '/api/remove', send: 'form', field: 'file', receive: 'image',
    })).render({
      row: rowAt(s.port, {
        method: 'POST', path: '/api/remove', send: 'form', field: 'file', receive: 'image',
      }),
      workflow,
      prompt: '',
      params: { width: 1024, seed: 7 },
      refs: [{ role: 'ref', asset: 'a.webp', image: pixels }],
    })

    const sent = s.seen[0]!
    assert.match(sent.contentType, /^multipart\/form-data; boundary=/)
    assert.equal(sent.url, '/api/remove')
    const text = sent.body.toString('latin1')
    assert.match(text, /name="file"; filename=/, 'the field the registry named')
    assert.match(text, /name="model"[\s\S]*birefnet-general/, 'the checkpoint the workflow names')
    assert.match(text, /name="alphaMatting"[\s\S]*true/, 'and the workflow’s own knob')
    // ⚠️ AND NOTHING ELSE. `width` and `seed` are the composer's, they mean nothing here, and
    // posting them at a stranger's endpoint is how a cutout ends up with a `cfg` field.
    assert.doesNotMatch(text, /name="width"/)
    assert.doesNotMatch(text, /name="seed"/)
    assert.ok(sent.body.includes(Buffer.from('\x89PNG', 'latin1')), 'the picture, as PNG')

    assert.equal(pixelsOf(out).width, 4)
    assert.equal(pixelsOf(out).channels, 4, 'alpha survives, which is the whole point of a cutout')
    assert.equal(out.seed, null, 'nothing here was random')
    assert.equal(out.model, 'birefnet-general')
  } finally {
    await s.close()
  }
})

test('with the picture as the body, the knobs ride in the query', async () => {
  const png = await green()
  const s = await stub(() => ({ type: 'image/png', body: png }))
  const row = rowAt(s.port, { method: 'POST', path: '/cut', send: 'body', receive: 'image' })
  try {
    await adapterFor(row).render({
      row, workflow, prompt: '', params: {},
      refs: [{ role: 'ref', asset: 'a.webp', image: pixels }],
    })
    const sent = s.seen[0]!
    assert.equal(sent.contentType, 'image/png')
    assert.match(sent.url, /^\/cut\?/)
    assert.match(sent.url, /model=birefnet-general/)
    assert.ok(sent.body.subarray(0, 4).equals(Buffer.from('\x89PNG', 'latin1')))
  } finally {
    await s.close()
  }
})

test('a JSON answer is unwrapped, data: prefix and all', async () => {
  const png = await green()
  const s = await stub(() => ({
    type: 'application/json',
    body: Buffer.from(JSON.stringify({ image: `data:image/png;base64,${png.toString('base64')}` })),
  }))
  const row = rowAt(s.port, {
    method: 'POST', path: '/x', send: 'form', receive: 'json', jsonField: 'image',
  })
  try {
    const out = await adapterFor(row).render({
      row, workflow, prompt: '', params: {},
      refs: [{ role: 'ref', asset: 'a.webp', image: pixels }],
    })
    assert.equal(pixelsOf(out).width, 4)
  } finally {
    await s.close()
  }
})

test('a refusal is reported with what it said, not as a mystery', async () => {
  const s = await stub(() => ({ status: 503, type: 'text/plain', body: Buffer.from('model loading') }))
  const row = rowAt(s.port, { method: 'POST', path: '/x', send: 'form', receive: 'image' })
  try {
    await assert.rejects(adapterFor(row).render({
      row, workflow, prompt: '', params: {},
      refs: [{ role: 'ref', asset: 'a.webp', image: pixels }],
    }), /503.*model loading/)
  } finally {
    await s.close()
  }
})

test('an http row with no call shape has no adapter, and says which fix', () => {
  assert.throws(() => adapterFor({
    id: 'x', transport: { kind: 'http', host: 'h', port: 1 },
  }), /call shape/)
})
