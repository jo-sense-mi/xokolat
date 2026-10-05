// The style list and its swatches: one list all of it the user's (the shipped file is a seed),
// and one probe render per style × service × model.

import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  StyleError, deleteCompositionStyle, deleteStyle, loadCompositionStyles, loadStyles,
  parseStyleFile, saveCompositionStyle, saveStyle,
} from '../src/styles/registry.ts'
import {
  PROBE, PROBE_SEED,
  failRel, forgetSwatch, pathKey, probeParams, probeSize, queueSwatch, readFailure, readSwatch,
  swatchPath, swatchRel,
} from '../src/styles/probe.ts'
import { resolveWorkflows } from '../src/inference/workflows.ts'
import { Queue } from '../src/jobs/lane.ts'
import type { InferenceRow } from '../src/types/inference.ts'
import { axesFor } from '../src/styles/axes.ts'
import { MINIMAL_CAPS } from '../src/inference/caps.ts'
import { MEDIA } from '../src/types/medium.ts'
import { writeMaster } from '../src/content/master.ts'
import type { Roots } from '../src/paths.ts'
import { resolveRoots } from '../src/paths.ts'
import { ctx } from '../src/validate.ts'

/** A real install root (so the shipped layer is the actual one) with a throwaway data root. */
async function tempRoots(): Promise<Roots> {
  const base = resolveRoots()
  return { ...base, data: await mkdtemp(join(tmpdir(), 'xk-styles-')) }
}

test('⚠️ THE APP SHIPS NO STYLES — a fresh install has an empty list, on purpose', async () => {
  // This test used to be "the shipped image style list is on-contract" and asserted the exact
  // opposite: a seed of between one and twelve entries, every one of them on a shelf.
  // `styles/image.json` is gone (2026-08-16). A style is CONTENT, content is the library's, and a
  // list that arrives with the app is one nobody can correct without shipping a release — our
  // taste, installed on somebody else's machine. The first style arrives through ⤓ or from ✨.
  const { install } = resolveRoots()
  assert.equal(existsSync(join(install, 'styles')), false,
    'nothing runnable and nothing look-ish ships with this app')

  // And an empty list is a real answer rather than a failure: no file, no issues, no seeding.
  const roots = await tempRoots()
  try {
    const { styles, issues } = await loadStyles(roots, 'image')
    assert.deepEqual(styles, [])
    assert.deepEqual(issues, [])
    assert.equal(existsSync(join(roots.data, 'styles', 'image.json')), false,
      'a read does not create a list — only a save does')
  } finally {
    await rm(roots.data, { recursive: true, force: true })
  }
})

test('a style is filed by collection and by nothing else', () => {
  // ⚠️ `category` WAS A FIELD AND IS GONE (2026-08-30). It was a CLOSED vocabulary of three image
  // techniques declared inside the app — the app owning content, which is the one thing it does
  // not do — and images-only, so five of the six media were filed by a field that could never
  // hold a value. One open axis now, named by whoever publishes or writes the style: a collection
  // called `painted` is simply a collection.
  const c = ctx('x')
  parseStyleFile(c, {
    medium: 'image',
    styles: [{ slug: 'spooky', category: 'drawn', positive: 'x' }],
  }, 'image')
  assert.ok(c.issues.some((i) => i.includes('category')), c.issues.join('\n'))

  // And filing is legal, open, and MANY — a style sits under every collection that names it.
  const ok = ctx('x')
  const f = parseStyleFile(ok, {
    medium: 'image',
    styles: [{ slug: 'mine', positive: 'x', collections: ['painted', 'picture-book'] }],
  }, 'image')
  assert.deepEqual(ok.issues, [])
  assert.deepEqual(f?.styles[0]?.collections, ['painted', 'picture-book'])
})

test('a style that changes nothing about the prompt is refused', () => {
  const c = ctx('x')
  parseStyleFile(c, { medium: 'image', styles: [{ slug: 'empty' }] }, 'image')
  assert.ok(c.issues.some((i) => i.includes('does nothing')), c.issues.join('\n'))
})

// ── a style may carry SETTINGS, not only words (2026-08-23) ───────────────────────────────────
//
// A music genre is the case that forced it: jazz noir is that caption AND 60–80 bpm AND a minor
// key, and publishing only the words means every genre plays at the graph's own 120 in C.

