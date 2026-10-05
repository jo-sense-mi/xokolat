// MODELS — the layer between an engine and a render, and the one Phase 0 shipped without.
//
// The bug it fixes is small and exact: the registry declared `stepsLocked: null` on Draw Things
// (true — the server locks nothing) while the ⚙ band defaulted steps to 4 (true of klein and of
// nothing else), so SDXL rendered at 4 steps and FLUX.1-dev at 4 instead of 28. Neither fact was
// wrong; they are facts about DIFFERENT THINGS, and there was nowhere to say the second one.
//
// ⚠️ A declared model row is NOT an inventory entry. What is actually on the machine comes from
// the engine's catalog, always, and the two are merged into three honest states:
//
//   known       declared here AND in the catalog   → its caps and params apply
//   discovered  in the catalog, nothing declared   → the engine's caps apply, and the shelf says so
//   declared    declared here, not in the catalog  → listed, never offered, never picked
//
// That is the same "declared · actually-there" reading the 🔌 shelf gives engines, one level
// down. Nothing is inferred from a filename — a model with no row gets the engine's caps, not a
// guess based on the word "flux" appearing in it.
//
// ⚠️ AND CAPABILITY LIVES HERE, not on the service (2026-08-08). A service is a pipe — a host, a
// port, a transport — and there is no true answer to "what can Draw Things do": the same server
// serves a checkpoint locked to 4 steps with no negative prompt and one that takes 28 free steps
// and has one. So `row.caps` is the FALLBACK a checkpoint inherits when it says nothing, and how a
// checkpoint wants to be addressed goes in its own row.
//
// ⚠️ WHAT CAN BE ASKED FOR IS A LEVEL UP FROM HERE (src/inference/workflows.ts). This file answers
// "what does this file want, and is it on the machine"; a WORKFLOW names one of these and says what it
// adds on top. The reason the split exists: plain SDXL takes no style reference, SDXL plus an
// IP-Adapter does, and they are the same file.

import type { Caps } from '../types/caps.ts'
import type { Engine, InferenceRow } from '../types/inference.ts'
import type { Medium } from '../types/medium.ts'
import type { Params } from '../types/request.ts'
import { MINIMAL_CAPS, applyCapsPatch } from './caps.ts'
import { brainFor } from './cli/brains.ts'
import { editableKnobs } from './tuning.ts'

/** What the engine reports it has. The subset of a catalog entry that matters here. */
export interface CatalogEngine {
  readonly file: string
  readonly name: string | null
  readonly version: string | null
  readonly builtin: boolean
}

export type EngineState = 'known' | 'discovered' | 'declared'

/** One row of the merged model list — the shape the shelf prints and the picker is built from. */
export interface ResolvedEngine {
  readonly file: string
  readonly label: string
  readonly state: EngineState
  /** True when this is what a press would use if nobody picked. */
  readonly isDefault: boolean
  /** ⚠️ EFFECTIVE caps: engine ← model. What a build will actually act on. */
  readonly caps: Caps
  /** True when the model row narrowed the engine's caps rather than inheriting them whole. */
  readonly capsDeclared: boolean
  /** ⚠️ EFFECTIVE knobs: shipped ← yours. What picking this model actually brings with it. */
  readonly params: Params
  /** What the REGISTRY declares — the value ↺ returns to, and the only keys that may be moved
   *  (src/inference/tuning.ts). Empty when nothing was declared, and then there is nothing to
   *  retune: the engine takes the service's settings. */
  readonly shipped: Params
  /** Only the fields YOU moved. Sparse, so a key that is not here has never been touched — which
   *  is what makes ↺ a delete rather than a second copy of the shipped number. */
  readonly tuned: Params
  /** What the ENGINE says this is (Draw Things' model version, e.g. `flux2_4b`). */
  readonly version: string | null
  readonly notes: string | null
  /** ⚠️ THE RAW REGISTRY ROW, or null for one nobody described. The editor sends these back —
   *  every declared row, with its edit applied — rather than the RESOLVED values above, which
   *  have the service's caps already folded in: posting those would silently declare every
   *  discovered checkpoint to be whatever its service happened to say that day. */
  readonly declared: Engine | null
  /** True when the declaration is in YOUR layer. Decides whether the verb on it is `🗑 forget`
   *  (nothing underneath) or `↺ revert` (the shipped description comes back). */
  readonly mine: boolean
}

