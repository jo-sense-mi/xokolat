// KINDS — the app's vocabulary of capabilities, as data.
//
// The thing worth testing here is not the parse: it is the SHAPE OF THE PROMISE. A kind registry
// that refused an unknown slug would be a closed union with extra steps, and the whole reason the
// list moved out of TypeScript is that a service can genuinely do something this build never heard
// of (NEXT.md — capability first).

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { kindsInPlay, mediaOf, parseKindsFile, soleMedium } from '../src/inference/kinds.ts'
import { resolveWorkflows } from '../src/inference/workflows.ts'
import type { InferenceRow } from '../src/types/inference.ts'
import { ctx } from '../src/validate.ts'

test('a kinds file is a slug and a line of prose', () => {
  const c = ctx('kinds')
  const kinds = parseKindsFile(c, {
    kinds: [{ slug: 't2i', face: 'from words alone' }, { slug: 'cutout', face: 'no words at all' }],
  })
  assert.deepEqual(c.issues, [])
  assert.deepEqual(kinds.map((k) => k.slug), ['t2i', 'cutout'])
})

test('a kind with no face is refused — an empty gloss is a row that explains nothing', () => {
  const c = ctx('kinds')
  parseKindsFile(c, { kinds: [{ slug: 'ref' }] })
  assert.equal(c.issues.length, 1)
})

test('two rows for one slug in one file is a mistake, not a preference', () => {
  const c = ctx('kinds')
  const kinds = parseKindsFile(c, {
    kinds: [{ slug: 'ref', face: 'one' }, { slug: 'ref', face: 'two' }],
  })
  assert.equal(kinds.length, 1)
  assert.match(c.issues.join(' '), /duplicate kind/)
})

test('a kind nobody described is drawn, not dropped', () => {
  const described = [{ slug: 't2i', face: 'from words alone' }, { slug: 'edit', face: 'changed' }]
  const inPlay = kindsInPlay(described, ['edit', 'upscale', 't2i'])
  // Described first, in the registry's order; the stranger appended rather than refused.
  assert.deepEqual(inPlay.map((k) => k.slug), ['t2i', 'edit', 'upscale'])
  assert.equal(inPlay.at(-1)?.face, '', 'and it has no gloss, because nobody wrote one')
})

test('a workflow may name a kind the registry has never heard of', () => {
  const row: InferenceRow = {
    id: 'rembg',
    engines: [{ file: 'birefnet-general' }],
    workflows: [{
      slug: 'cutout', kind: 'cutout', model: 'birefnet-general', inputs: ['ref'],
    }],
  }
  // No catalog: a plain-http service cannot be asked what it has, and that is not absence.
  const [rec] = resolveWorkflows(row, null)
  assert.equal(rec?.kind, 'cutout')
  assert.equal(rec?.state, 'known', 'so it is offerable, which is the whole point')
  assert.deepEqual(rec?.slots, ['ref'], 'and it takes a picture and no sentence')
})

// ── what a verb produces (2026-08-13) ─────────────────────────────────────────────────────────
//
// The 🔌 page bands capabilities by medium, and the band comes from the KIND's row rather than
// from whichever service happens to run it. That is the same rule as everywhere else here —
// declared, never inferred — so the tests are about where the fact lives, not about the parse.

test('a kind declares what it makes, and the vocabulary is the one closed set', () => {
  const c = ctx('kinds')
  const kinds = parseKindsFile(c, {
    kinds: [
      { slug: 't2i', medium: 'image', face: 'from words alone' },
      { slug: 't2m', medium: 'music', face: 'a song from tags' },
    ],
  })
  assert.deepEqual(c.issues, [])
  assert.deepEqual(kinds.map((k) => k.medium), ['image', 'music'])

  const bad = ctx('kinds')
  parseKindsFile(bad, { kinds: [{ slug: 't2i', medium: 'picture', face: 'x' }] })
  assert.equal(bad.issues.length, 1, 'a medium this app has no word for is refused')
})

test('a kind with no medium is still a kind — it lands in a band, it is not dropped', () => {
  // Same bargain as the slug: order and meaning, never legality. Someone adding a verb this build
  // never heard of should not have to know the medium vocabulary to be allowed to name it.
  const c = ctx('kinds')
  const kinds = parseKindsFile(c, { kinds: [{ slug: 'upscale', face: 'bigger and sharper' }] })
  assert.deepEqual(c.issues, [])
  assert.equal(kinds[0]?.medium, undefined)
})

test('every shipped kind says what it makes, because the page groups by it', () => {
  // ⚠️ Not a parse rule — a fact about the SHIPPED list. A row missing one would quietly fall into
  // the "somewhere else" band, which is the right home for a stranger and the wrong one for ours.
  const c = ctx('kinds')
  const kinds = parseKindsFile(c, JSON.parse(readFileSync(new URL(
    '../registries/kinds.json', import.meta.url), 'utf-8')))
  assert.deepEqual(c.issues, [])
  assert.ok(kinds.length >= 9)
  assert.deepEqual(kinds.filter((k) => !k.medium), [])
})

// ── what a service makes ──────────────────────────────────────────────────────────────────────
//
// ⚠️ THIS USED TO BE A FIELD ON THE ROW, and a question in ＋ connect (2026-09-06). One word could
// not describe a ComfyUI, so ComfyUI left it blank — and blank was then read as "answers for
// anything", which is how a music swatch came to be shot on a service holding only image workflows.

const KINDS = [
  { slug: 't2i', medium: 'image' as const, face: '' },
  { slug: 'i2i', medium: 'image' as const, face: '' },
  { slug: 't2m', medium: 'music' as const, face: '' },
  { slug: 'tts', medium: 'voice' as const, face: '' },
]

const svc = (kinds: string[]): InferenceRow => ({
  id: 's',
  workflows: kinds.map((kind, i) => ({ slug: `r${i}`, kind, model: 'm.ckpt', inputs: ['prompt'] })),
} as unknown as InferenceRow)

test('what a service makes is read off its workflows, and a ComfyUI makes several', () => {
  assert.deepEqual(mediaOf(svc(['t2i', 'i2i']), KINDS), ['image'], 'two image kinds are one medium')
  // The order is MEDIA's, not the workflows' — a card that reshuffles when you take something looks
  // like it changed more than it did.
  assert.deepEqual(mediaOf(svc(['t2m', 't2i', 'tts']), KINDS), ['image', 'music', 'voice'])
  // A kind nobody described claims nothing rather than claiming everything, which is the bug.
  assert.deepEqual(mediaOf(svc(['t2vec']), KINDS), [])
  // And a service with no workflows yet makes nothing — it cannot be armed and cannot render.
  assert.deepEqual(mediaOf(svc([]), KINDS), [])
})

test('the knob table follows a service that makes exactly one thing, and nothing otherwise', () => {
  assert.equal(soleMedium(svc(['t2i', 'i2i']), KINDS), 'image')
  // ⚠️ `null` FOR A MULTI-MEDIUM SERVICE, deliberately: the union would put a tempo and a key on
  // an SDXL checkpoint's ⚙ editor. This is what a ComfyUI has always had there.
  assert.equal(soleMedium(svc(['t2i', 't2m']), KINDS), null)
  assert.equal(soleMedium(svc([]), KINDS), null)
})
