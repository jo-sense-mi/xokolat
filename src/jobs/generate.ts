// One press → one run → N jobs. The whole orchestration, in one file, because it is the place
// every §4 rule about requests actually happens.

import { adapterFor } from '../inference/adapter.ts'
import type { ResolvedRef } from '../inference/adapter.ts'
import { cachedCatalog, serviceFiles } from '../inference/catalog.ts'
import { loadKinds } from '../inference/kinds.ts'
import { knobsProblem } from '../inference/knobs.ts'
import { mergeParams } from '../inference/params.ts'
import { workflowFor } from '../inference/workflows.ts'
import type { LoadedRegistry } from '../inference/registry.ts'
import { readTuning, tunedByFile } from '../inference/tuning.ts'
import { writeMaster } from '../content/master.ts'
import { readPixels } from '../content/pixels.ts'
import { freeRunId, masterRel, mintRunId, runRel, writeRunRecord } from '../content/run.ts'
import { styleParamFor } from '../styles/param.ts'
import { loadStyles } from '../styles/registry.ts'
import { PathEscapeError } from '../paths.ts'
import type { Roots } from '../paths.ts'
import type { Caps } from '../types/caps.ts'
import type { InferenceRow } from '../types/inference.ts'
import { isMedium } from '../types/medium.ts'
import type { Medium } from '../types/medium.ts'
import { reservedHole } from '../types/workflow.ts'
import type { Provenance } from '../types/provenance.ts'
import type { GenerationRequest, Params } from '../types/request.ts'
import type { ResolvedStyle } from '../types/style.ts'
import type { Queue } from './lane.ts'

export interface RunStart {
  readonly runId: string
  readonly jobs: readonly string[]
  readonly path: string
}

export class RequestError extends Error {
  readonly status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'RequestError'
    this.status = status
  }
}

/** Words too common to describe anything. Deliberately tiny: normalize lightly rather than
 *  curating into pools — the vocabulary grows with the content, and that is the feature. */
const STOPWORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'be', 'by', 'for', 'from', 'in', 'is', 'it', 'of', 'on', 'or',
  'that', 'the', 'to', 'with',
])

/**
 * Tags for a media run, which has no builder to produce them.
 *
 * ⚠️ Derived AT QUEUE TIME, from the request text, because they must be known before the master
 * is written (PLAN §6). Lowercased, trimmed, deduped — normalized lightly, never curated.
 */
export function tagsFromText(text: string, style: ResolvedStyle | null): string[] {
  const words = text.toLowerCase().split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
  const styleWords = (style?.tags ?? [])
    .map((t) => t.trim().toLowerCase())
    // `{prompt}` is a POSITION, not a descriptor — searching the library for it would find every
    // asset a lead-anchored style ever made.
    .filter((t) => t && t !== PROMPT_SLOT)
  return [...new Set([...words, ...styleWords])].slice(0, 12)
}

/**
 * WHERE THE SUBJECT GOES, when a style wants to say. Written as `{prompt}` among a style's words.
 *
 * ⚠️ POSITION IS NOT COSMETIC ON A TAG MODEL. CLIP's text encoder is causal and its conditioning
 * is pooled from the end, so a medium word placed BEFORE the subject is one every subject token is
 * then encoded knowing about — the style becomes structural. The same words trailing arrive after
 * the subject is committed and dilute the longer the sentence gets. Stability's own shipped SDXL
 * style templates are all this shape, and so is content-factory's palette:
 *
 *     line art drawing, {prompt}, professional, sleek, minimalist, vector graphics
 *     └ anchor         └ subject  └ refinements
 *
 * ⚠️ AND IT IS NOT ONLY THE TAG CHANNEL (2026-08-30). This used to end "FLUX reads prose through
 * T5 and barely cares, which is why only the tag channel uses it here" — which is why no published
 * style put the marker in `positive`, which is the only channel a prose engine reads. T5 is
 * bidirectional so position matters LESS than it does to CLIP's causal pooling; less is not none,
 * and there is a bigger effect than encoder mechanics: leading with the medium makes the style the
 * thing being described and the subject its content. See `composePrompt` — the default is now the
 * anchored shape on both channels, and the marker is how a style asks for something else.
 */
