// THE SHELF — "what does this app depend on, and is it actually there?" (PLAN §13).
//
// One row per INFERENCE SERVICE: where it is, whether it is reachable, what it can do. The
// per-run PICKER is the same data filtered to `role: generator` — one field and one filter,
// which is why there is no picker module here.
//
// ⚠️ NO ENGINE LIST HERE. What a service can be asked for is `src/inference/engines.ts` and the
// 🧩 section, and the split is the point: this answers *is it there*, that answers *what can I
// ask it for*. Putting the engine list on this row turned a settings card into a wall
// (DECISIONS.md, 2026-08-03).
//
// Every state comes from a DECLARED probe. Nothing is inferred from a name, and nothing that
// could not be checked is reported as missing.

import type { Caps } from '../types/caps.ts'
import type { InferenceRole, InferenceRow, LaunchMode, Transport } from '../types/inference.ts'
import type { Medium } from '../types/medium.ts'
import type { Kind } from '../types/workflow.ts'
import { MINIMAL_CAPS } from './caps.ts'
import { brainFor } from './cli/brains.ts'
import type { ServiceState, SignIn } from './health.ts'
import { commandProbe, httpProbe, signInProbe, tcpProbe } from './health.ts'
import { mediaOf } from './kinds.ts'
import type { Layer, LoadedRegistry } from './registry.ts'

export interface ShelfRow {
  readonly id: string
  readonly label: string
  readonly role: InferenceRole
  /** ⚠️ DERIVED FROM THE WORKFLOWS, not declared on the row (2026-09-06) — and a LIST, because one
   *  ComfyUI makes five. Empty for a service with no workflows yet, which is the honest answer: it
   *  cannot be armed and cannot render until it has one. See `mediaOf` (./kinds.ts). */
  readonly media: readonly Medium[]
  /** Where this row ORIGINATES: `user` for one you added, `shipped` for one the app ships — even
   *  when you have overridden fields of it. What you overrode is `patched`. */
  readonly source: Layer
  /** The top-level fields YOUR layer supplies for a shipped row. Empty for an untouched one and
   *  for one that is entirely yours. The ⚙ editor's "this is yours, ↺ puts it back". */
  readonly patched: readonly string[]
  readonly launch: LaunchMode
  /** For a tiered row, the tier that would run. Null when the row has no tiers. */
  readonly tier: string | null
  readonly endpoint: string | null
  /** The endpoint IN PIECES, because the editor edits pieces. `endpoint` above is the same thing
   *  as one string, which is what the card prints. */
  readonly transport: Transport | null
  /** ⚠️ THE FALLBACK A CHECKPOINT INHERITS, not a claim about the service. One server serves a
   *  4-step distilled checkpoint and a 28-step one; what a build acts on is the checkpoint's own
   *  (src/inference/engines.ts). A row that declared none shows the minimum, because that is what
   *  its undescribed checkpoints get. What can be ASKED FOR is neither of these — it is the
   *  service's workflow list (src/inference/workflows.ts). */
  readonly caps: Caps
  /** True when `caps` is the minimum rather than something the row declared. */
  readonly capsDeclared: boolean
  readonly state: ServiceState
  /**
   * WHETHER YOU ARE SIGNED IN — for the one transport where being installed is not enough.
   *
   * ⚠️ NULL MEANS THE QUESTION DOES NOT APPLY, not that the answer is no. A gRPC server has no
   * account; a client whose check this build has not verified reports `unknown` instead. The card
   * draws three lines from this — installed · signed in · connected — and a `·` for anything it
   * genuinely does not know.
   */
  readonly signIn: SignIn | null
  readonly detail: string | null
  readonly checkedMs: number | null
  /**
   * THE KEY THIS ROW WANTS, and whether there is one — never the key.
   *
   * ⚠️ A BOOLEAN IS THE WHOLE ANSWER (src/secrets.ts). There is no endpoint that returns a stored
   * key and there will not be one: a credential you can read back out of a web page is a credential
   * one screenshot from being someone else's. Null for a row that wants none, which is every local
   * one and every subscription (those are the `cli` transport, and it has no key at all).
   */
  readonly secret: { readonly id: string; readonly set: boolean } | null
  readonly notes: string | null
  /**
   * HOW TO GET THIS ONE ANSWERING — a link, shown on the card and loudest when it is not.
   *
   * ⚠️ THIS SHELF'S WHOLE JOB IS TO SAY "not running", and until now that is where it stopped.
   * The next thing anyone wants is the sentence after it, and that sentence is a page: which of
   * the two routes you want (the app's own server switch, or a headless agent), and the handful
   * of flags that decide whether it works. See web/guides/.
   */
  readonly help: string | null
}

/** What the row's launch mode resolves to. A tiered row uses its first tier for now; choosing
 *  the best AVAILABLE tier needs provisioning state, which is Phase 1's. */
function activeLaunch(row: InferenceRow): { mode: LaunchMode; tier: string | null } {
  const tier = row.tiers?.[0]
  if (tier) return { mode: tier.launch.mode, tier: tier.id }
  return { mode: row.launch?.mode ?? 'external', tier: null }
}

