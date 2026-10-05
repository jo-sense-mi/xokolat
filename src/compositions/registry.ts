// 🧩 COMPOSITIONS ON THIS MACHINE — the parser, and the four things you do to the folder.
//
// ⚠️ ONE LAYER, AND THAT IS THE POINT (2026-08-22). Every other registry here is shipped ← yours,
// because the app has an opinion about services and kinds and how a style file is shaped. It has
// none about compositions: it ships zero, it will always ship zero, and every one on a machine
// arrived because somebody took it from 📚 or wrote it. A shipped layer would be a shelf of ours
// inside a folder that is theirs.
//
// ⚠️ ONE FILE PER COMPOSITION, not one list. A list means taking one rewrites the file all of them
// live in, so a bad entry can take the others down with it and every write risks work that has
// nothing to do with the press. A folder means forgetting one is a delete and taking one is a
// write, and neither can reach anything else.
//
// ⚠️ AND THE PARSER IS HOSTILE FOR A REASON THAT IS NOT SECURITY. A composition is a graph — a
// step reads an earlier step's output — and the failure of a bad graph is not a refusal, it is a
// chain that runs three steps and then cannot find `founder`. Every reference is checked here,
// against steps that come BEFORE it, so a composition that loads is a composition that can run.

import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'

import type { Roots } from '../paths.ts'
import { resolveIn } from '../paths.ts'
import type { BindStep, Composition, MakeStep, PickStep, Step } from '../types/composition.ts'
import { ASK, BINDS, PAGES, isMake } from '../types/composition.ts'
import { MEDIA } from '../types/medium.ts'
import { WORKFLOW_INPUTS } from '../types/workflow.ts'
import { LOOK_TARGETS } from '../xoko/looks.ts'
import type { Ctx } from '../validate.ts'
import {
  SLUG, asArray, asBoolean, asEnum, asNumber, asObject, asParams, asString, asStringArray, ctx,
  issue, noStrayKeys,
} from '../validate.ts'

export const COMPOSITION_DIR = 'compositions'

/** The one composition that writes compositions. Pinned to the top of the list — see
 *  `loadCompositions`. It is content like any other and the app ships none of it; what is hard-coded
 *  here is only WHERE IT SITS, which is a fact about the nav and not about the library. */
export const BUILDER = 'composition-builder'

/** ⚠️ A CEILING ON `repeat`, because it is the one field in here that spends real time and disk.
 *  Twelve candidates is a composition; four hundred is a typo, and it would be found out by the
 *  fan running. */
const MAX_REPEAT = 64

/** Enough steps for anything anybody has published, and few enough that a runaway file is caught
 *  before it is walked. */
const MAX_STEPS = 32

export interface LoadedCompositions {
  readonly compositions: readonly Composition[]
  /** ⚠️ REPORTED, NEVER SWALLOWED. A file that will not parse must be visible: it is a thing the
   *  person can see in a folder, and a shelf that quietly omits it is a shelf that is lying. */
  readonly issues: readonly string[]
}

export class CompositionError extends Error {
  readonly status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'CompositionError'
    this.status = status
  }
}

// ── READING ────────────────────────────────────────────────────────────────────

const STEP_KEYS = [
  'id', 'makes', 'repeat', 'each', 'list', 'verbatim', 'inputs', 'recommends', 'says', 'sees',
  'params', 'notes',
]
const PICK_KEYS = ['id', 'pick', 'asks']
const BIND_KEYS = ['id', 'binds', 'parts', 'captions', 'page', 'notes']

/** `<service>/<slug>`, and both halves are slugs. Nothing here resolves it — a recommendation may
 *  name a service this machine has never had, which is a fact to report and not a reason to
 *  refuse the file. */
const BINDING = /^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/

/** A composition's own face. Code points rather than characters, so a flag or a skin tone counts
 *  as the one glyph it draws as. */
const ICON = /^.{1,4}$/u

