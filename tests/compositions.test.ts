// 🧩 COMPOSITIONS — the graph, the folder, and what would answer each step here.
//
// ⚠️ WHAT IS BEING DEFENDED IS NOT "does the shape parse". A composition is a GRAPH — step 4
// renders from what you chose in step 3 — and the failure of a bad graph is not a refusal, it is a
// chain that runs two presses, writes twelve pictures and then stops on a name nothing produced.
// Every reference check in here exists so that a composition which LOADS is one that can RUN.

import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  CompositionError, deleteComposition, loadCompositions, readDraft, saveComposition,
} from '../src/compositions/registry.ts'
import { resolveComposition } from '../src/compositions/resolve.ts'
import { saysFor } from '../src/compositions/says.ts'
import type { Candidate } from '../src/compositions/resolve.ts'
import { isBind, isMake } from '../src/types/composition.ts'
import type { Roots } from '../src/paths.ts'

const CHAIN = {
  slug: 'a-family',
  label: 'a family from one face',
  family: 'mascots',
  steps: [
    { id: 'brief', makes: 'text', inputs: { prompt: 'ask' }, says: 'Describe one character.' },
    { id: 'candidates', makes: 'image', repeat: 12, inputs: { prompt: 'brief' }, recommends: 'dt/dev-fast' },
    { id: 'founder', pick: 'candidates', asks: 'Which one is the character?' },
    { id: 'cast', makes: 'image', repeat: 4, inputs: { prompt: 'ask', ref: 'founder' }, recommends: 'dt/sdxl-face' },
  ],
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

const refusal = (fn: () => unknown): CompositionError => {
  try {
    fn()
  } catch (err) {
    assert.ok(err instanceof CompositionError, `refused with ${(err as Error).name}: ${(err as Error).message}`)
    return err as CompositionError
  }
  assert.fail('expected a refusal')
}

async function roots(): Promise<{ roots: Roots; done: () => Promise<void> }> {
  const base = await mkdtemp(join(tmpdir(), 'xk-comp-'))
  return {
    roots: { data: join(base, 'data'), content: join(base, 'work'), install: join(base, 'app') },
    done: () => rm(base, { recursive: true, force: true }),
  }
}

// ── the graph ─────────────────────────────────────────────────────────────────

test('a chain reads whole, with its picks and its repeats', () => {
  const one = readDraft(CHAIN)
  assert.equal(one.slug, 'a-family')
  assert.equal(one.steps.length, 4)
  assert.deepEqual(one.steps.map((s) => s.id), ['brief', 'candidates', 'founder', 'cast'])
})

test('⚠️ an input may name `ask` or an EARLIER step, and nothing else', () => {
  // The whole reason this parser is strict. `cast` is step 4; a step 2 reading it is a chain that
  // gets three presses in and then has nowhere to look.
  const forward = clone(CHAIN)
  forward.steps[1]!.inputs = { prompt: 'cast' }
  assert.match(refusal(() => readDraft(forward)).message, /nothing before this step is called "cast"/)

  // Itself is not earlier than itself.
  const self = clone(CHAIN)
  self.steps[1]!.inputs = { prompt: 'candidates' }
  assert.match(refusal(() => readDraft(self)).message, /nothing before this step is called "candidates"/)
})

test('a pick chooses from an earlier step that RENDERS something', () => {
  const nowhere = clone(CHAIN)
  ;(nowhere.steps[2] as { pick: string }).pick = 'nobody'
  assert.match(refusal(() => readDraft(nowhere)).message, /nothing before this step presses "nobody"/)

  // ⚠️ AND NOT FROM ANOTHER PICK. Choosing from a choice is not a shape this app has, and catching
  // it here means the runner never has to have an opinion about it.
  const chained = clone(CHAIN)
  ;(chained.steps[3] as unknown as { pick: string; id: string }) = { id: 'second', pick: 'founder' }
  assert.match(refusal(() => readDraft(chained)).message, /nothing before this step presses "founder"/)
})

test('a slot no workflow has can never be filled, so it is refused', () => {
  const bad = clone(CHAIN)
  bad.steps[0]!.inputs = { vibe: 'ask' } as unknown as { prompt: string }
  assert.match(refusal(() => readDraft(bad)).message, /is not something a workflow takes/)
})

test('two steps of one name is ambiguous, not untidy — ids are how steps refer to each other', () => {
  const twice = clone(CHAIN)
  twice.steps[1]!.id = 'brief'
  assert.match(refusal(() => readDraft(twice)).message, /two steps are called "brief"/)
})

test('`repeat` has a ceiling, because it is the field that spends the disk', () => {
  const many = clone(CHAIN)
  many.steps[1]!.repeat = 4000
  refusal(() => readDraft(many))
})

test('a chain with no steps does nothing, and says so', () => {
  assert.match(refusal(() => readDraft({ slug: 'empty', steps: [] })).message, /does nothing/)
})

test('every problem is reported in one pass, not one per attempt', () => {
  const bad = clone(CHAIN)
  bad.steps[1]!.inputs = { prompt: 'later' }
  bad.steps[3]!.inputs = { prompt: 'ask', ref: 'elsewhere' }
  const err = refusal(() => readDraft(bad))
  assert.match(err.message, /"later"/)
  assert.match(err.message, /"elsewhere"/)
})

// ── the folder ────────────────────────────────────────────────────────────────

test('one file per composition — taking one cannot reach another', async () => {
  const { roots: r, done } = await roots()
  try {
    await saveComposition(r, CHAIN)
    await saveComposition(r, { ...CHAIN, slug: 'a-set', label: 'a set' })
    const { compositions, issues } = await loadCompositions(r)
    assert.deepEqual(issues, [])
    assert.deepEqual(compositions.map((c) => c.slug), ['a-family', 'a-set'])

    await deleteComposition(r, 'a-family')
    assert.deepEqual((await loadCompositions(r)).compositions.map((c) => c.slug), ['a-set'])
  } finally {
    await done()
  }
})

test('no folder is the ordinary first-run state, not an error', async () => {
  const { roots: r, done } = await roots()
  try {
    assert.deepEqual(await loadCompositions(r), { compositions: [], issues: [] })
  } finally {
    await done()
  }
})

test('a file that will not parse is REPORTED, and does not take the shelf with it', async () => {
  const { roots: r, done } = await roots()
  try {
    await saveComposition(r, CHAIN)
    await writeFile(join(r.data, 'compositions', 'broken.json'), '{ not json')
    const { compositions, issues } = await loadCompositions(r)
    assert.deepEqual(compositions.map((c) => c.slug), ['a-family'])
    assert.equal(issues.length, 1)
    assert.match(issues[0] ?? '', /broken\.json/)
  } finally {
    await done()
  }
})

test('a file whose contents disagree with its name would be unreachable, so it is an issue', async () => {
  const { roots: r, done } = await roots()
  try {
    await mkdir(join(r.data, 'compositions'), { recursive: true })
    await writeFile(join(r.data, 'compositions', 'elsewhere.json'),
      JSON.stringify({ composition: CHAIN }))
    const { compositions, issues } = await loadCompositions(r)
    assert.deepEqual(compositions, [])
    assert.match(issues[0] ?? '', /it calls itself "a-family"/)
  } finally {
    await done()
  }
})

test('forgetting one that was never there is refused by name', async () => {
  const { roots: r, done } = await roots()
  try {
    const err = await deleteComposition(r, 'ghost').then(() => null, (e: Error) => e)
    assert.ok(err instanceof CompositionError)
    assert.equal((err as CompositionError).status, 404)
  } finally {
    await done()
  }
})

test('⚠️ a name that is not a name cannot address a file', async () => {
  const { roots: r, done } = await roots()
  try {
    // The escape it would take to reach outside the folder is refused before a path is built.
    for (const bad of ['../../etc/passwd', 'a/b', '.']) {
      const err = await deleteComposition(r, bad).then(() => null, (e: Error) => e)
      assert.ok(err instanceof CompositionError, `${bad} was not refused`)
      assert.equal((err as CompositionError).status, 400)
    }
  } finally {
    await done()
  }
})

test('it is stored as it will be read — one round trip, no drift', async () => {
  const { roots: r, done } = await roots()
  try {
    const saved = await saveComposition(r, CHAIN)
    const onDisk = JSON.parse(await readFile(join(r.data, 'compositions', 'a-family.json'), 'utf-8'))
    assert.deepEqual(onDisk.composition, saved)
  } finally {
    await done()
  }
})

// ── what would run it ─────────────────────────────────────────────────────────

const candidate = (over: Partial<Candidate>): Candidate => ({
  slug: 'dev-fast', label: 'FLUX fast', kind: 't2i', model: 'a.ckpt',
  inputs: ['prompt'], lineage: null, slots: [], state: 'known', isDefault: false,
  caps: {}, params: {}, controls: [], loras: [], graph: null, missing: [], notes: null,
  declaration: { slug: 'dev-fast', kind: 't2i', model: 'a.ckpt' }, mine: false,
  service: 'dt', serviceLabel: 'Draw Things', medium: 'image',
  ...over,
} as Candidate)

test('a step binds to exactly what it was published with, when that is here', () => {
  const got = resolveComposition(readDraft(CHAIN), [
    candidate({ service: 'dt', slug: 'dev-fast' }),
    candidate({ service: 'dt', slug: 'sdxl-face', inputs: ['prompt', 'ref'] }),
  ])
  assert.deepEqual(got.bindings.map((b) => b.binding), ['xoko', 'exact', 'exact', 'exact'])
  assert.deepEqual(got.bindings.map((b) => b.workflow),
    [null, 'dt/dev-fast', null, 'dt/sdxl-face'])
  assert.equal(got.ready, true)
  assert.deepEqual(got.needs, [])
})

test('⚠️ ANYTHING OF THE RIGHT SHAPE ANSWERS, which is what makes a downloaded chain portable', () => {
  // Not one of the published names is installed. The machine has other checkpoints, and the chain
  // still runs — a step declares what it MAKES and which inputs it fills, and so does a workflow.
  const got = resolveComposition(readDraft(CHAIN), [
    candidate({ service: 'other', slug: 'my-t2i' }),
    candidate({ service: 'other', slug: 'my-ref', inputs: ['prompt', 'ref'] }),
  ])
  assert.deepEqual(got.bindings.map((b) => b.binding),
    ['xoko', 'substitute', 'exact', 'substitute'])
  assert.equal(got.bindings[3]?.workflow, 'other/my-ref')
  assert.equal(got.ready, true)
})

test('a workflow with an extra slot can answer a step that fills fewer — ⊇, not =', () => {
  const got = resolveComposition(readDraft(CHAIN), [
    candidate({ service: 'x', slug: 'roomy', inputs: ['prompt', 'ref', 'look'] }),
  ])
  // `candidates` fills only a prompt; `cast` fills prompt and ref. One workflow answers both.
  assert.equal(got.bindings[1]?.workflow, 'x/roomy')
  assert.equal(got.bindings[3]?.workflow, 'x/roomy')
})

test('a step nothing can answer names the gap first, and then the fix', () => {
  const got = resolveComposition(readDraft(CHAIN), [])
  // ⚠️ THE TEXT STEP IS NEVER ONE OF THEM. Words are xoko, which is not a thing to install — so an
  // empty machine leaves a chain missing two image workflows, and never a brain.
  assert.deepEqual(got.bindings.map((b) => b.binding), ['xoko', 'none', 'exact', 'none'])
  // The MEDIUM first: what is missing is a way to make a picture, and that one workflow happens to
  // be the published answer is the shortcut rather than the gap.
  assert.match(got.bindings[1]?.why ?? '', /^nothing installed makes image from words/)
  assert.match(got.bindings[1]?.why ?? '', /⤓ take dt\/dev-fast/)
  assert.match(got.bindings[3]?.why ?? '', /makes image from a ref/)
  assert.equal(got.ready, false)
  assert.deepEqual(got.needs, ['dt/dev-fast', 'dt/sdxl-face'])
})

test('bound but missing a file is not ready, and says which file', () => {
  const got = resolveComposition(readDraft(CHAIN), [
    // ⚠️ NO TEXT CANDIDATE, because there cannot be one: a `text` step binds to xoko and never to
    // a workflow (src/compositions/resolve.ts), and there is no `chat` kind left to write one with.
    candidate({ service: 'dt', slug: 'dev-fast', missing: [{ what: 'model', file: 'a.ckpt' }] }),
    candidate({ service: 'dt', slug: 'sdxl-face', inputs: ['prompt', 'ref'] }),
  ])
  assert.equal(got.bindings[1]?.binding, 'exact')
  assert.deepEqual([...(got.bindings[1]?.missing ?? [])], ['a.ckpt'])
  assert.equal(got.ready, false)
  assert.deepEqual(got.needs, ['a.ckpt'])
})

test('a text step is xoko, and can never be the reason a chain is not ready', () => {
  // ⚠️ NOT "IT RESOLVES TO A BRAIN" ANY MORE (2026-08-24). It resolves to NOTHING, on purpose: the
  // brain is the one already armed in 🔌, so a chain needing one image workflow never announces
  // itself as needing a local LLM — which is exactly what taking `mascot` used to do.
  const got = resolveComposition(readDraft(CHAIN), [candidate({ service: 'dt', slug: 'only-t2i' })])
  assert.equal(got.bindings[0]?.binding, 'xoko')
  assert.equal(got.bindings[0]?.workflow, null)
  assert.deepEqual([...(got.bindings[0]?.options ?? [])], [])
  assert.equal(got.bindings[1]?.workflow, 'dt/only-t2i')
})

test('every workflow that could answer a step is offered, so ⚙ has something to plug', () => {
  // ⚠️ THIS IS WHAT "A COMPOSITION PLUGS DIFFERENT ENGINES" ACTUALLY MEANS. Until there was a list
  // the resolver picked one and that was the end of it.
  const got = resolveComposition(readDraft(CHAIN), [
    candidate({ service: 'dt', slug: 'dev-fast' }),
    candidate({ service: 'other', slug: 'mine' }),
    candidate({ service: 'dt', slug: 'sdxl-face', inputs: ['prompt', 'ref'] }),
  ])
  // ⊇, exactly as the binding rule is: a workflow with a spare `ref` can answer a step that fills
  // only the prompt, so it is offerable too — the slot is simply left empty.
  assert.deepEqual(got.bindings[1]?.options.map((o) => o.workflow),
    ['dt/dev-fast', 'other/mine', 'dt/sdxl-face'])
  assert.deepEqual(got.bindings[1]?.options.map((o) => o.published), [true, false, false])
  // A step wiring a `ref` is narrower, and its list says so.
  assert.deepEqual(got.bindings[3]?.options.map((o) => o.workflow), ['dt/sdxl-face'])
})

test('an option carries whose family it is from, because the ⚙ band sorts on it', () => {
  // ⚠️ WHY A STEP'S LIST NEEDS THIS AND A SHELF'S DOES NOT (2026-08-29). A shelf answers one press
  // and the parts inside it already match — that is what a workflow IS. A chain hands step 2 the
  // picture step 1 drew, and there the FAMILIES have to agree as well: an SDXL IP-Adapter reading
  // a FLUX founder does not fail, it renders something plausible and wrong. The resolver does not
  // act on it — every option that can answer is still offered — it carries it, and the band sorts.
  const got = resolveComposition(readDraft(CHAIN), [
    candidate({ service: 'dt', slug: 'dev-fast', lineage: 'flux' }),
    candidate({ service: 'dt', slug: 'sdxl-face', inputs: ['prompt', 'ref'], lineage: 'sdxl' }),
    candidate({ service: 'x', slug: 'anon', inputs: ['prompt', 'ref'] }),
  ])
  assert.deepEqual(got.bindings[1]?.options.map((o) => o.lineage), ['flux', 'sdxl', null])
  // ⚠️ NULL IS CARRIED, NOT COERCED. A workflow nobody described says nothing about whether it fits,
  // and calling that a match — or a mismatch — invents a fact the library never stated.
  assert.deepEqual(got.bindings[3]?.options.map((o) => o.lineage), ['sdxl', null])
  // And nothing was filtered out for it: crossing families is sometimes the ask.
  assert.equal(got.bindings[3]?.options.length, 2)
})

// ── what a text step is actually asked ────────────────────────────────────────
//
// ⚠️ THE FAILURE THIS PREVENTS IS NOT A CRASH. Without a frame, a chat model answers "Sure! Here's
// a vivid description:" and the next step renders THAT. Verified against a real brain: the framed
// ask comes back as the prompt alone, no preamble.

test('a step`s own instruction wins, and the frame is added anyway', () => {
  const got = saysFor({ says: 'Rewrite this as a scene.' })
  assert.match(got, /^Rewrite this as a scene\./)
  assert.doesNotMatch(got, /ignored/)
  // ⚠️ THE FRAME IS NOT ADVICE ABOUT THE TASK — it is the fact that a program reads this, which no
  // composition author should have to remember to say.
  assert.match(got, /no preamble/)
})

test('a step with nothing to go on still gets the floor', () => {
  // ⚠️ THE WORKFLOW USED TO BE THE SECOND SOURCE, and it cannot be any more (2026-08-24). It worked
  // because the step NAMED the workflow, chosen for that one job; words are xoko now, so the label
  // available says who is answering rather than what this step is for. The parser requires `says`
  // on a text step for exactly this reason — this is the floor under a chain written before it did.
  const got = saysFor({})
  assert.match(got, /no preamble/)
  assert.ok(got.length < 400, 'the floor is two sentences, not a personality')
})

// ── `each`, `list`, and the BIND — what makes a chain able to build ───────────────────────────
//
// ⚠️ WHAT IS BEING DEFENDED HERE IS THE DIFFERENCE BETWEEN TWO KINDS OF MANY (2026-08-24).
// `repeat: 12` is twelve takes of ONE thing and you keep one; `each` is one press per item and you
// keep them all. They read alike in a file and produce opposite results, so every rule that keeps
// them apart is worth a test — a book whose pages are twelve variants of concept one is not a book.

/** A draft, deliberately untyped: `readDraft` takes `unknown` and these are the shapes a PUBLISHED
 *  file can be, including the wrong ones. Typing them would test the compiler, not the parser. */
const draft = (...steps: unknown[]): unknown => ({ slug: 'a-chain', steps })

test('`each` names a source of items, and it must be one that came before and made something', () => {
  const made = readDraft(draft(
    { id: 'cast', makes: 'image', repeat: 4, inputs: { prompt: 'ask' } },
    { id: 'cut', makes: 'image', each: 'cast', inputs: { ref: 'cast' }, recommends: 'rembg/cutout' },
  ))
  assert.equal(made.steps.length, 2)

  assert.match(refusal(() => readDraft(draft(
    { id: 'cut', makes: 'image', each: 'nothing-here', inputs: { prompt: 'ask' } },
  ))).message, /nothing before this step makes/)

  // `ask` is always legal: a person typing one concept per line IS the list.
  const asked = readDraft(draft({ id: 'per-line', makes: 'image', each: 'ask', inputs: { prompt: 'ask' } }))
  const first = asked.steps[0]
  assert.equal(isMake(first!) ? first.each : null, 'ask')
})

test('a `list` is a text answer, and never one a step already answers item by item', () => {
  const words = readDraft(draft({ id: 'briefs', makes: 'text', list: true, inputs: { prompt: 'ask' }, says: 'One per line.' }))
  const first = words.steps[0]
  assert.equal(isMake(first!) ? first.list : null, true)

  assert.match(refusal(() => readDraft(draft(
    { id: 'nope', makes: 'image', list: true, inputs: { prompt: 'ask' } },
  ))).message, /`list` is for a `text` step/)

  assert.match(refusal(() => readDraft(draft(
    { id: 'briefs', makes: 'text', list: true, inputs: { prompt: 'ask' }, says: 'One per line.' },
    { id: 'more', makes: 'text', list: true, each: 'briefs', inputs: { prompt: 'briefs' }, says: 'One per line.' },
  ))).message, /already answers once per item/)
})

test('a chain ENDS by binding — the step that makes it produce something rather than a pile', () => {
  const book = readDraft(draft(
    { id: 'briefs', makes: 'text', list: true, inputs: { prompt: 'ask' }, says: 'One per line.' },
    { id: 'pages', makes: 'image', each: 'briefs', inputs: { prompt: 'briefs' } },
    { id: 'bound', binds: 'pdf', parts: 'pages', captions: 'briefs', page: 'square' },
  ))
  const last = book.steps.at(-1)!
  assert.ok(isBind(last))
  assert.equal(isBind(last) && last.parts, 'pages')
  assert.equal(isBind(last) && last.captions, 'briefs')
  assert.equal(isBind(last) && last.page, 'square')

  // ⚠️ IT NAMES NO WORKFLOW AND NO MEDIUM, and that is the whole correction of 2026-08-24: binding
  // reaches no engine, so a `bind` workflow on a `builtin` service making a `book` medium was three
  // inventions to file one PDF — and it put a product name in the app's list of materials.
  assert.match(refusal(() => readDraft(draft(
    { id: 'pages', makes: 'image', inputs: { prompt: 'ask' } },
    { id: 'bound', binds: 'pdf', parts: 'pages', recommends: 'builtin/book' },
  ))).message, /recommends: unknown field/)

  // …and its two references are held to the same rule as every other: earlier, and real.
  assert.match(refusal(() => readDraft(draft(
    { id: 'pages', makes: 'image', inputs: { prompt: 'ask' } },
    { id: 'bound', binds: 'pdf', parts: 'nothing' },
  ))).message, /nothing before this step makes/)
  assert.match(refusal(() => readDraft(draft(
    { id: 'pages', makes: 'image', inputs: { prompt: 'ask' } },
    { id: 'bound', binds: 'pdf', parts: 'pages', captions: 'nowhere' },
  ))).message, /captions come from an earlier/)

  // ⚠️ LAST OR NOTHING. The chain's result is the run's result, so a bind in the middle is a chain
  // that carried on after it had already finished.
  assert.match(refusal(() => readDraft(draft(
    { id: 'pages', makes: 'image', inputs: { prompt: 'ask' } },
    { id: 'bound', binds: 'pdf', parts: 'pages' },
    { id: 'after', makes: 'image', inputs: { prompt: 'ask' } },
  ))).message, /has to be the last step/)

  // A container this app cannot write is refused by name rather than attempted.
  assert.match(refusal(() => readDraft(draft(
    { id: 'pages', makes: 'image', inputs: { prompt: 'ask' } },
    { id: 'bound', binds: 'epub', parts: 'pages' },
  ))).message, /expected one of pdf/)
})

/**
 * ⚠️ ▶ IS NOT THE PERSON'S PRESS ON EVERY CHAIN (2026-09-04). One press from your own sentence is
 * what ▶ means; a chain whose result is a DOCUMENT — a composition to install, a book, a set of
 * SVGs — is work with a shape, and the author hands it to xoko instead. Declared, never derived:
 * the first guess at deriving it was "ends in a picture", which is wrong the moment a card-deck
 * chain ends in twelve of them and is still nobody's one press.
 */
test('a composition may say ▶ is not the person’s, and silence means it is', () => {
  assert.equal(readDraft(draft(
    { id: 'page', makes: 'image', inputs: { prompt: 'ask' } },
  )).press, undefined)

  const xokosOwn = readDraft({
    slug: 'a-chain',
    press: false,
    steps: [{ id: 'shape', makes: 'text', verbatim: true, inputs: { prompt: 'ask' }, says: 'Write the composition, JSON only.' }],
  })
  assert.equal(xokosOwn.press, false)

  // It survives the round trip through disk, like every other thing a chain declares about itself.
  assert.equal(readDraft({ ...(xokosOwn as object), press: true }).press, true)

  assert.match(refusal(() => readDraft({
    slug: 'a-chain', press: 'no',
    steps: [{ id: 'page', makes: 'image', inputs: { prompt: 'ask' } }],
  })).message, /press: expected true or false/)
})
