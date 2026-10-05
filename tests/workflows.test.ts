// WORKFLOWS — what a service can be asked for, which is the thing a person picks.
//
// This file replaces the three tests that used to derive `make · vary · edit` from a checkpoint's
// caps. Both halves of that were wrong: the vocabulary was invented, and the OWNER was wrong.
// Every test here is a version of "which level is this fact on".

import assert from 'node:assert/strict'
import test from 'node:test'

import type { CatalogEngine } from '../src/inference/engines.ts'
import { resolveWorkflows, workflowFor } from '../src/inference/workflows.ts'
import { parseInferenceRow } from '../src/inference/registry.ts'
import { ctx } from '../src/validate.ts'
import type { Caps } from '../src/types/caps.ts'
import type { InferenceRow } from '../src/types/inference.ts'

const SERVICE_CAPS: Caps = {
  negatives: true, idiom: 'prose', words: [20, 120], resolution: [512, 1536],
  stepsLocked: null, batch: false,
}

const row: InferenceRow = {
  id: 'draw-things-grpc',
  caps: SERVICE_CAPS,
  engines: [
    {
      file: 'klein.ckpt', label: 'klein', default: true,
      caps: { stepsLocked: 4, negatives: false }, params: { steps: 4, cfg: 1 },
    },
    { file: 'kontext.ckpt', label: 'Kontext', params: { steps: 28, guidanceEmbed: 2.5 } },
  ],
  workflows: [
    { slug: 'klein-t2i', kind: 't2i', model: 'klein.ckpt', inputs: ['prompt'] },
    {
      slug: 'klein-i2i', kind: 'i2i', model: 'klein.ckpt', inputs: ['prompt', 'ref'],
      params: { strength: 0.65 },
    },
    {
      slug: 'kontext', label: 'Kontext edit', kind: 'edit', model: 'kontext.ckpt',
      inputs: ['prompt', 'ref'], params: { strength: 1, imageGuidance: 1.5 },
    },
  ],
}

const catalog = (...files: string[]): CatalogEngine[] =>
  files.map((file) => ({ file, name: null, version: 'v', builtin: false }))

const bySlug = (row_: InferenceRow, cat: CatalogEngine[] | null) =>
  Object.fromEntries(resolveWorkflows(row_, cat).map((w) => [w.slug, w]))

test('ONE checkpoint, TWO workflows — which is the whole reason this layer exists', () => {
  const all = bySlug(row, catalog('klein.ckpt', 'kontext.ckpt'))
  assert.equal(all['klein-t2i']?.model, 'klein.ckpt')
  assert.equal(all['klein-i2i']?.model, 'klein.ckpt')
  // ⚠️ THE SAME FILE, ASKED TWO DIFFERENT THINGS. There is no way to say this on the checkpoint:
  // "takes a picture" would be true of one row and false of the other, and they are one file.
  assert.deepEqual(all['klein-t2i']?.slots, [])
  assert.deepEqual(all['klein-i2i']?.slots, ['ref'])
})

test('the kind is DECLARED, because the inputs cannot tell you', () => {
  const all = bySlug(row, catalog('klein.ckpt', 'kontext.ckpt'))
  // Identical inputs, different jobs: i2i re-noises the picture and follows a description,
  // Kontext reads it as context and follows an instruction. Nothing about `[prompt, ref]` says so.
  assert.deepEqual(all['klein-i2i']?.inputs, all['kontext']?.inputs)
  assert.equal(all['klein-i2i']?.kind, 'i2i')
  assert.equal(all['kontext']?.kind, 'edit')
})

test('the workflow wins over the checkpoint, and the checkpoint still brings its own', () => {
  const all = bySlug(row, catalog('klein.ckpt', 'kontext.ckpt'))
  // 28 steps is the FILE's; strength 1 is the WORKFLOW's. Both arrive without anyone typing either.
  assert.equal(all['kontext']?.params['steps'], 28)
  assert.equal(all['kontext']?.params['strength'], 1)
  assert.equal(all['kontext']?.params['imageGuidance'], 1.5)
  // …and the same file under a different workflow would carry a different strength.
  assert.equal(all['klein-i2i']?.params['strength'], 0.65)
  assert.equal(all['klein-i2i']?.params['steps'], 4, 'klein locks 4, whatever it is asked for')
  // Caps stay the checkpoint's: how a prompt is written is a fact about the file.
  assert.equal(all['klein-t2i']?.caps.stepsLocked, 4)
  assert.equal(all['klein-t2i']?.caps.negatives, false)
})

