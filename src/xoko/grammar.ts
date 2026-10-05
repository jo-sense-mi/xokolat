// ✨ THE DIRECTIVE LINE — the whole of what xoko can cause to happen, and how it is written.
//
// ⚠️ A LINE, NOT JSON, AND NOT TOOL CALLS (2026-08-12, still true). The three ways to let a brain
// act, in the order they were considered:
//
//   tool calls   The brain gets verbs and the server executes them. `claude -p` is ALREADY an
//                agent with a shell — which is exactly why the brain row runs it with its tools
//                disallowed — so this would mean handing back the surface we just closed, and it
//                needs function-calling support that small local models do not reliably have.
//   strict JSON  Every answer wrapped in an object. Claude does it well; a 3B model on Ollama
//                does not, and a malformed answer would then lose the PROSE as well as the action.
//   a line       ⭣ this. It parses with a regex, it degrades to visible text when the brain gets
//                it wrong, and an ordinary conversational turn stays ordinary prose.
//
// ⚠️ FOUR VERBS, AND THE TABLE DOES NOT GROW (2026-08-22). It was one — `▶ image:` — and widening
// it to "xoko can operate the app" could have meant a verb per feature: arm this, star that, open
// the styles grid, rename a run. That table would have to be extended by every section anybody
// ever writes, and the prompt would be a manual.
//
// These four are the kinds of thing an APP can do, not the things THIS app contains:
//
//   look   read something back    answered here, in the loop — the brain sees it and continues
//   go     move the person        handed to the browser
//   take   install from 📚        handed to the browser
//   make   render something       handed to the browser
//
// A fifth section, a fifth medium, a whole new content family: none of them needs a verb. What
// changes is the MAP the brain is given (web/lib/xoko-map.js), which is generated from the same
// registries the nav is drawn from. The verbs are the grammar; the map is the vocabulary.
//
// ⚠️ AND `make` NAMES A MEDIUM OR A CHAIN, NEVER A CHECKPOINT. xoko writes the SENTENCE; the
// workflow that answers it is whatever that SECTION is plugged with — its ⚙ band for a medium, its
// own per-step band for a chain (2026-08-29: both used to be one app-wide answer, chosen from a
// popover on the ask bar).
//
// ⚠️ THIS PARAGRAPH USED TO SAY A BRAIN "cannot pick your checkpoint, cannot know one exists", and
// that stopped being true the day the bracket grew `workflow` (`WORKFLOW_SETTING`, below). It may name
// another workflow FOR THE MEDIUM ASKED FOR — "make it quick" reaching a fast one is a real request
// — and it still cannot reach past a workflow to the checkpoint, the sampler or the step count.
// Those are the machine, edited once in 🔌, and no sentence gets to them.
//
// ⚠️ THE TWO LANES ARE NOT A DETAIL. `look` is answered by this process, so the brain can read the
// library and then say something true about it in the same turn. Everything else goes back to the
// BROWSER and is pressed there — through the section's own ▶, the same payload builder, the same
// ⤓ endpoint the 📚 page calls. Nothing xoko does happens off-screen.

import { MEDIA } from '../types/medium.ts'
import type { Medium } from '../types/medium.ts'

/** The verbs whose answer this process writes. One, and it is the only one in this lane. */
export const READ_VERBS = ['look'] as const
/** The verbs the BROWSER performs. Each is a press the person could have made by hand. */
export const ACT_VERBS = ['go', 'take', 'make'] as const

export type ActVerb = (typeof ACT_VERBS)[number]

/** One thing to read back before answering. `about` is everything after the target — a filter, in
 *  the person's words, because a library of thousands is not a thing you list. */
export interface Look {
  readonly target: string
  readonly about: string
}

/**
 * One thing to do.
 *
 * ⚠️ `make` NAMES WHAT WILL ANSWER, and that is either a MEDIUM or a COMPOSITION (2026-08-22). It
 * was media only, which meant the four verbs could operate every part of the app except the part
 * that is most worth operating: `▶ make a-family-from-one-face: a badger who runs a bakery` is one
 * line, and it is twelve renders, a question back, and four more. The table still does not grow —
 * `make` was always "name the thing, not the model", and a chain is a thing you can name.
 *
 * `medium` is set when the target names one; `target` is what was written either way.
 */
