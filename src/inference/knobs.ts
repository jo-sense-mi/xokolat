// THE KNOB VOCABULARY — what a checkpoint can be told to run at, declared once.
//
// ⚠️ WHY THIS EXISTS (2026-08-07). The ⚙ editor's first rule was "you may retune what the
// checkpoint DECLARES, and nothing else" — sound while the only service was one the app ships a
// registry for, and useless the moment someone adds their own. A user's ComfyUI declares nothing,
// every checkpoint on it is `discovered`, and the editor drew an empty panel saying there was
// nothing to move. The rule was defending against inventing a knob nobody could send; it was
// enforcing that by asking the wrong authority.
//
// So the authority moves to where it actually lives: THE APP KNOWS ITS OWN WIRE FORMAT. A knob is
// offerable when this table says the adapter reads it, not when a registry row happened to
// mention it. That is still "declare, never infer" (PLAN §4) — it is simply declared by the code
// that would have to send it.
//
// ⚠️ AND THE FALLBACKS LIVE HERE TOO, so the editor's placeholder is the value that would really
// be sent. They were literals inside the adapter, which meant the only way to learn what an
// unset `cfg` does was to read the adapter.
//
// Keyed by MEDIUM, because that is the granularity that is true today. When a second adapter for
// one medium lands with a different wire format, this becomes per transport — and the table, not a
// branch in the editor, is what changes.
//
// ⚠️ AND IT IS NO LONGER ABOUT THE ⚙ EDITOR ALONE (2026-08-23). A table that named only `image`
// meant `knobsFor('music')` returned nothing, and "nothing" is the answer that made every hole a
// published graph declares — a tempo, a key, a length, a lyric — unreachable by anything: no
// editor drew it, no request carried it, and xoko was never told it existed. What a medium can be
// asked for is now stated HERE, once, and read by three places: the ⚙ editor, the section's own
// controls, and the schema xoko is handed for a `make` (src/xoko/*).
//
// ⚠️ SO A KNOB HERE IS AN OFFER, NEVER A PROMISE. Nothing checks that the armed workflow has a hole
// for it; `fill()` (./comfy/adapter.ts) silently skips a hole the graph does not declare, and that
// is exactly what makes the table safe to grow ahead of the catalog. The intersection — what this
// table names AND the workflow exposes — is computed where it is needed, not baked in here.

import type { Medium } from '../types/medium.ts'
import type { Hole } from '../types/workflow.ts'
import { REF_SLOTS, RESERVED_HOLE, holeLiteral, holeSpec } from '../types/workflow.ts'
import type { ParamValue } from '../types/request.ts'
import {
  ACE_KEYSCALES, ACE_KEYSCALE_DEFAULT, ACE_LANGUAGES, ACE_LANGUAGE_DEFAULT,
  ACE_TIMESIGNATURES, ACE_TIMESIGNATURE_DEFAULT,
} from './comfy/ace.ts'
import { QWEN_TTS_LANGUAGES, QWEN_TTS_LANGUAGE_DEFAULT } from './comfy/qwen-tts.ts'
import { COMFY_SAMPLERS, COMFY_SCHEDULERS } from './comfy/sampling.ts'
import { SAMPLERS, SEED_MODES } from './draw-things/config.ts'

/** What a step count may be at all, on a checkpoint that has not locked one. Shared so the value
 *  a render would reject is the same value the ⚙ editor refuses to store. */
export const STEP_RANGE: readonly [number, number] = [1, 200]

/** What a seed may be — the width the adapter's own `randomSeed()` mints into. Wider than any
 *  graph needs and narrow enough to stay an exact integer in a browser. */
export const SEED_RANGE: readonly [number, number] = [0, 4294967295]

