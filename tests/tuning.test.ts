// YOUR NUMBERS OVER THE SHIPPED ONES — the sparse patch, and the two properties that make ↺
// trivial rather than a feature: only moved fields are stored, and an empty entry is removed.
//
// The thing being defended is a specific way for a settings file to rot: a UI that "saves the
// current values" writes 16 for a knob nobody touched, and the day the registry ships 18 that
// entry silently holds the old number forever. Nothing here ever writes a value you did not move.

import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { capsFor, resolveEngines } from '../src/inference/engines.ts'
import { mergeParams } from '../src/inference/params.ts'
import {
  TUNING_FILE, TuningError, checkPatch, readTuning, tunedByFile, tunedFor, tuningKey, writeTuning,
} from '../src/inference/tuning.ts'
import type { Roots } from '../src/paths.ts'
import type { Caps } from '../src/types/caps.ts'
import type { InferenceRow } from '../src/types/inference.ts'
import type { GenerationRequest } from '../src/types/request.ts'

const ENGINE_CAPS: Caps = {
  negatives: true, idiom: 'prose', words: [20, 120], resolution: [512, 1536],
  stepsLocked: null, batch: false,
}

const row: InferenceRow = {
  id: 'draw-things-grpc',
  caps: ENGINE_CAPS,
  defaults: { sampler: 'Euler A Trailing' },
  engines: [
    {
      file: 'klein.ckpt', label: 'klein', default: true,
      caps: { stepsLocked: 4, negatives: false }, params: { steps: 4, cfg: 1 },
    },
    { file: 'sdxl.ckpt', label: 'SDXL', caps: { idiom: 'tags' }, params: { steps: 16, cfg: 5, sampler: 'DPM++ 2M AYS' } },
    { file: 'bare.ckpt', label: 'nothing declared' },
  ],
}

const SDXL = tuningKey(row.id, 'sdxl.ckpt')
const shipped = row.engines?.[1]?.params ?? {}
const sdxlCaps = capsFor(row, 'sdxl.ckpt')

async function library(): Promise<Roots> {
  const base = await mkdtemp(join(tmpdir(), 'xk-tune-'))
  return { content: join(base, 'lib'), data: join(base, 'data'), install: join(base, 'app') }
}
const scrap = (roots: Roots): Promise<void> =>
  rm(join(roots.data, '..'), { recursive: true, force: true })

// ── what may be moved ─────────────────────────────────────────────────────────────────────

test('you may set any knob this app knows how to send', () => {
  assert.deepEqual(checkPatch(shipped, sdxlCaps, 'image', { steps: 20 }),
    { set: { steps: 20 }, unset: [] })
  // ⚠️ NOT A PLACE TO INVENT A KNOB. What guards that is the app's own wire format, not whether a
  // registry row happened to mention it — see the note at the top of src/inference/knobs.ts.
  assert.throws(() => checkPatch(shipped, sdxlCaps, 'image', { refinerStart: 0.8 }), TuningError)
  // …and a value the knob cannot take is refused by the knob, not by the shipped value's type.
  assert.throws(() => checkPatch(shipped, sdxlCaps, 'image', { steps: 'lots' }), TuningError)
  assert.throws(() => checkPatch(shipped, sdxlCaps, 'image', { sampler: 'Bogus++' }), TuningError)
})

test('a checkpoint nobody described is still yours to tune', () => {
  // ⚠️ THE CASE THAT BROKE THE OLD RULE. On a service you added, EVERY checkpoint declares
  // nothing — and "you may only move what is declared" meant an editor with no fields, forever.
  assert.deepEqual(checkPatch({}, ENGINE_CAPS, 'image', { steps: 28, cfg: 3.5 }),
    { set: { steps: 28, cfg: 3.5 }, unset: [] })
  // A medium with no knob table has nothing to offer, and says so rather than accepting anything.
  assert.throws(() => checkPatch({}, ENGINE_CAPS, 'voice', { steps: 28 }), TuningError)
})