const strip = (file: string): string => file.replace(/\.(ckpt|safetensors|gguf)$/, '')

export const engineLabel = (m: { file: string; label?: string }): string => m.label ?? strip(m.file)

/**
 * What this row DECLARES it can be asked for.
 *
 * ⚠️ WITH ONE FALLBACK, AND IT IS THE COMMAND-LINE BRAIN (2026-08-12). A `cli` row has no catalog
 * to ask — `claude --model` takes what the vendor publishes, not what is on this disk — so without
 * this its models would have to be typed into the registry, where they would be a second copy of
 * the list in `cli/brains.ts` and go stale the week a model ships. Which models a brain takes is a
 * fact about the brain, exactly like its argv, and it lives in the same file.
 *
 * ⚠️ AND ON A cli ROW THE TWO ARE MERGED, NOT REPLACED (2026-08-30). Everywhere else, naming your
 * own `engines` replaces the list, which is right when the alternative is a catalog read off a
 * disk. Here the alternative is a CLOSED LIST IN THIS BUILD'S OWN SOURCE, and replacing it is how
 * choosing which model xoko thinks with would delete the other two: pin `opus` and Sonnet and
 * Haiku are gone, out of a picker whose entire content was three names we compiled in. So a row of
 * yours WINS FOR ITS OWN FILE — the pin, the label, the params — and the brain's other models keep
 * their places behind it.
 */
export function declaredEngines(row: InferenceRow): readonly Engine[] {
  if (row.transport?.kind !== 'cli') return row.engines ?? []
  const brain = new Map((brainFor(row.transport.brain)?.models ?? [])
    .map((m): [string, Engine] => [m.file, { file: m.file, label: m.label }]))
  // ⚠️ MERGED PER FILE, not replaced. Your row overrides what it STATES and not what it omits —
  // pinning `opus` sends `{ file: 'opus', default: true }` and nothing else, and a whole-row win
  // would rename Claude Opus to `opus` in the picker as the side effect of choosing it.
  const mine = (row.engines ?? []).map((m): Engine => ({ ...brain.get(m.file), ...m }))
  for (const m of mine) brain.delete(m.file)
  const all = [...mine, ...brain.values()]
  // The vendor's own first choice, when you have not made one. `pickDefault` reads `default: true`,
  // so stamping it here as well would be two answers to one question.
  return all.some((m) => m.default) ? all : all.map((m, i) => (i === 0 ? { ...m, default: true } : m))
}

/** The declared row for a file, if there is one. Exact match on `file` — see `Engine.file`. */
export function declaredEngine(row: InferenceRow, file: string): Engine | undefined {
  return declaredEngines(row).find((m) => m.file === file)
}

/** Engine ← model, for one file. The single function every caps read should go through. */
export function capsFor(row: InferenceRow, file: string | null): Caps {
  const base = row.caps ?? MINIMAL_CAPS
  if (!file) return base
  return applyCapsPatch(base, declaredEngine(row, file)?.caps)
}

/**
 * The merged list, newest question first: what can this engine be asked for, and on what
 * authority. `catalog` is null when the engine could not be asked — and that case is NOT drawn
 * as "nothing installed": every declared row stays `declared`, and the caller says why.
 */