export interface Knob {
  readonly key: string
  readonly kind: 'integer' | 'number' | 'choice' | 'text' | 'boolean'
  /** `choice` only — and the exact strings the wire takes. */
  readonly choices?: readonly string[]
  /** `integer` / `number` only. */
  readonly range?: readonly [number, number]
  /** What is sent when nobody set it. Absent = the SERVICE's own default applies, because the
   *  adapter leaves the field out entirely — which is a different thing from a value. */
  readonly fallback?: ParamValue
  /**
   * THE FEW VALUES WORTH ASKING FOR, on a knob whose range is technically wide and practically
   * short. A control offers these as a menu instead of a spinner; the range still governs what is
   * legal, so a number typed or sent from anywhere else is not held to this list.
   *
   * ⚠️ A song's length is the case: 10–240 is what the graph accepts and nobody wants to arrive at
   * 94 seconds by nudging a spinner. Six options is a control; 231 is a text field wearing one.
   */
  readonly suggest?: readonly ParamValue[]
  /** One line, for the editor. Not marketing: what moving it does. */
  readonly what: string
  /**
   * WHAT THE NUMBER IS COUNTED IN, when a bare number is ambiguous.
   *
   * ⚠️ IT EXISTS BECAUSE A COLUMN OF NUMBERS TAUGHT NOBODY ANYTHING (2026-08-24). The map xoko
   * rides on prints a knob as `key <range or suggestions>` and never prints `what` — deliberately,
   * because `what` is a sentence and the map goes out with every question. So 🎬's frame count
   * arrived as `length 17 | 33 | 49 | 81 | 121`: five numbers, no unit, no relation to the seconds
   * a person actually asks for. Told "five seconds", xoko reached for `duration` — the word 🎼 and
   * 🔊 use — and was refused by name for a knob this workflow does not have. One word fixes it.
   */
  readonly unit?: string
  /**
   * HOW MANY OF THIS UNIT MAKE ONE SECOND — the arithmetic, as a number rather than as prose.
   *
   * ⚠️ THE UNIT ALONE TAUGHT NOBODY ANYTHING EITHER (2026-09-04). `unit: 'frames'` says what the
   * number counts and not what it is worth: asked for five seconds, xoko wrote `duration 5` — a
   * knob 🎬 does not have — and the press died on the refusal. A person reading the ⚙ menu had the
   * same problem in the other direction: 56 | 90 | 124 | 158 is four numbers to divide by hand.
   *
   * The unit was carrying it as English (`'frames — at 16fps, 81 of them is 5s'`), which the ⚙
   * label cannot compute with and a reader has to parse. With the number, the control says
   * `124 — 5s` and the map says `(frames, 24 a second)`, off one field.
   */
  readonly perSecond?: number
  /**
   * THIS IS WHERE A STYLE'S WORDS GO, on a medium whose prompt is not a description.
   *
   * ⚠️ AT MOST ONE PER MEDIUM, and most media have none. For a picture the sentence you type
   * describes what you want and a style is more words about the same thing, so the two compose.
   * For a VOICE the sentence is the SCRIPT — appending "an old sailor, gravelly" to it produces a
   * narrator who reads the stage direction aloud — so the description needs a channel of its own,
   * and this flag is which one (src/styles/param.ts).
   *
   * ⚠️ IT LIVES ON THE KNOB BECAUSE IT IS A FACT ABOUT THE KNOB. It was a second table keyed by
   * medium, which is the same fact written twice: the day a medium grew a shaping channel, two
   * files had to learn about it and only one of them was ever going to.
   */
  readonly shaping?: true
  /**
   * `text` only: the value is PROSE OR MORE — a lyric sheet, a voice description, a script.
   *
   * ⚠️ IT IS A FACT ABOUT THE KNOB, WHICH IS WHY IT IS HERE (2026-08-23). The control was picking
   * a textarea by comparing the key to the literal `'lyrics'`, so 🎼's lyric sheet was a
   * four-line box and 🗣's voice description — the one field in that whole section, and prose by
   * definition — was a 190px strip beside a label, with the words scrolling sideways past the
   * end. A published workflow declaring a script hole had no way to say so at all.
   */
  readonly multiline?: true
  /**
   * KEEP IT OFF THE ALWAYS-SENT MAP LINE. Not a limit — it still sets, the ⚙ pane still draws it,
   * and `▶ look: workflow <slug>` still prints it whole.
   *
   * ⚠️ IT IS ABOUT ONE CROWDED LINE AND NOTHING ELSE. An ACE-Step workflow exposes eighteen widgets;
   * printing all of them, with a 44-entry sampler enum, into the map that rides on every single
   * question would cost more context than the answer is worth. So the line carries what a person
   * asking for a song actually names — length, tempo, key, words — and says how many more there
   * are and the one command that shows them.
   */
  readonly advanced?: true
  /**
   * ⚠️ AN ENUM IS A SHORTCUT OVER THE WORDS, NEVER A BOUNDARY (2026-08-31).
   *
   * Qwen3-TTS publishes eleven languages and Catalan is not one of them — and a description saying
   * *en català* produces Catalan anyway, because the list NARROWS what the model already does from
   * prose rather than bounding it. A control presenting those eleven as the whole truth teaches
   * the opposite, and the day something auto-fills one of them it stops being a display problem: a
   * `language` quietly set to `Spanish` OVERRIDES a description that asked for Catalan, which is
   * the app destroying a capability the model has.
   *
   * So a subordinate knob is never auto-filled, its empty option reads *from the words*, and the
   * map xoko rides on says the list is not the edge. Declared by the LIBRARY, per hole, because
   * which of a node's widgets defer to prose is a fact about that node, not about this app.
   */
  readonly subordinate?: true
  /**
   * WHAT THIS WORKFLOW WILL RUN AT IF NOBODY TOUCHES THE CONTROL.
   *
   * ⚠️ IT EXISTS BECAUSE "AS PUBLISHED" WAS UNKNOWABLE, AND ONE OF THE VALUES RUINS A RENDER
   * (2026-08-31). Blank means "send nothing, the graph's own value stands" — a good rule, and it
   * left every control in 🎼 an empty box with no way on this machine to learn what stood. For
   * `bpm` that is survivable. For `cfg` it is not: `ace-step` publishes the turbo checkpoint at
   * `steps 8, cfg 1.0`, the sft profile wants `50 / 3.5`, and crossing them in EITHER direction
   * distorts. The only way to find the number was to render badly.
   *
   * ⚠️ AND IT IS THE VALUE, NOT A SUGGESTION ABOUT IT. Resolved here, where the graph is in hand:
   * the literal sitting at the hole's own address, then what the hole DECLARED (`fallback` — the
   * recommended value, what this workflow was published to be good at), then the workflow's own
   * `params`. Last writer wins, in the order the press itself resolves them.
   *
   * ⚠️ WITHOUT A GRAPH IT IS THE TABLE'S OWN `fallback`, and the difference is real rather than
   * tidy: an adapter that builds its ask out of fields (Draw Things) SENDS the fallback for a knob
   * nobody set, so the fallback is what runs. A graph adapter sends nothing and the literal runs.
   * Two mechanisms, one honest answer to "what happens if I leave this alone".
   */
  readonly published?: ParamValue
}