export const PROMPT_SLOT = '{prompt}'

/**
 * The composed prompt: what the user said, plus what the style adds, in the idiom the engine asked
 * for. A prose model given tag soup renders tag soup.
 *
 * ⚠️ THE STYLE LEADS WHEN IT DOES NOT SAY OTHERWISE (2026-08-30, was `${subject}, ${words}`).
 * A papercut press came back a photograph: twelve style words trailing thirty words of subject, on
 * a 4-step model that also has no negative channel to push the photo prior away. The words were
 * there and they were last, which on a long ask is the same as not being there. So an unmarked
 * style now composes as if it had written `{prompt}` after its own words — the shape every SDXL
 * style template and the whole content-factory palette already used — and `{prompt}` stays the way
 * to put the subject anywhere else, including back at the front.
 */
export function composePrompt(text: string, style: ResolvedStyle | null, caps: Caps): string {
  const subject = text.trim()
  if (!style) return subject
  const words = caps.idiom === 'tags'
    ? (style.tags?.join(', ') ?? style.positive ?? '')
    : (style.positive ?? style.tags?.join(', ') ?? '')
  if (!words) return subject
  return words.includes(PROMPT_SLOT)
    ? words.split(PROMPT_SLOT).join(subject)
    : `${words}, ${subject}`
}

/** The other half of the same idea: a tag model (SDXL) leans on a negative to push the photo/3d
 *  prior away, and the style is what says which words. A DEFAULT — a `negative` in the request
 *  still wins — and silently absent on an engine whose `caps.negatives` is false, because there
 *  it is not a knob that was refused, it is a channel the model does not have. */
export function styleNegative(style: ResolvedStyle | null, caps: Caps): Params {
  const words = style?.negative?.trim()
  return words && caps.negatives ? { negative: words } : {}
}

/**
 * WHICH OF THE TWO CHANNELS the prompt above actually came from — `tags`, `positive`, or neither.
 *
 * ⚠️ Not derivable from the idiom alone, and that is the whole reason it exists: composePrompt
 * FALLS BACK to the other channel when the asked-for one is empty. A UI that guessed from the
 * idiom would mislabel exactly the case worth seeing — and the case that actually bit was the
 * other way round: typing into `words` on a tag model, pressing shoot, and getting a byte-identical
 * picture, because SDXL never read that box. A style editor has to be able to say so out loud.
 */
export function styleChannel(
  style: ResolvedStyle | null, caps: Caps,
): 'tags' | 'positive' | null {
  if (!style) return null
  const has = { tags: Boolean(style.tags?.length), positive: Boolean(style.positive?.trim()) }
  const [first, second] = caps.idiom === 'tags'
    ? (['tags', 'positive'] as const)
    : (['positive', 'tags'] as const)
  return has[first] ? first : has[second] ? second : null
}

/** Everything this engine would actually be sent for one style, composed by the SAME functions a
 *  render calls. The preview and the render can therefore never disagree. */
export interface StyleSend {
  readonly prompt: string
  readonly negative: string | null
  readonly reads: 'tags' | 'positive' | null
  /**
   * WHAT THE STYLE SENDS BESIDE THE WORDS — a genre's tempo and key, a voice's description and
   * its pinned seed (`styleParams`).
   *
   * ⚠️ IT IS MOST OF THE STYLE ON HALF THE MEDIA and it was invisible (2026-08-29). The editor
   * printed one composed sentence, which on 🎼 omitted the two numbers that make a genre that
   * genre, and on 🗣 printed a sentence nothing ever renders. Empty for a style that brings only
   * words, which is the ordinary case.
   */
  readonly params: Params
}

/**
 * ⚠️ MEDIUM-AWARE, because the prompt is not always a description (src/styles/param.ts). On 🗣 the
 * sentence is the SCRIPT and the style goes to a channel of its own — so composing it into the
 * preview would print words no render will ever send, in the one box whose entire job is to say
 * what will be sent.
 */
export function styleSend(ask: string, style: ResolvedStyle | null, caps: Caps): StyleSend {
  const medium = style?.medium
  const shaping = medium && isMedium(medium) ? styleParamFor(medium) : null
  return {
    prompt: shaping ? ask.trim() : composePrompt(ask, style, caps),
    negative: (styleNegative(style, caps)['negative'] as string | undefined) ?? null,
    reads: shaping ? null : styleChannel(style, caps),
    params: medium && isMedium(medium) ? styleParams(medium, style) : {},
  }
}