function parseMake(
  c: Ctx, o: Record<string, unknown>, at: string,
  before: ReadonlySet<string>, madeBefore: ReadonlySet<string>,
): MakeStep | undefined {
  noStrayKeys(c, o, at, STEP_KEYS)
  const id = asString(c, o['id'], `${at}.id`, { pattern: SLUG })
  // ⚠️ THE SIX PLUS ONE, AND THE ONE IS SPELLED OUT HERE (2026-08-30). `text` left the medium
  // vocabulary with the writing model that was pretending to be a medium; a step that WRITES is
  // the one place the word survives, so this is the one parser that adds it back.
  const makes = asEnum(c, o['makes'], `${at}.makes`, [...MEDIA, 'text'] as const)
  const repeat = o['repeat'] === undefined
    ? undefined
    : asNumber(c, o['repeat'], `${at}.repeat`, { min: 1, max: MAX_REPEAT, int: true })
  // ⚠️ `each` NAMES A SOURCE OF ITEMS, and it is checked exactly as an input reference is: `ask`,
  // or a step that came BEFORE this one and actually MADE something. A pick makes one thing and is
  // therefore a legal source of one round, which is odd but not wrong; a step that does not exist
  // yet is a chain that stops halfway, and the honest moment to say so is now.
  const each = o['each'] === undefined ? undefined : asString(c, o['each'], `${at}.each`)
  if (each !== undefined && each !== ASK && !madeBefore.has(each)) {
    issue(c, `${at}.each`,
      `nothing before this step makes ${JSON.stringify(each)} — \`each\` is ${JSON.stringify(ASK)} `
      + 'or an earlier step that produced something')
  }
  const list = o['list'] === undefined ? undefined : asBoolean(c, o['list'], `${at}.list`)
  // ⚠️ A LIST IS A `text` ANSWER AND NOTHING ELSE. Every other medium already produces as many
  // assets as it was pressed for; `list` is the one way WORDS become many, and on an image step it
  // would read as a promise the runner cannot keep.
  if (list && makes !== 'text') {
    issue(c, `${at}.list`, '`list` is for a `text` step — every other step already makes as many as it is pressed for')
  }
  // A step that answers once per item already produces a list. Asking for both is asking for a
  // list of lists, which is not a shape anything downstream can read.
  if (list && each !== undefined) {
    issue(c, `${at}.list`, 'a step with `each` already answers once per item — it is already a list')
  }
  const verbatim = o['verbatim'] === undefined ? undefined : asBoolean(c, o['verbatim'], `${at}.verbatim`)
  // ⚠️ ONLY WORDS CAN BE VERBATIM. It says "a style's words never reach this step's instruction",
  // and a step that has no instruction has nothing for them to reach — on an image step it would
  // read as a promise that a style is ignored, which is the opposite of true.
  if (verbatim && makes !== 'text') {
    issue(c, `${at}.verbatim`, '`verbatim` is for a `text` step — it is about words a style would'
      + ' otherwise be added to')
  }
  const recommends = o['recommends'] === undefined
    ? undefined
    : asString(c, o['recommends'], `${at}.recommends`, { pattern: BINDING })
  // ⚠️ WORDS ARE XOKO, AND A CHAIN DOES NOT GET TO NAME A SECOND BRAIN (2026-08-24). A `text` step
  // that recommended `ollama/prompt-smith` made a composition needing one image workflow report
  // itself as needing a local LLM — and then asked a model that has never heard of this app to
  // write what xoko was standing right there to write. Refused by name, so a published chain
  // carrying one is fixed rather than quietly re-pointed.
  if (recommends !== undefined && makes === 'text') {
    issue(c, `${at}.recommends`,
      'a `text` step is written by xoko — it names no engine, and needs nothing installed')
  }
  const says = o['says'] === undefined ? undefined : asString(c, o['says'], `${at}.says`)
  // ⚠️ AND A `text` STEP MUST SAY WHAT IT IS FOR. It used to be able to borrow the instruction off
  // the workflow it named, because the workflow it named was chosen for that one job. It names none
  // now, and the brain answering is whichever one is armed — so a step with no `says` is a step
  // handing the person's raw sentence to a general model and rendering whatever comes back.
  if (makes === 'text' && !says?.trim()) {
    issue(c, `${at}.says`, 'a `text` step has to say what it is asking for — nothing else does now')
  }
  // ⚠️ WHAT THIS STEP MAY GO AND READ FIRST — look targets, checked against the app's own list so a
  // composition cannot publish a lookup that will never answer. `text` only: every other step is a
  // press through a workflow, and a render has nothing to read.
  const sees = o['sees'] === undefined
    ? undefined
    : asStringArray(c, o['sees'], `${at}.sees`)?.filter((t: string) => {
      if (LOOK_TARGETS.includes(t)) return true
      issue(c, `${at}.sees`,
        `${JSON.stringify(t)} is not something this app can look at (${LOOK_TARGETS.join(', ')})`)
      return false
    })
  if (sees !== undefined && makes !== 'text') {
    issue(c, `${at}.sees`, 'only a `text` step reads anything — every other step is a press')
  }
  const notes = o['notes'] === undefined ? undefined : asString(c, o['notes'], `${at}.notes`)
  // ⚠️ WHAT THIS STEP RUNS AT, as published. Scalars only — the same bag a press carries — and no
  // knob table is consulted here: which holes a graph really has depends on the workflow that ends up
  // answering the step, which is a fact about this machine and not about the file.
  const params = o['params'] === undefined ? undefined : asParams(c, o['params'], `${at}.params`)
  if (params !== undefined && makes === 'text') {
    issue(c, `${at}.params`, 'a `text` step is written by xoko — there is no graph to set a knob on')
  }

  const raw = asObject(c, o['inputs'] ?? {}, `${at}.inputs`)
  const inputs: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw ?? {})) {
    if (!(WORKFLOW_INPUTS as readonly string[]).includes(key)) {
      issue(c, `${at}.inputs`, `${JSON.stringify(key)} is not something a workflow takes (${WORKFLOW_INPUTS.join(', ')})`)
      continue
    }
    const from = asString(c, value, `${at}.inputs.${key}`)
    if (from === undefined) continue
    // ⚠️ EARLIER STEPS ONLY, AND `ask`. A step reading a LATER one is a chain that cannot run, and
    // the only honest moment to say so is now — the alternative is a run that gets three steps in
    // and then stops on a name nothing has produced.
    if (from !== ASK && !before.has(from)) {
      issue(c, `${at}.inputs.${key}`,
        `nothing before this step is called ${JSON.stringify(from)} — an input is ${JSON.stringify(ASK)} or an earlier step`)
      continue
    }
    inputs[key] = from
  }
  if (!id || !makes) return undefined
  return {
    id,
    makes,
    ...(repeat === undefined ? {} : { repeat }),
    ...(each === undefined ? {} : { each }),
    ...(list === undefined ? {} : { list }),
    ...(verbatim === undefined ? {} : { verbatim }),
    inputs,
    ...(recommends === undefined || makes === 'text' ? {} : { recommends }),
    ...(says === undefined ? {} : { says }),
    ...(sees === undefined || makes !== 'text' ? {} : { sees }),
    ...(params === undefined || makes === 'text' ? {} : { params }),
    ...(notes === undefined ? {} : { notes }),
  }
}