/**
 * The knobs the image adapter reads (`src/inference/draw-things/adapter.ts`).
 *
 * ⚠️ SIZE AND SEED ARE HERE NOW, AND LEAVING THEM OUT WAS THE APP'S LARGEST HOLE (2026-09-04).
 * The rule this table was written under said they are ASK-SHAPED — they belong to the sentence in
 * hand rather than to the checkpoint — and would live in "the making page's ⚙, per press". That
 * second surface was never built. `resolveImageKnobs` has validated `width`, `height` and `seed`
 * on every image press since the day it was written (src/inference/params.ts); the app simply had
 * no box for any of them and never told xoko they existed. So every picture came out 1024×1024 —
 * the literal default in `number(params, 'width', 1024)` — and the seed was re-rolled every press,
 * which makes "the same one again, wider" unreachable in a section whose whole job is iterating.
 *
 * A knob table with no size in it is not a smaller table, it is a missing capability. 🎬 has had
 * both since it landed, because its knobs come off a graph and the graph declares them.
 *
 * ⚠️ AND `negative` IS STILL NOT HERE, for a reason that is about caps rather than taste.
 * `resolveImageKnobs` REFUSES one on an engine whose `caps.negatives` is false, which is both
 * installed image engines and every guidance-distilled checkpoint. A box that always errors is
 * worse than no box. It belongs here the day a knob can say "only when the engine takes one".
 *
 * ⚠️ AND SIX OF THE NINE ARE FOLDED. `shift`, `clipSkip`, `guidanceEmbed`, `seedMode`, `strength`
 * and `imageGuidance` are real and stay settable — `advanced` is about the crowding of one pane
 * and one map line, never about what may be asked for. What is left unfolded is what somebody
 * making a picture actually sets.
 */
const IMAGE_KNOBS: readonly Knob[] = [
  // ── the ask-shaped three, first, because they are what a person moves ────────────────────────
  {
    key: 'width', kind: 'integer', range: [16, 4096], fallback: 1024,
    suggest: [512, 640, 768, 832, 896, 1024], unit: 'pixels',
    what: 'how wide the picture is. The engine holds it to its own range; swap it with the height for a portrait.',
  },
  {
    key: 'height', kind: 'integer', range: [16, 4096], fallback: 1024,
    suggest: [512, 640, 768, 832, 896, 1024], unit: 'pixels',
    what: 'how tall the picture is. Most checkpoints drift outside the size they were trained at, so the two together are worth about a megapixel.',
  },
  {
    key: 'seed', kind: 'integer', range: SEED_RANGE,
    what: 'the number the picture is grown from. Same seed and same settings is the same picture again; unset is a new one every press, which is what makes ▶ ▶ ▶ give you three.',
  },
  {
    key: 'steps', kind: 'integer', range: STEP_RANGE, fallback: 20,
    what: 'how many denoising passes. A step-distilled checkpoint locks this and more is worse.',
  },
  {
    key: 'cfg', kind: 'number', range: [0, 30], fallback: 1,
    what: 'how hard it is pushed toward the words. Guidance-distilled models run at 1 and steer through guidanceEmbed instead.',
  },
  {
    key: 'sampler', kind: 'choice', choices: SAMPLERS, fallback: 'Euler A Trailing',
    what: 'the solver. Trailing/AYS variants are the ones tuned for low step counts.',
  },
  {
    key: 'shift', kind: 'number', range: [0, 20],
    advanced: true,
    what: 'timestep shift — how much of the schedule is spent on structure rather than detail. Flow-matching families only.',
  },
  {
    key: 'clipSkip', kind: 'integer', range: [1, 12],
    advanced: true,
    what: 'how many text-encoder layers to stop short of. 2 for SD/SDXL-class checkpoints, 1 for the rest.',
  },
  {
    key: 'guidanceEmbed', kind: 'number', range: [0, 20],
    advanced: true,
    what: 'the baked-in guidance a distilled model steers with, in place of cfg.',
  },
  {
    key: 'seedMode', kind: 'choice', choices: SEED_MODES, fallback: 'ScaleAlike',
    advanced: true,
    what: 'how a seed becomes noise. Changing it changes every picture, so it is a compatibility switch, not a dial.',
  },
  // ── the two that only mean anything when something is ATTACHED ──────────────────────────────
  //
  // ⚠️ THEY ARE HERE ANYWAY, and that is deliberate. `strength` is ask-shaped for an ordinary
  // img2img — how much of this photo do I keep, per press — and MODEL-SHAPED for an in-context
  // editor: Kontext is not a denoiser being run part-way, it reads the picture as context and
  // needs 1. A checkpoint that has to say so needs somewhere to say it, and this table is where a
  // knob becomes settable in 🔌. The composer's slider seeds itself from whatever the armed
  // checkpoint declares here.
  {
    key: 'strength', kind: 'number', range: [0.05, 1], fallback: 0.65,
    advanced: true,
    what: 'how much of an attached picture is redrawn — 1 replaces it entirely. Only sent when something is attached; an in-context editor wants 1.',
  },
  {
    key: 'imageGuidance', kind: 'number', range: [0, 10],
    advanced: true,
    what: 'how hard an edit model is held to the picture you attached. Kontext reads it (its own default is 1.5); everything else ignores it.',
  },
]