test('a knob only the registry knows about keeps the shape it shipped with', () => {
  // Declared for this checkpoint, unknown to this build: the shipped value is the only thing that
  // says what shape it is, so that is what it is held to.
  const exotic = { refinerStart: 0.8 }
  assert.deepEqual(checkPatch(exotic, sdxlCaps, 'image', { refinerStart: 0.5 }).set, { refinerStart: 0.5 })
  assert.throws(() => checkPatch(exotic, sdxlCaps, 'image', { refinerStart: 'late' }), TuningError)
})

test('a locked step count is a fact, not a preference', () => {
  const kleinShipped = row.engines?.[0]?.params ?? {}
  const kleinCaps = capsFor(row, 'klein.ckpt')
  assert.equal(kleinCaps.stepsLocked, 4)
  // Stored, it would be a setting every single render then refuses — applied-looking and inert.
  assert.throws(() => checkPatch(kleinShipped, kleinCaps, 'image', { steps: 20 }), TuningError)
  // Its OTHER numbers are still yours to move: the lock is about steps, not about the checkpoint.
  assert.deepEqual(checkPatch(kleinShipped, kleinCaps, 'image', { cfg: 1.5 }).set, { cfg: 1.5 })
})

test('a step count no render could accept is refused where it is typed', () => {
  assert.throws(() => checkPatch(shipped, sdxlCaps, 'image', { steps: 0 }), TuningError)
  assert.throws(() => checkPatch(shipped, sdxlCaps, 'image', { steps: 999 }), TuningError)
  assert.throws(() => checkPatch(shipped, sdxlCaps, 'image', { steps: 12.5 }), TuningError)
})

test('null is ↺ — the field is forgotten, never overwritten with the shipped value', () => {
  assert.deepEqual(checkPatch(shipped, sdxlCaps, 'image', { steps: null, cfg: 7 }),
    { set: { cfg: 7 }, unset: ['steps'] })
})

// ── the file ──────────────────────────────────────────────────────────────────────────────

test('only what you moved is stored, and resetting the last one removes the entry', async () => {
  const roots = await library()
  try {
    assert.deepEqual((await readTuning(roots)).byEngine.size, 0, 'no file is the normal case')

    await writeTuning(roots, SDXL, { set: { steps: 20 }, unset: [] })
    const stored = JSON.parse(await readFile(join(roots.data, TUNING_FILE), 'utf-8')) as {
      engines: Record<string, Record<string, unknown>>
    }
    // ⚠️ ONE KEY. `cfg` and `sampler` were never touched, so they are not here — which is what
    // makes a later change to the shipped numbers reach you.
    assert.deepEqual(stored.engines[SDXL], { steps: 20 })

    await writeTuning(roots, SDXL, { set: { cfg: 7 }, unset: [] })
    assert.deepEqual((await readTuning(roots)).byEngine.get(SDXL), { steps: 20, cfg: 7 })

    await writeTuning(roots, SDXL, { set: {}, unset: ['steps', 'cfg'] })
    const empty = JSON.parse(await readFile(join(roots.data, TUNING_FILE), 'utf-8')) as {
      engines: Record<string, unknown>
    }
    // "I reset all of them" and "I never touched this one" are the same state, so the file has
    // one spelling for it.
    assert.deepEqual(empty.engines, {})
    assert.equal((await readTuning(roots)).byEngine.size, 0)
  } finally {
    await scrap(roots)
  }
})

test('a patch is read back per service, and a stranger key is left alone', async () => {
  const roots = await library()
  try {
    await writeTuning(roots, SDXL, { set: { steps: 20 }, unset: [] })
    await writeTuning(roots, tuningKey('other-service', 'sdxl.ckpt'), { set: { cfg: 3 }, unset: [] })
    const tuning = await readTuning(roots)
    assert.deepEqual([...tunedByFile(tuning, row.id).keys()], ['sdxl.ckpt'])
    assert.deepEqual(tunedFor(tuning, row.id, 'sdxl.ckpt'), { steps: 20 })
    assert.deepEqual(tunedFor(tuning, row.id, 'klein.ckpt'), {}, 'untouched is empty, not absent')
    assert.deepEqual(tunedFor(tuning, row.id, null), {})
  } finally {
    await scrap(roots)
  }
})

// ── where it lands ────────────────────────────────────────────────────────────────────────

