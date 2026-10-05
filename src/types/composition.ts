// 🧩 A COMPOSITION — a named chain that outlives one press.
//
// ⚠️ WHAT MAKES IT DIFFERENT FROM A WORKFLOW, in one line: a workflow is ONE ask answered by ONE
// service; a composition is several asks in an order, with the outputs of earlier ones feeding
// later ones, and — this is the part that makes it worth having — a place where it STOPS AND ASKS
// YOU something. "Twelve faces, you pick the one that is the character, the rest are drawn from
// that face" is not a workflow with more steps. It is a shape a person is inside.
//
// ⚠️ IT REFERENCES WORKFLOWS, IT NEVER DEFINES THEM (PLAN, NEXT.md §3). A workflow is a fact about a
// service — a checkpoint, its control files, its LoRAs, all on this machine — and the requirements
// check already knows how to say what is missing. Let a composition carry its own and the same
// workflow lives two lives with that check reimplemented inside it. What is composition-local is the
// BINDING: which workflow fills each step. That is `recommends`, and it is a recommendation rather
// than a pin so that a composition taken from the library survives a machine with other filenames.
//
// ⚠️ AND IT IS CONTENT, NOT FORMAT. The app ships none, ever. Every composition on a machine got
// there because somebody took it from 📚 or wrote it — which is why there is one layer and no
// shipped file to merge with, unlike every registry beside it.

import type { Medium } from './medium.ts'
import type { WorkflowInput } from './workflow.ts'
import type { Params } from './request.ts'

/**
 * WHERE A STEP'S INPUT COMES FROM: this word, or the id of an EARLIER step.
 *
 * ⚠️ ONE WORD, AND IT IS THE PERSON'S. Every composition begins with something only they can
 * supply — the sentence. A chain whose first step had no way to say "your words go here" would be
 * a chain that makes the same thing every time.
 */
export const ASK = 'ask'

