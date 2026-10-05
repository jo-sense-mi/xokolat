// WHAT EACH MEDIUM CAN BE ASKED FOR — the table that decides whether a published hole is reachable.
//
// The thing being defended is a silent kind of dead end. A workflow declares its holes and `fill()`
// skips the ones nothing was sent for, so a medium whose knob table is empty renders perfectly and
// ignores every setting on the graph: no editor draws them, no request carries them, and xoko is
// never told they exist. Nothing fails. The music simply always comes out at 120 bpm in C major.
//
// So these tests are about the table being POPULATED and HONEST — that the media the app generates
// have a vocabulary, and that every choice in it is a string the model would really accept.

import assert from 'node:assert/strict'
import test from 'node:test'

import { ACE_KEYSCALES, ACE_KEYSCALE_DEFAULT, ACE_LANGUAGES, ACE_LANGUAGE_DEFAULT } from '../src/inference/comfy/ace.ts'
import type { Knob } from '../src/inference/knobs.ts'
import { knobFor, knobProblem, knobsFor, knobsProblem, settableKnobs } from '../src/inference/knobs.ts'
import { fallbackLies, holeLiteral, reservedHole } from '../src/types/workflow.ts'
import { MEDIA } from '../src/types/medium.ts'

test('every medium this app generates has something it can be asked for', () => {
  // ⚠️ model3d is the deliberate exception and it is named rather than skipped: an image-to-3D
  // workflow takes a picture and nothing else, so an empty table there is the true answer.
  for (const medium of MEDIA) {
    const knobs = knobsFor(medium)
    if (medium === 'model3d') {
      assert.equal(knobs.length, 0, 'a mesh is asked for with a picture, not with settings')
      continue
    }
    assert.ok(knobs.length > 0, `${medium} can be asked for nothing at all`)
  }
})

test('a knob is described, and described in a sentence a person could act on', () => {
  for (const medium of MEDIA) {
    for (const knob of knobsFor(medium)) {
      assert.ok(knob.what.length > 20, `${medium}.${knob.key} says nothing useful about itself`)
      assert.ok(knob.key === knob.key.trim() && !knob.key.includes(' '),
        `${medium}.${knob.key} is not a wire name`)
    }
  }
})

test('a choice knob offers only strings the model would accept, and its fallback is one of them', () => {
  for (const medium of MEDIA) {
    for (const knob of knobsFor(medium)) {
      if (knob.kind !== 'choice') continue
      assert.ok(knob.choices?.length, `${medium}.${knob.key} is a choice with nothing to choose`)
      if (knob.fallback === undefined) continue
      assert.ok(knob.choices.includes(String(knob.fallback)),
        `${medium}.${knob.key} falls back to a value it does not offer`)
    }
  }
})

test('the music table round-trips through the checker that guards a render', () => {
  const ok = (key: string, value: unknown): void => {
    const knob = knobFor('music', key)
    assert.ok(knob, `music has no ${key}`)
    assert.equal(knobProblem(knob, value), null, `music.${key} refused ${JSON.stringify(value)}`)
  }
  const bad = (key: string, value: unknown): void => {
    const knob = knobFor('music', key)
    assert.ok(knob)
    assert.ok(knobProblem(knob, value), `music.${key} accepted ${JSON.stringify(value)}`)
  }

  ok('duration', 94)
  bad('duration', 600)      // past the graph's own ceiling
  bad('duration', 12.5)     // seconds are whole here
  ok('bpm', 72)
  // ⚠️ 208 IS LEGAL AND USED NOT TO BE. The range shipped as 40–200 — a guess at what music sounds
  // like, in the file whose entire rule is declare-never-infer — and it refused a tempo the node
  // takes. `GET /object_info/TextEncodeAceStepAudio1.5` says 10–300.
  ok('bpm', 208)
  bad('bpm', 400)
  ok('timesignature', '3')
  bad('timesignature', '5')   // the model was not trained on it, and the COMBO refuses it
  bad('timesignature', 4)     // the node's options are strings
  ok('keyscale', 'D minor')
  // ⚠️ THE CASE MATTERS AND THAT IS THE MODEL'S DOING, not ours. `TextEncodeAceStepAudio1.5`
  // compares the string exactly and answers `value_not_in_list` — this is the check that says so
  // before a step is sampled rather than after a minute of loading.
  bad('keyscale', 'D Minor')
  ok('language', 'ca')
  bad('language', 'klingon')
  ok('lyrics', '[Verse]\nlights on the skyline')
  bad('lyrics', 120)
})