/**
 * A STYLE THAT DOES NOT GO IN THE PROMPT — the params it sends instead (src/styles/param.ts).
 *
 * ⚠️ THE SEED COMES WITH IT, and that is the half that makes a voice a voice. A description on a
 * fresh number is a different person reading the same line; pinned, "the sailor" is one sailor in
 * every line he says. A style with no seed simply does not send one and the run draws its own, the
 * way everything else here does.
 */
export function styleParams(medium: Medium, style: ResolvedStyle | null): Params {
  if (!style) return {}
  // ⚠️ THE STYLE'S OWN SETTINGS COME FIRST AND THEY ARE NOT MEDIUM-SPECIFIC (2026-08-23). This
  // function used to return `{}` outright for any medium with no description channel, which meant
  // a music genre's bpm and key — the half of a genre that is not words — were parsed, stored,
  // shown in the editor and then silently dropped on the way to the graph.
  const param = styleParamFor(medium)
  // Prose first here, not idiom-first: this channel is a DESCRIPTION handed to one node, and the
  // tag list is only what a style carrying nothing else has to offer.
  const words = style.positive?.trim() || (style.tags ?? []).join(', ')
  return {
    ...(style.params ?? {}),
    ...(param && words ? { [param]: words } : {}),
    // ⚠️ STILL TIED TO THE DESCRIPTION CHANNEL, on purpose. A pinned seed is what makes one voice
    // one person across every line he reads; on a medium with no such channel it would freeze the
    // composition instead, which is the opposite of what a look is for.
    ...(param && style.seed !== undefined ? { seed: style.seed } : {}),
  }
}

async function resolveStyle(
  roots: Roots, request: GenerationRequest,
): Promise<ResolvedStyle | null> {
  if (!request.style) return null
  const { styles } = await loadStyles(roots, request.medium)
  if (request.style === 'random') {
    // A reserved value, so a token never forces a decision (PLAN §7).
    return styles.length ? styles[Math.floor(Math.random() * styles.length)] ?? null : null
  }
  const found = styles.find((p) => p.slug === request.style)
  if (!found) throw new RequestError(`no style ${JSON.stringify(request.style)} in the ${request.medium} style list`)
  return found
}

/**
 * The references, RESOLVED TO PIXELS — at press time, and once for the whole run.
 *
 * ⚠️ AT PRESS TIME, like the style and the tuning. A reference that has been deleted is a mistake
 * to say out loud while the person is standing there, not a job that fails four minutes later; and
 * a run is one act, so five engines comparing themselves on one photograph must all get THAT
 * photograph, even if it is replaced while the queue drains.
 *
 * ⚠️ CHECKED AGAINST WHAT THE ENGINE SAYS IT TAKES. `caps.refs` is per-engine, so attaching a
 * style reference to a checkpoint that only accepts a subject is refused here by name — the
 * composer already filters, and this is the same rule for a request that never went near it.
 */
async function resolveRefs(
  roots: Roots, request: GenerationRequest,
): Promise<readonly ResolvedRef[]> {
  const refs = request.refs ?? []
  if (!refs.length) return []
  return Promise.all(refs.map(async (ref) => {
    try {
      return { role: ref.role, asset: ref.asset, image: await readPixels(roots.content, ref.asset) }
    } catch (err) {
      if (err instanceof PathEscapeError) throw err
      throw new RequestError(`that reference could not be read: ${ref.asset}`, 404)
    }
  }))
}

/**
 * …and the other half of the same check, against THE WORKFLOW.
 *
 * ⚠️ THE WORKFLOW OWNS THE SLOTS (src/types/workflow.ts). It used to be `caps.refs` on the
 * checkpoint, which was the wrong owner: the same SDXL file takes a style reference in one workflow
 * and none in another. A picture attached to a slot the workflow does not declare is REFUSED by
 * name — rendering without it would look exactly like a render that ignored what you attached.
 */
