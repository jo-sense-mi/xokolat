// 🧩 ONE RUN OF ONE CHAIN — the folder every step of a single ▶ writes into, and the record beside
// them that says what the run was.
//
// ⚠️ A SECTION KEEPS WHAT IT MAKES (2026-08-24). This file is the whole of that rule on disk. A
// composition's presses used to be ordinary media runs carrying a byline, so a mascot landed in
// 🖼 among every picture you have ever drawn and `builds/` held only the PDF. You go to 🧸 to look
// at your mascots; 📁 reveal has to land you somewhere that says "mascot"; and a chain that made a
// picture, a song and a bound book left its three halves in three places with nothing joining them.
// Now the chain run IS the object: `compositions/<slug>/<run>/`, one folder, one card in the
// composition's own feed, every step inside it.
//
// ⚠️ THE RUN IS MINTED HERE, LIKE EVERY OTHER RUN (§15 rule 2). The browser asks for one and is
// given a slug the server derived from the sentence; every press of that chain then quotes it back
// and it is checked against the SLUG pattern and resolved against the content root before anything
// is opened. What the browser can never do is name a folder.
//
// ⚠️ AND WHAT A `text` STEP WROTE LIVES HERE, not on a shelf. Words are not an asset (there is no
// 📝 medium and there will not be one) — but the brief a chain wrote is most of the story of how
// the picture beside it happened, so it is a FIELD on the run, exactly as lyrics are a field on a
// song.

import { mkdir, readFile, writeFile } from 'node:fs/promises'

import { chainRel, mintRunId, titleFrom } from '../content/run.ts'
import { resolveIn } from '../paths.ts'
import type { Roots } from '../paths.ts'

/** The record beside the run. Named for what it is: one run of one chain. */
export const CHAIN_FILE = 'chain.json'

/** What a `text` step left — the step's id, and what it wrote. */
export interface ChainWrote {
  readonly step: string
  readonly text: string
  /**
   * ⚠️ THE ANSWERS AS THE STEP PRODUCED THEM, when there was more than one (2026-09-04). `text` is
   * one string because that is what a person reads; a `list` step and an `each` step produce MANY,
   * and joining them with newlines threw away where each one ended. That was survivable while the
   * only reader was the eye — and it is not, now that a run can be RESUMED: rebuilding twelve
   * concepts by splitting on newlines gives thirteen the moment one of them wrapped.
   */
  readonly items?: readonly string[]
}

/** What a `pick` step left: the one you chose, so a resumed run does not have to ask again. */
export interface ChainPicked {
  readonly step: string
  /** Content-root-relative master. */
  readonly master: string
}

/** Why a run stopped, on the step it stopped at. Cleared when that step is tried again. */
export interface ChainFailed {
  readonly step: string
  readonly why: string
}

/** What a bind step left: the run's own file, which is not a medium and has no shelf. */
export interface ChainBound {
  /** The file's name inside the run folder. */
  readonly file: string
  readonly step: string
  readonly parts: number
}

export interface ChainRecord {
  readonly runId: string
  readonly composition: string
  /** The sentence the whole chain was run on — every `ask` input read it. */
  readonly text: string
  readonly title: string
  readonly wrote?: readonly ChainWrote[]
  /** What each `pick` step chose. Nothing until one is answered. */
  readonly picked?: readonly ChainPicked[]
  /**
   * ⚠️ WHY IT STOPPED, WHICH NOTHING RECORDED UNTIL NOW (2026-09-04). A chain is driven from the
   * browser, so a step that threw put its reason in a flash and the flash went away — and a
   * reload, a restart or a closed tab left a run with three steps done, two never attempted, and
   * no way to tell those two states apart. "Why did it stop" was unanswerable after the fact.
   */
  readonly failed?: ChainFailed | null
  readonly bound?: ChainBound | null
  /**
   * ⚠️ WHAT THIS RUN PUT INTO THE APP, in the words a person uses — `composition trading-card-maker`
   * (2026-09-04). Written by `/api/install` when the ＋ button on what a step wrote is pressed.
   *
   * It is the only record of it. What was installed has moved into the registry and carries no
   * memory of the run that wrote it, so if the run does not say so, nothing does — and a run whose
   * whole point was to add a chain to the nav would otherwise be a card describing some words.
   */
  readonly installed?: string | null
  readonly createdAt: string
}

export class ChainError extends Error {
  readonly status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'ChainError'
    this.status = status
  }
}

const fileFor = (roots: Roots, composition: string, run: string): string =>
  resolveIn(roots.content, chainRel(composition, run), CHAIN_FILE)

/** Start one: mint the run, make the folder, write the record. */
export async function startChainRun(
  roots: Roots, { composition, text, title }: {
    composition: string; text: string; title?: string | undefined
  },
): Promise<ChainRecord> {
  const said = text.trim()
  const runId = mintRunId(said || composition)
  const record: ChainRecord = {
    runId,
    composition,
    text: said,
    title: title?.trim() || titleFrom(said) || composition,
    createdAt: new Date().toISOString(),
  }
  await mkdir(resolveIn(roots.content, chainRel(composition, runId)), { recursive: true })
  await writeFile(fileFor(roots, composition, runId), JSON.stringify(record, null, 2) + '\n')
  return record
}

export async function readChainRun(
  roots: Roots, composition: string, run: string,
): Promise<ChainRecord | null> {
  try {
    return JSON.parse(await readFile(fileFor(roots, composition, run), 'utf-8')) as ChainRecord
  } catch {
    return null
  }
}

/**
 * Change one field of a run in flight — what a step wrote, what a bind bound, what it is called.
 *
 * ⚠️ READ-MODIFY-WRITE, AND THE STEPS ARE SEQUENTIAL, which is what makes that safe here: a chain
 * runs one step at a time by construction (web/lib/chain.js), so there is never a second writer.
 */
export async function patchChainRun(
  roots: Roots, composition: string, run: string,
  patch: {
    wrote?: ChainWrote
    picked?: ChainPicked
    /** `null` clears it — what a step being tried again does before it runs. */
    failed?: ChainFailed | null
    bound?: ChainBound
    title?: string
    installed?: string
  },
): Promise<ChainRecord> {
  const record = await readChainRun(roots, composition, run)
  if (!record) throw new ChainError(`there is no run ${run} of ${composition}`, 404)
  const wrote = patch.wrote
    // One line per step: a step that ran twice (you pressed ⏹ and went again) says the last thing
    // it said, not both.
    ? [...(record.wrote ?? []).filter((w) => w.step !== patch.wrote?.step), patch.wrote]
    : record.wrote
  // One entry per step, exactly as `wrote` — choosing again on a resumed run replaces the choice.
  const picked = patch.picked
    ? [...(record.picked ?? []).filter((x) => x.step !== patch.picked?.step), patch.picked]
    : record.picked
  const next: ChainRecord = {
    ...record,
    ...(wrote ? { wrote } : {}),
    ...(picked ? { picked } : {}),
    ...(patch.failed === undefined ? {} : { failed: patch.failed }),
    ...(patch.bound ? { bound: patch.bound } : {}),
    ...(patch.installed ? { installed: patch.installed } : {}),
    // Blank goes back to the name read off the sentence — the same rule ✎ keeps for a media run.
    ...(patch.title === undefined
      ? {}
      : { title: patch.title.trim() || titleFrom(record.text) || composition }),
  }
  await writeFile(fileFor(roots, composition, run), JSON.stringify(next, null, 2) + '\n')
  return next
}
