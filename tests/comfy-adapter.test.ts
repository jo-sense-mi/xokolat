// THE COMFYUI ADAPTER — the one transport where the workflow brings the whole ask.
//
// ⚠️ WHAT IS BEING DEFENDED HERE IS THE CONTRACT, NOT THE PROTOCOL. Three calls to a stub prove
// very little on their own; what matters is the split the whole design rests on — the GRAPH is
// content that arrives from the library and is sent as published, and the HOLES are the short list
// of things this app is allowed to write into it. Every failure mode below is silent in
// production: a hole that misses writes nothing and the graph renders whatever it was saved with,
// an output taken from the wrong node yields a `.qvp` profile where a voice should be, and a graph
// mutated in place carries one press's prompt into the next.

import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import type { Duplex } from 'node:stream'
import type { Server } from 'node:http'
import test from 'node:test'

import { adapterFor } from '../src/inference/adapter.ts'
import type { RawImage } from '../src/inference/adapter.ts'
import { parseInferenceRow } from '../src/inference/registry.ts'
import type { ResolvedWorkflow } from '../src/inference/workflows.ts'
import type { InferenceRow } from '../src/types/inference.ts'
import type { Graph } from '../src/types/workflow.ts'
import { ctx } from '../src/validate.ts'

/** The music graph, cut to the shape that matters: a text node, a seed node, a save node — and a
 *  SECOND save node, which is what makes `out` worth declaring. */
const graph: Graph = {
  nodes: {
    '94': { class_type: 'TextEncodeAceStepAudio1.5', inputs: { tags: 'ambient instrumental', seed: 0 } },
    '109': { class_type: 'PrimitiveInt', inputs: { value: 77 } },
    '107': { class_type: 'SaveAudioMP3', inputs: { audio: ['18', 0], filename_prefix: 'xk/song' } },
    '108': { class_type: 'SaveAudio', inputs: { audio: ['18', 0], filename_prefix: 'xk/flac' } },
  },
  out: '107',
  holes: { prompt: '94.tags', seed: '109.value' },
}

const workflow = (over: Partial<ResolvedWorkflow> = {}): ResolvedWorkflow => ({
  slug: 'ace-step', label: 'ACE-Step 1.5', kind: 't2m',
  model: 'acestep_v1.5_xl_sft_bf16.safetensors',
  inputs: ['prompt'], slots: [], state: 'known', isDefault: true,
  params: {}, controls: [], loras: [], graph, missing: [],
  notes: null, mine: false,
  ...over,
} as unknown as ResolvedWorkflow)

interface Seen { method: string; url: string; body: Buffer }

/** A ComfyUI, in as many lines as it takes to answer three calls honestly. */
/**
 * ONE SERVER→CLIENT TEXT FRAME, unmasked, which is the whole of what ComfyUI sends.
 *
 * ⚠️ HAND-ROLLED BECAUSE NODE HAS A WebSocket CLIENT AND NO SERVER, and pulling in `ws` to prove
 * a progress bar works would break the rule the dependency tree is held to (PLAN §15.3). Twelve
 * lines against a permanent dependency is not a close call. Payloads here are short, so only the
 * 7-bit length form is written.
 */
function frame(text: string): Buffer {
  const body = Buffer.from(text, 'utf-8')
  if (body.length > 125) throw new Error('this stub only writes short frames')
  return Buffer.concat([Buffer.from([0x81, body.length]), body])
}