async function probe(row: InferenceRow, mode: LaunchMode): Promise<{
  state: ServiceState; detail: string | null; ms: number | null; signIn?: SignIn
}> {
  // `builtin` is the app itself doing the work: nothing to install, nothing to start, and it
  // cannot be missing — that is the whole point of the mode.
  if (mode === 'builtin') return { state: 'ready', detail: null, ms: null }

  if (!row.transport) {
    return { state: 'unknown', detail: 'no endpoint declared, so there is nothing to check', ms: null }
  }
  // ⚠️ A COMMAND IS PROBED TWICE, because being installed is not being usable (2026-08-21).
  //
  // The version argv answers "is the binary there". It said `ready` for months on machines that
  // had never logged in once, because nothing had ever asked the second question — and a green dot
  // on a connection that cannot answer is the exact lie this shelf exists to avoid.
  //
  // Both probes are free and offline: `--version`, then the client's own sign-in report (~0.2s,
  // local credentials, no token spent). A check that cost a question could not run every fifteen
  // seconds, and would bill you for looking at a settings page.
  if (row.transport.kind === 'cli') {
    const brain = brainFor(row.transport.brain)
    if (!brain) {
      return { state: 'unknown', detail: `no brain called ${row.transport.brain} in this build`, ms: null }
    }
    const timeoutMs = row.health?.timeoutMs ?? 5000
    const probed = await commandProbe(brain.bin, brain.version, timeoutMs)
    if (probed.state !== 'ready') {
      return {
        state: probed.state,
        detail: probed.state === 'not-installed'
          ? `${brain.bin} is not on your PATH — install it, then ${brain.login}`
          : probed.detail ?? null,
        ms: probed.ms,
      }
    }
    // Installed. Now: whose account is it holding?
    const signIn = brain.auth
      ? await signInProbe(brain.bin, brain.auth, timeoutMs)
      : { state: 'unknown' as const, plan: null, detail: 'this build has not checked how to read this client\'s sign-in' }
    return {
      // ⚠️ SIGNED OUT IS `down`, NOT `ready`. It is installed and it will refuse every question, so
      // the card must read as a connection that does not work — and `down`'s own meaning, "the
      // thing is there and will not answer, fix: start it", is exactly this one flag along.
      // `unknown` stays `ready`: not knowing is not evidence of a problem.
      state: signIn.state === 'out' ? 'down' : 'ready',
      detail: signIn.detail,
      ms: probed.ms,
      signIn,
    }
  }
  if (row.transport.port === 'auto') {
    return {
      state: 'down',
      detail: 'its port is assigned when the app starts it, and nothing has started it yet',
      ms: null,
    }
  }
  if (!row.health) {
    return { state: 'unknown', detail: 'no health check declared for this row', ms: null }
  }
  // ⚠️ AN `http` ROW IS ASKED, NOT DIALLED (2026-08-31, health.ts). The transport decides this,
  // not the stored `health.kind`: `tcp` on a port that answers HTTP is a strictly weaker check of
  // the same address, and it is the one that reported rembg READY while AirPlay Receiver — which
  // holds *:7000 on every Mac — was answering 403 to every cutout. What the row still says is how
  // long to wait for an answer.
  // A row with no call shape has nothing to ask — the render path refuses it too, and a TCP
  // connect is then honestly all this app knows how to check.
  if (row.transport.kind === 'http' && row.transport.call) {
    const { host, port, basePath, call } = row.transport
    const { state, detail, ms } = await httpProbe(
      `http://${host}:${port}${basePath ?? ''}${call.path}`, row.health.timeoutMs)
    return { state, detail: detail ?? null, ms }
  }
  const { state, detail, ms } = await tcpProbe(row.transport.host, row.transport.port, row.health.timeoutMs)
  return { state, detail: detail ?? null, ms }
}

export async function readShelf(
  registry: LoadedRegistry,
  /** Which key NAMES the store holds. Names only — this function never sees a value. */
  keys: readonly string[] = [],
  /** The kinds in force, for working out what each row makes. Empty = nothing claims a medium. */
  kinds: readonly Kind[] = [],
): Promise<ShelfRow[]> {
  // In parallel: probes are the slow part, they are independent, and one row's timeout must not
  // be added to the next one's.
  return Promise.all(registry.rows.map(async (row): Promise<ShelfRow> => {
    const { mode, tier } = activeLaunch(row)
    const { state, detail, ms, signIn } = await probe(row, mode)
    const auth = row.transport && row.transport.kind !== 'cli' ? row.transport.auth : undefined
    return {
      id: row.id,
      label: row.label ?? row.id,
      role: row.role ?? 'generator',
      media: mediaOf(row, kinds),
      source: registry.source.get(row.id) ?? 'shipped',
      patched: registry.patched.get(row.id) ?? [],
      launch: mode,
      tier,
      // What the card prints under the name. For a command there is no host and no port — what
      // there is, is the thing that runs and whose account it holds, which is the fact anyone
      // actually wants off this line. `claude · on this machine` was true and told you nothing.
      endpoint: !row.transport
        ? null
        : row.transport.kind === 'cli'
          ? [
            brainFor(row.transport.brain)?.bin ?? row.transport.brain,
            signIn?.state === 'in' ? (signIn.plan ? `${signIn.plan} plan` : 'signed in') : null,
          ].filter(Boolean).join(' · ')
          : `${row.transport.host}:${row.transport.port}`,
      transport: row.transport ?? null,
      caps: row.caps ?? MINIMAL_CAPS,
      capsDeclared: row.caps !== undefined,
      state,
      signIn: signIn ?? null,
      detail,
      checkedMs: ms,
      secret: auth ? { id: auth.secret, set: keys.includes(auth.secret) } : null,
      notes: row.notes ?? null,
      help: row.help ?? null,
    }
  }))
}