function parsePick(c: Ctx, o: Record<string, unknown>, at: string, pressedBefore: ReadonlySet<string>): PickStep | undefined {
  noStrayKeys(c, o, at, PICK_KEYS)
  const id = asString(c, o['id'], `${at}.id`, { pattern: SLUG })
  const pick = asString(c, o['pick'], `${at}.pick`)
  const asks = o['asks'] === undefined ? undefined : asString(c, o['asks'], `${at}.asks`)
  /**
   * ⚠️ IT MUST NAME A STEP THAT PRESSED SOMETHING YOU CAN LOOK AT.
   *
   * Two things are refused here and they are different. Choosing from a step that itself chose is
   * not a shape this app has. And choosing from WORDS is not one either (2026-09-04): a pick shows
   * you candidates and you press one, so what it offers has to be something a card can draw. The
   * first chain the composition builder wrote asked to "review the cards before art" over a `text`
   * step — a reasonable thing to want and not a thing this app does, and it installed cleanly and
   * then failed on step two with "produced nothing to choose from". A composition that loads is a
   * composition that can run, so it is refused here, by name, with the reason.
   */
  if (pick !== undefined && !pressedBefore.has(pick)) {
    issue(c, `${at}.pick`,
      `nothing before this step presses ${JSON.stringify(pick)} — a pick chooses between things you`
      + ' can look at, so it names an earlier step that RENDERS (a `text` step writes words, and'
      + ' there is nothing to choose between)')
    return undefined
  }
  if (!id || !pick) return undefined
  return { id, pick, ...(asks === undefined ? {} : { asks }) }
}