async function comfy(outputs: Record<string, unknown>, opts: {
  /** How many empty `/history` answers before the run appears. */
  pending?: number
  /** What `/prompt` says instead of taking it. */
  refuse?: unknown
  status?: { status_str?: string; messages?: unknown }
  /** Messages to push down `/ws` once a client connects — ComfyUI's progress feed. */
  push?: readonly unknown[]
} = {}): Promise<{ row: InferenceRow; seen: Seen[]; close: () => Promise<void> }> {
  const seen: Seen[] = []
  let left = opts.pending ?? 0
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      const url = req.url ?? ''
      seen.push({ method: req.method ?? '', url, body: Buffer.concat(chunks) })
      const json = (v: unknown, status = 200): void => {
        res.writeHead(status, { 'content-type': 'application/json' })
        res.end(JSON.stringify(v))
      }
      if (url.startsWith('/upload/image')) return json({ name: 'ref (1).png', subfolder: '', type: 'input' })
      if (url === '/prompt') {
        return opts.refuse ? json({ node_errors: opts.refuse }, 400) : json({ prompt_id: 'p-1' })
      }
      if (url.startsWith('/history/')) {
        if (left-- > 0) return json({})
        return json({ 'p-1': { status: opts.status ?? { status_str: 'success' }, outputs } })
      }
      if (url.startsWith('/view')) {
        res.writeHead(200, { 'content-type': 'audio/mpeg' })
        return res.end(Buffer.from('ID3 the bytes'))
      }
      res.writeHead(404).end()
    })
  })
  // ⚠️ THE UPGRADE IS A SEPARATE EVENT, and a server that does not answer it is the ordinary case
  // — most of these tests have no `push`, and the adapter must render anyway. That is the failure
  // mode the whole "a feed, never a result" split exists for.
  // ⚠️ AND THE UPGRADED SOCKETS ARE HELD, because `server.close()` stops accepting and waits for
  // what is open — a test that upgraded one and did not destroy it hangs forever.
  const open: Duplex[] = []
  if (opts.push) {
    server.on('upgrade', (req, socket) => {
      open.push(socket)
      const key = String(req.headers['sec-websocket-key'] ?? '')
      const accept = createHash('sha1')
        .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64')
      socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\n'
        + `Connection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`)
      seen.push({ method: 'UPGRADE', url: req.url ?? '', body: Buffer.alloc(0) })
      for (const m of opts.push ?? []) socket.write(frame(JSON.stringify(m)))
    })
  }
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const port = (server.address() as { port: number }).port
  const c = ctx('test')
  const row = parseInferenceRow(c, {
    id: 'comfyui', role: 'generator',
    transport: { kind: 'comfy', host: '127.0.0.1', port },
  }, '')
  assert.deepEqual(c.issues, [])
  return {
    row: row!,
    seen,
    close: () => new Promise<void>((r) => {
      for (const sock of open) sock.destroy()
      server.close(() => r())
    }),
  }
}

/** What was actually queued. */
const queuedGraph = (seen: readonly Seen[]): Record<string, { inputs: Record<string, unknown> }> =>
  JSON.parse(seen.find((s) => s.url === '/prompt')!.body.toString()).prompt

test('the graph is sent as published, with only the declared holes written into it', async () => {
  const { row, seen, close } = await comfy({ '107': { audio: [{ filename: 'song_00001_.mp3', subfolder: 'xk', type: 'output' }] } })
  try {
    const out = await adapterFor(row).render({
      row, workflow: workflow(), prompt: 'slow piano, rain outside', params: { seed: 4242 },
    })

    const sent = queuedGraph(seen)
    assert.equal(sent['94']!.inputs['tags'], 'slow piano, rain outside')
    assert.equal(sent['109']!.inputs['value'], 4242)
    // ⚠️ AND NOTHING ELSE MOVED. The graph is somebody's published work: every number in it was
    // chosen, and an app that "helpfully" wrote a width or a step count into a node it did not
    // understand would be silently re-authoring it.
    assert.equal(sent['94']!.inputs['seed'], 0)
    assert.equal(sent['107']!.inputs['filename_prefix'], 'xk/song')
    assert.equal(out.seed, 4242)

    // ⚠️ AND THE PUBLISHED OBJECT IS UNTOUCHED, which is the bug you only see on the second press:
    // a graph mutated in place carries the first prompt into every run after it.
    assert.equal((graph.nodes['94'] as { inputs: Record<string, unknown> }).inputs['tags'],
      'ambient instrumental')
  } finally {
    await close()
  }
})