/**
 * The knobs an ACE-Step music graph reads (`src/inference/comfy/adapter.ts` fills them into the
 * holes the workflow declares).
 *
 * ⚠️ THESE ARE ASK-SHAPED, AND THE IMAGE TABLE'S RULE DOES NOT SURVIVE THE CROSSING (2026-08-23).
 * Above, MODEL-shaped is the test — set once for a checkpoint, then true of every render on it —
 * because an image workflow's per-press facts (a size, a seed, a negative) have controls of their own
 * on the making page. Music has none of that: a length, a tempo and a key belong to THIS song and
 * there is nowhere else to say them. The table is the medium's whole vocabulary, not a slice of it.
 *
 * ⚠️ `steps` AND `cfg` ARE NOT HERE, and their absence is the point. Two music workflows differing
 * only in those two numbers are a fast one and a careful one — `music-fast` at 8 steps against
 * `music-detail` at 50 — and that is a choice between WORKFLOWS, made once, in the catalog. Exposing
 * them as knobs would let one press quietly become the other and leave the provenance saying
 * otherwise.
 */
const MUSIC_KNOBS: readonly Knob[] = [
  {
    key: 'seed', kind: 'integer', range: SEED_RANGE,
    what: 'the number the take is grown from. Same seed and same settings is the same song again; empty is a new one every press.',
  },
  {
    // ⚠️ 240 IS OUR CEILING, NOT THE MODEL'S — the node takes up to 2000 seconds. Half an hour of
    // ACE-Step is hours of sampling and nobody meant to ask for it; four minutes is the longest
    // thing this app is for. Said out loud because every other range here is the node's.
    key: 'duration', kind: 'integer', range: [10, 240], fallback: 120,
    suggest: [15, 30, 60, 94, 120, 180], unit: 'seconds',
    what: 'how long the track is, in seconds. Stated twice in an ACE-Step graph — on the encoder and on the empty latent — which is why its hole is a list.',
  },
  {
    // ⚠️ 10–300, WHICH IS THE NODE'S OWN RANGE AND NOT THE ONE THIS SHIPPED WITH (2026-08-23). It
    // said 40–200, a guess at what music sounds like, and it would have refused a legal 208 — the
    // exact failure the whole declare-never-infer rule is about, committed in the file that states
    // the rule. `GET /object_info/<node>` answers this in one request.
    key: 'bpm', kind: 'integer', range: [10, 300], fallback: 120, unit: 'beats a minute',
    what: 'the tempo. A genre has an idiomatic band; unset, the graph\'s own number stands.',
  },
  {
    key: 'timesignature', kind: 'choice', choices: ACE_TIMESIGNATURES, fallback: ACE_TIMESIGNATURE_DEFAULT,
    what: 'beats to the bar. Four unless you want a waltz (3) or a jig (6) — there is no 5 or 7, the model was not trained on them.',
  },
  {
    key: 'keyscale', kind: 'choice', choices: ACE_KEYSCALES, fallback: ACE_KEYSCALE_DEFAULT,
    what: 'the key. Spelled exactly as the model lists it — "D minor", never "d Minor" — and both spellings of an accidental are separate keys.',
  },
  {
    key: 'lyrics', kind: 'text', multiline: true,
    what: 'the words to be sung, with section tags like [Verse] and [Chorus]. Empty is what makes a track instrumental.',
  },
  {
    key: 'language', kind: 'choice', choices: ACE_LANGUAGES, fallback: ACE_LANGUAGE_DEFAULT,
    what: 'which language the lyrics are sung in. Ignored by an instrumental.',
  },
]