test('a genre carries the tempo and the key that make it that genre', () => {
  const c = ctx('x')
  const f = parseStyleFile(c, {
    medium: 'music',
    styles: [{
      slug: 'jazz-noir',
      positive: 'late-night smoky noir jazz, muted trumpet, upright bass',
      params: { bpm: 70, keyscale: 'D minor' },
    }],
  }, 'music')
  assert.deepEqual(c.issues, [])
  assert.deepEqual(f?.styles[0]?.params, { bpm: 70, keyscale: 'D minor' })
})

test('a style may not set something the medium cannot be asked for', () => {
  // ⚠️ THE KNOB TABLE IS THE AUTHORITY. A style is CONTENT, and it arrives from the library —
  // letting it name any key at all would make it a request format nobody validates, able to set a
  // step count or a checkpoint the person never chose.
  const c = ctx('x')
  parseStyleFile(c, {
    medium: 'music',
    styles: [{ slug: 'sneaky', positive: 'x', params: { steps: 4, model: 'something-else' } }],
  }, 'music')
  assert.ok(c.issues.some((i) => i.includes('steps')), c.issues.join('\n'))
  assert.ok(c.issues.some((i) => i.includes('model')), c.issues.join('\n'))
})

test('a near-miss spelling is refused by name rather than played in C', () => {
  const c = ctx('x')
  parseStyleFile(c, {
    medium: 'music',
    styles: [{ slug: 'typo', positive: 'x', params: { keyScale: 'D minor' } }],
  }, 'music')
  assert.ok(c.issues.some((i) => i.includes('keyScale')), c.issues.join('\n'))
})

test('a value the render would reject is caught where it is written', () => {
  const c = ctx('x')
  parseStyleFile(c, {
    medium: 'music',
    styles: [{ slug: 'shouty', positive: 'x', params: { keyscale: 'D Minor', bpm: 900 } }],
  }, 'music')
  // The model compares the string exactly; a capital M is `value_not_in_list` at render time.
  assert.ok(c.issues.some((i) => i.includes('D Minor')), c.issues.join('\n'))
  assert.ok(c.issues.some((i) => i.includes('bpm')), c.issues.join('\n'))
})

test('settings alone are enough — a style need not add words to do something', () => {
  const c = ctx('x')
  const f = parseStyleFile(c, {
    medium: 'music',
    styles: [{ slug: 'half-time', params: { bpm: 70 } }],
  }, 'music')
  assert.deepEqual(c.issues, [])
  assert.equal(f?.styles[0]?.params?.['bpm'], 70)
})

test('`random` is reserved, because it already means "pick one for me"', () => {
  const c = ctx('x')
  parseStyleFile(c, { medium: 'image', styles: [{ slug: 'random', positive: 'x' }] }, 'image')
  assert.ok(c.issues.some((i) => i.includes('reserved')), c.issues.join('\n'))
})

test('a style file whose medium contradicts its name is caught', () => {
  const c = ctx('x')
  parseStyleFile(c, { medium: 'music', styles: [] }, 'image')
  assert.ok(c.issues.some((i) => i.includes('music')), c.issues.join('\n'))
})

test('ONE list, and every entry in it is editable — however it arrived', async () => {
  // ⚠️ There is ONE list. A two-layer read with an xk:/user: namespace meant forking a style
  // before you could change it — ceremony this app does not need (DECISIONS.md, 2026-08-04) — and
  // this test used to prove that against the SEEDED entries. There is no seed now, so the list is
  // filled the way a real one is filled: something arrives (⤓, or ✨), and then it is yours.
  const roots = await tempRoots()
  try {
    await saveStyle(roots, 'image', { slug: 'flat-vector', label: 'flat vector', positive: 'flat' })
    await saveStyle(roots, 'image', { slug: 'ink-linework', label: 'ink', positive: 'ink' })
    const first = await loadStyles(roots, 'image')
    assert.equal(first.styles.length, 2)
    assert.ok(first.styles.every((s) => 'slug' in s && !('ns' in s)), 'no namespace survives')

    // Editing an entry that arrived from the library is an ordinary edit, not a copy.
    await saveStyle(roots, 'image', { slug: 'flat-vector', positive: 'mine now' })
    const after = await loadStyles(roots, 'image')
    assert.equal(after.styles.filter((s) => s.slug === 'flat-vector').length, 1)
    assert.equal(after.styles.find((s) => s.slug === 'flat-vector')?.positive, 'mine now')
    // And nothing followed it back to the library: there is no second copy anywhere to disagree.
  } finally {
    await rm(roots.data, { recursive: true, force: true })
  }
})

