// Where a run lands, and who gets to name it.
//
// ⚠️ THE SERVER MINTS THE RUN, and `<slug>` is derived HERE from the request text — slugified,
// length-capped, ASCII. Never chosen by a model, never sent by the browser (PLAN §4, §15 rule
// 2): a path an LLM names is a path an LLM can name `../`.
//
// The factory does the opposite — `media.js` mints the run folder client-side — precisely
// because two runners started a second apart would stamp two different timestamps. Same
// problem, solved one level up: one press is one run id, and every job in that press
// references it.

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'

import { knobsFor } from '../inference/knobs.ts'
import { resolveIn } from '../paths.ts'
import type { Roots } from '../paths.ts'
import type { Medium } from '../types/medium.ts'
import type { GenerationRequest } from '../types/request.ts'

/** Where every media run lives, under the content root. */
export const MEDIA_DIR = 'media'

/** The run folder's timestamp: sortable, second-resolution, no separators to parse. */
export function stamp(at = new Date()): string {
  const p = (n: number, w = 2): string => String(n).padStart(w, '0')
  return `${at.getFullYear()}${p(at.getMonth() + 1)}${p(at.getDate())}`
    + `-${p(at.getHours())}${p(at.getMinutes())}${p(at.getSeconds())}`
}

/** Lowercase ASCII kebab, capped. Accents are folded rather than dropped, so "cafè" stays
 *  "cafe" instead of becoming "caf"; anything with no ASCII left at all becomes "untitled",
 *  because a folder named "" is not a folder. */
export function slugify(text: string, max = 48): string {
  const folded = text.normalize('NFKD').replace(/[̀-ͯ]/g, '')
  const slug = folded.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  if (!slug) return 'untitled'
  // Cut on a word boundary when there is one near the limit — "coffee-before-9am" beats
  // "coffee-before-9a".
  const cut = slug.slice(0, max)
  const lastDash = cut.lastIndexOf('-')
  return (cut.length === slug.length || lastDash < max / 2 ? cut : cut.slice(0, lastDash))
    .replace(/-+$/, '')
}

export const mintRunId = (text: string, at = new Date()): string => `${slugify(text)}-${stamp(at)}`

/**
 * A RUN ID NOTHING IS USING YET — the same name, then `-2`, `-3`, …
 *
 * ⚠️ A CHAIN PRESSES TWELVE OF ONE STEP IN ONE SECOND, and that is what this is for. Inside a chain
 * a run is named after its STEP — `founder`, not `a-cat-20260824-101500` — because the chain run
 * folder already carries the sentence and the clock, and a timestamped child of a timestamped
 * parent reads like a mistake. Twelve candidates are then twelve folders called `founder`, which is
 * one folder, twelve masters of the same name, and eleven pictures that never existed.
 *
 * ⚠️ AND IT IS NOT ONLY A CHAIN'S PROBLEM. `mintRunId` is second-resolution, so two presses of ▶ a
 * few hundred milliseconds apart on the same sentence collide exactly the same way — quietly, by
 * overwriting.
 */
export async function freeRunId(
  roots: Roots, medium: Medium, base: string, chain?: ChainRef,
): Promise<string> {
  const taken = async (id: string): Promise<boolean> => {
    try {
      return (await stat(resolveIn(roots.content, runRel(medium, id, chain)))).isDirectory()
    } catch {
      return false
    }
  }
  if (!(await taken(base))) return base
  for (let n = 2; n < 500; n += 1) {
    const id = `${base}-${n}`
    if (!(await taken(id))) return id
  }
  throw new Error(`there are already 500 runs called ${base} — that is not a press, it is a loop`)
}