export function refusedRef(
  refs: readonly { readonly role: string }[], slots: readonly string[], who: string,
): string | null {
  const bad = refs.find((r) => !slots.includes(r.role))
  if (!bad) return null
  return `${who} does not take a ${bad.role} reference — it takes ${slots.join(', ') || 'none'}`
}

/** …and the mirror: a workflow whose slot nothing filled. Kontext with no picture is not a render
 *  from words, it is a render with the model's actual input missing. */
export function missingRef(
  refs: readonly { readonly role: string }[], slots: readonly string[], who: string,
): string | null {
  const empty = slots.find((slot) => !refs.some((r) => r.role === slot))
  return empty ? `${who} needs a ${empty} picture attached` : null
}

/**
 * ⚠️ TWO CHECKS USED TO LIVE HERE AND BOTH ARE GONE (2026-09-06).
 *
 * One refused an `operator`, a role nothing ever declared — the word is retired
 * (../types/inference.ts). The other refused a row whose own `medium` disagreed with the request,
 * and a service does not claim a medium any more, because one ComfyUI answers for five.
 *
 * Nothing is unguarded: the WORKFLOW's kind is checked against the request's medium a few lines
 * below, which is the same question asked of the thing that actually answers it. A `brain` cannot
 * reach here either — it is in no picker and no press names one.
 */
function rowFor(registry: LoadedRegistry, id: string): InferenceRow {
  const row = registry.rows.find((r) => r.id === id)
  if (!row) throw new RequestError(`no engine ${JSON.stringify(id)} in the registry`)
  return row
}

export interface GenerateDeps {
  readonly roots: Roots
  readonly queue: Queue
  readonly registry: LoadedRegistry
  /** The quality level for this request's medium, resolved at PRESS time — the setting in force
   *  when you pressed ▶ is the one the whole run gets, even if it changes while the queue
   *  drains. */
  readonly quality: string
}