export interface Act {
  readonly verb: ActVerb
  readonly medium: Medium | null
  /** `make`: the medium or composition named. Null for `go` and `take`, whose argument is `text`. */
  readonly target: string | null
  /**
   * `make <medium>/<style>`: HOW THIS ONE PRESS SHOULD COME OUT — a saved style, or the words.
   *
   * ⚠️ EITHER, AND THAT IS THE POINT (2026-08-23). A style is optional text that shapes a result,
   * never an object you must own before you can make anything: this held a SLUG and nothing else,
   * so "a voice of a happy kid" was unsayable on a machine with no happy kid installed — the
   * workflow's own narrator answered and the ask was silently dropped. It now holds whatever was
   * written, and the browser resolves it: a saved style when it names one, and otherwise the
   * shaping words themselves, typed into the control the medium keeps for them, in front of the
   * person, before the press.
   *
   * ⚠️ THIS IS NOT A SETTING, AND THE DISTINCTION IS THE WHOLE REASON IT IS ALLOWED (2026-08-22).
   * xoko may not name a model, a checkpoint, a step count or a sampler: those are the machine, the
   * person chose them in 🔌, and a brain overriding them would be rendering with something other
   * than the press they would have made. A style is the opposite kind of thing — content they took
   * from 📚, named, sitting in a picker beside the ask — and in 🗣 it is not decoration at all: the
   * sentence is the SCRIPT and the style is WHO SAYS IT. Without this, "read that in the sailor's
   * voice" was unsayable and every line came out in whichever voice the picker happened to hold.
   *
   * ⚠️ AND IT IS THEIRS TO NAME, NOT xoko's TO CHOOSE. It rides on the same rule as everything
   * else: their words frame the ask. Naming a style they asked for is relaying; picking one they
   * did not mention is deciding what they are making. The browser sets the picker to it in front
   * of them and then presses the section's own ▶, so what happens is a press they can see.
   */
  readonly style: string | null
  /**
   * `make <medium> [key value, …]`: WHAT THIS PRESS IS SET TO — a length, a tempo, a key, a lyric
   * sheet, or `workflow <slug>` to name which path answers.
   *
   * ⚠️ THE KEYS ARE NOT IN THE PROMPT AND MUST NOT BE (2026-08-23). What a medium can be set to is
   * whatever the ARMED WORKFLOW declares a hole for, intersected with what this app knows how to send
   * — `settableKnobs`, src/inference/knobs.ts — and that changes the moment somebody arms a
   * different workflow. It rides on the MAP, beside the medium, generated from the same function the
   * section draws its ⚙ pane from. A prompt that listed them would be a second copy of the catalog
   * and would be wrong the day after it was written; this is the same trade the four verbs already
   * make against the section list.
   *
   * ⚠️ AND THE VALUES ARE STRINGS HERE. This parser does not know a bpm from a keyscale, and
   * guessing would mean a second, worse copy of the knob table: the browser hands each one to the
   * control that owns it, which already knows what it takes and refuses what it does not.
   *
   * Empty for every act that named none, which is most of them.
   */
  readonly settings: Readonly<Record<string, string>>
  readonly text: string
}

export interface Answer {
  /** What to show in the transcript — the reply with its ▶ lines taken out. */
  readonly say: string
  readonly looks: readonly Look[]
  readonly acts: readonly Act[]
}

/**
 * The line, and it must be the WHOLE line: a ▶ inside a sentence is a sentence.
 *
 * Three groups: the verb, an optional target word, and the rest. `make` is the only verb that uses
 * the target (`▶ make image: a fox`); the others put everything after the colon
 * (`▶ look: library stickers`). One regex for both because a second one is a second thing to keep
 * in step with the prompt.
 */