test('an emptied list stays empty — nothing comes back to fill it', async () => {
  // A user who deleted every style meant it. Refilling would be the app arguing — which is the
  // same reason there is no seed at all now.
  const roots = await tempRoots()
  try {
    await saveStyle(roots, 'image', { slug: 'only-one', positive: 'x' })
    for (const s of (await loadStyles(roots, 'image')).styles) {
      await deleteStyle(roots, 'image', s.slug)
    }
    assert.deepEqual((await loadStyles(roots, 'image')).styles, [])
  } finally {
    await rm(roots.data, { recursive: true, force: true })
  }
})

test('an unreadable data root reads as empty rather than throwing', async () => {
  // A first run on a broken data directory shows an empty list and says why elsewhere — it does
  // not take the section down.
  const roots: Roots = { ...resolveRoots(), data: '/dev/null/nope' }
  const { styles } = await loadStyles(roots, 'image')
  assert.equal(styles.length, 0, 'nothing readable, and no throw')
})

test('a medium nobody has a style for loads empty rather than throwing', async () => {
  // ⚠️ A TEMP ROOT, NOT THE REAL ONE. This read `resolveRoots()` and asserted the operator's own
  // music list was empty — true on the day it was written and false the first time anybody takes a
  // genre from 📚. A test that passes because of what is on this machine is not a test.
  const roots = await tempRoots()
  try {
    const { styles, issues } = await loadStyles(roots, 'music')
    assert.deepEqual(issues, [])
    assert.deepEqual(styles, [])
  } finally {
    await rm(roots.data, { recursive: true, force: true })
  }
})

// ── WRITING the user layer ─────────────────────────────────────────────────────

test('a saved style lands in the user layer, namespaced, and shipped is untouched', async () => {
  const roots = await tempRoots()
  try {
    const after = await saveStyle(roots, 'image', {
      slug: 'my-look', label: 'my look', positive: 'thick gouache, muted',
    })
    const mine = after.styles.filter((s) => s.slug === 'my-look')
    assert.equal(mine.length, 1)
    assert.equal(mine[0]?.slug, 'my-look')
    // ⚠️ The shipped list is still there and still shipped — the layers do not merge.
        const raw = JSON.parse(await readFile(join(roots.data, 'styles', 'image.json'), 'utf-8')) as
      { medium: string; styles: { slug: string }[] }
    assert.equal(raw.medium, 'image')
    assert.ok(raw.styles.some((s) => s.slug === 'my-look'))
  } finally {
    await rm(roots.data, { recursive: true, force: true })
  }
})

test('saving the same slug replaces rather than duplicates', async () => {
  const roots = await tempRoots()
  try {
    await saveStyle(roots, 'image', { slug: 'my-look', positive: 'first' })
    const after = await saveStyle(roots, 'image', { slug: 'my-look', positive: 'second' })
    const mine = after.styles.filter((s) => s.slug === 'my-look')
    assert.equal(mine.length, 1)
    assert.equal(mine[0]?.positive, 'second')
  } finally {
    await rm(roots.data, { recursive: true, force: true })
  }
})

test('deleting one that never existed is refused by name', async () => {
  const roots = await tempRoots()
  try {
    await assert.rejects(() => deleteStyle(roots, 'image', 'never-existed'), StyleError)
  } finally {
    await rm(roots.data, { recursive: true, force: true })
  }
})

test('deleting removes exactly one of yours', async () => {
  const roots = await tempRoots()
  try {
    await saveStyle(roots, 'image', { slug: 'keep', positive: 'a' })
    await saveStyle(roots, 'image', { slug: 'drop', positive: 'b' })
    const after = await deleteStyle(roots, 'image', 'drop')
    assert.ok(after.styles.some((s) => s.slug === 'keep'))
    assert.ok(!after.styles.some((s) => s.slug === 'drop'))
  } finally {
    await rm(roots.data, { recursive: true, force: true })
  }
})

test('a bad draft is refused by name, and writes nothing', async () => {
  const roots = await tempRoots()
  try {
    await saveStyle(roots, 'image', { slug: 'good', positive: 'a' })
    // `random` is reserved; a style adding nothing does nothing; a bad slug is a bad slug.
    for (const bad of [
      { slug: 'random', positive: 'x' },
      { slug: 'says-nothing' },
      { slug: 'Not A Slug', positive: 'x' },
      { slug: 'stray', positive: 'x', colour: 'blue' },
    ]) {
      await assert.rejects(() => saveStyle(roots, 'image', bad), StyleError, JSON.stringify(bad))
    }
    const still = await loadStyles(roots, 'image')
    assert.ok(still.styles.some((s) => s.slug === 'good'))
  } finally {
    await rm(roots.data, { recursive: true, force: true })
  }
})