/**
 * The step where the chain writes its own result.
 *
 * ⚠️ `parts` MUST NAME A STEP THAT MADE ASSETS, and `captions` one that wrote WORDS. Both are
 * checked here for the same reason every other reference is: the failure of a bad graph is not a
 * refusal, it is a chain that renders twelve pages and then cannot find what to bind.
 */
function parseBind(
  c: Ctx, o: Record<string, unknown>, at: string, madeBefore: ReadonlySet<string>,
): BindStep | undefined {
  noStrayKeys(c, o, at, BIND_KEYS)
  const id = asString(c, o['id'], `${at}.id`, { pattern: SLUG })
  const binds = asEnum(c, o['binds'], `${at}.binds`, BINDS)
  const parts = asString(c, o['parts'], `${at}.parts`)
  if (parts !== undefined && !madeBefore.has(parts)) {
    issue(c, `${at}.parts`,
      `nothing before this step makes ${JSON.stringify(parts)} — a bind takes what an earlier step produced`)
  }
  const captions = o['captions'] === undefined ? undefined : asString(c, o['captions'], `${at}.captions`)
  if (captions !== undefined && !madeBefore.has(captions)) {
    issue(c, `${at}.captions`,
      `nothing before this step makes ${JSON.stringify(captions)} — captions come from an earlier \`text\` step`)
  }
  const page = o['page'] === undefined ? undefined : asEnum(c, o['page'], `${at}.page`, PAGES)
  const notes = o['notes'] === undefined ? undefined : asString(c, o['notes'], `${at}.notes`)
  if (!id || !binds || !parts) return undefined
  return {
    id,
    binds,
    parts,
    ...(captions === undefined ? {} : { captions }),
    ...(page === undefined ? {} : { page }),
    ...(notes === undefined ? {} : { notes }),
  }
}

/**
 * One composition, checked whole.
 *
 * ⚠️ EVERY PROBLEM IN ONE PASS. Throwing away all but the first would mean fixing a published file
 * one line per attempt, and the person doing that is usually not the person who wrote it.
 */
