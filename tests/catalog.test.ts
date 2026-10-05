// WHAT A SERVICE CAN BE ASKED — and, more to the point, what it CANNOT be asked without that
// being reported as a fault.
//
// Localhost only: `npm run check` must never touch the network (PLAN §14). Nothing here opens a
// socket at all — the branches under test are the ones that answer before any transport is used.

import assert from 'node:assert/strict'
import test from 'node:test'

import { forgetCatalog, readCatalog, serviceFiles } from '../src/inference/catalog.ts'
import type { InferenceRow } from '../src/types/inference.ts'

const row = (id: string, transport: NonNullable<InferenceRow['transport']>): InferenceRow =>
  ({ id, transport })

test('⚠️ a service with no catalog protocol is UNASKED, not broken', async () => {
  // THE BUG THAT COST A WHOLE CONVERSATION (2026-08-23). ComfyUI was running, answering on 8188
  // and `ready` on the shelf. This path still wrote `comfyui has no reachable gRPC endpoint to
  // ask` into its catalog, because everything that was not grpc fell through one branch whose
  // message named the one protocol the row had never claimed to speak.
  //
  // That string is not cosmetic: `src/xoko/here.ts` reads `catalog.error` as its reachability
  // test, so the map told xoko `music — NOT YET … the service is not answering. Nothing here can
  // run until it is up`. It then refused to attempt a render five times in a row — correctly,
  // given what it had been told, and every one of those turns was spent on a machine that would
  // have rendered.
  for (const kind of ['comfy', 'http'] as const) {
    forgetCatalog()
    const view = await readCatalog(row('graph', { kind, host: '127.0.0.1', port: 8188 }))
    assert.equal(view.error, null, `${kind} reported a failure for having nothing to ask`)
    // ⚠️ AND `null`, NOT `[]`. "I never asked" and "it has none" are different answers, and the
    // requirements check must claim nothing on the strength of a probe that did not happen — a
    // workflow marked `declared` is a workflow the picker drops.
    assert.equal(view.engines, null)
    assert.equal(view.askedAt, null)
    const files = serviceFiles('graph')
    assert.equal(files.loras, null)
    assert.equal(files.controlNets, null)
  }
})

test('a gRPC row that genuinely cannot be asked says which of the two reasons it is', async () => {
  forgetCatalog()
  const auto = await readCatalog(row('dt', { kind: 'grpc', host: '127.0.0.1', port: 'auto' }))
  assert.match(auto.error ?? '', /no fixed port/, 'a port found per render is not a fault')
  assert.doesNotMatch(auto.error ?? '', /not answering/)
})

test('a command has nothing to ask and that is not a failure either', async () => {
  forgetCatalog()
  const view = await readCatalog(row('claude-code', { kind: 'cli', brain: 'claude' }))
  assert.equal(view.error, null)
  assert.equal(view.engines, null)
})
