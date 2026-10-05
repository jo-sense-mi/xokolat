// The MODEL layer: declared facts × what the engine actually has.
//
// The bug these exist to keep fixed is one concrete render: the registry says Draw Things locks
// nothing (true), the ⚙ band defaulted to 4 steps (true of klein), and SDXL therefore rendered
// at 4. Every test here is a version of "which of the two levels is this fact on".

import assert from 'node:assert/strict'
import test from 'node:test'

import { MINIMAL_CAPS } from '../src/inference/caps.ts'
import { capsFor, defaultEngineFile, resolveEngines } from '../src/inference/engines.ts'
import type { CatalogEngine } from '../src/inference/engines.ts'
import { mergeParams } from '../src/inference/params.ts'
import type { Caps } from '../src/types/caps.ts'
import type { InferenceRow } from '../src/types/inference.ts'
import type { GenerationRequest } from '../src/types/request.ts'

const ENGINE_CAPS: Caps = {
  negatives: true,
  idiom: 'prose',
  words: [20, 120],
  resolution: [512, 1536],
  stepsLocked: null,
  batch: false,
}

const row: InferenceRow = {
  id: 'draw-things-grpc',
  caps: ENGINE_CAPS,
  defaults: { sampler: 'Euler A Trailing' },
  engines: [
    {
      file: 'klein.ckpt',
      label: 'klein',
      default: true,
      caps: { stepsLocked: 4, negatives: false },
      params: { steps: 4, cfg: 1 },
    },
    {
      file: 'sdxl.ckpt',
      label: 'SDXL',
      caps: { idiom: 'tags' },
      params: { steps: 16, cfg: 5 },
    },
    { file: 'gone.ckpt', label: 'not here' },
  ],
}

const catalog = (...files: string[]): CatalogEngine[] =>
  files.map((file) => ({ file, name: null, version: 'v', builtin: false }))

test('a model NARROWS its engine — and only where it said so', () => {
  const caps = capsFor(row, 'klein.ckpt')
  assert.equal(caps.stepsLocked, 4, 'the step lock is a checkpoint fact')
  assert.equal(caps.negatives, false)
  // Everything the model did not mention is still the engine's.
  assert.deepEqual(caps.resolution, ENGINE_CAPS.resolution)
  assert.equal(caps.idiom, 'prose')
})

test('the same engine serves a checkpoint that locks nothing and wants tags', () => {
  const caps = capsFor(row, 'sdxl.ckpt')
  assert.equal(caps.stepsLocked, null, 'THE bug: 4 steps is klein, not Draw Things')
  assert.equal(caps.idiom, 'tags')
  assert.equal(caps.negatives, true, 'inherited — SDXL really does have a negative branch')
})

test('a model nobody described gets the engine, never a guess from its name', () => {
  assert.deepEqual(capsFor(row, 'flux_something_4step.ckpt'), ENGINE_CAPS)
  assert.deepEqual(capsFor({ id: 'bare' }, 'anything.ckpt'), MINIMAL_CAPS)
})

test('three states, and "declared" is not "installed"', () => {
  const models = resolveEngines(row, catalog('klein.ckpt', 'stranger.ckpt'))
  const by = Object.fromEntries(models.map((m) => [m.file, m]))
  assert.equal(by['klein.ckpt']?.state, 'known')
  assert.equal(by['stranger.ckpt']?.state, 'discovered')
  assert.equal(by['gone.ckpt']?.state, 'declared', 'described here, absent there')
  assert.equal(by['sdxl.ckpt']?.state, 'declared')
  assert.equal(by['stranger.ckpt']?.capsDeclared, false)
})

test('an unaskable catalog is not an empty one', () => {
  const models = resolveEngines(row, null)
  assert.equal(models.length, 3, 'the declared rows are still a real answer')
  // ⚠️ `known`, NOT `declared` (2026-08-12). `declared` means "described, and this machine does not
  // have it" — a claim only a catalog can support. With no catalog nothing is known to be absent,
  // and calling every row absent took every workflow on a service that cannot be catalogued (which is
  // every transport but gRPC) out of the picker entirely.
  assert.ok(models.every((m) => m.state === 'known'))
  // …and the declared preference still stands, for the same reason.
  assert.equal(defaultEngineFile(row, null), 'klein.ckpt')
})