/**
 * The knobs a voice-design graph reads.
 *
 * ⚠️ ONE, AND IT IS THE STYLE'S OWN CHANNEL. In 🗣 the sentence is the SCRIPT and `voice` is the
 * description of who reads it (src/styles/param.ts) — so this row is what makes that channel a
 * thing the app can name, offer and hand to xoko, rather than something only a saved style could
 * ever fill. A voice typed here and a voice chosen from the picker arrive at the same hole.
 *
 * ⚠️ THE SEED IS NOT HERE, and for voice that is a real omission rather than an oversight: a
 * description on a fresh number is a different person saying the same line, so a REUSABLE voice
 * pins one — and pinning it is what a style is for (src/styles/registry.ts). A knob would make the
 * identity per-press, which is the bug the style layer was built to fix.
 */
/**
 * THE SEED, WHICH THESE TWO MEDIA HAVE NOWHERE ELSE TO SAY (2026-08-23).
 *
 * ⚠️ IT IS ABSENT FROM `IMAGE_KNOBS` ON PURPOSE and that is not an oversight: a picture's seed is
 * ask-shaped and 🖼 draws its own control for it, per press. 🎼 and 🗣 have no such control, and a
 * bare `"seed": "1.seed"` hole carries no shape, so `knobFromHole` could not draw one either — the
 * number was minted at random by the adapter every press and there was no way to see it, set it,
 * or ask for it again.
 *
 * ⚠️ AND FOR A DESIGNED VOICE THAT IS NOT A DETAIL, IT IS THE WHOLE PERSON. Qwen3-TTS's
 * VoiceDesign turns a description into a timbre WITH this number: the same words on a new seed is
 * a different human being who also happens to fit them. Asked four times for an old Italian woman
 * with the seed rolling underneath, the honest outcome is four strangers — which is exactly what
 * happened, and neither the person asking nor xoko could see the one field that decided it.
 *
 * Unset is still a fresh number every press. What changes is that it can now be pinned.
 */
const VOICE_KNOBS: readonly Knob[] = [
  {
    // ⚠️ NOT A DIAL — AN IDENTITY. See the note above the range.
    key: 'seed', kind: 'integer', range: SEED_RANGE,
    what: 'WHO you get. The description shapes the voice; this number decides which person fitting that description shows up. Empty rolls a new one every press — when you meet the one you wanted, write this down and set it to keep them.',
  },
  {
    key: 'voice', kind: 'text', shaping: true, multiline: true,
    what: 'who reads it — timbre, age, gender, accent, pace, mood. Prose, not tags: "an old man\'s voice, deep and weathered, unhurried".',
  },
  {
    // ⚠️ NAMES, NOT CODES, AND ELEVEN OF THEM — a different vocabulary from music's fifty-one ISO
    // codes, from a different vendor's node (./comfy/qwen-tts.ts). `Auto` reads it off the script,
    // which is the right default when the sentence IS the words to be spoken.
    key: 'language', kind: 'choice', choices: QWEN_TTS_LANGUAGES, fallback: QWEN_TTS_LANGUAGE_DEFAULT,
    what: 'which language it is read as. Auto takes it from the script; name one when the script is short enough to be ambiguous.',
  },
]

/**
 * The knobs a Wan-family video graph reads.
 *
 * ⚠️ A LENGTH IN FRAMES, NOT SECONDS, AND THAT IS THE MODEL'S WORD NOT OURS. Wan 2.1 samples
 * 4n+1 frames — 81 is the trained length — and plays them at 16fps, so "how long is it" is two
 * numbers that multiply. Offering seconds would mean rounding to a legal frame count behind the
 * person's back and then disagreeing with the file they get. The suggestions are the arithmetic:
 * 33 frames is two seconds, 81 is five.
 *
 * ⚠️ AND `steps`/`cfg` ARE HERE, UNLIKE 🎼. Music's two live in the catalog because a fast workflow
 * and a careful one are a choice between rows. Video has one checkpoint on this machine and a
 * render that costs minutes: the difference between a 12-step look and a 30-step keeper is a
 * decision you make per press, watching the clock.
 */