export async function startRun(deps: GenerateDeps, request: GenerationRequest): Promise<RunStart> {
  const { roots, queue, registry, quality } = deps
  // ⚠️ THE PHASE-0 GATE IS GONE (2026-08-17). It refused every medium but image here, at the top,
  // which is a good place for a refusal and a terrible place for a capability: a medium is now
  // reachable exactly when a row declares it and an adapter can answer for it, and both of those
  // are said by the registry rather than by this line. What a medium cannot do it now says where
  // it fails — no engine for it, or no workflow on the engine you picked.
  const style = await resolveStyle(roots, request)
  // ⚠️ READ ONCE, AT PRESS TIME — the same rule as `quality`. Every job in this run uses the
  // numbers that were set when you pressed ▶, even if you retune a checkpoint while the queue
  // is still draining. A run is one act and it has one answer.
  const tuning = await readTuning(roots)
  // ⚠️ THE KIND IS WHAT SAYS WHICH MEDIUM A WORKFLOW ANSWERS FOR, and reading the list is how a
  // service that makes MORE THAN ONE stays honest (2026-08-17). `rowFor` checks the row's own
  // `medium`, which is the right check for Draw Things and no check at all for ComfyUI: one
  // endpoint there makes pictures, songs, voices and meshes, so its row declares no medium and
  // every workflow on it would otherwise answer any press.
  const { kinds } = await loadKinds(roots)
  const mediumOf = new Map(kinds.map((k) => [k.slug, k.medium]))

  // ⚠️ THE WORKFLOW IS RESOLVED BEFORE THE JOB IS BUILT, because everything downstream is named
  // after it: the checkpoint it runs on, the file that gets written, the label in the queue. A
  // request that named none gets the service's default, which is always one that needs nothing
  // attached. The catalog is the CACHED one, so a press never waits on a cold model scan.
  const rows = request.inference.map((choice) => {
    const row = rowFor(registry, choice.id)
    const workflow = workflowFor(
      row, cachedCatalog(row.id).engines, choice.workflow ?? null,
      tunedByFile(tuning, row.id), serviceFiles(row.id))
    if (!workflow) {
      throw new RequestError(choice.workflow
        ? `${row.id} has no workflow ${JSON.stringify(choice.workflow)}`
        : `${row.id} has nothing that can be asked for ${request.medium}`)
    }
    // What the workflow's VERB makes, against what was asked for. An undescribed kind claims
    // nothing and is allowed through — kinds are open (src/inference/kinds.ts), and refusing one
    // here would put the shipped list between a user and a service that can genuinely do something
    // this build has never heard of.
    const makes = mediumOf.get(workflow.kind)
    if (makes && makes !== request.medium) {
      throw new RequestError(`${workflow.label} makes ${makes}, not ${request.medium}`)
    }
    // ⚠️ WHETHER WORDS ARE REQUIRED IS THE WORKFLOW'S BUSINESS (2026-08-12). The parser used to
    // refuse an empty sentence outright, which is right for everything that takes a `prompt` and
    // wrong for the workflows that do not: a cutout is a picture and no words. Refused BY NAME here,
    // where the workflow is resolved and the message can say which workflow wanted them.
    if (workflow.inputs.includes('prompt') && !request.text.trim()) {
      throw new RequestError(`${workflow.label} needs a sentence — say what you want`)
    }
    // ⚠️ A HAND-WRITTEN REGISTRY IS THE ONLY WAY PAST `reservedHole` AT PARSE TIME, and it is worth
    // one line here because the failure it prevents is invisible: the control sets `model`, the app
    // overwrites it with the checkpoint, and the render either fails inside the service or quietly
    // runs at the published value (src/types/workflow.ts).
    const clash = reservedHole(workflow.graph?.holes)
    if (clash) throw new RequestError(`${workflow.label}: ${clash} — re-take it from 📚`)
    return { choice, row, workflow, model: workflow.model }
  })
  const refs = await resolveRefs(roots, request)

  // 🧩 WHERE THIS RUN LANDS. A press somebody typed goes under its medium; a press a CHAIN made
  // goes under the chain's own run, in a folder named after the step (src/content/run.ts).
  const chain = request.composition
    ? { slug: request.composition.slug, run: request.composition.run }
    : undefined
  // ⚠️ INSIDE A CHAIN THE STEP IS THE NAME, and there is no timestamp on it: the chain run folder
  // above it already carries the sentence and the clock, and `founder` beside `mascot` is the whole
  // of what tells two folders in one run apart. Everywhere else it is the ask, stamped, as always.
  // A wordless press still has to name its run, and the workflow is the only word there is.
  const runId = await freeRunId(
    roots, request.medium,
    chain ? request.composition!.step : mintRunId(request.text.trim() || rows[0]?.workflow.slug || ''),
    chain)
  const record = await writeRunRecord(roots, request, runId)
  // ⚠️ THE QUEUE ROW READS THE NAME, NOT THE PATH. `<service> · <workflow> · <runId>` put a
  // 48-character slug with a timestamp welded to it in the one line you read while waiting — and
  // in every error message, which is where it was finally noticed.
  const named = record.title || runId
  const tags = tagsFromText(request.text, style)

  const jobs = rows.map(({ row, choice, workflow, model }) => {
    const caps = workflow.caps
    // ⚠️ The idiom is a MODEL fact: SDXL wants comma-separated tags, FLUX wants a sentence. The
    // style is rendered in whichever the resolved model asked for.
    // ⚠️ NO PROMPT MEANS NO PROMPT, style words and all. Composing one for a workflow that declares
    // no `prompt` input would hand a cutout daemon a sentence about flat vector art.
    // ⚠️ AND THE STYLE IS COMPOSED IN ONLY WHERE THE PROMPT IS A DESCRIPTION. In 🗣 voices the
    // sentence is the SCRIPT, so the style goes to a param instead and the words stay untouched —
    // see `styleParams` and src/styles/param.ts.
    const prompt = workflow.inputs.includes('prompt')
      ? (styleParamFor(request.medium) ? request.text.trim() : composePrompt(request.text, style, caps))
      : ''
    // ⚠️ THE KNOBS THE COMPOSER DID NOT SEND ARE THE MODEL'S OWN. `mergeParams` layers
    // row defaults → the model's declared params → the request → this selection, and the browser
    // deliberately omits `steps` and `cfg` (web/lib/pipelines/images.js) so that picking SDXL
    // means 16 steps and picking klein means 4 without either number being typed. It sent both,
    // drawn from whichever engine happened to be first, and SDXL rendered at klein's 4.
    // ⚠️ THE WORKFLOW'S KNOBS SIT ON TOP OF THE CHECKPOINT'S. `workflow.params` already carries
    // both, merged in that order, so a Kontext press gets 28 steps from the file and strength 1
    // from the workflow without either being typed.
    const params = {
      ...styleNegative(style, caps),
      // ⚠️ THE STYLE GOES THROUGH THE MERGE NOW, NOT AROUND IT (2026-08-23). Spread here it sat
      // UNDER the whole of `mergeParams`, so the engine row's generic defaults beat the genre the
      // person had chosen — a control that looks like it works and does not.
      ...mergeParams(row, request, choice, model, workflow.params, styleParams(request.medium, style)),
    }
    // ⚠️ CHECKED HERE, WHERE THE WORKFLOW AND THE MERGED BAG ARE BOTH IN HAND, and before a job
    // exists. Every layer that can put a value in this bag — the engine row, the checkpoint, your
    // tuning, the style, the request, the section's controls — is already merged, so this is the
    // only place that sees what will actually be sent (src/inference/knobs.ts `knobsProblem`).
    const wrong = knobsProblem(request.medium, workflow.graph ?? null, params)
    if (wrong) throw new RequestError(`${workflow.label}: ${wrong}`)
    const rel = masterRel(request.medium, runId, row.id, model, chain)
    const adapter = adapterFor(row)
    const who = workflow.label
    const refused = refusedRef(refs, workflow.slots, who) ?? missingRef(refs, workflow.slots, who)
    if (refused) throw new RequestError(refused)

    // ⚠️ THE LABEL NAMES WHAT WAS ASKED FOR, always. Two queued jobs reading "Draw Things ·
    // coffee-…" are two rows you cannot tell apart, which is the one thing a queue must never be
    // during the comparison it is running.
    return queue.add({
      label: `${row.label ?? row.id} · ${who} · ${named}`,
      lane: 'serial',
      runId,
      engine: row.id,
      // ⚠️ ONE PRESS, ONE PICTURE PER ENGINE. This looped `1..count` until 2026-08-07 — "how many"
      // was a knob nobody wanted, and pressing ▶ again is the variation button, since the seed is
      // drawn fresh each time. What went with it: the N-seed loop, the pin-the-seed-to-the-first
      // special case, the fractional progress, and the numbered filenames.
      run: async ({ signal, log, progress }) => {
        if (signal.aborted) throw new Error('cancelled')
        // Wall clock around the render alone — not around the write, which is milliseconds and
        // not the thing anyone is asking about.
        const started = Date.now()
        const out = await adapter.render({ row, workflow, prompt, params, refs, signal, log, progress })
        const durationMs = Date.now() - started

        const provenance: Provenance = {
          modality: request.medium,
          provider: row.id,
          model: out.model,
          // ⚠️ THE WORKFLOW, not the model family. This field has always meant "the named path
          // through the provider"; now there is one to name.
          workflow: workflow.slug,
          // ⚠️ THE ONE IT RESOLVED TO. `request.style` may be `random`, and the run record keeps
          // that because it is the decision you made; this is the answer, which is the half you
          // cannot reconstruct from anything else in the file.
          style: style?.slug ?? null,
          prompt,
          seed: out.seed,
          params: out.params,
          tags,
          // ⚠️ WHAT IT STARTED FROM. Half the input of an i2i render is the picture, and a record
          // that names only the words describes a thing nobody can make again.
          refs: refs.map((r) => ({ asset: r.asset, role: r.role })),
          runId,
          createdAt: new Date().toISOString(),
          durationMs,
          quality,
        }
        const { bytes } = await writeMaster(roots.content, rel, out.asset, provenance)
        log(`wrote ${rel} (${Math.round(bytes / 1024)} kB, ${(durationMs / 1000).toFixed(1)}s)`)
        progress(1)
      },
    }).id
  })

  // A one-engine press and a five-engine press differ only in how many masters land in the run.
  // ⚠️ THE PATH IS CONTENT-RELATIVE AND WHOLE. It was `<medium>/<runId>` — a fragment nothing could
  // open — and a chain press does not live under a medium at all any more.
  return { runId, jobs, path: runRel(record.medium, runId, chain) }
}
