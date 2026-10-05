// The 🔌 shelf and its probe. What matters here is not that a check passes — it is that the
// three failure modes stay distinct and `can't check` is never reported as `missing` (PLAN §13).
//
// Localhost sockets only: `npm run check` must never touch the network (PLAN §14).

import assert from 'node:assert/strict'
import { createServer as httpServer } from 'node:http'
import { createServer } from 'node:net'
import test from 'node:test'

import { httpProbe, tcpProbe } from '../src/inference/health.ts'
import { readShelf } from '../src/inference/shelf.ts'
import type { LoadedRegistry } from '../src/inference/registry.ts'
import { MINIMAL_CAPS } from '../src/inference/caps.ts'
import type { InferenceRow } from '../src/types/inference.ts'

/** A socket that accepts and says nothing, which is all a TCP probe ever needs. */
async function listener(): Promise<{ port: number; close: () => Promise<void> }> {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (typeof address === 'string' || !address) throw new Error('no port')
  return {
    port: address.port,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

/** One HTTP answer, at a real port. The status is the whole point: what an http row must survive
 *  is a stranger on its address, and a stranger is only distinguishable by what it says. */
async function answerer(
  status: number, headers: Record<string, string> = {},
): Promise<{ port: number; close: () => Promise<void> }> {
  const server = httpServer((_req, res) => { res.writeHead(status, headers); res.end('nope') })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (typeof address === 'string' || !address) throw new Error('no port')
  return {
    port: address.port,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

const registryOf = (...rows: InferenceRow[]): LoadedRegistry => ({
  rows,
  source: new Map(rows.map((r) => [r.id, 'shipped' as const])),
  patched: new Map(),
  patchedEngines: new Map(),
  patchedWorkflows: new Map(),
  layers: [],
  issues: [],
})

test('an endpoint that accepts is ready; one that refuses is down', async () => {
  const { port, close } = await listener()
  assert.equal((await tcpProbe('127.0.0.1', port, 500)).state, 'ready')
  await close()

  const refused = await tcpProbe('127.0.0.1', port, 500)
  assert.equal(refused.state, 'down')
  assert.match(refused.detail ?? '', /nothing is listening/)
})

// ⚠️ THE ONE THIS EXISTS FOR. rembg's port is shared with macOS AirPlay Receiver, which answers
// 403 to everything — so for months a dead daemon read READY off an open socket while every
// cutout came back refused. An http row is asked a question, and a refusal is not an answer.
test('an http row is DOWN when something else holds the port, even though the socket opens',
  async () => {
    const { port, close } = await answerer(403, { server: 'AirTunes/865.7.1' })
    try {
      const url = `http://127.0.0.1:${port}/api/remove`
      assert.equal((await tcpProbe('127.0.0.1', port, 500)).state, 'ready')   // the old lie
      const probe = await httpProbe(url, 500)
      assert.equal(probe.state, 'down')
      assert.match(probe.detail ?? '', /AirTunes/)
    } finally {
      await close()
    }
  })

// A service saying "not like that" is a service. rembg answers 422 to a GET with no `url`, and
// treating any non-refusal as ready is what keeps this check from needing a per-tool health path.
test('an http row that answers at all is ready, whatever it thinks of the question', async () => {
  const { port, close } = await answerer(422)
  try {
    assert.equal((await httpProbe(`http://127.0.0.1:${port}/api/remove`, 500)).state, 'ready')
  } finally {
    await close()
  }
  const gone = await httpProbe(`http://127.0.0.1:${port}/api/remove`, 500)
  assert.equal(gone.state, 'down')
  assert.match(gone.detail ?? '', /nothing is listening/)
})

test('a probe that cannot reach an answer is `unknown`, never `not-installed`', async () => {
  // 203.0.113.0/24 is TEST-NET-3: reserved, routed nowhere, so this can only time out. No
  // packet reaches anything that exists, which is what makes it a network-free test of a
  // timeout rather than a network test.
  const probe = await tcpProbe('203.0.113.1', 9, 150)
  assert.equal(probe.state, 'unknown')
  assert.notEqual(probe.state, 'not-installed')
})

test('the shelf reports effective caps, and says when they are the minimum', async () => {
  const { port, close } = await listener()
  try {
    const rows = await readShelf(registryOf(
      {
        id: 'declared',
        transport: { kind: 'grpc', host: '127.0.0.1', port },
        health: { kind: 'tcp', timeoutMs: 500 },
        caps: {
          negatives: true, idiom: 'prose', words: [20, 120], resolution: [512, 1536],
          stepsLocked: null, batch: true,
        },
      },
      {
        id: 'silent',
        transport: { kind: 'grpc', host: '127.0.0.1', port },
        health: { kind: 'tcp', timeoutMs: 500 },
      },
    ))
    const [declared, silent] = rows
    assert.equal(declared?.state, 'ready')
    assert.equal(declared?.capsDeclared, true)
    assert.equal(declared?.caps.batch, true)
    // An engine that claims nothing gets the minimum — and the shelf shows the minimum, not a
    // tidier version of it.
    assert.equal(silent?.capsDeclared, false)
    assert.deepEqual(silent?.caps, MINIMAL_CAPS)
  } finally {
    await close()
  }
})

test('a builtin row is never missing — that is the whole point of the mode', async () => {
  const [cutout] = await readShelf(registryOf({
    id: 'cutout',
    tiers: [{ id: 'flood-fill', launch: { mode: 'builtin' } }],
  }))
  assert.equal(cutout?.state, 'ready')
  assert.equal(cutout?.tier, 'flood-fill')
  assert.equal(cutout?.role, 'generator')
  assert.equal(cutout?.endpoint, null)
})

test('a row with nothing to probe says so instead of guessing', async () => {
  const [row] = await readShelf(registryOf({ id: 'mystery' }))
  assert.equal(row?.state, 'unknown')
  assert.match(row?.detail ?? '', /nothing to check/)
})

test('⚠️ THE SHIPPED REGISTRY CARRIES NOTHING AT ALL', async () => {
  // This assertion has been walked back twice, and each time the answer was "less". It once
  // required the Draw Things row to describe four checkpoints. Then (2026-08-16) the checkpoints
  // moved to xoko.lat and what ships was the ROW — transport, probe, platforms, fallback caps —
  // on the argument that a row is FORMAT rather than content.
  //
  // ⚠️ THAT ARGUMENT IS RETIRED (2026-08-20). What this build can SPEAK is code — the presets, the
  // brain whitelist, and the parser that refuses anything else — and no row was ever needed to
  // state it. What a row actually says is "you have pointed me at this", which is a choice and is
  // yours. Six shipped rows meant a cleared install showed six services, four of them for software
  // the user may not own, one of them answering and reporting nine checkpoints. THE APP COMES
  // EMPTY means empty: no services, no engines, no workflows, nothing.
  //
  // Everything arrives through ＋ (SERVICE_PRESETS) or ⤓ (the library), and both write YOUR layer.
  const { readShippedRows } = await import('../src/inference/registry.ts')
  const { resolveRoots } = await import('../src/paths.ts')
  assert.deepEqual(await readShippedRows(resolveRoots()), [])

  // ⚠️ AND THE MERGE STILL LOADS CLEAN. An empty shipped layer is a file that still has to parse —
  // `registry.rows` is shipped ← whatever this machine has taken, so on a used machine this is not
  // empty, and that is the point: everything in it was put there.
  const { loadInferenceRegistry } = await import('../src/inference/registry.ts')
  assert.deepEqual((await loadInferenceRegistry(resolveRoots())).issues, [])
})

test('the guide travels with the row, and a row without one says null rather than nothing', async () => {
  // The card decides WHERE to show it from the state; that it is there at all is this row's job.
  const [withGuide, without] = await readShelf(registryOf(
    {
      id: 'draw-things-grpc',
      transport: { kind: 'grpc', host: '127.0.0.1', port: 1 },
      health: { kind: 'tcp', timeoutMs: 200 },
      help: '/guides/draw-things.html',
    },
    {
      id: 'bare',
      transport: { kind: 'grpc', host: '127.0.0.1', port: 1 },
      health: { kind: 'tcp', timeoutMs: 200 },
    },
  ))
  assert.equal(withGuide?.help, '/guides/draw-things.html')
  assert.equal(without?.help, null)
})