/**
 * WHAT TO CALL A RUN NOBODY NAMED — the ask, read as a name rather than as a prompt.
 *
 * ⚠️ IT IS NOT `slugify`, AND THAT IS THE ENTIRE POINT (2026-08-23). The slug is a PATH: lowercase,
 * ASCII, hyphenated, capped at 48 and stamped with a timestamp, which is exactly right for a folder
 * and unreadable as a title — `a-happy-young-kid-bright-and-giggly-full-of-20260823-173618`. This
 * keeps the person's own capitals and punctuation and stops at the first clause, because the first
 * clause of a generation prompt is the subject and everything after it is direction.
 *
 * Not clever, and deliberately so: it is the FALLBACK. A run that deserves a real name gets one
 * from whoever pressed ▶ — the ⚙ name field, xoko's `[title …]`, or ✎ in ⓘ afterwards.
 *
 * ⚠️ NO LENGTH CAP, AND IT NEVER WRITES AN ELLIPSIS (2026-09-04). It cut at 42 and appended `…`
 * itself, so a stored title read `a warm, gentle young boy, about seven…` — and a cut that is
 * written down cannot reflow. Widen the pane and nothing happens, because the words are not there
 * to show; the dots sit in the same place at every width, which is the one thing they must not do.
 * Raising the number to 120 only moved where it was wrong.
 *
 * A NAME IS NOT A LENGTH — it is where the ask stops being the subject, and the sentence and the
 * clause below already find that. What is left over is a long name, and a long name is a
 * RENDERING problem: every place one is drawn clips with CSS, against the width it is actually in.
 * That is why 🎨's subject trims as you drag the pane and this did not.
 */
export function titleFrom(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (!flat) return 'untitled'
  // The first SENTENCE, when there is one — somebody who wrote two has already said which is the
  // subject.
  const sentence = /^(.+?)[.!?](?:\s|$)/.exec(flat)?.[1]?.trim()
  if (sentence) return sentence
  // Otherwise the first CLAUSE, when it is long enough to be a name on its own. "a happy young
  // kid" is; "synthwave" is not, and cutting there would name every track after its genre.
  const clause = flat.split(/[,;]/)[0]!.trim()
  return clause.length >= 16 ? clause : flat
}

/**
 * 🧩 WHERE A CHAIN'S RUNS LIVE — `compositions/<slug>/<run>/`, under the content root.
 *
 * ⚠️ A SECTION KEEPS WHAT IT MAKES (2026-08-24, and this is the correction). A composition's
 * presses were ordinary media runs with a byline: a mascot landed in `media/image/` and showed up
 * in 🖼 among everything you have ever drawn. That is wrong in the app — you go to 🧸 to see your
 * mascots — and it is wrong in the Finder, which is where 📁 reveal lands you. What a section makes
 * belongs to that section, on screen and on disk, so a chain press writes HERE instead.
 */
export const CHAIN_DIR = 'compositions'

/** Which chain run a press belongs to. Both halves are slugs; neither is ever concatenated into a
 *  path without `resolveIn` (§15 rule 2). */
export interface ChainRef {
  readonly slug: string
  /** The chain RUN folder — one per press of ▶, minted server-side (src/compositions/chain.ts). */
  readonly run: string
}

/** Content-root-relative folder for one run of one chain — everything it makes, in one place. */
export const chainRel = (slug: string, run: string): string => `${CHAIN_DIR}/${slug}/${run}`

/** Content-root-relative directory for a run. Every path in the app goes through `resolveIn`
 *  (§15 rule 2); these helpers only build the RELATIVE part.
 *
 *  ⚠️ TWO HOMES, ONE FUNCTION. A press somebody typed lands under its MEDIUM; a press a chain made
 *  lands under the CHAIN, in a folder named after the step. Same run record, same masters, same
 *  index — the only thing that differs is whose shelf it is on. */
export const runRel = (medium: Medium, runId: string, chain?: ChainRef): string =>
  (chain ? `${chainRel(chain.slug, chain.run)}/${runId}` : `${MEDIA_DIR}/${medium}/${runId}`)

/** Which file inside a run is the master, per medium. Image is the whole of Phase 0; the others
 *  land with their engines. Declared HERE, in the module that names files, so the index reads it
 *  from one place instead of keeping a second copy that can drift. */