// ⚠️ THE TARGET TAKES DASHES AND THE VERB DOES NOT. A verb is one of four fixed words; a
// target is a slug — `a-family-from-one-face` — and the group that could not hold a dash was
// a grammar that could name every medium and no composition.
// ⚠️ AND IT TAKES ONE SLASH (2026-08-22), which is how a style is named: `▶ make voice/old-sailor:`.
// One token, so the shape of the line does not change and neither does the number of groups — the
// alternative was a fourth capture that every verb would have had to ignore.
// ⚠️ AND WHAT FOLLOWS THAT SLASH MAY BE WORDS (2026-08-23): `▶ make voice/a happy kid, bright and
// quick: we're going to the beach!`. A style is optional text that shapes a result, not an object
// you must own first — so the half after the slash is a slug when it happens to name one and the
// shaping words themselves when it does not. The medium is still a slug, which is what keeps the
// split unambiguous: everything up to the first slash, dashes and all.
// ⚠️ AND A BRACKET MAY SIT BEFORE THE COLON (2026-08-23): `▶ make music [duration 90, bpm 72]: …`.
// It is a fourth group and every verb but `make` ignores it. The shape is `key value` pairs
// separated by commas, which is the one settings notation a language model writes without being
// taught — and it had to be SOMETHING, because a workflow that publishes a tempo, a key, a length
// and a lyric sheet was reachable from the ⚙ pane and from nowhere xoko could say.
const DIRECTIVE =
  /^[\s>*-]*▶\s*([a-z]+)(?:\s+([a-z0-9][a-z0-9-]*(?:\/[^:[\n]*)?))?\s*(?:\[([^\]\n]*)\])?\s*[::]\s*(.+?)\s*$/i

/**
 * `[duration 90, bpm 72, keyscale D minor]` → `{ duration: '90', bpm: '72', keyscale: 'D minor' }`.
 *
 * ⚠️ THE FIRST WORD IS THE KEY AND THE REST IS THE VALUE, which is what lets a value hold a space —
 * `keyscale D minor` and `voice an old sailor, gravelly` are both things somebody will write, and a
 * split on whitespace would have kept "D" and thrown "minor" away.
 *
 * ⚠️ COMMAS SEPARATE PAIRS *OUTSIDE QUOTES ONLY* (2026-08-23), and the quotes are the whole fix.
 * The comma was the separator with no escape hatch, so `voice an old sailor, gravelly` — the exact
 * example this comment used to give as WORKING — was read as two settings, the second of them a
 * knob called `gravelly`. Any value that needs a comma can now say so: `[voice "an old sailor,
 * gravelly"]`. Anything longer than a phrase belongs in a block (`readBlocks`), which needs no
 * escaping at all.
 *
 * ⚠️ A PAIR WITH NO VALUE IS DROPPED, not stored as empty. An empty knob means "as published" and
 * that is what leaving it out already says; storing `''` would send a blank where a number goes.
 */
function readSettings(inside: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const pair of splitPairs(inside)) {
    const m = /^\s*([a-z][a-z0-9]*)[\s:=]+(.+?)\s*$/i.exec(pair)
    if (!m) continue
    out[m[1]!.toLowerCase()] = unquote(m[2]!)
  }
  return out
}

/** Split on commas that are not inside a quoted value. */
function splitPairs(inside: string): readonly string[] {
  const out: string[] = []
  let quote: string | null = null
  let at = 0
  for (let i = 0; i < inside.length; i += 1) {
    const ch = inside[i]!
    if (quote) { if (ch === quote) quote = null; continue }
    if (ch === '"' || ch === "'") { quote = ch; continue }
    if (ch === ',') { out.push(inside.slice(at, i)); at = i + 1 }
  }
  out.push(inside.slice(at))
  return out
}

const unquote = (v: string): string =>
  (v.length > 1 && (v[0] === '"' || v[0] === "'") && v.at(-1) === v[0]) ? v.slice(1, -1) : v