test('⚠️ the master comes from the node the workflow named, not from whichever one saved', async () => {
  // The real voice graph writes a reusable `.qvp` profile AND an audio preview, from two nodes.
  // "The last output" picks whichever ComfyUI listed first, which is a coin toss between a voice
  // and a file nothing can play.
  const { row, close } = await comfy({
    '108': { audio: [{ filename: 'flac_00001_.flac', subfolder: 'xk', type: 'output' }] },
    '107': { audio: [{ filename: 'song_00001_.mp3', subfolder: 'xk', type: 'output' }] },
  })
  try {
    const out = await adapterFor(row).render({ row, workflow: workflow(), prompt: 'x', params: {} })
    assert.equal(out.asset.kind, 'bytes')
    // ⚠️ THE CONTAINER COMES OFF THE FILENAME. Nothing declared `mp3` anywhere — the save node
    // chose it, and `writeMaster` is what refuses one that disagrees with the medium.
    if (out.asset.kind !== 'bytes') throw new Error('not bytes')
    assert.equal(out.asset.ext, 'mp3')
    assert.deepEqual(out.asset.data, Buffer.from('ID3 the bytes'))
  } finally {
    await close()
  }
})

test('a picture is uploaded first, and the name ComfyUI chose is what lands in the graph', async () => {
  // ⚠️ THE NAME THAT COMES BACK IS NOT THE NAME THAT WENT OUT — ComfyUI renames a collision rather
  // than overwriting somebody's file, and a graph pointed at the name we SENT loads the wrong
  // picture: the one already sitting there under that name.
  const image: RawImage = { data: Buffer.alloc(4, 9), width: 2, height: 2, channels: 1 }
  const { row, seen, close } = await comfy({ '107': { '3d': [{ filename: 'mesh_00001_.glb', subfolder: '', type: 'output' }] } })
  try {
    const out = await adapterFor(row).render({
      row,
      workflow: workflow({
        kind: 'i23d', inputs: ['ref'], slots: ['ref'],
        graph: { ...graph, holes: { ref: '2.image' }, nodes: { ...graph.nodes, '2': { class_type: 'LoadImage', inputs: { image: 'placeholder.png' } } } },
      }),
      prompt: '',
      params: {},
      refs: [{ role: 'ref', image, asset: 'media/image/r/a.webp' }],
    })

    const upload = seen.find((s) => s.url.startsWith('/upload/image'))
    assert.ok(upload, 'the picture was never uploaded')
    assert.match(upload!.body.toString('latin1'), /name="image"; filename="ref\.png"/)
    assert.equal(queuedGraph(seen)['2']!.inputs['image'], 'ref (1).png')
    // A graph that takes no seed took none, and says so rather than recording a number that
    // changed nothing.
    assert.equal(out.seed, null)
  } finally {
    await close()
  }
})

test('⚠️ one word fills every node that states the same fact', async () => {
  // ACE-Step's length is set on the text encoder AND on the empty latent. A `duration` reaching
  // only one of them is two minutes of audio in a thirty-second container — no error, just a song
  // that stops.
  const { row, seen, close } = await comfy({ '107': { audio: [{ filename: 's.mp3', subfolder: '', type: 'output' }] } })
  try {
    await adapterFor(row).render({
      row,
      workflow: workflow({
        graph: {
          ...graph,
          nodes: { ...graph.nodes, '98': { class_type: 'EmptyAceStep1.5LatentAudio', inputs: { seconds: 120 } } },
          holes: { duration: ['94.duration', '98.seconds'] },
        },
      }),
      prompt: 'x',
      params: { duration: 30 },
    })
    const sent = queuedGraph(seen)
    assert.equal(sent['94']!.inputs['duration'], 30)
    assert.equal(sent['98']!.inputs['seconds'], 30)
  } finally {
    await close()
  }
})

test('a graph ComfyUI will not take is refused with what IT said, not with a status code', async () => {
  const { row, close } = await comfy({}, {
    refuse: { '105': { errors: [{ message: 'Value not in list: clip_name1' }] } },
  })
  try {
    await assert.rejects(
      () => adapterFor(row).render({ row, workflow: workflow(), prompt: 'x', params: {} }),
      // The node id and the missing file are the sentence somebody can act on: it names the model
      // to go and download.
      /clip_name1/,
    )
  } finally {
    await close()
  }
})