test('your number sits above the shipped one and below the sentence', () => {
  const request: GenerationRequest = { text: 'a cat', medium: 'image', inference: [{ id: row.id }] }
  const tuned = { steps: 20 }
  const params = mergeParams(row, request, { id: row.id }, 'sdxl.ckpt', tuned)
  assert.equal(params['steps'], 20, 'yours beats the shipped 16')
  assert.equal(params['cfg'], 5, 'and the shipped numbers you did not move are untouched')
  assert.equal(params['sampler'], 'DPM++ 2M AYS', 'including one that shadows the row default')

  // ⚠️ A DEFAULT NEVER OUTRANKS THE ASK. A knob set once is a preference; the request in hand is
  // a decision, and this is the layer order that says so.
  const asked = mergeParams(
    row, { ...request, params: { steps: 30 } }, { id: row.id }, 'sdxl.ckpt', tuned)
  assert.equal(asked['steps'], 30)
})

test('a chosen style beats a generic default and loses to a number you typed', () => {
  // ⚠️ THE LAYER THIS ADDS, AND WHY BOTH EDGES MATTER. A music genre carries its own tempo and key
  // (src/types/style.ts `params`). Below the engine's defaults it would never apply and the genre
  // picker would be decoration; above the request it would ignore the number typed for this press.
  // Get either edge wrong and one of the two controls stops working while both still look live.
  const request: GenerationRequest = { text: 'a cat', medium: 'image', inference: [{ id: row.id }] }
  const styled = { steps: 8, cfg: 2 }

  const withStyle = mergeParams(row, request, { id: row.id }, 'sdxl.ckpt', {}, styled)
  assert.equal(withStyle['steps'], 8, 'the style beats the shipped 16')
  assert.equal(withStyle['cfg'], 2)

  const tunedOver = mergeParams(row, request, { id: row.id }, 'sdxl.ckpt', { steps: 20 }, styled)
  assert.equal(tunedOver['steps'], 20, 'and the workflow pins what must not move')

  const asked = mergeParams(
    row, { ...request, params: { steps: 30 } }, { id: row.id }, 'sdxl.ckpt', {}, styled)
  assert.equal(asked['steps'], 30, 'and this press beats the style it was typed over')
})

test('the catalogue reports shipped, yours, and the effective merge separately', () => {
  const engines = resolveEngines(
    row, [{ file: 'sdxl.ckpt', name: null, version: 'v', builtin: false }],
    new Map([
      ['sdxl.ckpt', { steps: 20 }],
      // A checkpoint that declares nothing still runs at what you set it to.
      ['bare.ckpt', { steps: 12 }],
      // ⚠️ A HAND-EDITED KEY NOTHING CAN SEND IS DROPPED HERE TOO. The writer refuses it, but the
      // file is editable by hand and a knob nothing reads must not be drawn as though it were in
      // force.
      ['klein.ckpt', { refinerStart: 0.8 }],
    ]),
    // ⚠️ THE MEDIUM IS PASSED IN NOW (2026-09-06) — it used to sit on the row, and a service does
    // not claim one any more. It decides which knobs are movable at all, so `null` here would make
    // every tuned value below look hand-edited and out of force.
    new Set(), 'image',
  )
  const by = Object.fromEntries(engines.map((e) => [e.file, e]))
  assert.deepEqual(by['sdxl.ckpt']?.shipped, { steps: 16, cfg: 5, sampler: 'DPM++ 2M AYS' })
  assert.deepEqual(by['sdxl.ckpt']?.tuned, { steps: 20 })
  assert.equal(by['sdxl.ckpt']?.params['steps'], 20)
  assert.equal(by['sdxl.ckpt']?.params['cfg'], 5)
  // Nothing declared, so `shipped` is empty — and what you set is still in force.
  assert.deepEqual(by['bare.ckpt']?.shipped, {})
  assert.deepEqual(by['bare.ckpt']?.tuned, { steps: 12 })
  assert.deepEqual(by['bare.ckpt']?.params, { steps: 12 })
  assert.deepEqual(by['klein.ckpt']?.tuned, {}, 'a knob nothing can send is not in force')
})
