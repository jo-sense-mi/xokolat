// 🧩 WHAT WOULD ANSWER EACH STEP, ON THIS MACHINE — the binding, worked out fresh every time.
//
// ⚠️ NEVER STORED, AND THAT IS THE WHOLE DESIGN (NEXT.md §3). A composition carries `recommends`:
// the workflow it was BUILT against, on the machine it was published from. If that were written into
// the file as a pin, a composition downloaded onto a machine with other checkpoints would be a
// composition that can only fail. So the file says what it was built with, and this says what
// would actually run — and the two are allowed to differ.
//
// ⚠️ THE SUBSTITUTION RULE IS DERIVED, NOT CONFIGURED. A step declares what it makes and which
// inputs it fills; a workflow declares the same two things. Anything installed that makes the right
// medium and takes at least the inputs the step fills can answer it. That is not a heuristic about
// names — it is the same question the ask bar asks before it lets you press ▶.
//
// ⚠️ AND AN UNBOUND STEP IS A FIRST-CLASS ANSWER, not an error. "This chain needs a workflow that
// makes music and takes a prompt; ⤓ take comfyui/song" is a sentence somebody can act on, and it
// is the state a fresh install is in for every composition it has just taken.

import { resolveWorkflows } from '../inference/workflows.ts'
import type { ResolvedWorkflow } from '../inference/workflows.ts'
import type { InferenceRow } from '../types/inference.ts'
import type { Composition, MakeStep, Step } from '../types/composition.ts'
import { isMake } from '../types/composition.ts'
import type { Medium } from '../types/medium.ts'

/** One installed workflow, flattened with the service it lives on — the unit a step binds to. */
export interface Candidate extends ResolvedWorkflow {
  readonly service: string
  readonly serviceLabel: string
  /** What this workflow makes. Read off the SERVICE's medium, falling back to the kind's — the same
   *  order the ask bar uses, and the reason a mediumless ComfyUI row is not a problem. */
  readonly medium: Medium | null
}

/**
 * How a step got its workflow, and how much that is worth trusting.
 *
 * ⚠️ `xoko` IS NOT A WORKFLOW AND NEVER RESOLVES TO ONE (2026-08-24). A `text` step is written by
 * the agent this app is driven by — already chosen in 🔌, already the thing answering ✨ — so it
 * binds to nothing, needs nothing installed, and can never be `none`.
 */
export type Binding = 'exact' | 'substitute' | 'none' | 'xoko'

export interface ResolvedStep {
  readonly step: Step
  readonly binding: Binding
  /** `<service>/<slug>` of what would actually run, or null. */
  readonly workflow: string | null
  readonly label: string | null
  /** For an unbound step: the one sentence that says how to fix it. */
  readonly why: string | null
  /** Files the bound workflow still needs — the same list a ⤓ reports, so a step can be bound and
   *  still not runnable, and say which of the two it is. */
  readonly missing: readonly string[]
  /**
   * EVERYTHING INSTALLED THAT COULD ANSWER THIS STEP — what the ⚙ band offers you.
   *
   * ⚠️ THIS IS WHAT "A COMPOSITION PLUGS DIFFERENT ENGINES" ACTUALLY MEANS. The chain says a step
   * makes an image from a picture; which of your image workflows does it is yours to choose, and
   * until there was a list there was nothing to choose from — the resolver picked one and that was
   * the end of it. Empty for a `text` step (xoko), a pick and a bind, none of which reach an engine.
   */
  readonly options: readonly StepOption[]
}

/** One workflow a step could be plugged into. */
export interface StepOption {
  /** `<service>/<slug>`. */
  readonly workflow: string
  readonly label: string
  /** True for the one the composition was published against, when it is installed here. */
  readonly published: boolean
  /**
   * ⚠️ WHOSE FAMILY IT IS FROM (src/types/workflow.ts `lineage`) — and the reason a STEP'S list needs
   * it while a medium's shelf does not (2026-08-29). A shelf answers one press: whatever you plug
   * in makes a picture, and the parts inside it already match because a workflow is the thing that
   * holds them together. A CHAIN hands one step's output to the next, and there the families have
   * to agree too: an SDXL IP-Adapter cannot carry a FLUX founder. So the ⚙ band sorts each step's
   * options by what the step before it is plugged with, and marks the strangers.
   *
   * Null means the library did not say. It is not a claim of compatibility either way — it sorts
   * with the strangers, and it is marked as unknown rather than as wrong.
   */
  readonly lineage: string | null
}

export interface ResolvedComposition extends Composition {
  readonly steps: readonly Step[]
  readonly bindings: readonly ResolvedStep[]
  /** True when every making step has something to run and nothing is missing off the disk. */
  readonly ready: boolean
  /** What to ⤓ to make it ready, in the order it should be taken. Empty when it already is. */
  readonly needs: readonly string[]
}

