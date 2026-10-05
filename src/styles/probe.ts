// SWATCHES — one small render per style, so a list of looks can be judged by looking.
//
// A style is a LOOK. Browsing them as text was the wrong shape (DECISIONS.md, 2026-08-04): you
// cannot tell `ink-linework` from `cel-shaded` by reading their words, and the whole point of a
// style list is choosing between them. So every entry carries a probe render.
//
// ⚠️ EVERY MEDIUM HAS ONE, AND IT IS NOT ALWAYS CALLED A SUBJECT (2026-08-29). A style is a
// MODIFIER, and a modifier needs something to modify: jazz-noir over a lullaby is not jazz-noir
// over a chase. So the constant is universal and the WORD for it is not — subject · brief · event ·
// line · object — which is why `PROBE` below is a table and not a string. It also carries what the
// medium calls its own list, because "style" is right for four of the six and actively confusing
// for the other two: a music style is an IDIOM and a voice style is a PERSON.
//
//   PROBE below             the shipped sentence, used until the user saves one
//   <data>/styles/ask.json  what they saved, per medium
//
// ⚠️ ONE ASK PER GRID. Two styles judged on two different sentences compare nothing. But saving a
// new one DELETES NOTHING (changed 2026-08-29): every cell already carries the sentence it was
// actually shot from, so the pictures stay and the ones that no longer match are simply marked
// stale. Deleting them made the ask the one control nobody dared touch.
//
// ⚠️ SMALL — the medium's own cheapest honest answer: a picture at the MODEL'S declared minimum
// resolution (probeSize), fifteen seconds of music, three of sound, one second of video. In code,
// beside PROBE_SEED, never a knob — a probe answers one question and the budget is not a taste.
//
// ⚠️ NOT CONTENT. A swatch is evidence about a style, never the user's work: it lives in app
// data, it is not indexed, it never appears in the gallery, and deleting it is free because it
// regenerates. Same rule PLAN §9 already gives the canary probe.
//
// ⚠️ ONE SWATCH PER (STYLE × SERVICE × MODEL). The same words are a different picture on a
// different checkpoint — that is the whole reason a style will eventually want per-model
// wording — so the model is part of the PATH, and the grid is always the grid of ONE model.
// Keying by style alone meant a card could show a picture from an engine you were not using and
// had no way to say so.

import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { adapterFor } from '../inference/adapter.ts'
import { knobsProblem } from '../inference/knobs.ts'
import { mergeParams } from '../inference/params.ts'
import type { ResolvedWorkflow } from '../inference/workflows.ts'
import { readMaster, writeMaster } from '../content/master.ts'
import { MASTER_EXT } from '../content/run.ts'
import { styleParamFor } from './param.ts'
import { composePrompt, styleNegative, styleParams } from '../jobs/generate.ts'
import type { Queue } from '../jobs/lane.ts'
import { resolveIn } from '../paths.ts'
import type { Roots } from '../paths.ts'
import type { InferenceRow } from '../types/inference.ts'
import type { Medium } from '../types/medium.ts'
import type { Caps } from '../types/caps.ts'
import type { Provenance } from '../types/provenance.ts'
import type { GenerationRequest, Params } from '../types/request.ts'
import type { ResolvedStyle } from '../types/style.ts'
import { STYLE_DIR } from './registry.ts'

/** A medium's own words for its style list, and the sentence they are all judged on. */
export interface ProbeFace {
  /** What the constant is CALLED here — the label on the bar above the grid. */
  readonly ask: string
  /** What the list is called. Plural: the search placeholder and the tally read it. */
  readonly noun: string
  /** The shipped sentence, used until the user saves one. */
  readonly seed: string
  /** One line under the bar: what makes a good one for this medium. */
  readonly hint: string
}