test('a voice is described in words, because that is the channel the script is not', () => {
  const voice = knobFor('voice', 'voice')
  assert.ok(voice)
  assert.equal(voice.kind, 'text')
  assert.equal(knobProblem(voice, "an old man's voice, deep and weathered"), null)
  assert.ok(knobProblem(voice, 1301))
})

test('the two languages are two vocabularies, and mixing them would be silent', () => {
  // ⚠️ ACE-Step takes ISO codes and Qwen3-TTS takes English names, from two vendors' nodes. One
  // shared `language` list keyed by nothing would send `ca` to a node expecting `Catalan` — which
  // the COMBO refuses, at render time, on a value the app offered.
  const music = knobFor('music', 'language')
  const voice = knobFor('voice', 'language')
  assert.ok(music && voice)
  assert.equal(knobProblem(music, 'ca'), null)
  assert.ok(knobProblem(voice, 'ca'), 'a code is not a name')
  assert.equal(knobProblem(voice, 'Spanish'), null)
  assert.ok(knobProblem(music, 'Spanish'), 'a name is not a code')
  // Auto is a real option, not an absence: it reads the language off the script.
  assert.equal(knobProblem(voice, 'Auto'), null)
})

test('steps and cfg are a choice between workflows, never a knob on a song', () => {
  // Two music workflows differing only in these two numbers are the fast one and the careful one.
  // Offering them here would let one press quietly become the other.
  for (const key of ['steps', 'cfg', 'sampler']) {
    assert.equal(knobFor('music', key), undefined, `music should not expose ${key}`)
  }
})

test("ACE-Step's own enums are the node's, not a curated subset", () => {
  assert.equal(ACE_KEYSCALES.length, 34)
  assert.equal(ACE_LANGUAGES.length, 51)
  assert.ok(ACE_KEYSCALES.includes(ACE_KEYSCALE_DEFAULT))
  assert.ok(ACE_LANGUAGES.includes(ACE_LANGUAGE_DEFAULT))
  // Both spellings of an accidental are separate options because the node lists them separately.
  assert.ok(ACE_KEYSCALES.includes('C# major') && ACE_KEYSCALES.includes('Db major'))
  // `unknown` is a real option — "the language is unspecified", not a missing value.
  assert.ok(ACE_LANGUAGES.includes('unknown'))
})

test('⚠️ a workflow declares its OWN parameters, and the app admits ones it has never heard of', () => {
  // THE RULE THIS ENFORCES: a workflow IS a graph — a pipeline of nodes, every widget on it
  // tweakable, shipped with the defaults it was published for. A parameter is never a product.
  //
  // What it replaced: `music-fast` / `music-detail` / `music-base` / `music-light` were ONE graph
  // published four times, differing only in a checkpoint and a step count — and because the app
  // was the authority on which knobs existed, three of the four had `lyrics` frozen out of them
  // entirely and could not sing. Turning numbers into workflows cost the medium half its capability.
  const graph = {
    holes: {
      prompt: '94.tags',
      // A knob the medium's table knows — the graph's range wins over ours.
      bpm: { at: '94.bpm', kind: 'integer', range: [10, 300], fallback: 120 },
      // A knob NOTHING in this app has ever heard of, admitted on its own declaration alone.
      octree: {
        at: '8.octree_resolution', kind: 'integer', range: [16, 512], fallback: 128,
        what: 'the voxel grid the shape is decoded onto',
      },
      // …and one kept off the always-sent map line without being kept out of reach.
      bitrate: {
        at: '107.quality', kind: 'choice', choices: ['V0', '128k', '320k'],
        fallback: 'V0', advanced: true, what: 'how the mp3 master is encoded',
      },
    },
  } as const

  const knobs = settableKnobs('music', graph as never)
  const by = new Map<string, Knob>(knobs.map((k) => [k.key, k]))

  assert.ok(!by.has('prompt'), 'the sentence is not a knob')
  assert.deepEqual(by.get('bpm')?.range, [10, 300])
  // The stranger is real, typed, and validated — which is what makes a workflow published tomorrow
  // operable today, with no release of this app.
  const octree = by.get('octree')
  assert.ok(octree, 'a hole the table never heard of was dropped')
  assert.equal(knobProblem(octree, 256), null)
  assert.ok(knobProblem(octree, 4096), 'the graph said 16–512 and nothing enforced it')
  assert.match(octree.what, /voxel grid/)
  // Advanced is a display flag on ONE crowded line, never a limit.
  assert.equal(by.get('bitrate')?.advanced, true)
  assert.equal(knobProblem(by.get('bitrate')!, '320k'), null)
  assert.ok(knobProblem(by.get('bitrate')!, 'flac'))
  // A knob the medium knows but this graph has no hole for is simply not settable here.
  assert.ok(!by.has('keyscale'), 'a knob with no hole was offered anyway')
})