test('a run that saved nothing under the named node says which node did', async () => {
  const { row, close } = await comfy({ '108': { audio: [{ filename: 'x.flac', subfolder: '', type: 'output' }] } })
  try {
    await assert.rejects(
      () => adapterFor(row).render({ row, workflow: workflow(), prompt: 'x', params: {} }),
      /node 107 saved nothing.*108/s,
    )
  } finally {
    await close()
  }
})

test('a workflow with no graph is refused where it can say where graphs come from', async () => {
  const { row, close } = await comfy({})
  try {
    await assert.rejects(
      () => adapterFor(row).render({
        row, workflow: workflow({ graph: null }), prompt: 'x', params: {},
      }),
      /carries no graph/,
    )
  } finally {
    await close()
  }
})

test('⚠️ a hole pointing at a node that is not in the graph is refused where it is written', () => {
  const c = ctx('test')
  parseInferenceRow(c, {
    id: 'comfyui',
    workflows: [{
      slug: 'ace-step', kind: 't2m', model: 'ace.safetensors', inputs: ['prompt'],
      graph: { nodes: { '94': { class_type: 'X', inputs: {} } }, out: '94', holes: { prompt: '9.tags' } },
    }],
  }, '', { partial: true })
  // Nothing errors at render time when a hole misses: the node simply never receives the sentence,
  // and what comes back is whatever the graph was published with. Caught in the parser, it is one
  // line in the file with a number in it.
  assert.match(c.issues.join('; '), /no node "9" in this graph/)
})

test('an output node that is not in the graph is refused too', () => {
  const c = ctx('test')
  parseInferenceRow(c, {
    id: 'comfyui',
    workflows: [{
      slug: 'ace-step', kind: 't2m', model: 'ace.safetensors', inputs: ['prompt'],
      graph: { nodes: { '94': { class_type: 'X', inputs: {} } }, out: '107' },
    }],
  }, '', { partial: true })
  assert.match(c.issues.join('; '), /no node "107" in this graph/)
})

test('a slot hole obeys the same rule as a control: nothing fills what `inputs` does not list', () => {
  const c = ctx('test')
  parseInferenceRow(c, {
    id: 'comfyui',
    workflows: [{
      slug: 'mesh', kind: 'i23d', model: 'hunyuan.safetensors', inputs: ['prompt'],
      graph: { nodes: { '2': { class_type: 'LoadImage', inputs: {} } }, out: '2', holes: { ref: '2.image' } },
    }],
  }, '', { partial: true })
  assert.match(c.issues.join('; '), /nothing fills a ref slot here/)
})

test('⚠️ the socket is a progress FEED and never a result', async () => {
  // ComfyUI does not broadcast progress: it sends it to the ONE socket registered under the
  // `client_id` the prompt was submitted with. That is why the adapter opens the socket BEFORE the
  // POST — open it after and the first steps of a short render are dropped on the floor.
  const { row, seen, close } = await comfy(
    { '107': { audio: [{ filename: 'song_00001_.mp3', subfolder: 'xk', type: 'output' }] } },
    {
      pending: 1,
      push: [
        { type: 'progress', data: { prompt_id: 'p-1', value: 2, max: 8 } },
        { type: 'progress', data: { prompt_id: 'p-1', value: 6, max: 8 } },
        // Somebody else's render on the same ComfyUI must not move this bar.
        { type: 'progress', data: { prompt_id: 'someone-else', value: 1, max: 100 } },
        { type: 'executing', data: { prompt_id: 'p-1', node: null } },
      ],
    })
  try {
    const saw: (number | null)[] = []
    await adapterFor(row).render({
      row, workflow: workflow(), prompt: 'slow piano', params: {}, progress: (f) => saw.push(f),
    })
    // ⚠️ THE SOCKET IS OPENED FIRST. `seen` is in arrival order, so the upgrade preceding /prompt
    // is the assertion — not an implementation detail, the reason the first steps arrive at all.
    assert.equal(seen[0]?.method, 'UPGRADE')
    assert.match(seen[0]?.url ?? '', /^\/ws\?clientId=xokolat-/)
    assert.equal(seen[1]?.url, '/prompt')
    // The same client id in both places, which is the only reason the messages reach us.
    const clientId = JSON.parse(seen[1]!.body.toString())['client_id'] as string
    assert.ok(seen[0]!.url.endsWith(encodeURIComponent(clientId)))
    assert.deepEqual(saw, [0.25, 0.75, 1])
  } finally {
    await close()
  }
})