test('a user file with a problem is reported, and NOT silently replaced', async () => {
  // ⚠️ Overwriting here would delete entries the user wrote by hand because one has a typo.
  const roots = await tempRoots()
  try {
    await mkdir(join(roots.data, 'styles'), { recursive: true })
    await writeFile(join(roots.data, 'styles', 'image.json'),
      '{ "medium": "image", "styles": [{ "slug": "ok", "positive": "a" }, { "slug": "BAD SLUG" }] }')
    await assert.rejects(() => saveStyle(roots, 'image', { slug: 'new', positive: 'x' }), StyleError)
    const text = await readFile(join(roots.data, 'styles', 'image.json'), 'utf-8')
    assert.ok(text.includes('BAD SLUG'), 'the broken file is left exactly as it was')
  } finally {
    await rm(roots.data, { recursive: true, force: true })
  }
})

// ── SWATCHES ───────────────────────────────────────────────────────────────────

test('a style remembers the collections it came in, and they round-trip', async () => {
  const c = ctx('image.json')
  const file = parseStyleFile(c, {
    medium: 'image',
    styles: [{
      slug: 'soft-watercolour', positive: 'wet edges',
      // ⚠️ SEVERAL, BECAUSE IT IS IN SEVERAL. A way of putting paint on a surface AND a picture-book
      // register; the take writes every collection the library had it in, not the header pressed,
      // or the shelf here would group it differently from the shelf it came from.
      collections: ['paint-on-a-surface', 'picture-book'],
    }],
  }, 'image')
  assert.deepEqual(c.issues, [])
  assert.deepEqual(file?.styles[0]?.collections, ['paint-on-a-surface', 'picture-book'])

  // A style in none carries none — the ordinary case, and not an empty list nothing means.
  const loose = ctx('image.json')
  const ok = parseStyleFile(loose, { medium: 'image', styles: [{ slug: 'x', positive: 'a' }] }, 'image')
  assert.deepEqual(loose.issues, [])
  assert.equal(ok?.styles[0]?.collections, undefined)
})

test('a voice pins the number that makes it that voice, and a stray key is still refused', async () => {
  const c = ctx('voice.json')
  const file = parseStyleFile(c, {
    medium: 'voice',
    styles: [{ slug: 'old-sailor', label: 'old sailor', positive: 'gravelly, unhurried', seed: 77 }],
  }, 'voice')
  assert.deepEqual(c.issues, [])
  assert.equal(file?.styles[0]?.seed, 77)

  // ⚠️ A SEED IS A WHOLE NUMBER OR IT IS NOT A SEED. Refused by name rather than coerced — a
  // fractional one would reach the graph and mean a voice nobody can get back.
  const bad = ctx('voice.json')
  parseStyleFile(bad, { medium: 'voice', styles: [{ slug: 'x', positive: 'a', seed: 1.5 }] }, 'voice')
  assert.equal(bad.issues.length, 1)
  assert.match(bad.issues[0] ?? '', /whole number/)

  // And a voice with no seed is legal — it just gets a different person every press, which is
  // right for "read me anything" and wrong for a character.
  const loose = ctx('voice.json')
  const ok = parseStyleFile(loose, { medium: 'voice', styles: [{ slug: 'y', positive: 'a child' }] }, 'voice')
  assert.deepEqual(loose.issues, [])
  assert.equal(ok?.styles[0]?.seed, undefined)
})

