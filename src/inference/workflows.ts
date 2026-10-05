// WORKFLOWS — everything a service can be asked for, resolved against what it actually has.
//
// This is the layer the picker is built from, and it sits ON TOP of the checkpoint layer rather
// than replacing it: `src/inference/engines.ts` still answers "what does this file want and is it
// on the machine", and a workflow NAMES one of those files and says what it adds on top.
//
//   engine   flux_1_kontext_dev_q8p.ckpt   28 steps, cfg 1, prose, no negative branch
//   workflow   kontext                      →  that file, kind `edit`, inputs [prompt, ref], strength 1
//
// ⚠️ NOTHING IS SYNTHESISED, AND THAT IS THE POINT (2026-08-20). A checkpoint no workflow names gets
// NO workflow. It is listed on 🔌 as something this machine has, and it arms nothing.
//
// Until today a file nobody had written a workflow for got a `t2i` one invented for it, and the
// symptom was an app that CONFIGURED ITSELF the moment a port answered: start Draw Things and a
// freshly cleared install offered nine ways to make a picture that nobody had chosen. A directory
// listing is not a palette, and reading one as a palette is the same failure as shipping content —
// only sourced from the user's own disk instead of from us.
//
// THE TWO QUESTIONS ARE SEPARATE, and only the first one is a fact:
//
//   catalog   what does this machine HAVE    discovered from the service   the machine decides
//   workflow    what can I ASK FOR             ⤓ from 📚, or ＋ by hand       you decide
//
// Discovery keeps its real job — telling the library what will run here, so a row says
// `sdxl-ref needs ip_adapter_plus_xl_base_open_clip_h14_f16.ckpt` rather than failing at render
// time. It simply has no authority to arm the ask bar. "I downloaded a checkpoint and it appeared"
// still holds: it appears as INVENTORY, and a published workflow naming it turns takeable.
//
// ⚠️ AND THERE IS NO EXCEPTION ANY MORE (2026-08-30). There was one, for a narrow and real reason:
// a command-line brain's models are declared in this build's own source, so a `chat` workflow on one
// was `{ kind: chat, model: <that engine> }` — a restatement of the engine with not one fact added,
// and making somebody TAKE a file that said exactly that was ceremony. The synthesis was correct
// and the thing it synthesised was the mistake. Text is not a capability this layer serves: an LLM
// connects to xoko, and everything that needs words — a chain's `text` step, a prompt rewritten
// into what an image model reads, a look put into words — is xoko doing it with whatever it is
// connected to. So there is no `chat` kind, no text workflow, and nothing here to imply.
//
// What remains is one rule with no clauses: **a workflow is written by somebody, or it does not
// exist.**

import type { Caps } from '../types/caps.ts'
import type { InferenceRow } from '../types/inference.ts'
import type { Params } from '../types/request.ts'
import type {
  Control, Graph, Lora, RefSlot, Workflow, WorkflowInput, WorkflowKind,
} from '../types/workflow.ts'
import { MINIMAL_CAPS } from './caps.ts'
import { engineLabel, resolveEngines } from './engines.ts'
import type { CatalogEngine, EngineState, ResolvedEngine } from './engines.ts'

/**
 * ONE THING A WORKFLOW NEEDS AND HAS NOT GOT.
 *
 * ⚠️ THE POINT IS THAT IT IS A LIST, NOT A BOOLEAN. "sdxl-ref cannot run" is useless; "sdxl-ref
 * needs ip_adapter_plus_xl_base_open_clip_h14_f16.ckpt" is a sentence you can act on, and it is the
 * same sentence a downloaded workflow will need to say one day about a machine that has never had it.
 */
export interface Missing {
  readonly what: 'model' | 'control' | 'lora'
  readonly file: string
}

/**
 * WHAT ELSE THE SERVICE REPORTS — its control and LoRA catalogs, as plain file lists.
 *
 * ⚠️ NULL IS NOT EMPTY. A service that has never been asked (or could not be) knows nothing about
 * what is missing, and the requirements check must then claim nothing: a workflow is never marked
 * incomplete on the strength of a probe that did not happen.
 */
export interface ServiceFiles {
  readonly controlNets: readonly string[] | null
  readonly loras: readonly string[] | null
}

const NOTHING_ASKED: ServiceFiles = { controlNets: null, loras: null }