/** One step that MAKES something: a press, repeated `repeat` times, through a bound workflow. */
export interface MakeStep {
  readonly id: string
  /**
   * What this step produces — one of the six MEDIA, or `text`.
   *
   * ⚠️ AND THIS IS THE ONE PLACE `text` IS A THING THIS APP MAKES (2026-08-30). It is not in the
   * medium list and must not be put back into it: a step that writes the brief the next step
   * renders from is real, and every other use of the word was a writing model pretending to be a
   * seventh kind of output. Typed here, where it is true, instead of in a vocabulary six other
   * readers share.
   *
   * ⚠️ `text` IS ALSO THE ONE THAT NAMES NO ENGINE. Every other medium may need a model this
   * machine has to have; words are xoko, always, and cost a chain nothing to install (see
   * `recommends`).
   *
   * ⚠️ IT IS ALWAYS A MEDIUM AND NEVER A BOOK (2026-08-24). What the chain is FOR is not a medium
   * — see `BindStep` below, and the note in src/types/medium.ts.
   */
  readonly makes: Medium | 'text'
  /** How many, from one press. `undefined` is one. */
  readonly repeat?: number
  /**
   * RUN ONCE PER ITEM of `ask` or of an earlier step's output — and this is the step that makes a
   * chain able to build something rather than repeat something.
   *
   * ⚠️ IT IS NOT `repeat`, AND CONFUSING THE TWO IS THE WHOLE REASON IT HAS ITS OWN WORD.
   * `repeat: 12` is TWELVE PRESSES OF THE SAME THING — twelve candidates for one character, and
   * you pick one. `each: "concepts"` is ONE PRESS PER CONCEPT — twelve different pages, all of
   * them kept. A book's pages are the second; a mascot audition is the first; and a chain that
   * wants twelve takes of each of twelve pages says both.
   *
   * ⚠️ AN INPUT POINTING AT THE SAME SOURCE GETS THE ITEM, NOT THE COLLECTION. That is the binding
   * rule and it is the only one: `{ each: "cast", inputs: { ref: "cast" } }` cuts out each cast
   * member; `{ each: "briefs", inputs: { prompt: "briefs" } }` draws one page per brief. Inputs
   * naming a DIFFERENT step behave as they always did — the whole of it, every time round.
   *
   * ⚠️ AND THE OUTPUT IS IN ITEM ORDER, always. Page three has to be the third concept, which is
   * not something a manifest read back after the fact can promise.
   */
  readonly each?: string
  /**
   * A `text` step whose answer is a LIST — one item per line.
   *
   * ⚠️ IT EXISTS BECAUSE ONE SENTENCE HAS TO BECOME MANY THINGS (2026-08-24). "A book about
   * volcanoes, glaciers and coral reefs" is one ask and twelve pages, and nothing between them can
   * do that except a brain asked to answer with a list. Without this a chain could only ever make
   * ONE of whatever it was pointed at, however many presses it spent doing it.
   *
   * `text` only, and never together with `each` — a step that already answers once per item is
   * already a list, and "a list of lists" is a shape this app does not have.
   */
  readonly list?: boolean
  /**
   * A `text` step whose answer is read by a PARSER, not by a person — so nothing shapes it.
   *
   * ⚠️ A STYLE'S WORDS ARE APPENDED TO A STEP'S OWN INSTRUCTION (web/lib/chain.js). That is right
   * for prose — "wry second person, captions under eight words" is exactly the kind of thing a
   * chain should be able to say once and have every writing step obey. It is wrong, and quietly
   * destructive, for a step whose instruction ends "answer with the JSON and nothing around it":
   * the style lands immediately after that sentence and argues with it. Two published steps write
   * documents — the composition builder's `shape` and `svg-images`' `markup` — and both were one
   * ⚙ press away from being broken in a way nobody would have connected to a style.
   *
   * So: `says` never reaches a verbatim step. It is not a smaller style, it is NO style, because
   * there is nothing here for one to shape — the answer is machine-read or it is refused.
   */
  readonly verbatim?: boolean
  /**
   * Which of the workflow's inputs are filled, and from where. Keys are `WorkflowInput`s, so a step
   * cannot ask for a slot no workflow has; values are `ask` or an earlier step's id.
   */
  readonly inputs: Readonly<Partial<Record<WorkflowInput, string>>>
  /**
   * `<service>/<slug>` — which workflow this step was BUILT against.
   *
   * ⚠️ A RECOMMENDATION, NOT A PIN, and the difference is the whole reason a downloaded
   * composition can run at all. The machine that published it had `draw-things-grpc/dev-fast`; a
   * machine that does not can still answer the step with anything of the same kind. What the app
   * refuses to do is guess silently — an unbound step says so.
   *
   * ⚠️ AND NEVER ON A `text` STEP (2026-08-24). Words are xoko — it is the agent this app is
   * driven by, it is already chosen in 🔌, and a chain does not get to name a second brain. A
   * published `mascot` recommended `ollama/prompt-smith` on its first step, so taking a chain that
   * needs one image workflow announced itself as needing a local LLM, dragged one in, and asked a
   * model with no idea what this app is to write the thing xoko was standing right there to write.
   * The parser refuses it; `resolveComposition` binds every `text` step to xoko and to nothing
   * else.
   */
  readonly recommends?: string
  /**
   * WHAT THIS STEP IS ASKING FOR, in the composition's words — the frame around a `text` step.
   *
   * ⚠️ IT EXISTS BECAUSE A WORKFLOW DOES NOT CARRY ONE. A `chat` workflow is "this model, over this
   * transport"; what to ask it is not a fact about the service, it is the BINDING, and the binding
   * is composition-local (NEXT.md §3). Without this, step 1 of `words-worth-rendering` would send
   * your sentence to a chat model and get "Sure! Here is a great description:" back — and step 2
   * would render that.
   *
   * ⚠️ AND IT IS OPTIONAL, because the workflow's own label and notes were written by the person who
   * published it and usually say exactly this. When it is absent the runner composes one from
   * those; when it is present it wins. See `src/compositions/says.ts`.
   */
  readonly says?: string
  /**
   * WHAT THIS STEP IS RUN AT — the knobs the composition was published with.
   *
   * ⚠️ THE DEFAULTS COME WITH THE CHAIN, AND THEY ARE NOT THE APP'S (2026-08-24). A downloaded
   * composition is exactly like a downloaded workflow: it arrives with values that make it work — a
   * mascot drawn square at 1024, a page drawn 4:5 — and running it is pressing ▶, not filling in a
   * form first. They are shown in the ⚙ band beside the engine plug, where they can be changed for
   * this machine; nothing about them is compiled into this app, which knows only that a step may
   * carry a knob bag and that the values in it are scalars.
   *
   * ⚠️ AND THEY ARE KNOBS, NOT PARAMETERS OF THE COMPOSITION. A value the graph does not have a
   * hole for is refused at press time by name, exactly as it is for a knob somebody typed
   * (src/inference/knobs.ts `knobsProblem`) — a composition does not get a quieter failure than a
   * person does.
   */
  readonly params?: Params
  /**
   * WHAT THIS STEP MAY GO AND READ BEFORE IT ANSWERS — look targets (`src/xoko/look.ts` `LOOKS`).
   *
   * ⚠️ `text` ONLY, AND IT EXISTS BECAUSE A CHAIN COULD ONLY EVER GUESS (2026-08-31). Every text
   * step was single-shot: a prompt in, a paragraph out. That is right while the job is to WRITE
   * something, and wrong the moment the job depends on facts only the app holds — which services
   * are installed, what 📚 already publishes, what a ComfyUI node's widgets actually are. A chain
   * that authors a WORKFLOW has to read all three, and inventing a node's range is the exact failure
   * the whole declare-never-infer rule exists to prevent (`bpm` shipped as 40–200; the node says
   * 10–300).
   *
   * ⚠️ DECLARED, NOT "WHATEVER IT ASKS FOR". The composition says what it needs to see when it is
   * published, and a look outside the list is left unanswered in the reply where a person can read
   * it. Every one of them is read-only — `look()` writes, installs and deletes nothing — so this
   * widens what a step KNOWS and never what it can do.
   *
   * ⚠️ AND IT IS NOT A SECOND ROUTE TO ▶. The step still runs through `/api/text`, which reads only
   * the look verbs out of an answer: a step asked to write a prompt must not be able to start a
   * render nobody asked for, and that is the whole reason that endpoint exists apart from the
   * conversation's.
   */
  readonly sees?: readonly string[]
  readonly notes?: string
}