/**
 * A FENCE UNDER A ▶ LINE IS A SETTING TOO — the channel for anything too long for a bracket.
 *
 * ```
 * ▶ make music [duration 60, bpm 118]: upbeat sunny pop, female lead
 * ```lyrics
 * Roll the windows down,
 * here we go — hearts open
 * ```
 * ```
 *
 * ⚠️ IT EXISTS BECAUSE A LYRIC SHEET IS NOT A PHRASE (2026-08-23). The bracket is `key value`
 * pairs on ONE line separated by commas, and a lyric is commas and newlines by nature: asked for a
 * song with words, the brain wrote the chorus into the bracket and it arrived as four invented
 * knobs — `windows`, `here`, `hearts`, `and` — and the press was refused by name for every one of
 * them. Quoting would have saved the commas and nothing would have saved the newlines. So the long
 * values get a shape that needs no escaping: a fenced block whose info string is the knob.
 *
 * ⚠️ ONLY DIRECTLY UNDER A ▶ LINE, and only fence-then-fence after that. A fenced block anywhere
 * else in a reply is a brain showing somebody some code, and swallowing it would be this parser
 * deciding that a paragraph was a parameter.
 *
 * ⚠️ AND AN UNCLOSED FENCE IS NOT CONSUMED. Same rule the ▶ lines keep: what does not parse stays
 * on screen where it can be read and retried, rather than eating the rest of the reply in silence.
 */
