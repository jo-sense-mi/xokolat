// The ENGINE ROW — one data row per engine, and the reason adding an engine is not a code
// change (PLAN §13). Supervision policy is DATA; the app owns ONE supervisor that implements
// the four launch modes, correctly, once.
//
// ONE row schema, not two: `tiers` is an OPTIONAL FIELD. Absent, the row's own
// launch/health/provision apply; present, each tier carries its own and the row resolves to
// the best available one. Nothing branches beyond *does this row have tiers*.

import type { Caps, CapsPatch } from './caps.ts'
import type { Params } from './request.ts'
import type { Workflow } from './workflow.ts'

/**
 * WHAT THIS ROW IS FOR — and there are two answers, because there are two sections.
 *
 * ✨ xoko is the one that thinks. 🔌 inference is everything that makes something you keep. That
 * split is already on the screen, and this field is how the server finds which side a row is on:
 * `rows.find((r) => r.role === 'brain')` is the ONLY way xoko's connection is told apart from a
 * renderer. Nothing else on the row distinguishes them — a brain has a transport and an endpoint
 * like any other service.
 *
 * ⚠️ `operator` WAS THE THIRD AND IS GONE (2026-09-06). It meant "on the shelf, never in the
 * picker — a builder calls this, you do not", and for three weeks NOTHING declared it: rembg, the
 * textbook case, ships as a generator, because taking a background out is a thing people sit down
 * to do. What it left behind was a dropdown in ＋ connect whose second option could only hide your
 * new service from your own menu.
 *
 * ⚠️ AND ITS JOB IS ALREADY DONE BETTER, one level down. A workflow declares `inputs`, so a press
 * that needs a picture you have not got says so exactly, per workflow — `klein-i2i` needs a `ref`
 * and is a generator. "Would a person ask for this?" was a taste call worn as a field; "does this
 * need a file first?" is a fact, and the fact is the one the app reads.
 */
export const INFERENCE_ROLES = ['generator', 'brain'] as const

export type InferenceRole = (typeof INFERENCE_ROLES)[number]

/**
 * WHICH OPERATING SYSTEMS A SERVICE RUNS ON — declared, never inferred.
 *
 * ⚠️ A PROPERTY OF THE SERVICE, NOT THE WORKFLOW. Draw Things is macOS; every workflow that speaks it
 * inherits that, and none of them restates it. Which is also why this is flat yes/no rather than a
 * ranking: "works better on Linux" is a claim about hardware nobody here owns, and it will be wrong
 * for someone. A real caveat is a sentence in `notes`, where it can say what it actually means.
 */
export const PLATFORMS = ['macos', 'linux', 'windows'] as const

export type Platform = (typeof PLATFORMS)[number]

/**
 * WHOSE MACHINE DOES THE WORK — declared, and it CANNOT be inferred from the transport.
 *
 * ⚠️ THE OBVIOUS RULE IS WRONG, and Claude Code is the row that proves it. "A loopback host or a
 * plain command is local, a named remote host is not" reads well and gets `claude-code` exactly
 * backwards: it is a `cli` transport with no endpoint at all, and it is as cloud as anything here
 * — the prompt goes to Anthropic, it costs no memory of yours, and it needs a plan. A transport
 * says how the app REACHES a service. It does not say where the thinking happens.
 *
 * The distinction earns a field because it is the coarsest question anybody asks of an engine:
 * `local` wants a download and your GPU and is free; `cloud` wants a key or a subscription, uses
 * none of your memory, and costs per run. Absent = `local` — that is what an engine on a port is
 * until somebody says otherwise, and every row written before this field existed was one.
 */
export const WHERES = ['local', 'cloud'] as const

export type Where = (typeof WHERES)[number]

export const LAUNCH_MODES = [
  /** The app never manages it, it points at an endpoint — ComfyUI, Ollama, anything already
   *  running. THE DEFAULT: connect first, manage optionally. */
  'external',
  /** The app spawns and supervises it directly — in-house workers, most CPU helpers. */
  'child',
  /** The app installs a launchd USER agent; never a child of the app server. Draw Things on
   *  macOS needs a logged-in GUI session for Metal, or it renders pure noise and exits 0
   *  (PLAN §13.1) — that requirement is a VALUE here, not a comment in a bash script. */
  'user-agent',
  /** The app itself does the work — nothing to install, nothing to start, never missing.
   *  The tier-1 cutout. */
  'builtin',
] as const

export type LaunchMode = (typeof LAUNCH_MODES)[number]