export function parseComposition(c: Ctx, v: unknown, at = ''): Composition | undefined {
  const o = asObject(c, v, at)
  if (!o) return undefined
  noStrayKeys(c, o, at, ['slug', 'label', 'icon', 'family', 'notes', 'styles', 'press', 'steps'])
  const slug = asString(c, o['slug'], `${at}slug`, { pattern: SLUG })
  const label = o['label'] === undefined ? undefined : asString(c, o['label'], `${at}label`)
  // A face, not a label: a couple of characters, which is what a nav row has space for.
  const icon = o['icon'] === undefined
    ? undefined
    : asString(c, o['icon'], `${at}icon`, { pattern: ICON })
  const family = o['family'] === undefined ? undefined : asString(c, o['family'], `${at}family`, { pattern: SLUG })
  const notes = o['notes'] === undefined ? undefined : asString(c, o['notes'], `${at}notes`)
  // ⚠️ ONLY `false` MEANS ANYTHING. A composition that says nothing takes styles, which is what
  // every one of them did before this existed and what nearly all of them should go on doing.
  const styles = o['styles'] === undefined ? undefined : asBoolean(c, o['styles'], `${at}styles`)
  // ⚠️ SAME RULE, AND FOR THE SAME REASON: only `false` says anything. ▶ belongs to the person
  // unless the author says this chain is xoko's to drive.
  const press = o['press'] === undefined ? undefined : asBoolean(c, o['press'], `${at}press`)

  const list = asArray(c, o['steps'], `${at}steps`) ?? []
  if (!list.length) issue(c, `${at}steps`, 'a composition with no steps does nothing')
  if (list.length > MAX_STEPS) issue(c, `${at}steps`, `${list.length} steps is more than this app will walk (${MAX_STEPS})`)

  const steps: Step[] = []
  const seen = new Set<string>()
  /**
   * ⚠️ TWO SETS, BECAUSE A PICK PRODUCES SOMETHING AND IS NOT SOMETHING YOU PICK FROM (2026-09-04).
   *
   * There was one, and a `pick` step's id was never in it — so nothing downstream could name what
   * you chose. `each: "review"`, `parts: "review"`: refused, both of them, on a chain the runner
   * would have executed perfectly (`out[step.id] = assets([chosen])`, web/lib/chain.js). The whole
   * shape a composition exists for — draw twelve, STOP AND ASK, carry on with the one — was
   * unrepresentable, and the composition builder ran straight into it the first time it wrote a
   * chain with a choice in it.
   *
   * `made` is every step whose output can be named. `pressed` is the ones a pick may choose FROM,
   * which is RENDERS only: choosing from a step that itself chose is still not a shape this app
   * has, and neither is choosing between words.
   */
  const made = new Set<string>()
  const pressed = new Set<string>()
  for (const [i, raw] of list.slice(0, MAX_STEPS).entries()) {
    const at2 = `${at}steps[${i}]`
    const so = asObject(c, raw, at2)
    if (!so) continue
    // ⚠️ A BIND STEP IS THE LAST ONE OR IT IS NOTHING. The chain's result is the run's result, so
    // two of them would be a run with two answers and one in the middle would be a chain that
    // carried on after it had already finished.
    if ('binds' in so && i !== list.length - 1) {
      issue(c, `${at2}.binds`, 'a bind is what a chain ENDS with — it has to be the last step')
      continue
    }
    const step = 'binds' in so
      ? parseBind(c, so, at2, made)
      : ('pick' in so ? parsePick(c, so, at2, pressed) : parseMake(c, so, at2, seen, made))
    if (!step) continue
    // ⚠️ IDS ARE HOW STEPS REFER TO EACH OTHER, so two of a name is not untidy, it is ambiguous.
    if (seen.has(step.id)) { issue(c, `${at2}.id`, `two steps are called ${JSON.stringify(step.id)}`); continue }
    seen.add(step.id)
    if (isMake(step)) {
      made.add(step.id)
      // ⚠️ ONLY WHAT RENDERS. `pressed` is what a PICK may choose from, and you cannot look at
      // words — see parsePick.
      if (step.makes !== 'text') pressed.add(step.id)
    }
    // ⚠️ AND WHAT YOU CHOSE IS SOMETHING THE CHAIN MADE. It is one asset, on disk, under this
    // step's own id — the runner has always put it there.
    else if ('pick' in step) made.add(step.id)
    steps.push(step)
  }

  if (!slug) return undefined
  return {
    slug,
    ...(styles === undefined ? {} : { styles }),
    ...(press === undefined ? {} : { press }),
    ...(label === undefined ? {} : { label }),
    ...(icon === undefined ? {} : { icon }),
    ...(family === undefined ? {} : { family }),
    ...(notes === undefined ? {} : { notes }),
    steps,
  }
}

/** Check one WITHOUT saving it — what a take validates with, and what an editor would. */
export function readDraft(draft: unknown): Composition {
  const c = ctx('composition')
  const parsed = parseComposition(c, draft)
  if (!parsed || c.issues.length) {
    throw new CompositionError(c.issues.join('; ') || 'that is not a composition')
  }
  return parsed
}