test('a swatch lives in app data, never in the library', async () => {
  // ⚠️ A swatch is evidence about a style, not the user's work. If it landed under the content
  // root it would be indexed, appear in the gallery, and be exported — none of which it is.
  const roots = await tempRoots()
  try {
    const target = { medium: 'image', service: 'draw-things-grpc', model: 'flux_2_klein.ckpt' } as const
    const rel = swatchRel(target, 'my-look')
    assert.match(rel, /^styles\/swatches\/image\//)
    assert.ok(!rel.includes('media/'), 'never under media/')
    assert.equal(swatchPath(roots, target, 'my-look'), join(roots.data, rel))
    // ⚠️ The MODEL is part of the path: the same words are a different picture on a different
    // checkpoint, so a style has one cell PER MODEL and never one cell full stop.
    assert.notEqual(rel, swatchRel({ ...target, model: 'sdxl_base.safetensors' }, 'my-look'))
    assert.ok(rel.includes('flux_2_klein'), 'the model stays legible in the path')
    assert.ok(!rel.includes('.ckpt'), 'de-suffixed — this is a folder name, not a filename')
  } finally {
    await rm(roots.data, { recursive: true, force: true })
  }
})

test('forgetting a swatch that was never rendered is silent', async () => {
  // The normal case: every style starts without one, and delete/edit both call this blind.
  const roots = await tempRoots()
  try {
    await forgetSwatch(roots, 'image', 'never-rendered')
  } finally {
    await rm(roots.data, { recursive: true, force: true })
  }
})

test('editing a style forgets its swatch on EVERY model, not just the one on screen', async () => {
  // ⚠️ The words changed for all of them. A survivor would be a cell claiming to show a style
  // that no longer says that — the stale-picture bug this whole path exists to prevent.
  const roots = await tempRoots()
  try {
    const shot = ['flux_2_klein.ckpt', 'sdxl_base.safetensors'].map(
      (model) => ({ medium: 'image', service: 'draw-things-grpc', model }) as const)
    for (const t of shot) {
      const rel = swatchRel(t, 'my-look')
      await mkdir(join(roots.data, rel, '..'), { recursive: true })
      await writeFile(join(roots.data, rel), 'not really a webp')
      await writeFile(join(roots.data, failRel(t, 'other')), 'it went wrong\n')
    }
    await forgetSwatch(roots, 'image', 'my-look')
    for (const t of shot) {
      await assert.rejects(() => readFile(join(roots.data, swatchRel(t, 'my-look'))))
      // Another style's recorded failure is not collateral damage.
      assert.equal(await readFailure(roots, t, 'other'), 'it went wrong')
    }
  } finally {
    await rm(roots.data, { recursive: true, force: true })
  }
})

test('a model name can never climb out of the swatch folder', () => {
  // A model file is whatever the ENGINE calls it, and it reaches this as a browser-sent string.
  // §15 rule 2: every path is resolved against a root — this is the reduction that makes the
  // segment safe before `resolveIn` ever sees it.
  assert.ok(!pathKey('../../etc/passwd').includes('/'))
  assert.ok(!pathKey('a/b/c.ckpt').includes('/'))
  assert.equal(pathKey('...'), 'default', 'a name that reduces to nothing is not a hidden folder')
  assert.equal(pathKey(null), 'default')
  assert.equal(pathKey(''), 'default')
})

test('a cell reports what the swatch COST, from its own embedded record', async () => {
  // ⚠️ Read from the master, not from a sidecar. The record is the one source of truth about an
  // asset; a second file saying how long it took is a second answer waiting to disagree.
  const roots = await tempRoots()
  try {
    const t = { medium: 'image', service: 'dt', model: 'm.ckpt' } as const
    const rel = swatchRel(t, 'timed')
    await mkdir(join(roots.data, rel, '..'), { recursive: true })
    await writeMaster(roots.data, rel, {
      kind: 'image',
      image: { data: Buffer.alloc(8 * 8 * 3), width: 8, height: 8, channels: 3 },
    }, {
      modality: 'image', provider: 'dt', model: 'm.ckpt', workflow: null, style: 'timed',
      prompt: 'x', seed: 1, params: {}, tags: ['swatch'], refs: [], runId: 'r',
      createdAt: new Date().toISOString(), durationMs: 3200, quality: 'webp-q92',
    })
    const cell = await readSwatch(roots, t, 'timed')
    assert.ok(cell.at, 'the mtime doubles as the cache-buster')
    assert.equal(cell.tookMs, 3200)
    assert.equal(cell.error, null)
    // ⚠️ READ BACK, NEVER RE-DERIVED. ⓘ shows the sentence the picture was ACTUALLY made from, so
    // that a subject being tuned can be judged against what it drew. Re-composing it in the
    // browser would answer a different question and be silently wrong the moment the subject or
    // the engine's idiom changes.
    assert.equal(cell.prompt, 'x', 'the sentence comes off the picture, not out of a re-compose')

    // No picture: nothing cost anything, and the only thing worth knowing is why.
    const none = await readSwatch(roots, t, 'never-shot')
    assert.deepEqual(none, { at: null, tookMs: null, prompt: null, error: null })
  } finally {
    await rm(roots.data, { recursive: true, force: true })
  }
})

test('a recorded failure is only read when there is no picture', async () => {
  const roots = await tempRoots()
  try {
    const t = { medium: 'image', service: 'dt', model: 'm.ckpt' } as const
    assert.equal(await readFailure(roots, t, 'nope'), null, 'nothing recorded is not an error')
    await mkdir(join(roots.data, failRel(t, 'nope'), '..'), { recursive: true })
    await writeFile(join(roots.data, failRel(t, 'nope')), 'ink coverage 78%\n')
    assert.equal(await readFailure(roots, t, 'nope'), 'ink coverage 78%')
  } finally {
    await rm(roots.data, { recursive: true, force: true })
  }
})

test('every medium has a probe, and it is not all called a subject', () => {
  // ⚠️ THE THROW THIS REPLACED. `PROBE` held one entry, `image`, while the 🎨 band was mounted for
  // every medium — so 🎼 and 🗣 drew a grid of blanks with a ▶ that could only ever fail. A style
  // is a MODIFIER and a modifier needs something to modify, in every medium there is.
  for (const m of MEDIA) {
    const face = PROBE[m]
    assert.ok(face?.seed.trim(), `${m} has no probe sentence`)
    assert.ok(face.ask.trim() && face.noun.trim() && face.hint.trim(), `${m} is missing its words`)
  }
  assert.equal(typeof PROBE_SEED, 'number')

  // ⚠️ THE WORD IS THE MEDIUM'S. Calling all six "subject" is what made a voice grid unreadable:
  // the line is not what the style is applied to, it is what everybody reads so you can tell the
  // voices apart. Same for the noun — a music style is an idiom, a voice style is a person.
  assert.equal(PROBE.voice.ask, 'line')
  assert.equal(PROBE.voice.noun, 'voices')
  assert.equal(PROBE.music.noun, 'genres')

  // ⚠️ IDENTICAL ASKS FOR 🖼 AND 🎬, on purpose: it is what makes the two grids readable against
  // each other. Two different sentences would compare nothing across engines.
  assert.equal(PROBE.video.seed, PROBE.image.seed)

  // ⚠️ AND THE MUSIC BRIEF NAMES NO GENRE, because in 🎼 the style IS the genre — a brief that
  // said "sardana" would fight every entry in the list.
  assert.doesNotMatch(PROBE.music.seed, /\b(jazz|folk|synth|rock|waltz|sardana|blues|lo-?fi)\b/i)

  // ⚠️ TWO OPERATOR-TESTED INTENTS on the image sentence, guarded because both were learned from a
  // bad render and both are easy to drop while retuning the WORDING.
  //   · the count is STATED — `one chick` read as an article on FLUX.2 9B and it drew two;
  //   · the background is STATED — clutter is noise in a style comparison, and asking beats hoping.
  const subject = PROBE.image.seed
  assert.ok(subject.includes('chocolate'), 'the mona de Pasqua, not stock filler')
  assert.match(subject, /\b(a single|one)\b[^,]*\bchick\b/, 'the chick count is said out loud')
  assert.match(subject, /simple background/, 'no scenery, asked for rather than hoped for')
})

test('a probe costs the least its medium can honestly be asked for', () => {
  const caps = { ...MINIMAL_CAPS, resolution: [768, 1536] as const }
  // A picture gets SMALLER; a song gets SHORTER; a clip gets fewer FRAMES, because that is the
  // field each node actually has (src/inference/knobs.ts). Nothing is converted into a house unit.
  assert.deepEqual(probeParams('image', caps), { width: 768, height: 768 })
  assert.deepEqual(probeParams('music', caps), { duration: 15 })
  assert.deepEqual(probeParams('sound', caps), { duration: 3 })
  assert.deepEqual(probeParams('video', caps), { length: 17 })
  // ⚠️ 4n+1, which is what Wan samples — an illegal frame count would be refused outright.
  assert.equal((17 - 1) % 4, 0)
  // ⚠️ VOICE HAS NO BUDGET, and that is not an omission: a voice probe is a line being read, and
  // the line is already as long as it is.
  assert.deepEqual(probeParams('voice', caps), {})
})

test('a swatch is a master, so its name is the medium\'s', () => {
  // ⚠️ `.webp` WAS HARD-CODED, which was invisible while 🖼 was the only grid with a probe and a
  // silent lie the moment 🎼 got one: `writeMaster` refuses mp3 bytes under a webp name.
  const t = (medium: 'image' | 'music' | 'video') => ({ medium, service: 'comfyui', model: 'm.ckpt' })
  assert.ok(swatchRel(t('image'), 'ink').endsWith('/ink.webp'))
  assert.ok(swatchRel(t('music'), 'jazz').endsWith('/jazz.mp3'))
  assert.ok(swatchRel(t('video'), 'ink').endsWith('/ink.mp4'))
})

test('a swatch renders at the MODEL\'s minimum, never at a number we picked', () => {
  // ⚠️ The bug this replaced: a shipped 512 was refused outright by an engine whose floor is 768
  // ("width must be a whole number between 768 and 1536"). "Small" is a property of the engine,
  // not a constant — and below its declared minimum a model stops representing itself, so a
  // cheap swatch that misrepresents the model is worse than a slow one.
  const caps = (resolution: readonly [number, number]) => ({ ...MINIMAL_CAPS, resolution })
  assert.equal(probeSize(caps([768, 1536])), 768, 'the engine that refused 512')
  assert.equal(probeSize(caps([512, 1024])), 512)
  assert.equal(probeSize(caps([1024, 2048])), 1024, 'never smaller than the floor, however slow')
  // Latent models want a multiple of 64, and the snap must not leave the band.
  assert.equal(probeSize(caps([500, 1024])), 512)
  assert.equal(probeSize(caps([600, 640])), 640)
})

// ── STYLE AXES ─────────────────────────────────────────────────────────────────

test('the axes are ingredients, not whole styles', () => {
  // ⚠️ Each example is appended to whatever the user already wrote, so two of them have to read
  // together. content-factory's options were whole style sentences because a roll used exactly
  // one per axis — here you are writing, and a 12-word option would BE the style.
  // ⚠️ EVERY MEDIUM THAT HAS THEM, not only 🖼 (2026-08-29). 🎼, 🔊 and 🗣 grew checklists because
  // "what IS a sound style" and "what IS a voice style" are real questions, and the axes are how
  // the editor answers them without a paragraph in the pane.
  for (const medium of MEDIA) {
    const axes = axesFor(medium)
    if (!axes.length) continue
    assert.ok(axes.length >= 4, `${medium}: a checklist of one dimension is not a checklist`)
    for (const axis of axes) {
      assert.ok(axis.examples.length >= 3, `${axis.name} needs enough words to be a menu`)
      for (const words of axis.examples) {
        assert.ok(words.split(' ').length <= 6, `"${words}" is a style, not an ingredient`)
        assert.ok(!words.includes(','), `"${words}" is two ingredients wearing one coat`)
      }
    }
  }
  // ⚠️ LOWERCASE IS AN 🖼 RULE, not a house one, because 🗣's accents and 🎼's eras are PROPER
  // NOUNS — "irish" appended mid-sentence would be the wrong spelling, not the humble one.
  for (const axis of axesFor('image')) {
    for (const words of axis.examples) {
      assert.equal(words, words.toLowerCase(), 'appended mid-sentence — never capitalised')
    }
  }
})

test('a medium with no axes simply has no checklist', () => {
  // The editor works without one — this must be an empty list, never a throw. 🧊 has no engine
  // yet, so nobody has learned what its dimensions are.
  assert.deepEqual(axesFor('model3d'), [])
})

// ── 🧩 A COMPOSITION'S OWN STYLES ──────────────────────────────────────────────
//
// The second scope a style can have, and the first that is not a medium. What it can say that a
// media style cannot is `says` — words that shape the chain's TEXT steps, which reach xoko and no
// engine at all — and `uses`, one media style NAMED per medium rather than copied.

test('a chain style says something to the writing and names one style per medium', async () => {
  const roots = await tempRoots()
  try {
    const after = await saveCompositionStyle(roots, 'book', {
      slug: 'noir-picture-book',
      label: 'noir picture book',
      says: 'Wry, second person. Captions under eight words.',
      uses: { image: 'ink-linework', music: 'jazz-noir' },
    })
    assert.equal(after.issues.length, 0)
    assert.equal(after.styles.length, 1)
    assert.deepEqual(after.styles[0]?.uses, { image: 'ink-linework', music: 'jazz-noir' })

    // ⚠️ IT NAMES, IT DOES NOT HOLD. `uses` is slugs into the lists the media sections already
    // read — and it is deliberately NOT checked against them here: a chain style arriving before
    // the styles it names is the ordinary order things come out of 📚 in, not a broken file.
    assert.equal((await loadStyles(roots, 'image')).styles.length, 0)

    const back = await loadCompositionStyles(roots, 'book')
    assert.equal(back.styles[0]?.says, 'Wry, second person. Captions under eight words.')

    // A second composition's list is a different file and cannot see this one.
    assert.equal((await loadCompositionStyles(roots, 'mascot')).styles.length, 0)

    const gone = await deleteCompositionStyle(roots, 'book', 'noir-picture-book')
    assert.equal(gone.styles.length, 0)
  } finally {
    await rm(roots.data, { recursive: true, force: true })
  }
})

test('a chain style that shapes nothing, or names a medium that is not one, is refused by name', async () => {
  const roots = await tempRoots()
  try {
    await assert.rejects(
      saveCompositionStyle(roots, 'book', { slug: 'empty' }),
      /says nothing and names no styles/)
    // ⚠️ THE KEY IS A MEDIUM AND THE CLOSED LIST IS THE AUTHORITY. `pictures` is a typo somebody
    // wants to hear about, not a channel that silently reaches nothing.
    await assert.rejects(
      saveCompositionStyle(roots, 'book', { slug: 'x', uses: { pictures: 'ink' } }),
      /pictures/)
    // `random` already means "pick one for me", in every scope.
    await assert.rejects(
      saveCompositionStyle(roots, 'book', { slug: 'random', says: 'anything' }),
      /reserved/)
  } finally {
    await rm(roots.data, { recursive: true, force: true })
  }
})

// ── a swatch is a press ───────────────────────────────────────────────────────────────────────

/** One graph service answering two kinds — which is exactly what ComfyUI is. */
const GRAPHED: InferenceRow = {
  id: 'comfyui',
  // ⚠️ A PORT NOTHING ANSWERS ON, DELIBERATELY. The job is real and the lane starts it; the point
  // of the test is what the probe HANDS the adapter, and a reachable ComfyUI would have this
  // suite queueing fifteen-second songs on the machine running it.
  transport: { kind: 'comfy', host: '127.0.0.1', port: 9 },
  workflows: [
    {
      slug: 'ace-step', kind: 't2m', model: 'acestep.safetensors', inputs: ['prompt'],
      params: { steps: 8 },
      graph: { nodes: { '94': { inputs: { tags: '' } } }, holes: { prompt: '94.tags' }, out: '94' },
    },
    {
      slug: 'hunyuan3d', kind: 'i23d', model: 'hunyuan.safetensors', inputs: ['ref'],
      graph: { nodes: { '1': { inputs: { image: '' } } }, holes: { ref: '1.image' }, out: '1' },
    },
  ],
}

const workflowNamed = (slug: string) => {
  const found = resolveWorkflows(GRAPHED, null).find((w) => w.slug === slug)
  assert.ok(found, slug)
  return found
}

test('a swatch is armed like a press — the workflow comes with it, graph and all', async () => {
  // ⚠️ THE BUG THIS PINS (2026-08-29): the probe resolved a MODEL and handed the adapter nothing
  // else, so shooting a music style answered "this workflow carries no graph — a ComfyUI workflow is
  // one". The workflow is now what the grid is OF: its checkpoint names the folder, and its own
  // knobs are what the cell was shot at.
  const roots = await tempRoots()
  const queue = new Queue()
  try {
    const workflow = workflowNamed('ace-step')
    assert.equal(workflow.graph?.holes?.['prompt'], '94.tags')
    assert.equal(workflow.params['steps'], 8)

    const { jobId } = await queueSwatch(
      { roots, queue, row: GRAPHED, workflow }, 'music', { slug: 'bossa-nova', medium: 'music', positive: 'bossa' })
    const job = queue.list().find((j) => j.id === jobId)
    assert.equal(job?.engine, 'comfyui')
    // Filed under the WORKFLOW's checkpoint — a swatch shot on one model and filed under another is
    // a picture of an engine you are not using.
    assert.equal(
      swatchRel({ medium: 'music', service: 'comfyui', model: workflow.model }, 'bossa-nova')
        .includes('acestep'),
      true)
    queue.cancel(jobId)
    await new Promise((r) => setTimeout(r, 20))
  } finally {
    await rm(roots.data, { recursive: true, force: true })
  }
})

test('a workflow that reads a picture cannot shoot a swatch, and says so once', async () => {
  // A swatch is a sentence and nothing attached (see the header of src/styles/probe.ts). Refused
  // before the queue rather than per cell: a sweep of twelve would otherwise be twelve identical
  // failures, each naming a missing slot instead of the reason.
  const roots = await tempRoots()
  const queue = new Queue()
  try {
    await assert.rejects(
      queueSwatch(
        { roots, queue, row: GRAPHED, workflow: workflowNamed('hunyuan3d') },
        'model3d', { slug: 'clay', medium: 'model3d', positive: 'clay' }),
      /a swatch is a sentence/)
    assert.equal(queue.list().length, 0)
  } finally {
    await rm(roots.data, { recursive: true, force: true })
  }
})