/** One step where the chain STOPS AND ASKS YOU. Nothing is made; one earlier output is chosen. */
export interface PickStep {
  readonly id: string
  /** The id of the step whose output you are choosing from. */
  readonly pick: string
  /** The question, in the composition's own words. Shown above the candidates. */
  readonly asks?: string
}

/**
 * WHAT A CHAIN CAN BIND ITS RESULT INTO. The list is the type.
 *
 * ⚠️ THE CONTAINER, NOT THE PRODUCT. `pdf` — not `book`, not `comic`, not `zine`. Those are the
 * names of COMPOSITIONS, and a composition already has a name. `svg` is the same rule: not
 * `icon`, not `badge`, not `logo`.
 *
 * ⚠️ AND `svg` IS WHY A BIND IS NOT ALWAYS AN ASSEMBLY (2026-08-29). It retired a MEDIUM. `vector`
 * was one of the seven for six days, on two cloud workflows that traced pixels into polygons — and
 * an SVG is not a rendering, it is MARKUP, which is to say it is words, which is to say it is
 * xoko. So there is nothing to render and nothing to trace: a `text` step writes the document and
 * this step files it. What a bind means is unchanged — THE CHAIN WRITES ITS OWN RESULT, reaching
 * no engine — and the two containers only differ in what they are handed: `pdf` takes assets and
 * lines, `svg` takes the markup itself.
 *
 * ⚠️ AND `registry` WAS A THIRD, FOR FOUR DAYS (2026-08-31 → 2026-09-04). A chain could write a
 * workflow row and this step would file it into the app's own registry — which worked, and was the
 * wrong shape for it. Installing is not binding: a bind leaves the run's own result in the run's
 * own folder, and installing changes the app. Worse, it could only ever happen at the END of a
 * successful run, so a document the parsers refused was a dead run — the expensive part done, the
 * JSON sitting there, and nothing to press. What replaced it is a BUTTON on what the step wrote
 * (`/api/install`), which can be pressed again after a fix and goes in through the same door a ⤓
 * take does.
 */
export const BINDS = ['pdf', 'svg'] as const

export type Bind = (typeof BINDS)[number]

/** The paper a bound page is laid out on. `letter` and `a4` are what a printer takes; `square` is
 *  what a picture book usually is, and what reads best on a phone. */
export const PAGES = ['letter', 'a4', 'square'] as const

export type Page = (typeof PAGES)[number]

/**
 * 🧩 THE LAST STEP — where a chain WRITES ITS OWN RESULT.
 *
 * ⚠️ THIS IS WHAT MAKES A COMPOSITION A THING RATHER THAN A MACRO (2026-08-24). Every other step
 * leaves an asset in the run; four steps that draw twelve pages leave twelve pictures and a pile.
 * The chain's DELIVERABLE — the file the person actually asked for — is produced here, beside them,
 * and belongs like them to the run that made it (src/compositions/chain.ts).
 *
 * ⚠️ AND IT IS NOT A WORKFLOW, WHICH IS THE MISTAKE THIS REPLACED. Binding was briefly a `bind`
 * workflow on a `builtin` service making a `book` medium — three inventions to file one PDF, and it
 * put "book" in a list of things models render. A workflow is one ask answered by one service; "these
 * twelve, in this order, into one file" is not an ask anybody types. It is the shape of the chain.
 *
 * ⚠️ LAST, AND AT MOST ONE. The chain's result is the run's result — a second bind step would be a
 * run with two answers, and a bind step in the middle would be a chain that carried on after it had
 * already finished.
 */