export function resolveEngines(
  row: InferenceRow, catalog: readonly CatalogEngine[] | null,
  /** file → the fields you moved, for this service only. A plain map rather than the loaded
   *  tuning, so this module stays a pure merge and does not import the store. */
  tuned: ReadonlyMap<string, Params> = new Map(),
  /** Which files YOUR registry layer declares a row for (LoadedRegistry.patchedEngines). */
  yours: ReadonlySet<string> = new Set(),
  /** ⚠️ PASSED IN, NOT READ OFF THE ROW (2026-09-06). Which knobs a checkpoint may be tuned to is
   *  a question about a medium, and a service no longer claims one — the caller works it out from
   *  the workflows (`soleMedium`, ./kinds.ts) and `null` means "several, or none yet", which is what
   *  a ComfyUI has always had here. */
  medium: Medium | null = null,
): ResolvedEngine[] {
  const declared = declaredEngines(row)
  const base = row.caps ?? MINIMAL_CAPS
  const seen = new Set<string>()
  const out: ResolvedEngine[] = []

  const push = (file: string, found: CatalogEngine | undefined): void => {
    if (seen.has(file)) return
    seen.add(file)
    const dec = declaredEngine(row, file)
    const shipped = dec?.params ?? {}
    // ⚠️ ONLY WHAT THIS APP CAN SEND. A patch key that is neither a knob of this medium nor
    // something the registry declared for this checkpoint is a line nothing reads — the writer
    // refuses it, but the file is hand-editable, so it is filtered here too rather than trusted
    // twice, and never drawn as though it were in force.
    const canMove = editableKnobs(medium, shipped)
    const mine = Object.fromEntries(
      Object.entries(tuned.get(file) ?? {}).filter(([k]) => canMove.includes(k)))
    const caps = applyCapsPatch(base, dec?.caps)
    out.push({
      file,
      label: dec ? engineLabel(dec) : (found?.name || strip(file)),
      // ⚠️ A CATALOG NOBODY COULD READ IS NOT EVIDENCE OF ABSENCE (2026-08-12). `declared` means
      // "described, and this machine does not have it" — a claim only a catalog can support. A
      // service that cannot be asked at all (any transport but gRPC, and a gRPC one that is down)
      // was making that claim about every checkpoint it declares, which took every workflow on a
      // plain-http service out of the picker: rembg would have shipped invisible. So with no
      // catalog the registry is the only authority there is — the same reasoning `pickDefault`
      // uses one function down.
      state: dec ? (found || catalog === null ? 'known' : 'declared') : 'discovered',
      isDefault: false,
      caps,
      capsDeclared: dec?.caps !== undefined,
      params: { ...shipped, ...mine },
      shipped,
      tuned: mine,
      version: found?.version ?? null,
      notes: dec?.notes ?? null,
      declared: dec ?? null,
      mine: yours.has(file),
    })
  }

  // Declared first, so the list a user curated leads and the machine's leftovers follow.
  for (const m of declared) push(m.file, catalog?.find((c) => c.file === m.file))
  for (const c of catalog ?? []) push(c.file, c)

  const chosen = pickDefault(row, out, catalog)
  return out.map((m) => (m.file === chosen ? { ...m, isDefault: true } : m))
}

/**
 * Which model a press uses when nobody chose.
 *
 * A `default: true` row that is not on this machine does NOT win — a default nothing can render
 * is not a default. The exception is a catalog we could not read at all: then nothing is known
 * to be absent, so the declared preference stands rather than the app silently picking something
 * else because a probe timed out.
 */
function pickDefault(
  row: InferenceRow, models: readonly ResolvedEngine[], catalog: readonly CatalogEngine[] | null,
): string | null {
  // ⚠️ THROUGH `declaredEngines`, NOT `row.engines` — so a command-line brain's own first model is
  // the preference when you have not pinned one, which is the same list the picker draws.
  const preferred = declaredEngines(row).find((m) => m.default)?.file
  if (preferred && (catalog === null || models.some((m) => m.file === preferred && m.state === 'known'))) {
    return preferred
  }
  // ⚠️ AND WHEN THE CATALOG COULD NOT BE READ AT ALL, a declared row is the best thing there is.
  // Nothing is known to be absent, so refusing to pick one means a service the app cannot ask —
  // which is every service whose transport nothing speaks yet — has no default and renders
  // nothing, however carefully it was described.
  const usable = models.filter((m) => m.state !== 'declared' || catalog === null)
  return usable.find((m) => m.state === 'known')?.file ?? usable[0]?.file ?? null
}

/** The default as a file name, for the server side — which resolves a request that named no
 *  model rather than failing it. */
export function defaultEngineFile(row: InferenceRow, catalog: readonly CatalogEngine[] | null): string | null {
  return resolveEngines(row, catalog).find((m) => m.isDefault)?.file ?? null
}

/** The knobs a model brings. Never includes `model` itself — that is `file`, and the parser
 *  rejects a row that tries. */
export function paramsFor(row: InferenceRow, file: string | null): Params {
  return (file ? declaredEngine(row, file)?.params : undefined) ?? {}
}
