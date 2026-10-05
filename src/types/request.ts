// THE REQUEST — every generation in the app is this one shape (PLAN §4).
//
// What a payload builder in web/ produces is always this. There is NO path in a request: one
// press is one RUN and the SERVER mints its id, which is how N services land in one folder
// without the browser ever naming a path (PLAN §4, §15 rule 2).
//
// ⚠️ VOCABULARY (DECISIONS.md, 2026-08-03): **inference** is the service that runs — Draw Things,
// ComfyUI, Ollama, a cutout daemon. An **engine** is what that service can be asked for — a
// checkpoint, or a capability that is not a checkpoint at all. This file names the first;
// `params.model` names the second, and keeps the word `model` on purpose: it is what goes on the
// wire and what the provenance record calls it, and those speak the common vocabulary, not ours.

import type { RefSlot } from './workflow.ts'
import type { Medium } from './medium.ts'

/** A knob value. Scalars only — a knob that needs an object is a capability in disguise. */
export type ParamValue = string | number | boolean

/** The knob bag: seed, steps, resolution… Validated against the resolved `caps`, and a violation
 *  is REJECTED with a named error, never silently clamped (PLAN §4). */
export type Params = Readonly<Record<string, ParamValue>>

/** One selected INFERENCE SERVICE, with its own knobs. Per-service because `caps` differ: a
 *  single shared bag "validated against the caps" is a lie the moment two are picked. One
 *  service — the common case — writes nothing extra. */
export interface InferenceSelection {
  readonly id: string
  /**
   * WHICH WORKFLOW — a workflow slug on that service (src/types/workflow.ts). Absent = the service's
   * default, which is always a `t2i` one, because a default that needs something attached would
   * make a fresh install's first press an error message.
   *
   * ⚠️ THE MODEL IS NOT NAMED HERE. The workflow names its checkpoint, so sending both would be
   * two answers to one question and the merge order would pick the winner.
   */
  readonly workflow?: string
  readonly params?: Params
}

/**
 * A reference points at an ASSET, not an upload — "3D this character" is picking the character;
 * an upload is just an imported asset. `asset` is content-root-relative and is resolved against
 * the root before anything reads it.
 *
 * ⚠️ `role` IS A WORKFLOW SLOT (`ref` · `style` · `mask`), and the workflow in the same selection
 * declares which of them it takes. One word per slot, from the tray through the wire to the
 * adapter — a second vocabulary in the middle is how a picture ends up on the wrong channel.
 */
export interface Reference {
  readonly asset: string
  readonly role: RefSlot
}

export interface GenerationRequest {
  readonly medium: Medium
  /** The spine: one free-text sentence. The ONE required input (PLAN §6). */
  readonly text: string
  /**
   * WHAT TO CALL THE THING THIS MAKES. Absent = the server names it from `text`.
   *
   * ⚠️ IT IS NOT THE RUN ID AND MUST NEVER BECOME ONE (§15 rule 2). The run FOLDER is minted
   * server-side from slugified ASCII precisely because a path an LLM can name is a path an LLM can
   * name `../`; this is a field in `run.json`, read by the index and shown in the list, and the
   * worst a bad one can do is read badly. Which is what makes it safe for xoko to write.
   *
   * ⚠️ AND IT EXISTS BECAUSE A SONG HAS NO PICTURE (2026-08-23). 🖼 identifies a run by its
   * thumbnail and the slug is a filename nobody reads; 🎼 and 🗣 open as a LIST, where the first
   * column is the whole of what tells two rows apart — and it was the generation prompt, entire.
   * A tag-soup sentence about instruments and mood is what you tell the model, not what you call
   * the track.
   */
  readonly title?: string
  /**
   * A namespaced slug from the medium's style list — `xk:flat-vector`, `user:my-look`.
   *
   * ⚠️ Named `style` since 2026-08-04, when **Style** became layer 3 of the classification
   * (PLAN §4a). It was `preset` while that layer was called Palette, on the reasoning that the
   * CONTROL is labelled per medium — style for image, genre for music, dna for a mascot — though
   * the field is one. That is still true, and is not a reason for the field to disagree with the
   * layer it names.
   *
   * Null / absent = no style, which is always valid (§4c). `"random"` = pick a curated one.
   */
  readonly style?: string | null
  /** One press, N services → N serial jobs sharing one run folder, one master each. A comparison
   *  needs no separate mode: grouping is the general case and A/B is a group with N > 1. */
  readonly inference: readonly InferenceSelection[]
  readonly refs?: readonly Reference[]
  /**
   * 🧩 WHICH CHAIN PRESSED THIS, AND WHICH RUN OF IT — when a chain did.
   *
   * ⚠️ IT IS ROUTING, NOT A BYLINE (2026-08-24). It was provenance for one day: the press was
   * ordinary, the picture landed on the medium's shelf, and this said which chain had drawn it. But
   * a section keeps what it makes — you go to 🧸 to look at your mascots, not to 🖼 — so these three
   * words are what send the run to `compositions/<slug>/<run>/<step>/` instead
   * (src/content/run.ts `runRel`).
   *
   * ⚠️ AND `run` IS THE ONE PATH-SHAPED THING THE BROWSER EVER SENDS (§15 rule 2). It does not
   * name it: the server minted it when ▶ was pressed (src/compositions/chain.ts) and the browser
   * quotes it back, whereupon it is checked against the slug pattern and resolved against the
   * content root like everything else.
   *
   * Absent for every press somebody made by typing a sentence, which is most of them.
   */
  readonly composition?: {
    readonly slug: string
    /** The chain RUN — one press of ▶, and the folder every step of it writes into. */
    readonly run: string
    /** Which step of it — a chain makes several kinds of picture and they are not interchangeable. */
    readonly step: string
  }
  /**
   * Shared defaults for every selected service; a service's own `params` win.
   *
   * ⚠️ WHAT IS ABSENT IS THE MODEL'S OWN (2026-08-07). The layers are `row.defaults → the model's
   * declared params → this → the selection's own`, so a request that omits `steps` gets 4 on
   * klein and 16 on SDXL without either number being typed. The composer sends only ASK-SHAPED
   * knobs — size, seed, negative — because everything else belongs to the checkpoint rather than
   * to the sentence, and is edited once in 🔌 instead of every press. Sending an untouched
   * field's DISPLAYED value is exactly how one engine's numbers reached another engine's render.
   *
   * ⚠️ NO `count` (2026-08-07). One press is one asset per engine; pressing ▶ again is the
   * variation button, since the seed is drawn fresh each time. What went with it: the N-seed
   * loop, the pinned-seed special case, and the numbered filenames a cell folder existed to hold.
   */
  readonly params?: Params
}