test('a checkpoint nobody wrote a workflow for is offered NOTHING', () => {
  // ⚠️ THE WHOLE POINT (2026-08-20). `stranger.ckpt` is on the machine and the service reports it,
  // and that buys it a place on 🔌 and nothing else. A file on a disk is not a decision to be able
  // to make pictures with it — the app used to invent a `t2i` workflow here, and the symptom was a
  // freshly cleared install that armed itself the moment Draw Things was running.
  const all = bySlug(row, catalog('klein.ckpt', 'kontext.ckpt', 'stranger.ckpt'))
  assert.equal(all['t2i:stranger.ckpt'], undefined)
  assert.equal(Object.keys(all).filter((s) => s.startsWith('t2i:')).length, 0)
  // The declared ones are all that is left, and they are untouched by the catalog growing.
  assert.ok(all['klein-t2i'], 'a workflow somebody wrote still resolves')
})

test('a service with a catalog and no workflows resolves to none', () => {
  // A FRESH INSTALL, in one assertion: six checkpoints reported, nothing written about any of
  // them, nothing to press. Everything runnable arrives through ⤓ or ＋.
  const bare = { ...row, workflows: [] }
  assert.deepEqual(resolveWorkflows(bare, catalog('klein.ckpt', 'kontext.ckpt', 'stranger.ckpt')), [])
})

test('the default is one that needs nothing attached', () => {
  const all = resolveWorkflows(row, catalog('klein.ckpt', 'kontext.ckpt'))
  // ⚠️ BY KIND, BECAUSE THERE IS ONE DEFAULT PER KIND NOW (2026-08-24). One per SERVICE was right
  // while a service meant a medium; ComfyUI is one row answering seven, and six of them were
  // falling through to install order. `find(isDefault)` would now answer whichever kind sorts
  // first, which is not a question anybody is asking.
  const chosen = all.find((w) => w.isDefault && w.kind === 't2i')
  // ⚠️ NOT SIMPLY THE FIRST ROW, and not the registry's favourite checkpoint if that checkpoint
  // only edits: a default that needs a picture makes a fresh install's first press an error.
  assert.equal(chosen?.slug, 'klein-t2i')
  assert.deepEqual(chosen?.slots, [])

  // With only the editor installed there is nothing safe to default to, and that is said rather
  // than papered over with a workflow that cannot run.
  const editorOnly = resolveWorkflows(row, catalog('kontext.ckpt'))
  assert.equal(editorOnly.find((w) => w.isDefault), undefined)
})

test('a workflow for a checkpoint the machine does not have is listed, never picked', () => {
  const all = bySlug(row, catalog('klein.ckpt'))
  assert.equal(all['kontext']?.state, 'declared', 'described here, absent there')
  assert.equal(all['kontext']?.isDefault, false)
  assert.equal(all['klein-t2i']?.state, 'known')
})

test('a request naming no workflow gets the default; one naming a stranger gets nothing', () => {
  const cat = catalog('klein.ckpt', 'kontext.ckpt')
  assert.equal(workflowFor(row, cat, null)?.slug, 'klein-t2i')
  assert.equal(workflowFor(row, cat, 'kontext')?.model, 'kontext.ckpt')
  // Refused rather than resolved to something else: a press that quietly ran a different workflow
  // than the one on screen is the worst possible outcome here.
  assert.equal(workflowFor(row, cat, 'no-such-thing'), null)
})

test('the label falls back to the checkpoint, because the kind is already a column', () => {
  const all = bySlug(row, catalog('klein.ckpt', 'kontext.ckpt'))
  assert.equal(all['klein-t2i']?.label, 'klein', 'no need to repeat the kind in the name')
  assert.equal(all['kontext']?.label, 'Kontext edit', 'but a workflow may name itself')
})

test('a workflow naming a checkpoint nothing describes is `declared`, never dropped', () => {
  // ⚠️ A TYPO IN `model` IS INVISIBLE OTHERWISE: the workflow resolves to `declared`, quietly leaves
  // the picker, and looks exactly like a checkpoint you have not downloaded.
  //
  // This test used to sweep the SHIPPED registry for that typo. There are no shipped workflows any
  // more (2026-08-16) — they are published at xoko.lat, and the sweep moved with them: the site's
  // `check.mjs` refuses to publish a workflow whose `model` no engine row in the same file
  // describes. Here, where a workflow can now arrive from anywhere, what matters is the BEHAVIOUR:
  // an unrecognised checkpoint is listed and unusable rather than silently absent.
  const stranger: InferenceRow = {
    ...row,
    workflows: [{ slug: 'typo', kind: 't2i', model: 'kleim.ckpt', inputs: ['prompt'] }],
  }
  const [only] = resolveWorkflows(stranger, catalog('klein.ckpt'))
  assert.equal(only?.slug, 'typo')
  assert.equal(only?.state, 'declared', 'listed, and never picked')
  assert.deepEqual(only?.missing, [{ what: 'model', file: 'kleim.ckpt' }],
    'and it says the filename, which is how you see the typo')
})