/** One askable thing: a workflow, bound to a checkpoint that may or may not be on the machine. */
export interface ResolvedWorkflow {
  readonly slug: string
  readonly label: string
  readonly kind: WorkflowKind
  readonly model: string
  readonly inputs: readonly WorkflowInput[]
  /** ⚠️ WHOSE FAMILY THE CHECKPOINT IS FROM (src/types/workflow.ts) — what says whether two steps of
   *  one chain can hand a picture to each other. Null when the library did not declare it, which
   *  sorts with the strangers rather than with anything. */
  readonly lineage: string | null
  /** The pictures it takes — `inputs` without the sentence. What the tray draws a slot for. */
  readonly slots: readonly RefSlot[]
  /** The checkpoint's state, because that is what decides whether this can run at all. */
  readonly state: EngineState
  /** True when a press with nothing chosen would use this one. */
  readonly isDefault: boolean
  /** ⚠️ EFFECTIVE caps: service ← checkpoint. How the prompt must be written and what numbers
   *  are legal — still the checkpoint's business, not the workflow's. */
  readonly caps: Caps
  /** ⚠️ EFFECTIVE knobs: checkpoint (shipped ← yours) ← workflow. What picking this brings. */
  readonly params: Params
  /**
   * The workflow's own named knob sets — combinations that only mean anything together
   * (`Workflow.presets`). Carried through untouched: a preset names this workflow's holes, and there is
   * nothing on the checkpoint to merge it with.
   *
   * ⚠️ NOT FOLDED INTO `params`. `params` is what a press runs at with nobody choosing; a preset is
   * a choice somebody makes, and folding one in would make it the default it deliberately is not.
   */
  readonly presets: Readonly<Record<string, Params>> | null
  /** Which of the medium's knobs this workflow reads, for one with no graph to declare its own
   *  (`Workflow.knobs`). Null = the whole table, which is right on a service the table was written
   *  for and wrong on one it was not. */
  readonly knobs: readonly string[] | null
  /** The adapters this workflow stacks on its checkpoint, and the LoRAs. Carried through resolution
   *  untouched — unlike params, there is nothing on the checkpoint to merge them with: a control is
   *  a fact about the workflow and about nothing else. */
  readonly controls: readonly Control[]
  readonly loras: readonly Lora[]
  /** The node graph, for a service that takes one instead of a set of fields. Carried through
   *  untouched for the same reason as the controls: there is nothing on the checkpoint to merge it
   *  with. Null for every workflow whose service builds its own ask (src/types/workflow.ts). */
  readonly graph: Graph | null
  /** What this workflow needs on the machine and has not got — the checkpoint, then its control and
   *  LoRA files. Empty when everything is there, and empty when the service could not be asked at
   *  all (absent evidence is not evidence of absence). */
  readonly missing: readonly Missing[]
  readonly notes: string | null
  /** ⚠️ THE RAW REGISTRY ROW, and never null — every workflow in this list was written by somebody.
   *  The editor sends these back, with its edit applied, rather than the resolved values above,
   *  which have the checkpoint's params already folded in. Posting those would freeze today's
   *  numbers onto every workflow you happened to save next to. */
  readonly declaration: Workflow
  /** True when the declaration is in YOUR layer: 🗑 forget it, rather than ↺ back to the shipped
   *  workflow. */
  readonly mine: boolean
}

/** The pictures this workflow asks for — everything but the sentence. What the refuse/require checks
 *  read is `inputs`; this is what the TRAY draws a square for. */
const slotsOf = (inputs: readonly WorkflowInput[]): RefSlot[] =>
  inputs.filter((i): i is RefSlot => i !== 'prompt')

/**
 * Every workflow this service can be asked for right now.
 *
 * Registry order, and nothing else in the list: every row was written by this app, by the library
 * or by you. A service with a full catalog and no workflows resolves to none — which is exactly what
 * a fresh install is, however many checkpoints are sitting on the disk.
 */
export function resolveWorkflows(
  row: InferenceRow,
  catalog: readonly CatalogEngine[] | null,
  tuned: ReadonlyMap<string, Params> = new Map(),
  /** Which workflow slugs YOUR registry layer declares (LoadedRegistry.patchedWorkflows). */
  yours: ReadonlySet<string> = new Set(),
  /** The service's other catalogs, for the requirements check. */
  files: ServiceFiles = NOTHING_ASKED,
): ResolvedWorkflow[] {
  const engines = resolveEngines(row, catalog, tuned)
  const byFile = new Map(engines.map((e) => [e.file, e]))
  const out: ResolvedWorkflow[] = []

  for (const rec of row.workflows ?? []) {
    out.push(bind(rec, rec.model, byFile.get(rec.model), files, yours.has(rec.slug)))
  }

  const chosen = pickDefaults(out, engines.find((e) => e.isDefault)?.file ?? null)
  return out.map((w) => (chosen.has(w.slug) ? { ...w, isDefault: true } : w))
}

/**
 * WHAT THIS WORKFLOW IS MISSING. The checkpoint first, because without it nothing else matters.
 *
 * ⚠️ ONLY WHAT WAS ACTUALLY LOOKED FOR. A null catalog contributes nothing: `state: 'declared'`
 * already means "described and not here", and it is only ever set when a catalog was read.
 */
function missingFor(
  rec: Workflow, state: EngineState, files: ServiceFiles,
): Missing[] {
  const out: Missing[] = []
  if (state === 'declared') out.push({ what: 'model', file: rec.model })
  for (const control of rec.controls ?? []) {
    // ⚠️ A CONTROL WITH NO FILE CAN NEVER BE MISSING. klein's moodboard is the checkpoint's own
    // reference channel; there is no adapter to download, so a workflow using it is ready the moment
    // the checkpoint is — reporting a missing "" here would hold it at not-ready forever.
    if (control.file === undefined) continue
    if (files.controlNets && !files.controlNets.includes(control.file)) {
      out.push({ what: 'control', file: control.file })
    }
  }
  for (const lora of rec.loras ?? []) {
    if (files.loras && !files.loras.includes(lora.file)) out.push({ what: 'lora', file: lora.file })
  }
  return out
}