const FENCE_OPEN = /^\s*(```|~~~)\s*([a-z][a-z0-9]*)\s*$/i
const fenceClose = (line: string, mark: string): boolean =>
  new RegExp(`^\\s*${mark}\\s*$`).test(line)

function readBlocks(lines: readonly string[], from: number): { at: number; blocks: Record<string, string> } {
  const blocks: Record<string, string> = {}
  let at = from
  for (;;) {
    const open = FENCE_OPEN.exec(lines[at] ?? '')
    if (!open) return { at, blocks }
    const mark = open[1]!
    let end = at + 1
    while (end < lines.length && !fenceClose(lines[end]!, mark)) end += 1
    if (end >= lines.length) return { at, blocks }
    blocks[open[2]!.toLowerCase()] = lines.slice(at + 1, end).join('\n')
    at = end + 1
  }
}

/** The reserved key: which workflow answers, rather than what it is set to. */
export const WORKFLOW_SETTING = 'workflow'

const NO_SETTINGS: Readonly<Record<string, string>> = Object.freeze({})

const isMedium = (s: string): s is Medium =>
  (MEDIA as readonly string[]).includes(s)

/**
 * Read what came back: the prose, what it wants to look at, and what it wants done.
 *
 * ⚠️ A LINE THAT DOES NOT PARSE IS LEFT WHERE IT IS. It stays in `say`, visible, so a brain that
 * got the shape slightly wrong produces a turn you can read and retry rather than a silence.
 *
 * ⚠️ AND TWO NEAR-MISSES ARE FORGIVEN BY NAME, because they are what brains actually write and
 * both are unambiguous: `▶ image: …` (the medium as the verb) is a `make`, and `▶ look library: x`
 * (the target before the colon) is the same as putting it after. Neither is legacy support — the
 * prompt teaches one form — they are the two mistakes worth being relaxed about.
 */
export function readAnswer(text: string): Answer {
  const kept: string[] = []
  const looks: Look[] = []
  const acts: Act[] = []

  /**
   * ⚠️ EVERY LINE IS PERFORMED, AND THE COUNTING IS GONE (2026-08-23). There were three numbers —
   * six acts, three of them renders, three lookups — and between them they produced the worst turn
   * this app has had: asked to plug two services and four workflows, half the lines were set aside
   * and the reply talked about all six as though they had run. The fix for that was `dropped`, a
   * second list handed back so the refusals could at least be SEEN — a mechanism built to make a
   * limit legible rather than a limit worth having.
   *
   * None of the three was protecting anybody. An install writes a few kilobytes of registry and is
   * undone from the screen it lands on. A lookup is a file read, and how many ROUNDS of them a
   * question may cost is bounded where that cost actually is — MAX_HOPS, in the loop
   * (src/server/app.ts). A render costs real time and disk and it is the one that had a case; but
   * the queue is serial, visible and cancellable, generation is cheap (DECISIONS.md, 2026-08-03),
   * and a reply asking for eleven pictures is a judgement failure a number cannot fix. So the rule
   * moved to where judgement lives, in the prompt, and this parser reads what it was given.
   */
  const add = (act: Act): void => { acts.push(act) }

  // ⚠️ INDEXED, NOT `for…of` (2026-08-23), because a ▶ line may be followed by blocks that belong
  // to it — see `readBlocks`. A make act cannot be built until they have been read.
  const lines = String(text).split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!
    const hit = DIRECTIVE.exec(line)
    if (!hit) { kept.push(line); continue }
    const verb = (hit[1] ?? '').toLowerCase()
    // ⚠️ NOT LOWERCASED WHOLESALE ANY MORE. The half after a slash may be a sentence about a
    // person — "a Scottish grandmother, warm" — and flattening its case is flattening the ask.
    // The medium is lowercased where it is read, below, which is the only half that is a slug.
    const target = (hit[2] ?? '').trim()
    const rest = hit[4] ?? ''
    // The blocks under this line, whatever verb it turns out to be. `go` and `take` take no
    // settings and drop theirs below, exactly as they drop a bracket — but the lines are consumed
    // either way, because a fence written under a ▶ was written FOR it and leaving half of it in
    // the transcript is worse than ignoring all of it.
    const read = readBlocks(lines, i + 1)
    i = read.at - 1
    const settings = hit[3] === undefined && !Object.keys(read.blocks).length
      ? NO_SETTINGS
      : { ...(hit[3] === undefined ? {} : readSettings(hit[3])), ...read.blocks }

    // ▶ make image: …  ·  ▶ make <composition>: …  ·  ▶ image: …
    //
    // ⚠️ AN UNKNOWN TARGET AFTER `make` IS STILL AN ACT, and that is the change that lets a chain
    // be named. The browser knows what compositions exist and this does not — so a target it
    // cannot place comes back as "there is no X here", in the transcript, next to the line that
    // asked for it. A bare `▶ film:` with no `make` is still a sentence: the verb is the tell.
    if (verb === 'make' && target) {
      // `voice/old-sailor` — the medium, then how it should come out. A composition slug never
      // carries a slash, so the split is unambiguous; anything the left half is not a medium is
      // left whole and goes to the browser to place (or to refuse by name).
      const cut = target.indexOf('/')
      const head = (cut < 0 ? target : target.slice(0, cut)).toLowerCase()
      const styled = cut >= 0 && isMedium(head)
      add({
        verb: 'make',
        medium: isMedium(head) ? head : null,
        target: styled ? head : target.toLowerCase(),
        style: styled ? target.slice(cut + 1).trim() || null : null,
        settings,
        text: rest,
      })
      continue
    }
    if (isMedium(verb)) {
      add({ verb: 'make', medium: verb, target: verb, style: null, settings, text: rest })
      continue
    }

    // ▶ look: library stickers  ·  ▶ look library: stickers
    if (verb === 'look') {
      const arg = (target ? `${target} ${rest}` : rest).trim()
      const [first = '', ...more] = arg.split(/\s+/)
      looks.push({ target: first.toLowerCase(), about: more.join(' ') })
      continue
    }

    // ▶ go: images  ·  ▶ take: draw-things-grpc/klein-t2i
    if (verb === 'go' || verb === 'take') {
      const arg = (target ? `${target} ${rest}` : rest).trim()
      // ⚠️ NO SETTINGS ON `go` OR `take`. There is nothing to set: one moves the person and the
      // other installs a row. A bracket on either is a brain guessing, and it is dropped rather
      // than carried to a browser that would have to decide what to ignore.
      add({ verb, medium: null, target: null, style: null, settings: NO_SETTINGS, text: arg })
      continue
    }

    // A ▶ line with a verb nobody knows. It stays on screen rather than being swallowed — the
    // person can see what it tried to do, which is the whole reason this is a line and not JSON.
    kept.push(line)
  }

  return { say: kept.join('\n').trim(), looks, acts }
}