// ── what a workflow needs, and has not got ──────────────────────────────────────────────────
//
// The requirements check. It only became possible to be missing something
// once a workflow could name more than a checkpoint.

const withControls: InferenceRow = {
  ...row,
  workflows: [
    ...(row.workflows ?? []),
    {
      slug: 'style-ref', kind: 'style', model: 'klein.ckpt', inputs: ['prompt', 'look'],
      controls: [{ file: 'adapter.ckpt', from: 'look', inputType: 'Shuffle', weight: 0.8 }],
    },
    {
      slug: 'fast', kind: 't2i', model: 'klein.ckpt', inputs: ['prompt'],
      loras: [{ file: 'four-step.ckpt' }],
    },
  ],
}

const need = (files: { controlNets: string[] | null; loras: string[] | null }) =>
  Object.fromEntries(resolveWorkflows(
    withControls, catalog('klein.ckpt', 'kontext.ckpt'), new Map(), new Set(), files,
  ).map((w) => [w.slug, w.missing]))

test('a workflow needs its control and LoRA files, not only its checkpoint', () => {
  const missing = need({ controlNets: ['something-else.ckpt'], loras: [] })
  assert.deepEqual(missing['style-ref'], [{ what: 'control', file: 'adapter.ckpt' }])
  assert.deepEqual(missing['fast'], [{ what: 'lora', file: 'four-step.ckpt' }])
  // …and a workflow that needs nothing but its checkpoint is unaffected by any of it.
  assert.deepEqual(missing['klein-t2i'], [])
})

test('everything present is nothing missing', () => {
  const missing = need({ controlNets: ['adapter.ckpt'], loras: ['four-step.ckpt'] })
  assert.deepEqual(missing['style-ref'], [])
  assert.deepEqual(missing['fast'], [])
})

test('a service nobody could ask claims nothing is missing', () => {
  // ⚠️ ABSENT EVIDENCE IS NOT EVIDENCE OF ABSENCE — the same rule the checkpoint layer follows.
  // A timed-out catalog must not take every control workflow out of the picker.
  const missing = need({ controlNets: null, loras: null })
  assert.deepEqual(missing['style-ref'], [])
  assert.deepEqual(missing['fast'], [])
})

test('the missing checkpoint is still the first thing named', () => {
  const missing = need({ controlNets: [], loras: [] })
  assert.deepEqual(resolveWorkflows(
    { ...withControls, workflows: [{ slug: 'gone', kind: 't2i', model: 'nope.ckpt', inputs: ['prompt'] }] },
    catalog('klein.ckpt'), new Map(), new Set(), { controlNets: [], loras: [] },
  )[0]?.missing, [{ what: 'model', file: 'nope.ckpt' }])
  assert.deepEqual(missing['style-ref'], [{ what: 'control', file: 'adapter.ckpt' }])
})

test('a workflow that cannot run is never the default', () => {
  // The default is what a press with nothing chosen uses; one whose adapter is absent would be a
  // fresh install where ▶ renders a picture that quietly ignored the workflow.
  const all = resolveWorkflows(
    { ...withControls, workflows: [{
      slug: 'only-one', kind: 't2i', model: 'klein.ckpt', inputs: ['prompt'],
      loras: [{ file: 'four-step.ckpt' }],
    }] },
    catalog('klein.ckpt'), new Map(), new Set(), { controlNets: [], loras: [] })
  assert.equal(all.find((w) => w.isDefault), undefined)
})

/**
 * ⚠️ ONE SERVICE, SEVEN MEDIA — the shape that broke the old rule (2026-08-24). A default used to
 * be one workflow for a whole row, filtered to the row's "plain kind", which was sound while a
 * service meant a medium. ComfyUI is a single row answering every medium in the app, so six of the
 * seven got no considered default at all and fell through to install order in the browser.
 */