export interface BindStep {
  readonly id: string
  /** The container this writes. */
  readonly binds: Bind
  /**
   * WHAT IS BOUND, read per container.
   *
   * `pdf` — the step whose ASSETS are the pages, every one it made, in the order it made them.
   * `svg` — the step whose WORDS are the document. One file per thing it wrote, so a `text` step
   *         carrying `list` or `each` files a set rather than one.
   */
  readonly parts: string
  /** The step whose lines go under them, one per page. Absent = no captions. */
  readonly captions?: string
  /** Paper. Absent = `letter`. */
  readonly page?: Page
  readonly notes?: string
}

export type Step = MakeStep | PickStep | BindStep

export const isPick = (s: Step): s is PickStep => 'pick' in s
export const isMake = (s: Step): s is MakeStep => 'makes' in s
export const isBind = (s: Step): s is BindStep => 'binds' in s

export interface Composition {
  /** Unique on this machine. The nav row's id, so it is also a route segment. */
  readonly slug: string
  readonly label?: string
  /**
   * THE FACE ON ITS NAV ROW — one or two characters, the composition's own.
   *
   * ⚠️ IT COMES WITH THE CHAIN, LIKE EVERYTHING ELSE ABOUT IT (2026-08-24). The app kept a table of
   * family → glyph — mascots 🧸, coloring 🖍, books 📖 — which is a list of the library's content
   * compiled into the app, in the one place that still had one. A composition published tomorrow in
   * a family nobody has named draws its own face; 🧩 is the fallback, and it is the only glyph this
   * app has an opinion about.
   */
  readonly icon?: string
  /**
   * WHICH SHELF IT BELONGS TO — `one-offs`, `mascots`, `sets`, and whatever the library names next.
   *
   * ⚠️ OPEN, BECAUSE THE VOCABULARY LIVES IN THE LIBRARY. A closed list here would mean the app
   * refusing a composition for having a word in it that its own author chose, which is the exact
   * way "the app owns the format, the library owns the content" gets broken from the format side.
   */
  readonly family?: string
  /** What it is FOR, in the words its card carried. It travels: a composition that reads worse
   *  here than on the shelf it came from is one somebody will not use. */
  readonly notes?: string
  /**
   * `false` — THIS CHAIN TAKES NO STYLE, and says so itself.
   *
   * ⚠️ THE COMPOSITION DECLARES IT; THE APP DOES NOT GUESS (2026-09-04). The first version of this
   * was derived — no media step, and every text step `verbatim`, therefore nothing to shape — and
   * it was wrong about the one chain it was written for. The composition builder's `survey` writes
   * PROSE, so the derivation said "styles apply here", and the ⚙ band went on offering a picker
   * for a chain whose only real output is a document. A style on `survey` shapes a brief nobody
   * ever reads in its own right; there is nothing here for one to do.
   *
   * Whether a chain has anything a style could shape is a fact about what it is FOR, which is the
   * author's to state and not something a rule over step kinds can work out. Undefined means yes,
   * because that is what every composition meant before this field existed.
   */
  readonly styles?: boolean
  /**
   * `false` — ▶ IS NOT THE PERSON'S PRESS HERE. The button greys; xoko runs this one.
   *
   * ⚠️ WHAT ▶ MEANS, AND WHY NOT EVERY CHAIN GETS ONE (2026-09-04). ▶ is one press from your own
   * sentence: you say what you want, an engine answers, you look at it. That is true of a chain
   * that draws — say the mascot, get the mascot — and it is not true of a chain whose result is a
   * DOCUMENT you then do something with: a composition to install, a book to read, a set of SVGs.
   * Those are not "the thing you asked for, rendered"; they are work with a shape, and the shape
   * is xoko's to drive.
   *
   * ⚠️ AND IT IS NOT DERIVABLE FROM THE STEPS. The first guess was "ends in a picture" — wrong the
   * moment a card-deck chain ends in twelve pictures and is still nobody's one press. Whether ▶
   * belongs to the person is a fact about what the chain IS FOR, which is the author's to state,
   * exactly like `styles`.
   *
   * ⚠️ GREYED, NOT GONE, AND XOKO KEEPS ITS PRESS. The section still runs — `▶ make <slug>:` from
   * the conversation calls the very same function a click would (web/lib/shell.js `actFor`). What
   * this removes is the human button, because pressing it is not how this chain is used. A hidden
   * ▶ would say "nothing runs here", which is false.
   *
   * Undefined means yes, because that is what every composition meant before this field existed.
   */
  readonly press?: boolean
  readonly steps: readonly Step[]
}

/** What one composition file holds. One composition, so taking one is a write of one file and
 *  forgetting one is a delete of it — no list to rewrite, and nothing else at risk. */
export interface CompositionFile {
  readonly composition: Composition
}