function bind(
  rec: Workflow, model: string, engine: ResolvedEngine | undefined, files: ServiceFiles,
  mine = false,
): ResolvedWorkflow {
  const state = engine?.state ?? 'declared'
  return {
    slug: rec.slug,
    label: rec.label ?? engine?.label ?? engineLabel({ file: model }),
    kind: rec.kind,
    model,
    inputs: rec.inputs,
    lineage: rec.lineage ?? null,
    slots: slotsOf(rec.inputs),
    // A workflow naming a checkpoint the service does not have is `declared`, exactly like the
    // checkpoint would be: listed, never picked. Nothing is dropped for being absent.
    state,
    isDefault: false,
    caps: engine?.caps ?? MINIMAL_CAPS,
    controls: rec.controls ?? [],
    loras: rec.loras ?? [],
    graph: rec.graph ?? null,
    missing: missingFor(rec, state, files),
    // ⚠️ THE WORKFLOW WINS OVER THE CHECKPOINT, and both lose to the request. Kontext's file says 28
    // steps; the workflow says strength 1; the person at the keyboard says the seed.
    params: { ...engine?.params, ...rec.params },
    presets: rec.presets ?? null,
    knobs: rec.knobs ?? null,
    notes: rec.notes ?? engine?.notes ?? null,
    declaration: rec,
    mine,
  }
}

/**
 * What a press uses when nobody chose — ONE PER KIND, which is the drawer a medium's picker opens.
 *
 * ⚠️ IT WAS ONE PER SERVICE AND THAT STOPPED BEING TRUE (2026-08-24). The old rule picked a single
 * workflow for a whole row, filtered to the row's "plain kind" (`t2i`, or `chat` for a brain) — right
 * while a service meant a medium, and wrong the moment one row served several. ComfyUI is ONE row
 * answering seven media, so exactly one of them got a considered default and the other six fell
 * through to `usable[0]` in the browser: *install order*. 🔊 armed the ACE-Step music graph over
 * the model built for sound, and ✒ armed the workflow whose only input is a picture, so asking for a
 * cat in words came back "attach a picture first". Neither was a decision anybody made.
 *
 * ⚠️ AND THE ORDER OF PREFERENCE IS THE POINT, not the grouping. A default is what happens to
 * somebody who has not chosen yet, so it has to be a workflow that RUNS: nothing missing, nothing to
 * attach, and words are enough. `default: true` in the catalog beats all of it — that is the
 * library saying which of two runnable workflows it means, which is the one thing this cannot work
 * out for itself (stable-audio over ambience: both take words, and only one is built for sound).
 */
function pickDefaults(
  all: readonly ResolvedWorkflow[], preferred: string | null,
): ReadonlySet<string> {
  const runnable = all.filter((w) => w.state !== 'declared' && !w.missing.length && !w.slots.length)
  const chosen = new Set<string>()
  for (const kind of new Set(all.map((w) => w.kind))) {
    // ⚠️ A DECLARED DEFAULT WINS EVEN IF IT NEEDS AN ATTACHMENT, and it is the only thing that
    // does. The runnable rule below exists so nobody's first press is an error — but a kind where
    // EVERY workflow takes a picture (i23d) has no error-free option to fall back to, and silently
    // ignoring what the catalog said would leave the field looking honoured when it was not.
    const said = all.find((w) => w.kind === kind && w.declaration.default && w.state !== 'declared'
      && !w.missing.length)
    if (said) { chosen.add(said.slug); continue }
    const able = runnable.filter((w) => w.kind === kind)
    // ⚠️ WORDS ARE THE TEST, NOT THE ABSENCE OF SLOTS. An image-to-3D workflow declares no `prompt`
    // and is pressed with an empty line on purpose; a workflow that takes neither words nor an
    // attachment is not a thing. But where a kind offers both, the one you can press by typing is
    // the one a person who has chosen nothing can use.
    const wordy = able.filter((w) => w.inputs.includes('prompt'))
    const pool = wordy.length ? wordy : able
    const pick = pool.find((w) => w.model === preferred)
      ?? pool[0]
    if (pick) chosen.add(pick.slug)
  }
  // ⚠️ A KIND WITH NOTHING RUNNABLE GETS NO DEFAULT AT ALL, and that guarantee predates this
  // rewrite: with only an editor installed there is nothing safe to reach for, and saying so beats
  // arming a workflow whose first press is an error.
  return chosen
}

/** One workflow by slug, for the render path. Null when the request named one nothing serves. */
export function workflowFor(
  row: InferenceRow, catalog: readonly CatalogEngine[] | null, slug: string | null,
  tuned: ReadonlyMap<string, Params> = new Map(),
  files: ServiceFiles = NOTHING_ASKED,
): ResolvedWorkflow | null {
  const all = resolveWorkflows(row, catalog, tuned, new Set(), files)
  if (!slug) return all.find((w) => w.isDefault) ?? null
  return all.find((w) => w.slug === slug) ?? null
}