const VIDEO_KNOBS: readonly Knob[] = [
  {
    key: 'length', kind: 'integer', range: [1, 261], fallback: 81,
    suggest: [17, 33, 49, 81, 121], unit: 'frames', perSecond: 16,
    what: 'how many frames. Wan wants 4n+1 and was trained at 81; at 16fps that is five seconds.',
  },
  {
    key: 'fps', kind: 'integer', range: [1, 120], fallback: 16, unit: 'frames a second',
    what: 'how fast they play. 16 is what Wan 2.1 was trained at — raising it shortens the clip rather than smoothing it.',
  },
  {
    key: 'width', kind: 'integer', range: [16, 1280], fallback: 832, unit: 'pixels, in 16s',
    what: 'frame width, in steps of 16. 832×480 is the 1.3B model\'s trained size and anything much larger is slower without being better.',
  },
  { key: 'height', kind: 'integer', range: [16, 1280], fallback: 480, unit: 'pixels, in 16s', what: 'frame height, in steps of 16. Wan 2.1 1.3B was trained at 480 and drifts above it.' },
  {
    key: 'steps', kind: 'integer', range: STEP_RANGE, fallback: 20,
    what: 'how many denoising passes, over every frame at once. This is the clock: doubling it doubles the render.',
  },
  { key: 'cfg', kind: 'number', range: [0, 30], fallback: 6, what: 'how hard it is pushed toward the words. Wan likes 5–7.' },
  { key: 'negative', kind: 'text', multiline: true, what: 'what to keep out — blur, jitter, watermarks, extra limbs.' },
  { key: 'shift', kind: 'number', range: [0, 100], fallback: 8, advanced: true, what: 'timestep shift. Higher spends more of the schedule on motion and less on detail.' },
  { key: 'sampler', kind: 'choice', choices: COMFY_SAMPLERS, fallback: 'uni_pc', advanced: true, what: 'the solver. uni_pc is what the Wan reference workflow uses.' },
  { key: 'scheduler', kind: 'choice', choices: COMFY_SCHEDULERS, fallback: 'simple', advanced: true, what: 'how the noise schedule is spaced across the steps.' },
  { key: 'seed', kind: 'integer', range: SEED_RANGE, what: 'the number the take is grown from. Same seed and same settings is the same clip again.' },
]

/**
 * The knobs a sound graph reads.
 *
 * ⚠️ SECONDS HERE, FRAMES NEXT DOOR, AND NEITHER IS A HOUSE STYLE. A sound model is handed a
 * duration in seconds because that is the field its node has; a video model is handed frames
 * because that is the field ITS node has. The table says what each medium's wire really takes —
 * inventing one unit and converting would put the app between the person and the file twice.
 */
const SOUND_KNOBS: readonly Knob[] = [
  {
    key: 'duration', kind: 'number', range: [0.5, 300], fallback: 10,
    suggest: [1, 3, 5, 10, 30, 60], unit: 'seconds',
    what: 'how long it runs, in seconds. A door is one; a rain bed is sixty.',
  },
  { key: 'negative', kind: 'text', multiline: true, what: 'what to keep out — music, speech, hiss.' },
  { key: 'steps', kind: 'integer', range: STEP_RANGE, fallback: 50, advanced: true, what: 'how many denoising passes.' },
  { key: 'cfg', kind: 'number', range: [0, 30], fallback: 5, advanced: true, what: 'how hard it is pushed toward the words.' },
  { key: 'sampler', kind: 'choice', choices: COMFY_SAMPLERS, fallback: 'dpmpp_3m_sde_gpu', advanced: true, what: 'the solver. Stable Audio\'s reference workflow uses the dpmpp SDE family.' },
  { key: 'scheduler', kind: 'choice', choices: COMFY_SCHEDULERS, fallback: 'exponential', advanced: true, what: 'how the noise schedule is spaced across the steps.' },
  { key: 'seed', kind: 'integer', range: SEED_RANGE, what: 'the number the take is grown from. Same seed and same settings is the same sound again.' },
]

const BY_MEDIUM: Partial<Record<Medium, readonly Knob[]>> = {
  image: IMAGE_KNOBS,
  music: MUSIC_KNOBS,
  sound: SOUND_KNOBS,
  voice: VOICE_KNOBS,
  video: VIDEO_KNOBS,
}

/** Every knob this medium can be tuned on. Empty for one nothing renders yet — which is why the
 *  editor draws "nothing to set here" rather than a guess. */
export const knobsFor = (medium: Medium | null | undefined): readonly Knob[] =>
  (medium ? BY_MEDIUM[medium] : undefined) ?? []

export const knobFor = (medium: Medium | null | undefined, key: string): Knob | undefined =>
  knobsFor(medium).find((k) => k.key === key)

/** What the adapter would send for a knob nobody set. `undefined` = it sends nothing at all. */
export const knobFallback = (medium: Medium | null | undefined, key: string): ParamValue | undefined =>
  knobFor(medium, key)?.fallback

/**
 * WHAT THIS WORKFLOW CAN ACTUALLY BE ASKED FOR — the table above, narrowed to what the workflow will
 * really carry.
 *
 * ⚠️ THIS IS THE INTERSECTION, AND IT IS COMPUTED ONCE HERE BECAUSE THREE PLACES NEED THE SAME
 * ANSWER (2026-08-23): the section's own controls, the ⚙ band, and the schema xoko is handed for a
 * `make`. Computed separately in each, they would drift, and the drift would be invisible — a
 * control that sets a tempo the graph has no hole for looks exactly like one that works.
 *
 * ⚠️ NO GRAPH MEANS EVERYTHING, and that is not a shortcut. An adapter that builds its own ask out
 * of fields (Draw Things) reads every knob the table names by construction; only a workflow that IS a
 * graph has a declared, finite list of places the app may write. So the presence of a graph is
 * precisely the question "is there a narrower answer than the table?".
 *
 * ⚠️ AND IT NOW ANSWERS "WHAT WILL HAPPEN IF I LEAVE THIS ALONE" TOO (2026-08-31) — see
 * `Knob.published`. That answer needs the graph's NODES, not only its holes, which is why the
 * parameter widened; `params` is the workflow's own bag, the last thing to write before the press.
 */