export const TRANSPORT_KINDS = [
  /** Draw Things' gRPCServerCLI. */
  'grpc',
  /** Anything that takes a picture and answers with one, described by a `call` shape. */
  'http',
  /** An OpenAI-compatible `/chat/completions` — Ollama, LM Studio, llama.cpp, a cloud. */
  'openai',
  /** ⚠️ COMFYUI, AND THE ONLY TRANSPORT WHERE THE WORKFLOW CARRIES THE WHOLE ASK (2026-08-17). The
   *  other three take FIELDS — a prompt, a seed, a size — because the app knows what those mean
   *  there. ComfyUI takes a GRAPH, and what a graph means is a fact about the nodes installed on
   *  somebody else's machine. So the graph travels with the workflow (`Workflow.graph`, ./workflow.ts),
   *  the app fills only the holes that workflow declares, and this transport is the three calls that
   *  queue it, wait for it and fetch what came out. It is what makes voice, music and 3D reachable
   *  at all — one adapter, three media, none of them named in this source tree. */
  'comfy',
  /** ⚠️ A COMMAND ON THIS MACHINE, and the only transport with no endpoint (2026-08-12). It
   *  exists for ONE reason: a subscription is not an API key. Claude Pro and Gemini Advanced buy
   *  you the vendor's own client, and no OAuth flow lets a third-party app spend them — so the
   *  way to think with a subscription is to drive the CLI you already logged into, in a terminal,
   *  once. The credential never reaches this app, which is the best possible place for it. */
  'cli',
] as const

export type TransportKind = (typeof TRANSPORT_KINDS)[number]

/**
 * HOW A PLAIN HTTP SERVICE IS CALLED — declared, because there is nothing here to discover.
 *
 * ⚠️ THIS IS THE GENERIC ESCAPE HATCH (2026-08-12), and rembg is its first user: nothing about
 * background removal is in this source tree. Four questions cover the shape of every small local
 * tool anyone writes in an afternoon — where, how the picture goes in, what else to send, how the
 * picture comes back — and every one of them is DATA, so adding such a service is a registry row
 * rather than a release.
 *
 * ⚠️ AND IT CARRIES NO COMMAND (PLAN §15 rule 1). A service that needs a local binary run is an
 * `exec` row with a fixed argv template, hand-written in the registry file, where the UI can fill
 * only declared holes. It does not exist yet, and it will never be a text field on a web form.
 */
export interface HttpCall {
  /** POST only. A GET that takes a picture is not a shape worth describing. */
  readonly method: 'POST'
  /** The path the picture is sent to, e.g. `/api/remove`. */
  readonly path: string
  /** `body` = the bytes ARE the request; `form` = multipart, with the picture in one field and the
   *  workflow's knobs as the others. rembg's daemon wants `form`. */
  readonly send: 'body' | 'form'
  /** The multipart field the picture goes in. `form` only; defaults to `file`. */
  readonly field?: string
  /** `image` = the answer's bytes are the picture. `json` = they are JSON, with the picture
   *  base64-encoded under `jsonField` (a `data:` prefix is tolerated). */
  readonly receive: 'image' | 'json'
  readonly jsonField?: string
}

/**
 * HOW A SERVICE IS PAID FOR — a key, BY NAME (2026-08-12).
 *
 * ⚠️ THE NAME IS THE WHOLE OF WHAT THE REGISTRY HOLDS. The key itself lives in `<data>/secrets.json`
 * at 0600 (src/secrets.ts), so a registry file stays a thing you can read, copy and share: moving a
 * service to another machine carries what it IS and leaves the credential behind. The browser is
 * told whether a key is set and never what it is.
 *
 * ⚠️ AND IT IS NOT WHAT A SUBSCRIPTION NEEDS. A Pro plan carries no API credential, and no login
 * flow lets a third-party app spend one — that is the `cli` transport, which has no auth field
 * because the credential never comes near this app (DECISIONS.md, 2026-08-12).
 */
export interface Auth {
  /** Which key, in the store. Never the key. */
  readonly secret: string
  /** The header it rides in. Absent = `Authorization: Bearer <key>`, which is what every
   *  OpenAI-compatible cloud takes; name one (`x-api-key`) and the key is the value, bare. */
  readonly header?: string
}

/** A service somewhere on the network — which is every service but one. */
export interface NetTransport {
  readonly kind: 'grpc' | 'http' | 'openai' | 'comfy'
  readonly host: string
  /** A fixed port, or `"auto"` — probe a free one at launch. Ports collide (`:7000` is also
   *  macOS AirPlay Receiver), so an engine port is never hardcoded. The APP's own port is the
   *  deliberate opposite: stable, and it fails loudly if taken (PLAN §9). */
  readonly port: number | 'auto'
  /** For `http`/`openai`: the path the endpoint is rooted at, e.g. `/v1`. */
  readonly basePath?: string
  /** ⚠️ DECLARED, NOT INFERRED FROM THE PORT. `:443` is a convention, not a promise, and a cloud
   *  reached over plain http is a key on the wire. Absent = plain http, which is right for
   *  everything on `127.0.0.1` and wrong for everything else. */
  readonly tls?: boolean
  /** The key this endpoint wants, by name. Absent = it wants none, which is every local one. */
  readonly auth?: Auth
  /** For `http`: what one call looks like. Absent = the row is reachable and unaskable. */
  readonly call?: HttpCall
}