test('⚠️ a graph may not name a hole `model` — the app fills that one itself', () => {
  // THE FAILURE THIS PREVENTS, in full (2026-08-23). A published voice workflow declared a hole
  // called `model` meaning "which Qwen3-TTS size", enum ["0.6B","1.7B"]. `mergeParams` writes the
  // RESOLVED CHECKPOINT into `params.model` on every press unconditionally, and for that workflow the
  // checkpoint was the string "Qwen3-TTS-1.7B" — a name for the record, as the library's own notes
  // said, not a path. The adapter wrote it into the node. ComfyUI refused the graph in 0.0s.
  assert.equal(reservedHole({ prompt: '1.text', seed: '1.seed', size: '1.model_choice' }), null,
    '`prompt` and `seed` are the app\'s words too — those holes exist so the app can fill them')
  assert.equal(reservedHole(undefined), null)
  const said = reservedHole({ model: '1.model_choice' })
  assert.match(said ?? '', /the app's own word for the checkpoint/)
  assert.match(said ?? '', /a Qwen3-TTS size is `size`/, 'a refusal that names no fix is half a refusal')

  // And nothing draws a control for one that got in through a hand-written registry.
  const graph = { holes: { model: { at: '1.model_choice', kind: 'choice', choices: ['0.6B'] } } }
  assert.deepEqual(settableKnobs('voice', graph as never).map((k) => k.key), [])
})

test('⚠️ what is about to be SENT is checked against what the workflow declared', () => {
  // `src/inference/params.ts` opens with "a violation is rejected with a named error, never
  // silently clamped" — and enforced it only for the knobs the app had written TypeScript for.
  // Everything a WORKFLOW declares went out unchecked and was refused by the service instead.
  const graph = {
    holes: {
      size: { at: '1.model_choice', kind: 'choice', choices: ['0.6B', '1.7B'], fallback: '1.7B' },
      bpm: { at: '94.bpm', kind: 'integer', range: [10, 300] },
    },
  } as const

  assert.equal(knobsProblem('music', graph as never, { size: '1.7B', bpm: 72 }), null)
  // The exact value that reached ComfyUI.
  assert.match(
    knobsProblem('music', graph as never, { size: 'Qwen3-TTS-1.7B' }) ?? '',
    /is not a size this engine takes — one of: 0\.6B, 1\.7B/)
  assert.match(knobsProblem('music', graph as never, { bpm: 900 }) ?? '', /between 10 and 300/)
  // ⚠️ A KEY WITH NO HOLE IS NOT AN ERROR. The merged bag is full of things that are nobody's knob
  // here — a checkpoint, a negative, an image size on a song — and refusing those refuses every
  // press. `fill()` drops them and the graph's own value stands.
  assert.equal(knobsProblem('music', graph as never, { model: 'anything.safetensors', width: 1024 }), null)
})

test('a knob says whether its value is PROSE, and the graph may say so too', () => {
  // The control picked a textarea by comparing the key to the literal `'lyrics'`, so 🗣's voice
  // description — the one field in that section, and prose by definition — was a 190px strip.
  assert.equal(knobFor('music', 'lyrics')?.multiline, true)
  assert.equal(knobFor('voice', 'voice')?.multiline, true)
  assert.notEqual(knobFor('music', 'bpm')?.multiline, true)

  const graph = { holes: { script: { at: '3.text', kind: 'text', multiline: true, what: 'the words' } } }
  const [script] = settableKnobs('voice', graph as never)
  assert.equal(script?.multiline, true, 'a workflow published tomorrow can say its hole is prose')
})

/**
 * ⚠️ THE PRESS THAT PRODUCED FOUR STRANGERS (2026-08-23). A ComfyUI graph declares its seed as a
 * bare `"seed": "1.seed"` — an address with no shape — so `knobFromHole` had nothing to draw and
 * nothing to validate, and with no table entry either the field simply did not exist: the adapter
 * minted a random number every press and no control, no map line and no ⚙ pane ever mentioned it.
 * For a voice-design node that number IS the speaker, so four presses of one description were four
 * different people and the only visible knob — the description — was not the one that was moving.
 */
test('🗣 and 🎼 can pin a seed, and a bare hole is enough for it to appear', () => {
  for (const medium of ['voice', 'music'] as const) {
    const seed = knobFor(medium, 'seed')
    assert.ok(seed, `${medium} must be able to say which seed it wants`)
    assert.equal(seed?.kind, 'integer')
    // A bare target, exactly as every published graph writes it. The table is what gives it shape.
    const [only] = settableKnobs(medium, { holes: { seed: '1.seed' } } as never)
    assert.equal(only?.key, 'seed', 'an address with no spec still reaches the table')
    assert.equal(only?.kind, 'integer')
    assert.equal(knobProblem(only as Knob, 2496167935), null, 'the seeds the adapter mints are legal')
    assert.match(String(knobProblem(only as Knob, -1)), /\S/, 'and a number no seed can be is not')
  }
})

/**
 * ⚠️ 🖼 WAS THE EXCEPTION AND THE EXCEPTION WAS A HOLE (2026-09-04). This asserted the opposite —
 * no seed for a picture — on the rule that size and seed are ASK-shaped and belong to "the making
 * page's ⚙, per press". That second surface was never built, so for the whole life of the app the
 * most-used section had no size box and no seed box, and xoko was never told either existed:
 * every picture came out 1024×1024, and "the same one again, wider" was unreachable.
 *
 * `resolveImageKnobs` has validated all three on every press since it was written. The table is
 * the only surface there is, so they live in it.
 */
test('🖼 can be given a size and a seed, like every other medium', () => {
  for (const key of ['width', 'height', 'seed'] as const) {
    const knob = knobFor('image', key)
    assert.ok(knob, `a picture must be able to say its ${key}`)
    assert.equal(knob?.kind, 'integer')
  }
  // The ones almost nobody moves are folded — still settable, out of the pane's first screen and
  // out of the map line that rides on every question.
  for (const key of ['shift', 'clipSkip', 'guidanceEmbed', 'seedMode', 'strength', 'imageGuidance']) {
    assert.equal(knobFor('image', key)?.advanced, true, `${key} belongs behind the disclosure`)
  }
  for (const key of ['width', 'height', 'seed', 'steps', 'cfg', 'sampler']) {
    assert.notEqual(knobFor('image', key)?.advanced, true, `${key} is what somebody actually sets`)
  }
  // ⚠️ AND `negative` IS STILL OUT, because `resolveImageKnobs` REFUSES one on an engine whose
  // caps say it takes none — which is both installed image engines. A box that always errors is
  // worse than no box.
  assert.ok(!knobFor('image', 'negative'), 'a negative is caps-gated, not knob-gated')
})

/**
 * ⚠️ A WORKFLOW WITH NO GRAPH GOT THE WHOLE TABLE, AND THE TABLE WAS NOT ABOUT IT (2026-09-04).
 * `cutout` is a background remover reached over plain HTTP. It was offered a sampler, a cfg, a
 * clipSkip and a seedMode — nine boxes, none of them reaching the service — because a graph is the
 * only thing that could narrow the table and it has none. `knobs` is how it says so.
 */
test('a graphless workflow may say which of the medium’s knobs it reads', () => {
  const whole = settableKnobs('image', null)
  assert.ok(whole.length > 3, 'no declaration is still the whole table')

  const some = settableKnobs('image', null, undefined, ['width', 'height'])
  assert.deepEqual(some.map((k) => k.key), ['width', 'height'])

  assert.equal(settableKnobs('image', null, undefined, []).length, 0,
    'nothing to set is a real answer, and it is the honest one for a cutout')
})

/**
 * ⚠️ "AS PUBLISHED" USED TO BE UNKNOWABLE, AND ONE OF THE VALUES RUINS A RENDER (2026-08-31).
 *
 * A blank control means "send nothing, the graph's own value stands" — a good rule that was kept as
 * a secret: every box read the words `as published`, so the only way to learn what stood was to
 * render. `ace-step` publishes the turbo checkpoint at `steps 8, cfg 1.0`; the sft profile wants
 * `50 / 3.5`. Cross them in either direction and the track distorts, and the app said nothing.
 *
 * ⚠️ AND THE FIRST ANSWER PUT `fallback` ABOVE THE LITERAL, WHICH WAS THE SAME BUG WEARING A FIX
 * (2026-08-31, same day). Nothing sends a fallback — `fill()` writes the bag and nothing else — so
 * on a graph the literal is what runs, full stop. `ambience` declared `duration: 10` over a node
 * holding 120, this said 10, and six minutes of compute later two minutes of looping music came
 * back. A `fallback` now answers only where the node carries no such input, and one that disagrees
 * with a literal is refused at parse (`fallbackLies`, below).
 */
test('a control can say what will happen if you leave it alone', () => {
  const graph = {
    nodes: {
      3: { class_type: 'KSampler', inputs: { steps: 8, cfg: 1.0, seed: ['109', 0] } },
      94: { class_type: 'TextEncodeAceStepAudio1.5', inputs: { bpm: 120, keyscale: 'C major' } },
      109: { class_type: 'PrimitiveInt', inputs: { value: 77 } },
    },
    holes: {
      // A bare target — the commonest form, and the one that showed an empty box.
      bpm: '94.bpm',
      // A declared shape with no opinion about the value: the node's literal is the answer.
      keyscale: { at: '94.keyscale', kind: 'choice', choices: ['C major', 'D minor'] },
      // The publisher declaring a value for a widget the saved graph does not carry — the
      // Qwen3-TTS case, where ComfyUI fills it from the node's own default and the declaration is
      // the only statement the app has about what that is.
      shift: { at: '94.shift', kind: 'number', range: [0, 10], fallback: 3 },
      // A declared value that AGREES with the node, which is the only way to declare one over an
      // input the graph does carry.
      steps: { at: '3.steps', kind: 'integer', range: [1, 200], fallback: 8 },
      // And the seed, wired to another node rather than typed into this one.
      seed: '3.seed',
    },
  } as const

  const by = new Map(settableKnobs('music', graph as never).map((k) => [k.key, k]))
  assert.equal(by.get('bpm')?.published, 120, 'a bare hole still knows what its node holds')
  assert.equal(by.get('keyscale')?.published, 'C major')
  assert.equal(by.get('steps')?.published, 8, 'the node is what runs, and a fallback agrees with it')
  assert.equal(by.get('shift')?.published, 3,
    'a fallback is the answer where the node carries no such input — and only there')
  // ⚠️ A WIRE IS NOT A VALUE. `["109", 0]` means "whatever node 109 produced"; printing it as a
  // default would put a node reference in a spinner.
  assert.equal(by.get('seed')?.published, undefined)

  // The workflow's own params are the last thing written before the adapter sees the bag, so they are
  // the last thing to decide what "leave it alone" means.
  const mine = new Map(
    settableKnobs('music', graph as never, { steps: 12, bpm: 90, shift: 5 }).map((k) => [k.key, k]))
  assert.equal(mine.get('steps')?.published, 12)
  assert.equal(mine.get('bpm')?.published, 90)
  assert.equal(mine.get('shift')?.published, 5, 'and they outrank a fallback too')

  // ⚠️ AND WITHOUT A GRAPH IT IS THE TABLE'S OWN FALLBACK, which is a different mechanism reaching
  // the same honest answer: a field-building adapter SENDS the fallback for a knob nobody set, so
  // the fallback is what runs. A graph adapter sends nothing and the literal runs.
  const fieldy = new Map(settableKnobs('image', null).map((k) => [k.key, k]))
  assert.equal(fieldy.get('steps')?.published, knobFor('image', 'steps')?.fallback)
})

/**
 * ⚠️ THE TWO-MINUTE RAIN (2026-08-31) — the workflow that advertised a number it did not run at.
 *
 * `ambience` was forked from the ACE-Step song graph and kept its 120-second literal in the nodes,
 * while its `duration` hole declared `fallback: 10`. Nothing sends a fallback, so the app printed
 * "runs at 10" everywhere a value is shown — the ⚙ box, `▶ look: workflow`, the map xoko rides on —
 * and 120 ran. xoko left the knob alone exactly as it is told to, reported ten seconds in good
 * faith, and six minutes of compute produced two minutes of looping music that was not rain.
 *
 * Every party was honest. The workflow was wrong, so the workflow is what gets refused — at the app's
 * door and at the library's, in the same words.
 */
test('⚠️ a workflow may not advertise a value it does not run at', () => {
  const nodes = {
    3: { class_type: 'KSampler', inputs: { steps: 8, cfg: 1.0, seed: ['109', 0] } },
    94: { class_type: 'TextEncodeAceStepAudio1.5', inputs: { duration: 120 } },
    98: { class_type: 'EmptyAceStep1.5LatentAudio', inputs: { seconds: 120 } },
  }

  // The real one, as published: two addresses holding 120 under a hole that says 10.
  const said = fallbackLies(nodes, {
    duration: { at: ['94.duration', '98.seconds'], kind: 'number', fallback: 10 },
  })
  assert.match(said ?? '', /duration says it runs at 10 and its node holds 120/)
  assert.match(said ?? '', /nothing sends a fallback/, 'a refusal that names no cause is half a refusal')
  assert.match(said ?? '', /Put the recommended value in the node/, 'and it says how to fix it')

  // Agreeing is the only legal way to declare one over an input the graph carries…
  assert.equal(fallbackLies(nodes, {
    duration: { at: ['94.duration', '98.seconds'], kind: 'number', fallback: 120 },
    steps: { at: '3.steps', kind: 'integer', fallback: 8 },
  }), null)
  // …and over one it does not carry, a fallback is the app's only statement about the node's own
  // default — seven of Qwen3-TTS's widgets are exactly this, and none of them is a lie.
  assert.equal(fallbackLies(nodes, { shift: { at: '94.shift', kind: 'number', fallback: 3 } }), null)
  // A bare target declares nothing, so there is nothing to disagree with.
  assert.equal(fallbackLies(nodes, { duration: '94.duration' }), null)
  assert.equal(fallbackLies(undefined, undefined), null)

  // ⚠️ AND A WIRE IS NOT A VALUE — `["109", 0]` is "whatever node 109 produced", which is neither a
  // literal to run nor a number to disagree with.
  assert.equal(holeLiteral(nodes, '3.seed'), undefined)
  assert.equal(holeLiteral(nodes, '94.duration'), 120)
  assert.equal(holeLiteral(nodes, ['98.seconds', '94.duration']), 120, 'the first target, and no other')
  assert.equal(fallbackLies(nodes, { seed: { at: '3.seed', kind: 'integer', fallback: 77 } }), null)
})

/**
 * ⚠️ AN ENUM IS A SHORTCUT OVER THE WORDS, NEVER A BOUNDARY (2026-08-31).
 *
 * Qwen3-TTS publishes eleven languages and Catalan is not one of them — and a description saying
 * *en català* produces Catalan anyway. So a subordinate hole must never be auto-filled: a
 * `language` quietly set to `Spanish` would OVERRIDE a description asking for Catalan, which is the
 * app taking away a capability the model has.
 */
test('a list that narrows the words is not the edge of what the model does', () => {
  const graph = {
    nodes: { 1: { class_type: 'FB_Qwen3TTSVoiceDesign', inputs: { language: 'Auto' } } },
    holes: {
      language: {
        at: '1.language', kind: 'choice', choices: ['Auto', 'English', 'Spanish'],
        subordinate: true,
      },
    },
  } as const
  const [lang] = settableKnobs('voice', graph as never)
  assert.equal(lang?.subordinate, true, 'the flag has to survive the merge or nothing reads it')
  // It is still a real enum: what the list holds is still all this widget takes.
  assert.equal(knobProblem(lang as Knob, 'Spanish'), null)
  assert.ok(knobProblem(lang as Knob, 'Catalan'), 'the widget itself has no Catalan to offer')
})

/**
 * ⚠️ THE UNIT SAID WHAT THE NUMBER COUNTS AND NEVER WHAT IT IS WORTH (2026-09-04). 🎬's clock is
 * frames; asked for five seconds, xoko wrote `duration 5` — a knob 🎬 does not have — and the press
 * died on the refusal. A person had the same problem in the other direction: a menu reading
 * 56 | 90 | 124 | 158 is four numbers to divide by hand. `perSecond` is the arithmetic as a number
 * rather than as English inside the unit string, so a control and a map line can both compute it.
 */
test('a knob counted in something other than seconds can say what it is worth', () => {
  const length = knobFor('video', 'length')
  assert.equal(length?.unit, 'frames')
  assert.equal(length?.perSecond, 16, 'Wan runs at 16fps, so 81 frames is five seconds')

  // It comes off a HOLE too, which is how a published workflow at another frame rate says so.
  const [own] = settableKnobs('video', {
    holes: { length: { at: '6.length', kind: 'integer', range: [5, 3600], unit: 'frames', perSecond: 24 } },
  } as never)
  assert.equal(own?.perSecond, 24)
})