export function settableKnobs(
  medium: Medium | null | undefined,
  graph: GraphShape | null,
  params?: Readonly<Record<string, ParamValue>> | undefined,
  declares?: readonly string[] | null | undefined,
): readonly Knob[] {
  const table = knobsFor(medium)
  // ⚠️ THE TABLE'S OWN FALLBACK IS THE PUBLISHED VALUE HERE, and only here. A field-building
  // adapter SENDS it when nobody set the knob, so it is what runs — the opposite of a graph, where
  // an unset knob is not sent at all and the literal in the node runs instead.
  //
  // ⚠️ AND A GRAPHLESS WORKFLOW MAY SAY WHICH OF THEM IT READS (2026-09-04, `Workflow.knobs`). The
  // whole table was the only answer here, so `cutout` — a background remover over plain HTTP —
  // offered a sampler, a cfg and a seedMode. A graph declares its own holes and is narrowed to
  // them; this is how a workflow with no graph says the same thing.
  if (!graph) {
    const mine = declares ? table.filter((k) => declares.includes(k.key)) : table
    return mine.map((k) => (k.fallback === undefined ? k : { ...k, published: k.fallback }))
  }

  const byKey = new Map(table.map((k) => [k.key, k]))
  const out: Knob[] = []
  for (const [key, hole] of Object.entries(graph.holes ?? {})) {
    // A ref slot is a place a PICTURE lands, not a value anybody types. The tray fills those.
    // ⚠️ AND `model` IS SKIPPED FOR A DIFFERENT REASON FROM THE OTHERS. A ref slot and a prompt
    // are filled from elsewhere in the ask; `model` is REFUSED at parse time (`reservedHole`) and
    // is only reachable here through a registry written by hand. Skipped rather than drawn,
    // because the app would overwrite whatever the control said with the resolved checkpoint.
    if ((REF_SLOTS as readonly string[]).includes(key) || key === 'prompt' || key === RESERVED_HOLE) continue
    const merged = knobFromHole(key, hole, byKey.get(key), graph, params?.[key])
    if (merged) out.push(merged)
  }
  return out
}

/** As much of a `Graph` as this file reads. Structural, so a caller may hand the whole thing. */
interface GraphShape {
  readonly nodes?: Readonly<Record<string, unknown>>
  readonly holes?: Readonly<Record<string, Hole>>
}

/**
 * ONE HOLE, AS A KNOB — the graph's declaration laid over the medium's table.
 *
 * ⚠️ THE GRAPH WINS, FIELD BY FIELD. The table is what the APP knows about a word in general; the
 * hole is what THIS pipeline does with it. When ACE-Step's encoder says `bpm` is 10–300, that is
 * not an opinion the app gets to hold a second one about — and when a workflow ships `steps: 8`
 * because it is the turbo profile, that recommended value belongs to the workflow, not to music.
 *
 * ⚠️ AND A HOLE THE TABLE HAS NEVER HEARD OF IS ADMITTED ON ITS OWN DECLARATION. That is the whole
 * unlock: a workflow published tomorrow, exposing a widget nobody has written TypeScript for, is
 * settable the moment it lands — in the ⚙ pane, in `▶ look: workflow`, and in the line xoko writes.
 * A bare target with no shape and no table entry is the one thing that cannot be offered: there
 * would be nothing to draw and nothing to validate against, so it is left to the graph's own value.
 */