/**
 * A COMMAND, and the answer to PLAN §15 rule 1 rather than an exception to it.
 *
 * ⚠️ THERE IS NO ARGV HERE, AND THERE NEVER WILL BE. The row names a brain from a list that is
 * COMPILED IN (`src/inference/cli/brains.ts`); the binary, the flags and where the words go are
 * code. So the worst a registry file can say — or a browser post, or a model that wrote itself a
 * service row — is *which of the things this build already knows how to run*, and a name that is
 * not on the list is refused by the parser. A free-text command field would have been half a line
 * of work and a remote shell.
 */
export interface CliTransport {
  readonly kind: 'cli'
  /** The id of a shipped `CliBrain`. Not a path, not a command — a choice from a closed set. */
  readonly brain: string
}

/** ⚠️ A UNION, so `host` cannot be read off a row that has no endpoint. Every reader already
 *  branched on `kind` first; this makes the compiler hold them to it. */
export type Transport = NetTransport | CliTransport

/** A declared install step, so "not installed" gets a fix button instead of a support ticket.
 *  Downloads are hash-verified and land in app data — never in the install directory. */
export interface Provision {
  readonly kind: 'download'
  readonly url: string
  readonly sha256: string
  /** Human words for the shelf: "onnx model", "gRPCServerCLI binary". */
  readonly what?: string
}

export interface Launch {
  readonly mode: LaunchMode
  /** `child` / `user-agent`: the executable, resolved against the provisioned bin dir. */
  readonly binary?: string
  /** `child`: an in-repo entry point instead of a binary, e.g. `src/workers/cutout.ts`. */
  readonly entry?: string
  /** ARGV ARRAY, never a command line, never a shell (PLAN §15). `{port}` and `{models_dir}`
   *  are the only substitutions, filled server-side from resolved values. */
  readonly args?: readonly string[]
  readonly provision?: Provision
}

/** Liveness. A plain TCP probe, because a check that shares a lane with the work is not a
 *  liveness check — Draw Things' `--echo-on-queue` deadlocks the queue it is meant to test
 *  (PLAN §13.2). */
export interface Health {
  /** `tcp` opens a connection and closes it. `command` runs the brain's version argv and looks at
   *  the exit code — the same discipline one layer over: nothing is written, nothing is asked, and
   *  "not installed" stays distinguishable from "cannot tell". */
  readonly kind: 'tcp' | 'command'
  readonly timeoutMs: number
}

/** The answer to the silent failure the health check passes (PLAN §13): after starting an
 *  image engine, render a tiny fixed prompt and check the result is not noise. The probe goes
 *  to a temp path — never the content root, never indexed, never rated. */
export interface Canary {
  readonly kind: 'render-noise-check'
}

/** Some workloads leak (onnxruntime's CPU arena grows and never returns memory), so the
 *  process is recycled past an RSS cap and the daemon is an accelerator, never a dependency. */
export interface Supervise {
  readonly maxRssMb: number
  readonly onCap: 'recycle'
}

/** One fallback level of a tiered row. Carries its own launch/provision, so the row resolves
 *  to the best available tier and the shelf names which one is live. */
export interface InferenceTier {
  readonly id: string
  readonly launch: Launch
  readonly health?: Health
  readonly provision?: Provision
  readonly supervise?: Supervise
}

/**
 * A MODEL the engine can be asked for, and what is known about it.
 *
 * ⚠️ This row is a set of FACTS ABOUT A CHECKPOINT, not a list of what is installed. Whether the
 * file is actually on this machine is answered by the engine's catalog at runtime — never by
 * the presence of a row here (`src/inference/engines.ts` resolves the three states). Declaring one
 * a stranger does not have costs nothing; it simply never appears in their picker.
 *
 * It exists because the layer above it cannot hold these facts. `stepsLocked: 4` and
 * `idiom: 'tags'` are checkpoint facts; an engine row that tried to state them would be lying
 * about every other checkpoint the same server serves.
 */