// ⚠️ WHAT AN ENGINE IS FOR IS NOT TESTED HERE ANY MORE (2026-08-08). It was — three tests over a
// `tasksOf` that derived `make · vary · edit` from the caps on this row — and both halves of that
// were wrong: the vocabulary was invented (nobody says "vary") and the OWNER was wrong, because
// plain SDXL takes no style reference while SDXL plus an IP-Adapter does, and they are one file.
// What can be asked for is a WORKFLOW, and it is tested in tests/workflows.test.ts.

test('a checkpoint you described is pickable on a service nothing can be asked of', () => {
  // Nothing is marked default, and the catalog cannot be read — which is EVERY service but Draw
  // Things today, because nothing else speaks a catalog request. Refusing to pick a `declared`
  // row here means a service you described by hand renders nothing, however carefully.
  const mine: InferenceRow = {
    id: 'comfyui-local', caps: ENGINE_CAPS,
    engines: [{ file: 'a.safetensors' }, { file: 'b.safetensors' }],
  }
  assert.equal(defaultEngineFile(mine, null), 'a.safetensors')
  // But an engine that CAN be asked and says it has neither still offers nothing.
  assert.equal(defaultEngineFile(mine, catalog()), null)
})

test('the editor is handed the raw declaration, never the resolved one', () => {
  const [klein, , gone] = resolveEngines(row, catalog('klein.ckpt'), new Map(), new Set(['klein.ckpt']))
  assert.equal(klein?.mine, true, 'this description is in your layer')
  assert.equal(gone?.mine, false)
  // ⚠️ THE PATCH, not the seven resolved values. The editor posts these back, so handing it the
  // resolved set would declare every checkpoint to be whatever its service said that day — and
  // freeze that answer the moment it was saved.
  assert.deepEqual(klein?.declared?.caps, { stepsLocked: 4, negatives: false })
  assert.equal(klein?.caps.idiom, 'prose', 'while the RESOLVED one still inherits the service’s')
  const [stranger] = resolveEngines({ id: 'bare' }, catalog('stranger.ckpt'))
  assert.equal(stranger?.declared, null, 'nobody described it')
  assert.equal(stranger?.mine, false)
})

test('a default nothing can render is not a default', () => {
  assert.equal(defaultEngineFile(row, catalog('klein.ckpt', 'sdxl.ckpt')), 'klein.ckpt')
  assert.equal(defaultEngineFile(row, catalog('sdxl.ckpt')), 'sdxl.ckpt', 'falls to a known one')
  assert.equal(defaultEngineFile(row, catalog('stranger.ckpt')), 'stranger.ckpt', 'then to anything present')
  assert.equal(defaultEngineFile(row, catalog()), null)
})

test('the model sits BETWEEN the engine and the request', () => {
  const request: GenerationRequest = {
    medium: 'image', text: 'a cat', inference: [{ id: row.id }], params: { cfg: 9 },
  }
  const params = mergeParams(row, request, { id: row.id }, 'sdxl.ckpt')
  assert.equal(params['steps'], 16, 'the model brought its own')
  assert.equal(params['cfg'], 9, 'but the request still wins')
  assert.equal(params['sampler'], 'Euler A Trailing', 'and the engine default survives untouched')
  assert.equal(params['model'], 'sdxl.ckpt', 'the resolved model is written in explicitly')
})

test("a per-engine bag beats the request's shared one", () => {
  const request: GenerationRequest = {
    medium: 'image', text: 'a cat', inference: [{ id: row.id }], params: { steps: 30 },
  }
  const params = mergeParams(row, request, { id: row.id, params: { steps: 8 } }, 'sdxl.ckpt')
  assert.equal(params['steps'], 8)
})