test('a ComfyUI with no socket to open still renders, and simply says nothing', async () => {
  // The ordinary case for every other test in this file, asserted once on purpose: a render that
  // worked must never be failed by the thing that was drawing a line under it.
  const { row, close } = await comfy(
    { '107': { audio: [{ filename: 'song_00001_.mp3', subfolder: 'xk', type: 'output' }] } })
  try {
    const saw: (number | null)[] = []
    const out = await adapterFor(row).render({
      row, workflow: workflow(), prompt: 'slow piano', params: {}, progress: (f) => saw.push(f),
    })
    assert.equal(out.asset.kind, 'bytes')
    assert.deepEqual(saw, [], 'silence beats a guess — the queue row keeps its elapsed clock')
  } finally {
    await close()
  }
})

/**
 * ⚠️ THE RECORD USED TO BE WHAT THE APP SENT, WHICH FOR MOST PRESSES WAS NOTHING (2026-08-31).
 *
 * A song pressed with nothing typed recorded nothing about itself: no tempo, no key, no language,
 * no cfg. `params` came off the request's own bag, and an unset knob is never in it — so the
 * presses whose settings were least guessable were the ones the master could say least about, and
 * "what was this made at?" had no answer anywhere on the machine.
 *
 * The values were in the graph the whole time, at the addresses the holes name.
 */
test('⚠️ the record says what the graph RAN at, not what happened to be typed', async () => {
  const wide: Graph = {
    nodes: {
      '3': { class_type: 'KSampler', inputs: { steps: 8, cfg: 1.0, seed: ['109', 0] } },
      '94': { class_type: 'TextEncodeAceStepAudio1.5', inputs: { tags: '', bpm: 120, keyscale: 'C major' } },
      '109': { class_type: 'PrimitiveInt', inputs: { value: 77 } },
      '107': { class_type: 'SaveAudioMP3', inputs: { audio: ['18', 0], filename_prefix: 'xk/song' } },
    },
    out: '107',
    holes: { prompt: '94.tags', seed: '109.value', bpm: '94.bpm', keyscale: '94.keyscale', steps: '3.steps', cfg: '3.cfg' },
  }
  const { row, close } = await comfy({ '107': { audio: [{ filename: 'song_00001_.mp3', subfolder: 'xk', type: 'output' }] } })
  try {
    const out = await adapterFor(row).render({
      row, workflow: workflow({ graph: wide }), prompt: 'a waltz',
      // ONE knob typed, out of six holes. Everything else is "leave it alone".
      params: { bpm: 90, size: 'not a hole here' },
    })

    assert.equal(out.params['bpm'], 90, 'what was set is what ran')
    assert.equal(out.params['keyscale'], 'C major', 'and what was NOT set still ran at something')
    assert.equal(out.params['cfg'], 1.0, 'the number that decides whether the track distorts')
    assert.equal(out.params['steps'], 8)
    // ⚠️ ONLY THIS WORKFLOW'S HOLES. The merged bag is full of things that are nobody's hole here —
    // an image size on a song — and the graph never saw them, so the record must not claim it did.
    assert.equal(out.params['size'], undefined)
    // The seed has a field of its own on the record; two copies is two answers to one question.
    assert.equal(out.params['seed'], undefined)
    // And the prompt is the run's ask, not a knob.
    assert.equal(out.params['prompt'], 'a waltz')
  } finally {
    await close()
  }
})