export interface Engine {
  /** EXACTLY what the engine calls it — this is the catalog key and the value of the `model`
   *  param, so a prettified name here would silently never match. */
  readonly file: string
  /** What the picker shows. Falls back to a de-suffixed `file`. */
  readonly label?: string
  /** Pick this one when nobody chose. At most one per engine; ignored when the engine does not
   *  actually have the file. */
  readonly default?: boolean
  /** The delta over the engine's caps. Absent = the engine's caps apply unchanged. */
  readonly caps?: CapsPatch
  /** The knobs this checkpoint wants — steps, sampler, cfg, shift. Sits between the engine's
   *  `defaults` and the request, so picking a model changes what a press will do without the
   *  user setting anything. Must not carry `model` (that is what `file` is). */
  readonly params?: Params
  /**
   * GIGABYTES OF MEMORY THIS CHECKPOINT WANTS, measured — the number that decides whether a press
   * renders or dies, and the only fact here a person shops on.
   *
   * ⚠️ MEASURED OR ABSENT. Never read off a filename: `q6p` and `i8x` say how it was quantised,
   * not what it costs to run, and a wrong number here sends someone to fetch 12 GB that will not
   * fit. Absent means unknown and is shown as unknown — the same discipline as `caps`.
   *
   * Unified memory on Apple silicon, VRAM on a discrete card. They are not the same quantity and
   * this does not pretend they are; it is the floor under both.
   */
  readonly memory?: number
  /** Free text for the shelf: why these numbers, what this checkpoint is for. */
  readonly notes?: string
}

export interface InferenceRow {
  /** Stable slug. It is the `<engine>` path segment of a run folder and the `provider` in a
   *  provenance record, so renaming one orphans content. */
  readonly id: string
  /** What the shelf and the picker call it. Falls back to `id`. */
  readonly label?: string
  /** Absent = `generator` (the common case). `brain` is set in ✨ xoko and nowhere else. */
  readonly role?: InferenceRole
  /**
   * ⚠️ THERE IS NO `medium` HERE ANY MORE (2026-09-06). A service does not know what it makes —
   * its WORKFLOWS do, through their `kind`, and every kind names its medium (registries/kinds.json).
   * The row's own claim could only ever be a worse copy: one ComfyUI serves five media and had to
   * leave the field blank, and a blank field then matched EVERY medium — which is how a music
   * swatch came to be shot on a ComfyUI holding nothing but image workflows.
   *
   * Read it with `mediaOf(row, kinds)` (../inference/kinds.ts). It is derived, so it follows the
   * workflows you take: one music workflow onto a ComfyUI and its card starts saying so by itself.
   */
  /** Where this service runs. Absent = unstated, not "everywhere" — an empty claim beats a wrong
   *  one, and the shelf shows it as unstated. */
  readonly platforms?: readonly Platform[]
  /** Whose machine does the work. Absent = `local`. See `WHERES` — it is not derivable from the
   *  transport, and the one row that proves it is `claude-code`. */
  readonly where?: Where
  readonly transport?: Transport
  /** Absent = `{ mode: 'external' }`. */
  readonly launch?: Launch
  readonly health?: Health
  readonly canary?: Canary
  /** Absent = MINIMAL, not permissive (src/inference/caps.ts). What every model of this engine
   *  gets before its own `caps` patch is applied. */
  readonly caps?: Caps
  /** What is known about individual checkpoints. NOT an inventory — see `Engine`. */
  readonly engines?: readonly Engine[]
  /**
   * The WORKFLOWS this service can be asked for — what a person actually picks (./workflow.ts).
   *
   * ⚠️ A LEVEL ABOVE `engines`, not a replacement for it. A checkpoint nobody wrote a workflow for
   * still gets one, synthesised: `t2i`, because that is the only thing safe to assume from
   * nothing (src/inference/workflows.ts).
   */
  readonly workflows?: readonly Workflow[]
  /** The knobs a run gets when nobody chose otherwise — the "working default" behind the 🔌
   *  band (PLAN §4). A request's params win over these, and an engine's own params win over
   *  the request's shared ones. Data, so a new engine does not need a code branch to be
   *  usable. */
  readonly defaults?: Params
  /** Optional fallback levels. Present → the row's own launch/health/provision are ignored. */
  readonly tiers?: readonly InferenceTier[]
  readonly supervise?: Supervise
  /** Free text for the shelf — what this row is and what a user might have to fix. */
  readonly notes?: string
  /**
   * WHERE TO READ HOW TO GET THIS RUNNING — a guide, not a description.
   *
   * ⚠️ A LINK, BECAUSE THE ANSWER IS LONGER THAN A CARD. "Run it from the app's own menu, or as a
   * per-user launch agent, and here are the four flags and the one that deadlocks the health
   * check" is a page. `notes` says what this row IS in a sentence; this says how to make it
   * ANSWER, and the two are different lengths for a reason.
   *
   * `/guides/…` for one that ships with this app (web/guides/), `https://…` for anything else.
   * Nothing else parses — a `javascript:` in a registry file is a registry file that can run.
   */
  readonly help?: string
}

/** The on-disk registry file, in both layers (shipped defaults + app-data overrides). */
export interface InferenceRegistryFile {
  /** One row per SERVICE. Each row's own `engines` are what it can be asked for — the word
   *  appears at both levels on purpose, and only ever means the second thing at the inner one. */
  readonly services: readonly InferenceRow[]
}