export const MASTER_EXT: Record<Medium, string> = {
  image: 'webp', music: 'mp3', sound: 'mp3', voice: 'mp3', model3d: 'glb',
  // ⚠️ h264 IN mp4, WHICH IS A CHOICE AND NOT THE ONLY ONE. ComfyUI's SaveVideo also writes webm,
  // and webm is smaller — but mp4/h264 is the file every editor, phone and browser on this machine
  // opens without being asked twice, and a master is the copy you keep.
  video: 'mp4',
}

/**
 * What one selection's master inside a run is called: the service AND the checkpoint, always.
 *
 * ⚠️ UNCONDITIONAL (2026-08-07). It used to depend on its SIBLINGS — a plain `draw-things-grpc`
 * when one engine answered, `draw-things-grpc--<stem>` when two did. A name that changes with how
 * many boxes you happened to tick means the same checkpoint has two possible paths, and you
 * cannot read a path and know what made the picture. One rule, in every press.
 *
 * ⚠️ A FILE, NOT A FOLDER. It was `<cell>/NN.webp` while one press could ask for N assets; `count`
 * is gone, so a folder per cell would be three folders holding one file each — the worst possible
 * layout for the one act this feature exists for. Flat, a comparison is three siblings in one
 * Finder window.
 *
 * The name is a LAYOUT detail either way: the index reads which service rendered an asset out of
 * the master's own provenance (src/content/index.ts).
 */
export const cellName = (service: string, model: string | null): string =>
  (model ? `${service}--${slugify(model.replace(/\.[^.]+$/, ''), 32)}` : service)

/** The master's content-root-relative path — the whole of it, from medium to extension. */
export const masterRel = (
  medium: Medium, runId: string, service: string, model: string | null, chain?: ChainRef,
): string => `${runRel(medium, runId, chain)}/${cellName(service, model)}.${MASTER_EXT[medium]}`

/** The run's own record: what was asked for, before any engine touched it. Not provenance —
 *  that lives in each master (PLAN §4) — but the ASK, which no single asset owns and which the
 *  index reads to label the group. */
export interface RunRecord {
  readonly runId: string
  readonly medium: Medium
  readonly text: string
  /**
   * WHAT THIS RUN IS CALLED. Always present on a record written since 2026-08-23; null on an older
   * one, and the index falls back the same way it always did.
   *
   * ⚠️ IT LIVES ON THE RUN AND NOT IN THE MASTER'S PROVENANCE, which is the same split `text`
   * already keeps: provenance is what an ENGINE did to make one file, and a name is what a PERSON
   * calls the press. It is also the only one of the two that is meant to be edited — renaming
   * rewrites this json and touches no master (`/api/run/title`).
   */
  readonly title?: string | null
  /**
   * WHAT THIS RUN IS ABOUT, when that is not the text it carries.
   *
   * ⚠️ IT EXISTS BECAUSE 🗣's TEXT IS NOT ITS SUBJECT (2026-08-23). For a picture or a song the
   * ask IS the description, so a name read off it is a name of the thing. For a VOICE the ask is
   * the SCRIPT — the words to be spoken — and the thing being made is the speaker, who is
   * described in a channel of their own (the medium's shaping knob, src/inference/knobs.ts). A
   * list named off the text answered "what will it say", which is the one question you can
   * already answer by pressing play.
   *
   * Stored rather than recomputed so that ✎ → blank restores the SAME name the run was born
   * with: the params live in each master's provenance, and a run outlives any one of them.
   */
  readonly subject?: string | null
  readonly style: string | null
  readonly inference: readonly string[]
  /**
   * 🧩 THE CHAIN THAT PRESSED IT, and which run of it — absent for a press somebody typed.
   *
   * ⚠️ IT IS ROUTING NOW, NOT A BYLINE (2026-08-24). These three fields say WHERE the run went:
   * `runRel` reads them and files the press under `compositions/<composition>/<chain>/<step>/`
   * instead of under the medium. A byline was the half-measure that preceded it — the picture was
   * still on the medium's shelf and merely admitted where it came from.
   */
  readonly composition?: string | null
  /** The chain RUN this press belongs to — the folder every step of one ▶ writes into. */
  readonly chain?: string | null
  readonly step?: string | null
  readonly createdAt: string
}