const multi: InferenceRow = {
  id: 'comfyui',
  caps: SERVICE_CAPS,
  engines: [{ file: 'a.ckpt', label: 'a' }, { file: 'b.ckpt', label: 'b' }],
  workflows: [
    // Taken first, and the wrong answer — the music graph doing sound.
    { slug: 'ambience', kind: 't2s', model: 'a.ckpt', inputs: ['prompt'] },
    { slug: 'stable-audio', kind: 't2s', default: true, model: 'b.ckpt', inputs: ['prompt'] },
    // Taken first, and unpressable by words — this is the one that answered a request for a cat
    // with "attach a picture first".
    { slug: 'trace', kind: 'vectorize', model: 'a.ckpt', inputs: ['ref'] },
    { slug: 'draw', kind: 't2vec', model: 'a.ckpt', inputs: ['prompt'] },
    // Every workflow of this kind needs a picture, so the runnable rule can never choose one.
    { slug: 'mesh', kind: 'i23d', default: true, model: 'a.ckpt', inputs: ['ref'] },
  ],
}

test('every kind gets its own default — one per service was a service being a medium', () => {
  const all = resolveWorkflows(multi, catalog('a.ckpt', 'b.ckpt'))
  const starred = all.filter((w) => w.isDefault).map((w) => w.slug).sort()
  assert.deepEqual(starred, ['draw', 'mesh', 'stable-audio'])
})

test('⚠️ what the catalog SAYS beats what was installed first', () => {
  const all = resolveWorkflows(multi, catalog('a.ckpt', 'b.ckpt'))
  const sound = all.filter((w) => w.kind === 't2s')
  assert.equal(sound.find((w) => w.isDefault)?.slug, 'stable-audio',
    'the model built for sound, not the music graph that happened to be taken first')
  assert.equal(sound[0]?.slug, 'ambience', 'and it is genuinely not first in the list')
})

test('a declared default is honoured even when it needs a picture — nothing is ignored silently', () => {
  const all = resolveWorkflows(multi, catalog('a.ckpt', 'b.ckpt'))
  // The runnable rule exists so a first press is not an error. A kind where EVERY workflow takes an
  // attachment has no error-free option, so the catalog's word stands rather than being dropped.
  assert.equal(all.find((w) => w.kind === 'i23d')?.isDefault, true)
})

test('a kind offering words AND a picture defaults to the one you can type', () => {
  const both: InferenceRow = {
    ...multi,
    workflows: [
      { slug: 'needs-a-picture', kind: 't2v', model: 'a.ckpt', inputs: ['prompt', 'ref'] },
      { slug: 'takes-words', kind: 't2v', model: 'a.ckpt', inputs: ['prompt'] },
    ],
  }
  const all = resolveWorkflows(both, catalog('a.ckpt'))
  assert.equal(all.find((w) => w.isDefault)?.slug, 'takes-words')
})

// ── a control that names no file ──────────────────────────────────────────────────────────────

test('⚠️ a control with NO file is the model\'s own channel, and parses', () => {
  const c = ctx('a test registry')
  const parsed = parseInferenceRow(c, {
    id: 'dt', label: 'DT', role: 'generator',
    transport: { kind: 'grpc', host: '127.0.0.1', port: 7859 },
    workflows: [{
      slug: 'klein-moodboard', kind: 'ref', model: 'flux_2_klein_4b_i8x.ckpt', lineage: 'flux-2',
      inputs: ['prompt', 'ref'],
      controls: [{ from: 'ref', inputType: 'Shuffle' }],
    }],
  }, 'row')
  assert.deepEqual(c.issues, [], 'a fileless control is not an issue')
  const control = parsed?.workflows?.[0]?.controls?.[0]
  assert.equal(control?.file, undefined, 'no file survives as no file')
  assert.equal(control?.inputType, 'Shuffle')
})

test('a control with no file can never be reported as a missing download', () => {
  // klein reads a reference through its own moodboard channel — there is nothing to install, so a
  // server reporting an EMPTY control list must still leave the workflow ready. Anything else would
  // hold it at not-ready forever, waiting for a file that does not exist.
  const moodboard: InferenceRow = {
    ...row,
    workflows: [{
      slug: 'klein-moodboard', kind: 'ref', model: 'klein.ckpt', inputs: ['prompt', 'ref'],
      controls: [{ from: 'ref', inputType: 'Shuffle' }],
    }],
  }
  const all = bySlug(moodboard, catalog('klein.ckpt'))
  assert.deepEqual(all['klein-moodboard']?.missing ?? [], [])
  assert.deepEqual(all['klein-moodboard']?.slots, ['ref'])
})