/** Every workflow installed anywhere, as candidates. */
export function candidates(
  rows: readonly InferenceRow[],
  enginesOf: (id: string) => Parameters<typeof resolveWorkflows>[1],
  filesOf: (id: string) => Parameters<typeof resolveWorkflows>[4],
  mediumOfKind: (kind: string) => Medium | null,
): Candidate[] {
  const out: Candidate[] = []
  for (const row of rows) {
    for (const w of resolveWorkflows(row, enginesOf(row.id), new Map(), new Set(), filesOf(row.id))) {
      out.push({
        ...w,
        service: row.id,
        serviceLabel: row.label ?? row.id,
        // ⚠️ THE KIND IS THE ONLY ANSWER. It used to be the kind OR the row's own claim; the row
        // does not make that claim any more, because it could never be right about a service
        // serving five media (../inference/kinds.ts).
        medium: mediumOfKind(w.kind) ?? null,
      })
    }
  }
  return out
}

const fills = (step: MakeStep): readonly string[] => Object.keys(step.inputs)

/** ⚠️ ⊇, NOT =. A workflow that takes a `look` as well as a `prompt` can answer a step that only
 *  fills the prompt — the extra slot is simply left empty, which is what the tray does anyway. */
const covers = (w: Candidate, step: MakeStep): boolean =>
  fills(step).every((i) => (w.inputs as readonly string[]).includes(i))

function bindOne(step: Step, pool: readonly Candidate[]): ResolvedStep {
  // A pick makes nothing and a bind reaches no engine — this app writes that file itself — so for
  // both there is nothing to bind to and nothing that can be missing off the disk.
  if (!isMake(step)) {
    return { step, binding: 'exact', workflow: null, label: null, why: null, missing: [], options: [] }
  }

  // ⚠️ WORDS ARE XOKO, ALWAYS (2026-08-24). Not "a text workflow, resolved like any other" — the
  // agent, the one connected in ✨ xoko and already answering ✨. So a text step binds to nothing,
  // installs nothing, offers nothing to plug, and cannot be the reason a chain is not ready. The
  // day this resolved like a render was the day taking `mascot` — three steps, one of them words —
  // announced that it needed a local LLM.
  if (step.makes === 'text') {
    return { step, binding: 'xoko', workflow: null, label: 'xoko', why: null, missing: [], options: [] }
  }

  // Every workflow on this machine that makes the right thing and takes the right inputs. This is
  // the ⚙ band's list as well as the resolver's, so what you may plug in and what would run are
  // read off one rule.
  const able = pool.filter((w) => w.medium === step.makes && covers(w, step))
  const [wantService, wantSlug] = (step.recommends ?? '').split('/')
  const isPublished = (w: Candidate): boolean => w.service === wantService && w.slug === wantSlug
  const options: StepOption[] = able.map((w) => ({
    workflow: `${w.service}/${w.slug}`, label: w.label, published: isPublished(w),
    lineage: w.lineage,
  }))

  const found = (w: Candidate, binding: Binding): ResolvedStep => ({
    step,
    binding,
    workflow: `${w.service}/${w.slug}`,
    label: w.label,
    why: null,
    missing: w.missing.map((m) => m.file),
    options,
  })

  // 1 · exactly what it was built with.
  const exact = pool.find(isPublished)
  if (exact) return found(exact, 'exact')

  // 2 · anything installed that makes the right thing and takes the right inputs.
  // ⚠️ THE ONE THE MACHINE PREFERS, not the first one read. `isDefault` is what a press with
  // nothing chosen would use, which is the honest answer to "what would run".
  const sub = able.find((w) => w.isDefault) ?? able[0]
  if (sub) return found(sub, 'substitute')

  // 3 · nothing. ⚠️ THE MEDIUM FIRST, THEN THE FIX. What is missing is a way to make a picture
  // from a picture; that one workflow happens to be the published answer is the shortcut, not the
  // gap — and a machine with other filenames needs to read the gap.
  const slots = fills(step).filter((i) => i !== 'prompt')
  const gap = `nothing installed makes ${step.makes}`
    + `${slots.length ? ` from a ${slots.join(' and a ')}` : ' from words'}`
  return {
    step,
    binding: 'none',
    workflow: null,
    label: null,
    why: step.recommends ? `${gap} — ⤓ take ${step.recommends}` : gap,
    missing: [],
    options,
  }
}

export function resolveComposition(
  composition: Composition, pool: readonly Candidate[],
): ResolvedComposition {
  const bindings = composition.steps.map((s) => bindOne(s, pool))
  const needs: string[] = []
  for (const b of bindings) {
    if (b.binding === 'none' && isMake(b.step) && b.step.recommends) needs.push(b.step.recommends)
    for (const file of b.missing) if (!needs.includes(file)) needs.push(file)
  }
  return {
    ...composition,
    bindings,
    ready: bindings.every((b) => b.binding !== 'none' && !b.missing.length),
    needs,
  }
}