const dirOf = (roots: Roots): string => resolveIn(roots.data, COMPOSITION_DIR)

/**
 * Every composition on this machine.
 *
 * ⚠️ NO FOLDER IS THE ORDINARY FIRST-RUN STATE, not an error. The app ships none, so an empty
 * shelf is what a correct install looks like on day one.
 */
export async function loadCompositions(roots: Roots): Promise<LoadedCompositions> {
  const dir = dirOf(roots)
  let names: string[]
  try {
    names = (await readdir(dir)).filter((n) => n.endsWith('.json')).sort()
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { compositions: [], issues: [] }
    return { compositions: [], issues: [`your compositions could not be read: ${(err as Error).message}`] }
  }
  const compositions: Composition[] = []
  const issues: string[] = []
  for (const name of names) {
    // ⚠️ RESOLVED, NOT JOINED. A file name comes off a directory listing here, which is safe — and
    // it goes through the same door every other path in this app goes through anyway, because the
    // day one of these is named by a caller is not the day to remember this line existed.
    const file = resolveIn(dir, name)
    let raw: unknown
    try {
      raw = JSON.parse(await readFile(file, 'utf-8'))
    } catch (err) {
      issues.push(`${name}: ${(err as Error).message}`)
      continue
    }
    const c = ctx(name)
    const one = parseComposition(c, (raw as { composition?: unknown })?.composition ?? raw)
    if (!one || c.issues.length) { issues.push(`${name}: ${c.issues.join('; ')}`); continue }
    // ⚠️ THE FILE NAME IS THE SLUG, and a file whose contents disagree is a file that would be
    // unreachable by the name it is stored under.
    if (`${one.slug}.json` !== name) { issues.push(`${name}: it calls itself ${JSON.stringify(one.slug)}`); continue }
    compositions.push(one)
  }
  /**
   * ⚠️ THE BUILDER GOES FIRST, DELIBERATELY (2026-09-04). Everything else is alphabetical by file
   * name, which is a fine order for a shelf of things you made and the wrong one for the door that
   * makes more of them. It is not a composition among the compositions; it is where the next one
   * comes from, and it belongs above the list for the same reason `add a composition` does.
   *
   * By slug and not by filename luck: `composition-builder` sorts to the top today only because
   * nobody has taken anything beginning with a letter before `c`.
   */
  compositions.sort((a, b) =>
    Number(b.slug === BUILDER) - Number(a.slug === BUILDER))
  return { compositions, issues }
}

export async function loadComposition(roots: Roots, slug: string): Promise<Composition | null> {
  const { compositions } = await loadCompositions(roots)
  return compositions.find((x) => x.slug === slug) ?? null
}

// ── WRITING ────────────────────────────────────────────────────────────────────

/** Add or replace one. Write-then-rename, because a crash mid-write must not leave a truncated
 *  file where a composition used to be. */
export async function saveComposition(roots: Roots, draft: unknown): Promise<Composition> {
  const one = readDraft(draft)
  const dir = dirOf(roots)
  await mkdir(dir, { recursive: true })
  const file = resolveIn(dir, `${one.slug}.json`)
  const tmp = `${file}.tmp`
  await writeFile(tmp, `${JSON.stringify({ composition: one }, null, 2)}\n`)
  await rename(tmp, file)
  return one
}

/** 🗑 Forget one. ⚠️ IT DELETES THE COMPOSITION, NEVER THE ASSETS. What it made is yours and lives
 *  in the content root; the chain that made it is a workflow for doing it again. */
export async function deleteComposition(roots: Roots, slug: string): Promise<void> {
  if (!SLUG.test(slug)) throw new CompositionError(`${JSON.stringify(slug)} is not a composition name`, 400)
  const file = resolveIn(dirOf(roots), `${slug}.json`)
  try {
    await rm(file)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new CompositionError(`there is no composition called ${JSON.stringify(slug)}`, 404)
    }
    throw err
  }
}