/**
 * THE SHIPPED ASK, PER MEDIUM — a seed, editable above the grid (`saveAsk`).
 *
 * ⚠️ HOW TO RETUNE ONE, learned from bad renders and easy to drop while rewording: state the count
 * (`one chick` read as an article on FLUX.2 9B and it drew two), state the background (clutter is
 * noise in a comparison, and asking beats hoping), keep the adjectives (SDXL's CLIP needs them,
 * FLUX's T5 does not), judge it on the WEAKEST model in the list, and keep it short — the style's
 * own words follow it.
 *
 * ⚠️ AND NONE OF THEM NAMES A STYLE. The music brief is an occasion with a mood and no idiom,
 * because in 🎼 the style IS the idiom: a brief that said "sardana" would fight every entry in the
 * list. Same rule as 🖼's technique-only — the ask is the WHAT, the style is the HOW.
 */
export const PROBE: Readonly<Record<Medium, ProbeFace>> = {
  // The *mona de Pasqua*: three surfaces a style treats differently — down, specular chocolate,
  // matte crumb — and a clear silhouette.
  image: {
    ask: 'subject', noun: 'styles',
    seed: 'a single fluffy yellow chick looking up at a large chocolate egg on a cake, simple background',
    hint: 'one thing, counted, on a stated background — the style\'s words follow it',
  },
  // ⚠️ THE SAME SENTENCE AS 🖼, ON PURPOSE. Identical asks are what make the two grids comparable
  // to each other — "what does ink-linework do on my image engine vs my video engine" is a real
  // question, and two different subjects would destroy it. Stored separately all the same, because
  // a slow video engine is exactly where you would want to cut it down.
  video: {
    ask: 'subject', noun: 'styles',
    seed: 'a single fluffy yellow chick looking up at a large chocolate egg on a cake, simple background',
    hint: 'the same sentence 🖼 uses, so the two grids can be read against each other',
  },
  // One closed form, two surfaces. A 3D probe is judged on silhouette before anything else.
  model3d: {
    ask: 'object', noun: 'styles',
    seed: 'a small round chocolate egg with a fluffy yellow chick sitting on top, plain background',
    hint: 'one closed object, plainly lit — a silhouette you would recognise from across a room',
  },
  // ⚠️ AN OCCASION, NOT A GENRE. See the note above: the style is the idiom here.
  music: {
    ask: 'brief', noun: 'genres',
    seed: 'a short cue for a boat leaving a Mediterranean harbour at first light',
    hint: 'an occasion and a mood, naming no genre — the genre is what you are comparing',
  },
  // The textbook foley probe: a hard transient and a long tail, which is exactly where a
  // RECORDING — close and dry, distant in stone, through a wall — shows itself.
  sound: {
    ask: 'event', noun: 'styles',
    seed: 'a heavy wooden door closing in a stone hall',
    hint: 'one event with a clear attack — a style here is how it was recorded, not what it is',
  },
  // ⚠️ A CONTROL, NOT A THING BEING MODIFIED. A voice style is a PERSON, so the line is not what
  // the style is applied to — it is what everybody reads so you can tell them apart. Kept English:
  // a line in another language silently breaks every English-only voice. Comma-pause, sibilance
  // and a rising end, which is where a flat TTS gives itself away.
  voice: {
    ask: 'line', noun: 'voices',
    seed: 'Careful now — that step is steeper than it looks.',
    hint: 'one short line everybody reads, so the difference you hear is the voice',
  },
}

/** Same picture every time, so the only variable is the style. */
export const PROBE_SEED = 424242

const ASK_FILE = `${STYLE_DIR}/ask.json`

/** The user's sentence if they saved one, else the shipped seed. Blank/unreadable = the seed. */
export async function askFor(roots: Roots, medium: Medium): Promise<string | null> {
  try {
    const raw = JSON.parse(await readFile(resolveIn(roots.data, ASK_FILE), 'utf-8')) as
      Record<string, unknown>
    const saved = raw?.[medium]
    if (typeof saved === 'string' && saved.trim()) return saved.trim()
  } catch { /* never saved one */ }
  return PROBE[medium]?.seed ?? null
}