export const RUN_FILE = 'run.json'

/** Put one record on disk. Split from `writeRunRecord` below because a run is not always a press:
 *  an IMPORT is a run of one asset with no engine and no sentence (src/content/import.ts), and it
 *  is filed the same way so the index has one kind of folder to read. */
export const chainOf = (record: Pick<RunRecord, 'composition' | 'chain'>): ChainRef | undefined =>
  (record.composition && record.chain ? { slug: record.composition, run: record.chain } : undefined)

export async function writeRun(roots: Roots, record: RunRecord): Promise<RunRecord> {
  const dir = resolveIn(roots.content, runRel(record.medium, record.runId, chainOf(record)))
  await mkdir(dir, { recursive: true })
  await writeFile(resolveIn(dir, RUN_FILE), JSON.stringify(record, null, 2) + '\n')
  return record
}

/**
 * ✎ RENAME ONE RUN — rewrite `run.json`'s `title`, and nothing else.
 *
 * ⚠️ NO FILE MOVES, AND THAT IS THE WHOLE REASON A NAME IS A FIELD. The run FOLDER is the asset's
 * identity: it is in every master's provenance (`runId`), in the ratings keys, and in whatever the
 * person has open in the Finder. A rename that moved it would orphan all three to change a word on
 * a screen. `run.json` is the only thing on disk that has to know.
 *
 * The caller hands the content-relative run folder, which `resolveIn` checks before anything is
 * opened (§15 rule 2).
 */
export async function renameRun(roots: Roots, rel: string, title: string): Promise<RunRecord> {
  const dir = resolveIn(roots.content, rel)
  const file = resolveIn(dir, RUN_FILE)
  let record: RunRecord
  try {
    record = JSON.parse(await readFile(file, 'utf-8')) as RunRecord
  } catch {
    throw new Error(`there is no run at ${rel} to rename`)
  }
  // Blank means "go back to reading it off the ask", which is a real thing to want and the only
  // way back from a name you regret.
  const named: RunRecord = {
    ...record,
    title: title.trim() || titleFrom(record.subject || record.text || ''),
  }
  await writeFile(file, JSON.stringify(named, null, 2) + '\n')
  return named
}

/**
 * THE MEDIUM'S SHAPING VALUE, or null — the one param that says what this is rather than what it
 * says. Exactly one knob per medium may declare it and most declare none, so for 🖼 and 🎼 this is
 * null and the ask names the run exactly as it always did.
 */
function subjectOf(request: GenerationRequest): string | null {
  const key = knobsFor(request.medium).find((k) => k.shaping)?.key
  if (!key) return null
  for (const bag of [request.params, ...request.inference.map((s) => s.params)]) {
    const value = bag?.[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

export async function writeRunRecord(roots: Roots, request: GenerationRequest, runId: string): Promise<RunRecord> {
  return writeRun(roots, {
    runId,
    medium: request.medium,
    text: request.text,
    subject: subjectOf(request),
    // ⚠️ THE SUBJECT NAMES IT WHEN THERE IS ONE. "an old Catalan man, gravelly" is what the person
    // made; "Bon dia, com estàs?" is what he was handed to read.
    title: request.title?.trim() || titleFrom(subjectOf(request) ?? request.text),
    style: request.style ?? null,
    inference: request.inference.map((s) => s.id),
    ...(request.composition
      ? {
        composition: request.composition.slug,
        chain: request.composition.run,
        step: request.composition.step,
      }
      : {}),
    createdAt: new Date().toISOString(),
  })
}
