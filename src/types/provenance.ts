// PROVENANCE — one shape for every medium, written INTO the file where the format allows it
// (PLAN §4). The provenance chip, the index and a re-run all read it without knowing which
// engine made it.
//
// The field list below is the canonical one and this is its home in the codebase. Carrier is
// XMP (src/provenance/xmp.ts): `sharp` has no API for PNG text chunks and our masters are
// `.webp` anyway, so A1111 interop was never available. The honest goal is SELF-DESCRIBING TO
// US, BEST-EFFORT TO OTHERS.
//
// ⚠️ EXPORTS STRIP IT. A LINE pack is a file the user sells; embedding their prompt in it
// publishes their method. Provenance is for the library, not the deliverable — that is a gate,
// not an option.

import type { RefSlot } from './workflow.ts'
import type { Medium } from './medium.ts'
import type { Params } from './request.ts'

/** One attached reference, as the record remembers it. The same pair the request carried
 *  (`src/types/request.ts` → `Reference`), kept whole: the role is what the pixels MEANT. */
export interface ProvenanceRef {
  readonly asset: string
  readonly role: RefSlot
}

export interface Provenance {
  /** Which medium this asset is. Same vocabulary as the request's `medium` — the plan calls
   *  it `modality` here and `medium` there, and one type keeps them from drifting. */
  readonly modality: Medium
  /** The engine ROW ID that produced it (`draw-things-grpc`), not a vendor name. */
  readonly provider: string
  /** The checkpoint / model identifier the provider used, when it names one. */
  readonly model: string | null
  /** The named path through the provider — a Draw Things sampler workflow, or what a ComfyUI
   *  workflow (a graph — see src/types/workflow.ts) resolved to. */
  readonly workflow: string | null
  /**
   * THE STYLE IT WAS MADE IN — the RESOLVED slug, never what was asked for.
   *
   * ⚠️ THE WORDS WERE ALWAYS IN THE FILE AND THE NAME WAS NOT. `prompt` below is composed, so a
   * style's words are embedded in every master it ever shaped — but nothing said WHICH style, and
   * "what look is this?" is the question somebody asks of a picture months later. A record that
   * cannot answer it is not self-describing, which is what this type is for.
   *
   * ⚠️ RESOLVED, so `random` is never stored: `resolveStyle` picks once per press
   * (src/jobs/generate.ts), which is exactly what surprise-me makes you want to know afterwards.
   *
   * ⚠️ AND PER ASSET, NOT PER RUN, although a press has one style. A chain's steps each name
   * their own (`uses`), so one composition run holds several and a run-level field would be right
   * for one cell and wrong for the rest.
   *
   * Null is ordinary: a press with no style is always valid (§4c).
   */
  readonly style: string | null
  /** What was actually sent, after the builder composed it. Not what the user typed. */
  readonly prompt: string | null
  readonly seed: number | null
  /** The knobs this render actually ran with — resolved, not the requested bag. */
  readonly params: Params
  /** Descriptive OUTPUT, never generation input (PLAN §6). Known before the master is written,
   *  because `sharp` cannot write metadata in place and a second pass re-encodes the pixels. */
  readonly tags: readonly string[]
  /**
   * What was ATTACHED to the sentence — the library assets this render started from.
   *
   * ⚠️ WITHOUT THIS AN i2i ASSET IS UNREPRODUCIBLE. The prompt, seed and model are only half the
   * inputs once something is attached; a picture whose other half is unrecorded cannot be made
   * again, and "which photo was this?" is asked months later. Content-root-relative paths, so the
   * answer is a file you can open.
   *
   * Empty for a render from words alone, which is most of them.
   */
  readonly refs: readonly ProvenanceRef[]
  /** The run this asset belongs to — server-minted `<slug>-<ts>`. */
  readonly runId: string
  /** ISO 8601. */
  readonly createdAt: string
  /**
   * How long THIS asset took, wall clock, measured around the render call.
   *
   * Per-asset and not per-job: a job with `count: 4` is four renders, and a 4-step engine
   * against a 28-step one is the difference the number exists to show. Null for a master
   * written before this field existed — an absent value is never drawn as zero.
   */
  readonly durationMs: number | null
  /**
   * The quality LEVEL this master was written at — `balanced`, `exact` (src/types/quality.ts).
   *
   * A name and not a number, so it survives a medium changing its encoder. Recorded because a
   * library holds both kinds and "can I trust this one for a print export?" gets asked months
   * after the render. This IS the encoder setting: `writeMaster` reads it rather than taking a
   * second argument, so the record cannot disagree with the file.
   */
  readonly quality: string
}

/**
 * The subset the browser is given per cell, so a provenance chip can be drawn from the index
 * without opening the master. Projected by the indexer.
 *
 * ⚠️ `params` IS IN AND `prompt` IS OUT, and the line between them is not squeamishness (2026-08-23).
 * What made a song is not its provider and seed: it is 94 seconds, 72 bpm, D minor, and four
 * stanzas of lyrics — every one of them a value the person SET, and none of them visible anywhere
 * after the render. `prompt` stays out because the run's own `ask` is already in the manifest and
 * a second, style-composed copy per cell would be the same sentence twice.
 *
 * ⚠️ EXCEPT WHERE THE SENTENCE IS NOT A DESCRIPTION (2026-08-31), and there `prompt` is the one
 * thing the asset could not otherwise say. A voice take has TWO texts — the SCRIPT and the
 * description of who reads it — and it carried neither: the script was borrowed from the run's
 * `ask`, and the description only existed on the cell if somebody had explicitly typed it. So the
 * projection carries the prompt for a medium with a shaping channel (`styleParamFor`), where it is
 * the words that were spoken rather than a second copy of the ask.
 */
export type ProvenanceIdentity = Pick<
  Provenance,
  'provider' | 'model' | 'workflow' | 'style' | 'seed' | 'createdAt' | 'durationMs' | 'quality' | 'params'
> & {
  /** The words THIS asset was made from, when they are not a description of it — a script.
   *  Null everywhere else: the run's `ask` already says it, and twice is worse than once. */
  readonly prompt?: string | null
}