/** Save it. Empty is `✕ clear` — back to the shipped seed. Nothing is deleted either way; the
 *  cells that no longer match say so themselves (see the header). */
export async function saveAsk(
  roots: Roots, medium: Medium, ask: unknown,
): Promise<string | null> {
  const next = typeof ask === 'string' ? ask.trim() : ''
  const file = resolveIn(roots.data, ASK_FILE)
  let all: Record<string, string> = {}
  try {
    all = JSON.parse(await readFile(file, 'utf-8')) as Record<string, string>
  } catch { /* first save */ }
  if (next) all[medium] = next
  else delete all[medium]
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify(all, null, 2)}\n`)
  return askFor(roots, medium)
}

/**
 * How big a swatch renders: **the model's own declared minimum**, never a number chosen here.
 *
 * ⚠️ This is content-factory's rule, and its reason is the important half — below its declared
 * minimum a model STOPS REPRESENTING ITSELF, and a swatch that misrepresents the model is worse
 * than a slow one. So "small" is not a constant: a shipped 512 is simply refused by an engine
 * whose floor is 768 (which is what happened), and it would be a lie on one whose floor is 1024.
 *
 * A swatch answers one question — what does this style LOOK like — and the smallest canvas the
 * engine will honestly stand behind is the cheapest way to answer it. Snapped up to a multiple
 * of 64, which is what every latent model wants, then held inside the band.
 */
export function probeSize(caps: Caps): number {
  const [lo, hi] = caps.resolution
  return Math.min(Math.max(Math.ceil(lo / 64) * 64, lo), hi)
}

/**
 * WHAT A PROBE IS ALLOWED TO COST, per medium — the other half of `probeSize`.
 *
 * ⚠️ IN CODE, NOT A KNOB, and for the same reason the resolution is not one: a probe answers ONE
 * question — what does this style do — and the smallest honest answer is the cheapest way to get
 * it. A budget somebody can raise is a budget that gets raised, and then a sweep of twenty genres
 * is forty minutes instead of four.
 *
 * ⚠️ EACH MEDIUM'S LEVER IS THE ONE ITS NODE ACTUALLY HAS. A picture gets smaller; a song gets
 * shorter; a video gets fewer FRAMES, because that is Wan's field and seconds would mean rounding
 * behind the person's back (src/inference/knobs.ts). Nothing is converted into a house unit.
 *
 * ⚠️ AND VOICE HAS NONE. A voice probe is a line being read, and the line is already as long as it
 * is — there is no dial between "the whole sentence" and "less than the sentence" worth having.
 */
export function probeParams(medium: Medium, caps: Caps): Params {
  switch (medium) {
    case 'image': {
      const size = probeSize(caps)
      return { width: size, height: size }
    }
    // 17 frames is 4n+1 and, at Wan's 16fps, a hair over a second. A style is a technique and a
    // technique reads in a frame; the clip only has to move enough to be a clip.
    case 'video': return { length: 17 }
    // Long enough to state a groove and a texture, short enough to sweep ten of them.
    case 'music': return { duration: 15 }
    // A door is one second. Three leaves room for the tail, which is where a recording style is.
    case 'sound': return { duration: 3 }
    default: return {}
  }
}

export const SWATCH_DIR = `${STYLE_DIR}/swatches`

/** A service id or a model filename as ONE path segment. Both come from a registry, but a model
 *  is whatever the engine calls its file — `flux_2_klein_4b_i8x.ckpt`, or a slash-bearing
 *  ComfyUI subpath — so it is de-suffixed and reduced to characters a folder name may hold. */
export function pathKey(value: string | null | undefined): string {
  const stem = (value ?? '').replace(/\.(ckpt|safetensors|gguf|pt|bin)$/i, '')
  return stem.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[.-]+/, '').slice(0, 80) || 'default'
}

/** Which grid a swatch belongs to. Everything below takes this rather than three loose strings,
 *  because getting the model wrong silently shows a picture of the wrong engine. */
export interface SwatchTarget {
  readonly medium: Medium
  readonly service: string
  readonly model: string | null
}

export const swatchDir = (t: SwatchTarget): string =>
  `${SWATCH_DIR}/${t.medium}/${pathKey(t.service)}/${pathKey(t.model)}`

/** `<data>/styles/swatches/<medium>/<service>/<model>/<slug>.<ext>`. A slug is already lowercase
 *  kebab, which is a filename with nothing to escape.
 *
 *  ⚠️ THE EXTENSION IS `MASTER_EXT`'s, NOT `.webp` (2026-08-29). It was hard-coded, which was
 *  invisible while 🖼 was the only grid with a probe and a silent lie the moment 🎼 got one: an mp3
 *  written under a `.webp` name is a file `writeMaster` refuses and `readMaster` would open with
 *  the wrong reader. A swatch is a master like any other — same namer. */
export const swatchExt = (medium: Medium): string => MASTER_EXT[medium]

export const swatchRel = (t: SwatchTarget, slug: string): string =>
  `${swatchDir(t)}/${slug}.${swatchExt(t.medium)}`

/** Beside the picture that is not there: WHY it is not there, in the engine's own words.
 *  A failure that only flashed once is a style you will try again tomorrow for the same
 *  reason — kept, a ✗ cell is the most useful cell in the grid. */
export const failRel = (t: SwatchTarget, slug: string): string => `${swatchDir(t)}/${slug}.err.txt`

export const swatchPath = (roots: Roots, t: SwatchTarget, slug: string): string =>
  resolveIn(roots.data, swatchRel(t, slug))

/** What is known about one cell of the grid: a picture and what it cost, a recorded failure, or
 *  neither. */
export interface SwatchState {
  /** The file's mtime, which doubles as the <img> cache-buster. Null = no picture. */
  readonly at: number | null
  /** How long the probe took, from the swatch's OWN embedded record — the same field the gallery
   *  shows on a tile. A style's cost is a fact about the style on this model, and it is exactly
   *  what you want before pressing ▶ sweep on twenty of them. */
  readonly tookMs: number | null
  /**
   * The exact sentence this picture was rendered from — subject + the style's own words, composed
   * for this engine's idiom.
   *
   * ⚠️ READ BACK, NEVER RE-DERIVED. Re-composing it in the browser would show what a probe *would*
   * say today, which is a different claim and silently wrong the moment the subject or the engine's
   * idiom changes. This is what the picture on screen IS, and it is free: the record is already
   * embedded in the master and already being opened for `tookMs`.
   */
  readonly prompt: string | null
  readonly error: string | null
}

/** Everything the grid knows about one cell. The stat and the record are read HERE, beside the
 *  path convention, so no caller ever builds a swatch path of its own. */
export async function readSwatch(
  roots: Roots, t: SwatchTarget, slug: string,
): Promise<SwatchState> {
  const file = swatchPath(roots, t, slug)
  let at: number | null = null
  try {
    at = Math.round((await stat(file)).mtimeMs)
  } catch {
    // No picture — the normal case for a style just written. Then the only thing worth knowing
    // is whether it FAILED, and reading the record of a file that is not there is pointless.
    return { at: null, tookMs: null, prompt: null, error: await readFailure(roots, t, slug) }
  }
  const rec = await readMaster(file)
  return { at, tookMs: rec?.durationMs ?? null, prompt: rec?.prompt ?? null, error: null }
}

export async function readFailure(
  roots: Roots, t: SwatchTarget, slug: string,
): Promise<string | null> {
  try {
    return (await readFile(resolveIn(roots.data, failRel(t, slug)), 'utf-8')).trim() || null
  } catch {
    return null
  }
}

/**
 * Forget a style's swatches — on delete, or when its words change and the pictures stop being
 * true. ACROSS EVERY SERVICE AND MODEL: the words changed for all of them, so a survivor would
 * be a cell claiming to show a style that no longer says that.
 *
 * Silent when there were none; that is the normal case.
 */
export async function forgetSwatch(
  roots: Roots, medium: Medium, slug: string,
): Promise<void> {
  const root = resolveIn(roots.data, `${SWATCH_DIR}/${medium}`)
  let services: string[]
  try {
    services = await readdir(root)
  } catch {
    return // nothing has ever been shot for this medium
  }
  for (const service of services) {
    let models: string[]
    try {
      models = await readdir(resolveIn(root, service))
    } catch {
      continue // a stray file where a service folder should be
    }
    for (const model of models) {
      const dir = resolveIn(root, `${service}/${model}`)
      await rm(resolveIn(dir, `${slug}.${swatchExt(medium)}`), { force: true })
      // The stem-named sidecar every non-webp master carries its record in (content/master.ts).
      await rm(resolveIn(dir, `${slug}.gen.json`), { force: true })
      await rm(resolveIn(dir, `${slug}.err.txt`), { force: true })
    }
  }
}

export interface ProbeDeps {
  readonly roots: Roots
  readonly queue: Queue
  readonly row: InferenceRow
  /**
   * ⚠️ THE WORKFLOW, AND IT IS NOT OPTIONAL (2026-08-29). A swatch is a PRESS — the same adapter,
   * on the same engine, answering the same question — so it is armed exactly like one. It used to
   * resolve a model and hand the adapter nothing else, which was survivable on Draw Things (where
   * the workflow only adds controls and LoRAs, so a swatch was quietly a picture of the checkpoint
   * without them) and simply fatal on ComfyUI, where the workflow IS the graph: shooting a music
   * swatch answered "this workflow carries no graph".
   *
   * The caller resolves it, because "which workflow answers this medium" is a question about what is
   * armed and the grid already had to ask it (src/server/app.ts `swatchTarget`).
   */
  readonly workflow: ResolvedWorkflow
}

/**
 * Queue one swatch. Returns the job id — the caller watches the queue, exactly as a generation
 * does, because a swatch shares the one serial lane and must not race a real render.
 *
 * The resolution below (model → caps → prompt → params) calls the SAME helpers `startRun` does.
 * A probe that resolved its own knobs would be a second answer to "what does this engine want",
 * and the first time they disagreed the swatch would be a picture of a lie.
 */
export async function queueSwatch(
  deps: ProbeDeps, medium: Medium, style: ResolvedStyle,
): Promise<{ jobId: string }> {
  const { roots, queue, row, workflow } = deps
  // ⚠️ READ, NOT CACHED. The user can edit the ask between one sweep and the next, and a swatch
  // rendered from a remembered sentence would be a picture filed under a claim it does not match.
  // It is one small file, once per queued probe.
  const ask = await askFor(roots, medium)
  if (!ask) throw new Error(`no probe ${PROBE[medium]?.ask ?? 'ask'} for ${medium} yet`)

  // ⚠️ A SWATCH IS WORDS AND NOTHING ELSE (see the header), so a workflow that reads a picture
  // cannot shoot one. Refused HERE rather than per cell: a sweep of twelve styles would otherwise
  // queue twelve identical failures, each stating the missing slot instead of the reason.
  if (workflow.slots.length) {
    throw new Error(`${workflow.label} takes ${workflow.slots.join(' + ')} — a swatch is a sentence`
      + ' and nothing attached, so arm a workflow that can be pressed with words')
  }
  // The model, the caps and the knobs all come off the armed workflow, exactly as they do in
  // `startRun`. The grid is that workflow's grid — filed under its checkpoint, because that is what
  // the picture is of.
  const model = workflow.model
  const target: SwatchTarget = { medium, service: row.id, model }
  const caps = workflow.caps
  // ⚠️ THE STYLE IS COMPOSED IN ONLY WHERE THE PROMPT IS A DESCRIPTION — the same branch
  // `startRun` takes (src/jobs/generate.ts, src/styles/param.ts). In 🗣 the sentence is the SCRIPT
  // and the style is WHO reads it, so appending it here would have every voice swatch narrating
  // its own stage direction.
  const shaped = styleParams(medium, style)
  const prompt = styleParamFor(medium) ? ask : composePrompt(ask, style, caps)
  // ⚠️ THE STYLE'S OWN SEED WINS, and for 🗣 that is not a detail — it is the whole person. A voice
  // style is a description AND a pinned number, and a probe that overrode it with the house
  // constant would render eight strangers and file them under eight names.
  const seed = typeof shaped['seed'] === 'number' ? shaped['seed'] : PROBE_SEED
  // A synthetic request, so `mergeParams` validates these knobs against the same caps a real
  // press would — including a `stepsLocked` engine, whose swatch must use its fixed count.
  const request: GenerationRequest = {
    medium,
    text: ask,
    style: style.slug,
    inference: [{ id: row.id }],
    params: {
      ...probeParams(medium, caps),
      seed,
      ...(model ? { model } : {}),
    },
  }
  // ⚠️ `shaped` GOES THROUGH THE MERGE, NOT AROUND IT. A genre is a caption AND a tempo AND a key
  // (src/types/style.ts `params`); spread outside, the engine row's generic 120bpm/C-major would
  // have beaten it and every genre in the grid would have come back sounding like the same one.
  //
  // ⚠️ AND ON YOUR NUMBERS TOO — `workflow.params` is the checkpoint's shipped knobs with your
  // retuning already folded in (src/inference/engines.ts), which is the same value `startRun`
  // passes. Reading the tuning here a second time got the workflow's own knobs wrong: a workflow that
  // pins 8 steps was shot at whatever the checkpoint says.
  const params = {
    ...styleNegative(style, caps),
    ...mergeParams(row, request, { id: row.id }, model, workflow.params, shaped),
  }
  // The same check a press gets, against the same table: a genre's pinned key or tempo is a knob
  // like any other, and one out of range must say so rather than be sent and silently ignored.
  const wrong = knobsProblem(medium, workflow.graph, params)
  if (wrong) throw new Error(`${workflow.label}: ${wrong}`)
  const rel = swatchRel(target, style.slug)
  const fail = resolveIn(roots.data, failRel(target, style.slug))

  const job = queue.add({
    label: `swatch · ${style.label ?? style.slug}`,
    lane: 'serial',
    runId: `swatch-${style.slug}`,
    engine: row.id,
    run: async ({ signal, log }) => {
      const started = Date.now()
      let out
      try {
        out = await adapterFor(row).render({ row, workflow, prompt, params, signal, log })
      } catch (err) {
        // ⚠️ THE FAILURE IS THE RESULT. A style that cannot render on this model is a real
        // answer about the style, and one that only flashed would be re-tried tomorrow for the
        // same reason. Recorded, then rethrown — the queue still calls this job failed.
        await mkdir(dirname(fail), { recursive: true })
        await writeFile(fail, `${(err as Error).message}\n`)
        throw err
      }
      await rm(fail, { force: true }) // it renders now; the old reason is no longer true
      const provenance: Provenance = {
        modality: medium,
        provider: row.id,
        model: out.model,
        workflow: out.workflow,
        // ⚠️ A SWATCH IS ENTIRELY THIS. Every other master names the style that SHAPED it; here
        // it is the whole subject, which is why the slug is in the tags as well — one says what
        // this picture was made in, the other says what it is a picture of, and for a probe
        // those are the same answer arrived at twice.
        style: style.slug,
        prompt,
        seed: out.seed,
        params: out.params,
        tags: ['swatch', style.slug],
        // A swatch is a picture of WORDS — nothing is ever attached to one.
        refs: [],
        runId: `swatch-${style.slug}`,
        createdAt: new Date().toISOString(),
        durationMs: Date.now() - started,
        // Always compressed: it is a thumbnail of a test, never a master anyone exports.
        quality: 'webp-q92',
      }
      await writeMaster(roots.data, rel, out.asset, provenance)
      log(`swatch for ${style.slug}`)
    },
  })
  return { jobId: job.id }
}