function knobFromHole(
  key: string, hole: Hole, known: Knob | undefined,
  graph: GraphShape, mine: ParamValue | undefined,
): Knob | null {
  // ⚠️ THE PUBLISHED VALUE IS RESOLVED FOR A BARE TARGET TOO. A hole written `"94.bpm"` declares no
  // shape and leans on the medium's table for one — but the node behind it still holds a number,
  // and that number is what will run. Dropping it here would leave exactly the short-form holes
  // showing an empty box, which is the state this field exists to end.
  const at = holeLiteral(graph.nodes, hole)
  const spec = holeSpec(hole)
  if (!spec) {
    if (!known) return null
    const published = mine ?? at
    return published === undefined ? known : { ...known, published }
  }

  const kind = spec.kind ?? known?.kind ?? (spec.choices?.length ? 'choice' : 'text')
  const choices = spec.choices ?? known?.choices
  const range = spec.range ?? known?.range
  const fallback = spec.fallback ?? known?.fallback
  const suggest = spec.suggest ?? known?.suggest
  const perSecond = spec.perSecond ?? known?.perSecond
  const unit = spec.unit ?? known?.unit
  // ⚠️ THE ORDER THE PRESS ITSELF RESOLVES THEM IN, AND `fallback` IS NOT SECOND (2026-08-31).
  // It was, and the sentence justifying it — "a declared fallback is the workflow saying run it at
  // this instead" — was simply not true of a graph: NOTHING SENDS A FALLBACK. `fill()` writes the
  // bag and nothing else, so an unset knob runs at the node's literal, whatever a hole says beside
  // it. `ambience` declared `duration` at 10 over a node still holding the song graph's 120, and
  // this line printed the 10 — into the ⚙ box, into `▶ look: workflow`, into the map xoko reads. It
  // left the knob alone, as it should, and got two minutes of looping music.
  // So: the workflow's own `params` are the last thing written before the adapter sees the bag and
  // win; then the literal, because it is what actually runs; and `fallback` answers only where the
  // node carries no such input at all — the widget ComfyUI fills from its own default, which the
  // publisher's declared value is the only available statement about. A `fallback` that DISAGREES
  // with a literal never reaches here: `fallbackLies` refuses it at parse (src/types/workflow.ts).
  const published = mine ?? at ?? spec.fallback
  return {
    key,
    kind,
    ...(choices === undefined ? {} : { choices }),
    ...(range === undefined ? {} : { range }),
    ...(fallback === undefined ? {} : { fallback }),
    ...(suggest === undefined ? {} : { suggest }),
    ...(perSecond === undefined ? {} : { perSecond }),
    ...(unit === undefined ? {} : { unit }),
    ...(published === undefined ? {} : { published }),
    what: spec.what ?? known?.what ?? `a ${kind} this workflow exposes`,
    ...(known?.shaping ? { shaping: true as const } : {}),
    ...(spec.multiline || known?.multiline ? { multiline: true as const } : {}),
    ...(spec.advanced ? { advanced: true as const } : {}),
    ...(spec.subordinate ? { subordinate: true as const } : {}),
  }
}

/**
 * Is this a value the knob can take? A message, or `null` when it is fine.
 *
 * Returned rather than thrown: the caller decides whether a bad knob is a 400 (the ⚙ editor) or
 * an issue in a list (a hand-edited file), and both want the same sentence.
 */
export function knobProblem(knob: Knob, value: unknown): string | null {
  if (knob.kind === 'choice') {
    if (typeof value !== 'string') return `${knob.key} is one of: ${(knob.choices ?? []).join(', ')}`
    if (!(knob.choices ?? []).includes(value)) {
      return `${JSON.stringify(value)} is not a ${knob.key} this engine takes — one of: ${(knob.choices ?? []).join(', ')}`
    }
    return null
  }
  if (knob.kind === 'text') {
    return typeof value === 'string' ? null : `${knob.key} is text`
  }
  if (knob.kind === 'boolean') {
    return typeof value === 'boolean' ? null : `${knob.key} is true or false`
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return `${knob.key} must be a real number (got ${JSON.stringify(value)})`
  }
  if (knob.kind === 'integer' && !Number.isInteger(value)) {
    return `${knob.key} must be a whole number (got ${value})`
  }
  const [lo, hi] = knob.range ?? []
  if (lo !== undefined && hi !== undefined && (value < lo || value > hi)) {
    return `${knob.key} must be between ${lo} and ${hi} (got ${value})`
  }
  return null
}

/**
 * EVERY KNOB THIS WORKFLOW DECLARES, CHECKED AGAINST WHAT IS ABOUT TO BE SENT. A sentence, or null.
 *
 * ⚠️ WHY IT EXISTS (2026-08-23). `src/inference/params.ts` opens with the house rule — *a
 * violation is rejected with a named error, never silently clamped* — and it was enforced for
 * `steps`, `width`, `height` and `seed`, which is to say for the knobs the app happened to have
 * written TypeScript for. Everything a WORKFLOW declares went out unchecked, so a press carrying
 * `size: "Qwen3-TTS-1.7B"` against a hole whose enum is `["0.6B","1.7B"]` was queued, sent, and
 * refused by ComfyUI's own validator ten seconds later with a message about `value_not_in_list`.
 * The app was holding the enum and the value in one process at the time.
 *
 * ⚠️ ONLY KEYS THIS WORKFLOW ACTUALLY DECLARES. The merged bag is full of things that are nobody's
 * knob here — a checkpoint, a negative, an image size on a song — and refusing those would refuse
 * every press. A key with no knob is not an error: `fill()` drops it and the graph's own value
 * stands, which is the same rule that lets the table grow ahead of the catalog.
 */
export function knobsProblem(
  medium: Medium | null | undefined,
  graph: { readonly holes?: Readonly<Record<string, Hole>> } | null,
  params: Readonly<Record<string, ParamValue>>,
): string | null {
  for (const knob of settableKnobs(medium, graph)) {
    const value = params[knob.key]
    if (value === undefined) continue
    const bad = knobProblem(knob, value)
    if (bad) return bad
  }
  return null
}
