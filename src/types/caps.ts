// `caps` — HOW A CHECKPOINT WANTS TO BE ADDRESSED. Composition branches on it, `params` is
// validated against it, and the 🔌 shelf prints it.
//
// ⚠️ NOT "what it can do" any more (2026-08-08). What can be ASKED FOR is a workflow
// (src/types/workflow.ts); what is left here is the narrower and more durable question of how this
// particular file reads a prompt and what it will accept as numbers.
//
// Two rules the type cannot state and code must keep:
//   - NEVER infer a capability from a model's name. The two Draw Things engines are the
//     standing example: same vendor, and only `caps` says which one has ControlNet.
//   - A row with no `caps` is MINIMAL, not permissive. See `MINIMAL_CAPS` in
//     src/inference/caps.ts — the default lives with the behaviour, not with the shape.

// ⚠️ WHAT A REFERENCE IS FOR IS NOT HERE ANY MORE (2026-08-08). It was `REF_ROLES` on this shape,
// and it was on the wrong shape: whether a picture can be attached is a fact about the WORKFLOW, not
// about the checkpoint. Plain SDXL takes no style reference; SDXL plus an IP-Adapter does, and both
// are the same file. The slots live on the workflow now — src/types/workflow.ts.

/** How a model wants to be addressed. A prose model given tag soup renders tag soup. */
export const IDIOMS = ['prose', 'tags'] as const

export type Idiom = (typeof IDIOMS)[number]

/** How, if at all, an endpoint can be made to return schema-shaped JSON (PLAN §4). One
 *  transport is not one structured-output mechanism, so it is declared like every other
 *  capability — and the adapter validates the response anyway, whatever this says. */
export const STRUCTURED_MODES = [
  'json_schema', // OpenAI, LM Studio — `response_format: { type: "json_schema", strict: true }`
  'json',        // Ollama `format: json` — shape is not enforced, only JSON-ness
  'none',        // prose that *looks* like JSON. Survivable because we validate + retry.
] as const

export type StructuredMode = (typeof STRUCTURED_MODES)[number]

/** An inclusive `[min, max]` band. */
export type Band = readonly [min: number, max: number]

export interface Caps {
  /** Does a negative prompt reach anything at all. FLUX: false — a constraint has to be
   *  phrased as something PRESENT instead. */
  readonly negatives: boolean
  readonly idiom: Idiom
  /** Useful prompt-length band, in words. Not a hard limit — a hint the builder writes to. */
  readonly words: Band
  /** Supported pixel band for either side. */
  readonly resolution: Band
  /** A fixed step count (turbo/lightning checkpoints), or null when steps are free. */
  readonly stepsLocked: number | null
  /** Can it return N images from one request. When false and `count` > 1 the runner loops
   *  serially with N seeds (PLAN §4) — one job, N assets, either way. */
  readonly batch: boolean
  /** Text engines only: how schema-shaped output can be asked for. */
  readonly structured?: StructuredMode
}

/**
 * A MODEL's delta over its engine's caps (PLAN §4). Half the real capability facts are not
 * engine facts at all — `stepsLocked: 4` is a klein fact, not a Draw Things fact, and the same
 * server also serves SDXL at 16 free steps. So caps resolve in two levels, engine ← model, and
 * a model states only what it changes.
 *
 * This is the ONE place a partial `caps` is legal, and it is legal because it is explicitly a
 * delta over something complete. A partial `caps` on an ENGINE row is still an error — see
 * `parseCaps`.
 */
export type CapsPatch = Partial<Caps>
