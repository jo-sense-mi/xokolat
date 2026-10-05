// THE ENGINE REGISTRY — read in two layers, validated by hand, and the only place an engine
// row comes from.
//
//   <install>/registries/inference.json   shipped defaults, read-only
//   <data>/registries/inference.json      the user's — added services, and overrides of shipped ones
//
// ⚠️ THE USER LAYER NAMES FIELDS (2026-08-07). It used to REPLACE a shipped row whole, defended
// as "a half-overridden `caps` is a capability nobody declared" — which is true of `caps` and of
// nothing else. What it cost was the ordinary case: moving Draw Things to another port meant
// copying its six checkpoint rows into your own file, where they would sit frozen the day the
// shipped ones changed. That is the exact drift `engine-params.json` exists to avoid, one level up.
//
// So the merge is PER TOP-LEVEL FIELD, and each field is still atomic: a `caps` you name replaces
// the shipped `caps` entirely (and must be complete — `parseCaps` sees to that), a `transport` you
// name replaces the whole endpoint. What you do not name, you inherit. A row whose id is not in
// the shipped file is simply one with nothing to inherit from.
//
// ⚠️ WITH ONE EXCEPTION, AND IT IS `engines` (2026-08-08). A list is not a field: declaring one
// checkpoint of six would replace the other five with nothing, so the only way to say "and this
// one is distilled to 4 steps" would be to paste all six into your file — the same frozen copy
// the field-level merge exists to prevent, one level down. `engines` therefore merges BY FILE, and
// each engine row is itself atomic. See `mergeEngines`.
//
// ⚠️ AND THE CROSS-FIELD CHECKS RUN ON THE MERGED ROW, because they are about the row that will
// actually be used: "a generator needs a transport" is not a fact about your two-line override.
// A merged row that fails them is REFUSED — the shipped row stands and the reason is reported —
// rather than dropped, because dropping it would take a working service away over a typo.

import { readFile } from 'node:fs/promises'

import { resolveIn } from '../paths.ts'
import type { Roots } from '../paths.ts'
import type {
  Auth, Canary, Engine, HttpCall, InferenceRegistryFile, InferenceRow, InferenceTier, Health,
  Launch, Provision, Supervise, Transport,
} from '../types/inference.ts'
import { INFERENCE_ROLES, LAUNCH_MODES, PLATFORMS, TRANSPORT_KINDS, WHERES } from '../types/inference.ts'
import type { ParamValue } from '../types/request.ts'
import type { Ctx } from '../validate.ts'
import {
  SLUG, asArray, asBoolean, asEnum, asEnumArray, asNumber, asObject, asParams, asString,
  asStringArray, ctx, issue, noStrayKeys,
} from '../validate.ts'
import {
  CONTROL_INPUT_TYPES, CONTROL_MODES, LORA_MODES, REF_SLOTS, TARGET_BLOCKS, WORKFLOW_INPUTS,
} from '../types/workflow.ts'
import type { Control, Graph, Hole, HoleSpec, Lora, Workflow, RefSlot } from '../types/workflow.ts'
import { RESERVED_HOLE, fallbackLies, holeTargets, presetGaps, reservedHole } from '../types/workflow.ts'
import { parseCaps, parseCapsPatch } from './caps.ts'
import { CLI_BRAINS, brainFor } from './cli/brains.ts'

/** Where each layer lives, relative to its root. */
export const REGISTRY_FILE = 'registries/inference.json'

export type Layer = 'shipped' | 'user'

export interface LoadedLayer {
  readonly layer: Layer
  readonly path: string
  readonly present: boolean
  readonly rows: number
}

export interface LoadedRegistry {
  readonly rows: readonly InferenceRow[]
  /** Where each id ORIGINATES — `user` for one you added, `shipped` for one this app ships, even
   *  when you have overridden fields of it. What you overrode is `patched`. */
  readonly source: ReadonlyMap<string, Layer>
  /** id → the top-level fields your layer supplies for a SHIPPED row. The ↺ list, and the only
   *  thing that tells "the registry says :7859" from "you said :7859". */
  readonly patched: ReadonlyMap<string, readonly string[]>
  /** id → the engine FILES your layer declares a row for, on a shipped service or your own.
   *  Finer than a field name because `engines` merges per file: ✎ and ↺ on a checkpoint are about
   *  that checkpoint, not about the list it is in. */
  readonly patchedEngines: ReadonlyMap<string, readonly string[]>
  /** id → the workflow SLUGS your layer declares, on a shipped service or your own. Same reasoning
   *  as `patchedEngines`, one level up: 🗑 on a workflow you wrote removes it, ↺ on a shipped one
   *  you edited puts the shipped workflow back, and only this tells them apart. */
  readonly patchedWorkflows: ReadonlyMap<string, readonly string[]>
  readonly layers: readonly LoadedLayer[]
  /** Every problem found, in one pass. A row with an issue is DROPPED, not repaired. */
  readonly issues: readonly string[]
}

// ── the guards ────────────────────────────────────────────────────────────────────────────

function parseProvision(c: Ctx, v: unknown, path: string): Provision | undefined {
  const o = asObject(c, v, path)
  if (!o) return undefined
  noStrayKeys(c, o, path, ['kind', 'url', 'sha256', 'what'])
  const kind = asEnum(c, o['kind'], `${path}.kind`, ['download'] as const)
  const url = asString(c, o['url'], `${path}.url`, { pattern: /^https:\/\/\S+$/ })
  const sha256 = asString(c, o['sha256'], `${path}.sha256`, { pattern: /^[a-f0-9]{64}$/ })
  const what = o['what'] === undefined ? undefined : asString(c, o['what'], `${path}.what`)
  if (!kind || !url || !sha256) return undefined
  return { kind, url, sha256, ...(what === undefined ? {} : { what }) }
}

function parseLaunch(c: Ctx, v: unknown, path: string): Launch | undefined {
  const o = asObject(c, v, path)
  if (!o) return undefined
  noStrayKeys(c, o, path, ['mode', 'binary', 'entry', 'args', 'provision'])
  const mode = asEnum(c, o['mode'], `${path}.mode`, LAUNCH_MODES)
  const binary = o['binary'] === undefined ? undefined : asString(c, o['binary'], `${path}.binary`)
  const entry = o['entry'] === undefined ? undefined : asString(c, o['entry'], `${path}.entry`)
  const args = o['args'] === undefined ? undefined : asStringArray(c, o['args'], `${path}.args`)
  const provision = o['provision'] === undefined
    ? undefined
    : parseProvision(c, o['provision'], `${path}.provision`)
  if (!mode) return undefined

  // What each mode needs in order to be startable at all. Declaring `child` with nothing to
  // run is a row that passes review and fails at 3am on someone else's machine.
  if ((mode === 'child' || mode === 'user-agent') && !binary && !entry) {
    issue(c, path, `mode ${mode} needs a binary or an entry to launch`)
  }
  if (mode === 'user-agent' && entry && !binary) {
    issue(c, path, 'mode user-agent installs a launch agent, so it needs a binary, not an entry')
  }
  if (mode === 'builtin' && (binary || entry || args || provision)) {
    issue(c, path, 'mode builtin is the app doing the work itself — it launches nothing')
  }
  if (mode === 'external' && (binary || entry || provision)) {
    issue(c, path, 'mode external means the app never manages it — it cannot install or start it')
  }

  return {
    mode,
    ...(binary === undefined ? {} : { binary }),
    ...(entry === undefined ? {} : { entry }),
    ...(args === undefined ? {} : { args }),
    ...(provision === undefined ? {} : { provision }),
  }
}

/** ONE CALL, DESCRIBED. Everything here is data the adapter reads; nothing here is a command. */
function parseCall(c: Ctx, v: unknown, path: string): HttpCall | undefined {
  const o = asObject(c, v, path)
  if (!o) return undefined
  noStrayKeys(c, o, path, ['method', 'path', 'send', 'field', 'receive', 'jsonField'])
  const method = asEnum(c, o['method'], `${path}.method`, ['POST'] as const)
  const at = asString(c, o['path'], `${path}.path`, { pattern: /^\// })
  const send = asEnum(c, o['send'], `${path}.send`, ['body', 'form'] as const)
  const field = o['field'] === undefined ? undefined : asString(c, o['field'], `${path}.field`)
  const receive = asEnum(c, o['receive'], `${path}.receive`, ['image', 'json'] as const)
  const jsonField = o['jsonField'] === undefined
    ? undefined
    : asString(c, o['jsonField'], `${path}.jsonField`)
  if (receive === 'json' && !jsonField) {
    issue(c, `${path}.jsonField`, 'an answer in JSON needs the name of the field holding the picture')
  }
  if (send === 'body' && field) {
    issue(c, `${path}.field`, 'a field name is for multipart — with `send: "body"` the picture IS the body')
  }
  if (!method || !at || !send || !receive) return undefined
  return {
    method, path: at, send, receive,
    ...(field === undefined ? {} : { field }),
    ...(jsonField === undefined ? {} : { jsonField }),
  }
}

/** WHICH KEY, and where it rides. Never the key — see src/secrets.ts for why that is the only
 *  shape this may have. */
function parseAuth(c: Ctx, v: unknown, path: string): Auth | undefined {
  const o = asObject(c, v, path)
  if (!o) return undefined
  noStrayKeys(c, o, path, ['secret', 'header'])
  const secret = asString(c, o['secret'], `${path}.secret`, { pattern: SLUG })
  const header = o['header'] === undefined
    ? undefined
    : asString(c, o['header'], `${path}.header`, { pattern: /^[A-Za-z][A-Za-z0-9-]*$/ })
  // ⚠️ A KEY IN THE REGISTRY IS A KEY IN A FILE MEANT TO BE SHARED. Refused by name, because the
  // shape that invites it — "why not just put it here" — is the one this whole split exists to
  // prevent, and a typo'd field name would otherwise sit in plain text forever.
  for (const stray of ['key', 'value', 'token', 'apiKey']) {
    if (o[stray] !== undefined) {
      issue(c, `${path}.${stray}`, 'a key never goes in the registry — name it here and set the '
        + 'value in 🔌 settings, where it lands in an owner-only file')
    }
  }
  if (!secret) return undefined
  return { secret, ...(header === undefined ? {} : { header }) }
}

function parseTransport(c: Ctx, v: unknown, path: string): Transport | undefined {
  const o = asObject(c, v, path)
  if (!o) return undefined
  noStrayKeys(c, o, path, ['kind', 'host', 'port', 'basePath', 'tls', 'auth', 'call', 'brain'])
  const kind = asEnum(c, o['kind'], `${path}.kind`, TRANSPORT_KINDS)

  // ⚠️ THE COMMAND-LINE ROW IS A NAME AND NOTHING ELSE (PLAN §15 rule 1). It carries no argv, no
  // binary, no path — only which of the brains this build ships (src/inference/cli/brains.ts). A
  // registry file is the operator's own disk and they may write what they like in it; what they
  // CANNOT do is make this app run something it does not already know how to run, and neither can
  // anything arriving through the settings API, because both come through here.
  if (kind === 'cli') {
    for (const stray of ['host', 'port', 'basePath', 'tls', 'auth', 'call']) {
      if (o[stray] !== undefined) {
        issue(c, `${path}.${stray}`, 'a command has no endpoint — a `cli` transport is one name')
      }
    }
    const brain = asString(c, o['brain'], `${path}.brain`)
    if (!brain) return undefined
    if (!brainFor(brain)) {
      issue(c, `${path}.brain`, `this build ships no brain called ${JSON.stringify(brain)} — it `
        + `knows ${CLI_BRAINS.map((b) => b.id).join(', ')}`)
      return undefined
    }
    return { kind, brain }
  }

  const host = asString(c, o['host'], `${path}.host`)
  const port = o['port'] === 'auto'
    ? 'auto' as const
    : asNumber(c, o['port'], `${path}.port`, { int: true, min: 1, max: 65535 })
  const basePath = o['basePath'] === undefined
    ? undefined
    : asString(c, o['basePath'], `${path}.basePath`, { pattern: /^\// })
  const tls = o['tls'] === undefined ? undefined : asBoolean(c, o['tls'], `${path}.tls`)
  const auth = o['auth'] === undefined ? undefined : parseAuth(c, o['auth'], `${path}.auth`)
  const call = o['call'] === undefined ? undefined : parseCall(c, o['call'], `${path}.call`)
  if (call && kind !== 'http') {
    issue(c, `${path}.call`, `a call shape is for the \`http\` transport, not \`${kind}\``)
  }
  // A key on a plain-http hop is a key on the wire. `127.0.0.1` is the exception that proves it:
  // there is no wire.
  if (auth && !tls && host !== '127.0.0.1' && host !== 'localhost') {
    issue(c, `${path}.tls`, `${host} is not this machine, so a key sent to it needs \`tls: true\``)
  }
  if (!kind || !host || port === undefined) return undefined
  return {
    kind, host, port,
    ...(basePath === undefined ? {} : { basePath }),
    ...(tls === undefined ? {} : { tls }),
    ...(auth === undefined ? {} : { auth }),
    ...(call === undefined ? {} : { call }),
  }
}

function parseHealth(c: Ctx, v: unknown, path: string): Health | undefined {
  const o = asObject(c, v, path)
  if (!o) return undefined
  noStrayKeys(c, o, path, ['kind', 'timeoutMs'])
  const kind = asEnum(c, o['kind'], `${path}.kind`, ['tcp', 'command'] as const)
  const timeoutMs = asNumber(c, o['timeoutMs'], `${path}.timeoutMs`, { int: true, min: 1 })
  if (!kind || timeoutMs === undefined) return undefined
  return { kind, timeoutMs }
}

function parseCanary(c: Ctx, v: unknown, path: string): Canary | undefined {
  const o = asObject(c, v, path)
  if (!o) return undefined
  noStrayKeys(c, o, path, ['kind'])
  const kind = asEnum(c, o['kind'], `${path}.kind`, ['render-noise-check'] as const)
  return kind ? { kind } : undefined
}

function parseSupervise(c: Ctx, v: unknown, path: string): Supervise | undefined {
  const o = asObject(c, v, path)
  if (!o) return undefined
  noStrayKeys(c, o, path, ['maxRssMb', 'onCap'])
  const maxRssMb = asNumber(c, o['maxRssMb'], `${path}.maxRssMb`, { int: true, min: 1 })
  const onCap = asEnum(c, o['onCap'], `${path}.onCap`, ['recycle'] as const)
  if (maxRssMb === undefined || !onCap) return undefined
  return { maxRssMb, onCap }
}

function parseTier(c: Ctx, v: unknown, path: string): InferenceTier | undefined {
  const o = asObject(c, v, path)
  if (!o) return undefined
  noStrayKeys(c, o, path, ['id', 'launch', 'health', 'provision', 'supervise'])
  const id = asString(c, o['id'], `${path}.id`, { pattern: SLUG })
  const launch = parseLaunch(c, o['launch'], `${path}.launch`)
  const health = o['health'] === undefined ? undefined : parseHealth(c, o['health'], `${path}.health`)
  const provision = o['provision'] === undefined
    ? undefined
    : parseProvision(c, o['provision'], `${path}.provision`)
  const supervise = o['supervise'] === undefined
    ? undefined
    : parseSupervise(c, o['supervise'], `${path}.supervise`)
  if (!id || !launch) return undefined
  return {
    id, launch,
    ...(health === undefined ? {} : { health }),
    ...(provision === undefined ? {} : { provision }),
    ...(supervise === undefined ? {} : { supervise }),
  }
}

function parseEngine(c: Ctx, v: unknown, path: string): Engine | undefined {
  const o = asObject(c, v, path)
  if (!o) return undefined
  noStrayKeys(c, o, path, ['file', 'label', 'default', 'caps', 'params', 'memory', 'notes'])
  // No SLUG here: `file` is whatever the SERVICE calls it, dots and all, and the
  // exact string is what the catalog is matched on.
  const file = asString(c, o['file'], `${path}.file`)
  const label = o['label'] === undefined ? undefined : asString(c, o['label'], `${path}.label`)
  const dflt = o['default'] === undefined
    ? undefined
    : asBoolean(c, o['default'], `${path}.default`)
  const caps = o['caps'] === undefined ? undefined : parseCapsPatch(c, o['caps'], `${path}.caps`)
  const params = o['params'] === undefined ? undefined : asParams(c, o['params'], `${path}.params`)
  // Gigabytes, measured. The ceiling is a sanity rail, not a prediction: past ~512 GB the number
  // is a typo, and a typo here is a checkpoint nobody can find a machine for.
  const memory = o['memory'] === undefined
    ? undefined
    : asNumber(c, o['memory'], `${path}.memory`, { min: 1, max: 512 })
  const notes = o['notes'] === undefined ? undefined : asString(c, o['notes'], `${path}.notes`)

  // An engine row that names a model is two answers to one question, and the merge order decides
  // which wins — so it is rejected rather than resolved.
  if (params && 'model' in params) {
    issue(c, `${path}.params.model`, 'an engine row IS the model — set `file`, not a `model` param')
  }
  if (!file) return undefined
  return {
    file,
    ...(label === undefined ? {} : { label }),
    ...(dflt === undefined ? {} : { default: dflt }),
    ...(caps === undefined ? {} : { caps }),
    ...(params === undefined ? {} : { params }),
    ...(memory === undefined ? {} : { memory }),
    ...(notes === undefined ? {} : { notes }),
  }
}

/**
 * ONE ADAPTER STACKED ON THE CHECKPOINT.
 *
 * ⚠️ EVERY VOCABULARY HERE IS CLOSED, unlike `kind`. These are wire words with an INDEX behind them
 * (src/types/workflow.ts) — `Shuffle` is 13 and nothing else is — so a word this build does not know
 * is not a capability it has never heard of, it is a number it would have to invent. Refused by
 * name, at load, where the message can list the words that exist.
 */
function parseControl(c: Ctx, v: unknown, path: string): Control | undefined {
  const o = asObject(c, v, path)
  if (!o) return undefined
  noStrayKeys(c, o, path, [
    'file', 'from', 'inputType', 'weight', 'mode', 'start', 'end', 'targetBlocks',
    'downSamplingRate',
  ])
  // Not a SLUG: a control file is whatever the service calls it, dots and all. ABSENT is legal and
  // means the model's own reference channel — klein's moodboard has no adapter file to name.
  const file = o['file'] === undefined
    ? undefined
    : asString(c, o['file'], `${path}.file`)
  const from = asEnum(c, o['from'], `${path}.from`, REF_SLOTS)
  const inputType = asEnum(c, o['inputType'], `${path}.inputType`, CONTROL_INPUT_TYPES)
  const weight = o['weight'] === undefined
    ? undefined
    : asNumber(c, o['weight'], `${path}.weight`, { min: 0, max: 2 })
  const mode = o['mode'] === undefined
    ? undefined
    : asEnum(c, o['mode'], `${path}.mode`, CONTROL_MODES)
  const start = o['start'] === undefined
    ? undefined
    : asNumber(c, o['start'], `${path}.start`, { min: 0, max: 1 })
  const end = o['end'] === undefined
    ? undefined
    : asNumber(c, o['end'], `${path}.end`, { min: 0, max: 1 })
  const targetBlocks = o['targetBlocks'] === undefined
    ? undefined
    : asEnum(c, o['targetBlocks'], `${path}.targetBlocks`, TARGET_BLOCKS)
  const downSamplingRate = o['downSamplingRate'] === undefined
    ? undefined
    : asNumber(c, o['downSamplingRate'], `${path}.downSamplingRate`, { min: 1, max: 8 })
  if (start !== undefined && end !== undefined && start >= end) {
    issue(c, `${path}.start`, 'a control that stops before it starts never applies')
  }
  if (!from || !inputType) return undefined
  return {
    ...(file === undefined ? {} : { file }),
    from, inputType,
    ...(weight === undefined ? {} : { weight }),
    ...(mode === undefined ? {} : { mode }),
    ...(start === undefined ? {} : { start }),
    ...(end === undefined ? {} : { end }),
    ...(targetBlocks === undefined ? {} : { targetBlocks }),
    ...(downSamplingRate === undefined ? {} : { downSamplingRate }),
  }
}

function parseLora(c: Ctx, v: unknown, path: string): Lora | undefined {
  const o = asObject(c, v, path)
  if (!o) return undefined
  noStrayKeys(c, o, path, ['file', 'weight', 'mode'])
  const file = asString(c, o['file'], `${path}.file`)
  const weight = o['weight'] === undefined
    ? undefined
    : asNumber(c, o['weight'], `${path}.weight`, { min: 0, max: 2 })
  const mode = o['mode'] === undefined ? undefined : asEnum(c, o['mode'], `${path}.mode`, LORA_MODES)
  if (!file) return undefined
  return {
    file,
    ...(weight === undefined ? {} : { weight }),
    ...(mode === undefined ? {} : { mode }),
  }
}

/** Where one hole points: `<node id>.<input>`. The node id is whatever the export called it — a
 *  number, usually, but ComfyUI allows anything — so only the input name is constrained. */
const HOLE = /^([^.]+)\.([A-Za-z0-9_]+)$/

/**
 * A NODE GRAPH, checked for the three things this app can actually know.
 *
 * ⚠️ THE NODES THEMSELVES ARE NOT INSPECTED, AND THAT IS THE DESIGN (2026-08-17). What a
 * `class_type` means, which inputs it takes and whether the wires type-check are facts about the
 * ComfyUI on the other end — its custom nodes, its version, its models. A parser here that had an
 * opinion would refuse graphs that run and pass graphs that do not, and it would go stale every
 * time somebody updated a node pack.
 *
 * What IS checkable is whether the workflow is internally consistent: the graph is an object of
 * objects, and every hole and the output point at a node that is really in it. A hole pointing at
 * a node that is not there is the failure worth catching early — nothing errors, the prompt simply
 * never arrives, and the render comes back as whatever the graph was saved with.
 */
/**
 * ONE HOLE — a bare target, or a target that also declares what may be put in it.
 *
 * ⚠️ BOTH FORMS STAY (2026-08-23). `"prompt": "94.tags"` is the overwhelming case and does not
 * deserve four lines of JSON; the long form is for a widget the app has no word for, or one whose
 * range and enum belong to the node rather than to a taste of ours. Normalising the short form to
 * the long one would rewrite every published workflow on read and make what comes back out of a
 * registry file differ from what somebody wrote into it.
 */
function parseHole(c: Ctx, v: unknown, path: string): Hole | undefined {
  const one = (t: unknown) => asString(c, t, path, { pattern: HOLE })

  if (typeof v === 'string') return one(v)
  if (Array.isArray(v)) {
    // One word may fill several nodes — ACE-Step states its length twice, on the text encoder and
    // on the empty latent, and a `duration` reaching only one of them makes two minutes of audio
    // in a thirty-second container.
    const many = asStringArray(c, v, path)?.filter((t) => Boolean(one(t)))
    return many?.length ? many : undefined
  }

  const o = asObject(c, v, path)
  if (!o) return undefined
  noStrayKeys(c, o, path,
    ['at', 'kind', 'choices', 'range', 'fallback', 'suggest', 'what', 'multiline', 'unit',
      'perSecond', 'advanced', 'subordinate'])

  const at = Array.isArray(o['at'])
    ? asStringArray(c, o['at'], `${path}.at`)?.filter((t) => Boolean(one(t)))
    : one(o['at'])
  if (!at || !at.length) return undefined

  const kind = o['kind'] === undefined ? undefined
    : asEnum(c, o['kind'], `${path}.kind`, ['integer', 'number', 'choice', 'text', 'boolean'] as const)
  const choices = o['choices'] === undefined ? undefined
    : asStringArray(c, o['choices'], `${path}.choices`)
  const range = o['range'] === undefined ? undefined
    : asArray(c, o['range'], `${path}.range`)
      ?.map((n, i) => asNumber(c, n, `${path}.range[${i}]`))
      .filter((n): n is number => n !== undefined)
  const what = o['what'] === undefined ? undefined : asString(c, o['what'], `${path}.what`)
  const advanced = o['advanced'] === undefined ? undefined
    : asBoolean(c, o['advanced'], `${path}.advanced`)
  const multiline = o['multiline'] === undefined ? undefined
    : asBoolean(c, o['multiline'], `${path}.multiline`)
  const subordinate = o['subordinate'] === undefined ? undefined
    : asBoolean(c, o['subordinate'], `${path}.subordinate`)
  const unit = o['unit'] === undefined ? undefined : asString(c, o['unit'], `${path}.unit`)
  const perSecond = o['perSecond'] === undefined ? undefined
    : asNumber(c, o['perSecond'], `${path}.perSecond`)
  if (perSecond !== undefined && !(perSecond > 0)) {
    issue(c, `${path}.perSecond`, 'how many of this unit make one second — a positive number')
  }

  // ⚠️ THE SHAPE HAS TO BE COMPLETE ENOUGH TO VALIDATE AGAINST, or the declaration is worse than
  // no declaration: a `choice` with no list accepts anything and then the render fails inside
  // ComfyUI, on a string the node compares exactly.
  if (kind === 'choice' && !choices?.length) {
    issue(c, path, 'a `choice` hole must list the exact strings the node takes')
  }
  if ((kind === 'integer' || kind === 'number') && range && range.length !== 2) {
    issue(c, `${path}.range`, 'a range is exactly [low, high]')
  }

  const spec: HoleSpec = {
    at: at.length === 1 && typeof o['at'] === 'string' ? at[0]! : at,
    ...(kind === undefined ? {} : { kind }),
    ...(choices === undefined ? {} : { choices }),
    ...(range?.length === 2 ? { range: [range[0]!, range[1]!] as const } : {}),
    ...(o['fallback'] === undefined ? {} : { fallback: o['fallback'] as ParamValue }),
    ...(Array.isArray(o['suggest']) ? { suggest: o['suggest'] as readonly ParamValue[] } : {}),
    ...(what === undefined ? {} : { what }),
    ...(multiline ? { multiline: true as const } : {}),
    ...(unit === undefined ? {} : { unit }),
    ...(perSecond === undefined || !(perSecond > 0) ? {} : { perSecond }),
    ...(advanced ? { advanced: true as const } : {}),
    ...(subordinate ? { subordinate: true as const } : {}),
  }
  return spec
}

function parseGraph(c: Ctx, v: unknown, path: string): Graph | undefined {
  const o = asObject(c, v, path)
  if (!o) return undefined
  noStrayKeys(c, o, path, ['nodes', 'out', 'holes'])

  const nodes = asObject(c, o['nodes'], `${path}.nodes`)
  if (nodes && !Object.keys(nodes).length) {
    issue(c, `${path}.nodes`, 'an empty graph renders nothing')
  }
  for (const [id, node] of Object.entries(nodes ?? {})) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) {
      issue(c, `${path}.nodes.${id}`, 'a node is an object with a `class_type` and its inputs')
    }
  }

  const out = asString(c, o['out'], `${path}.out`)
  if (nodes && out && !(out in nodes)) {
    issue(c, `${path}.out`, `there is no node ${JSON.stringify(out)} in this graph`)
  }

  let holes: Record<string, Hole> | undefined
  const raw = o['holes'] === undefined ? undefined : asObject(c, o['holes'], `${path}.holes`)
  if (raw) {
    // ⚠️ REFUSED AT THE DOOR, not at render time. A hole named for something the pipeline writes
    // itself is filled with the pipeline's answer and the control that appears to set it sets
    // nothing (src/types/workflow.ts `RESERVED_HOLE`).
    const clash = reservedHole(raw)
    if (clash) issue(c, `${path}.holes.${RESERVED_HOLE}`, clash)
    holes = {}
    for (const [key, target] of Object.entries(raw)) {
      const hole = parseHole(c, target, `${path}.holes.${key}`)
      if (!hole) continue
      // ⚠️ THE TARGET IS CHECKED WHICHEVER FORM IT CAME IN. A hole pointing at a node that is not
      // in the graph is the failure worth catching early — nothing errors at render time, the
      // value simply never arrives, and the track comes back as whatever the graph was saved with.
      const bad = holeTargets(hole)
        .map((t) => HOLE.exec(t)?.[1] ?? '')
        .find((node) => nodes && !(node in nodes))
      if (bad !== undefined) {
        issue(c, `${path}.holes.${key}`,
          `there is no node ${JSON.stringify(bad)} in this graph, so nothing would `
          + `ever receive ${JSON.stringify(key)}`)
        continue
      }
      holes[key] = hole
    }
    // ⚠️ AND A RECOMMENDED VALUE THAT IS NOT THE ONE THAT WOULD RUN (2026-08-31). Same door, same
    // reason as the clash above: the control appears to say what happens if you leave it alone, and
    // says a number nothing will use. See `fallbackLies` for the render it cost.
    const lying = fallbackLies(nodes, holes)
    if (lying) issue(c, `${path}.holes`, lying)
  }

  if (!nodes || !out) return undefined
  return { nodes, out, ...(holes === undefined ? {} : { holes }) }
}

/**
 * NAMED SETS OF KNOBS THAT ONLY MEAN ANYTHING TOGETHER (`Workflow.presets`).
 *
 * ⚠️ A PRESET THAT SETS NOTHING IS WORSE THAN NO PRESET, which is the whole of what is checked
 * here. `fill()` silently skips a hole the graph does not declare — the rule that lets the knob
 * table grow ahead of the catalog — so a preset naming `cfg` on a graph with no `cfg` hole applies
 * cleanly, renders at the published value, and the only clue is that the track is not what was
 * asked for. Named at parse time, it is one line in the issues list.
 *
 * ⚠️ AND ONLY WHERE THERE IS A GRAPH TO CHECK AGAINST. A field-building service (Draw Things) has
 * no declared list of places the app may write — every knob the medium's table names is reachable
 * by construction — so there is nothing here to be wrong about.
 */
function parsePresets(
  c: Ctx, v: unknown, path: string, graph: Graph | undefined,
): Record<string, Record<string, string | number | boolean>> | undefined {
  const o = asObject(c, v, path)
  if (!o) return undefined
  const out: Record<string, Record<string, string | number | boolean>> = {}
  for (const [name, body] of Object.entries(o)) {
    if (name.startsWith('$')) continue
    const values = asParams(c, body, `${path}.${name}`)
    if (!values) continue
    if ('model' in values) {
      issue(c, `${path}.${name}.model`,
        'a workflow names its checkpoint in `model`; a graph that swaps one does it through a hole')
    }
    const gaps = graph ? presetGaps(values, graph.holes) : null
    if (gaps) issue(c, `${path}.${name}`, gaps)
    out[name] = values
  }
  return out
}

/**
 * One WORKFLOW.
 *
 * ⚠️ `inputs` IS A CLOSED VOCABULARY AND `kind` IS NOT (2026-08-12). A slot nothing recognises is
 * a picture the adapter has nowhere to put — that is a wire fact and stays an enum. A KIND is the
 * app's vocabulary of capabilities, and closing it means a service that can do something this
 * build never heard of cannot say so (src/inference/kinds.ts). The cost is that a typo makes its
 * own group instead of being refused; the 🔌 page marks a kind nobody described, which is the
 * honest version of the same warning.
 */
function parseWorkflow(c: Ctx, v: unknown, path: string): Workflow | undefined {
  const o = asObject(c, v, path)
  if (!o) return undefined
  noStrayKeys(c, o, path,
    ['slug', 'label', 'kind', 'default', 'model', 'inputs', 'lineage', 'params', 'presets',
      'knobs', 'controls', 'loras', 'graph', 'notes'])
  const slug = asString(c, o['slug'], `${path}.slug`, { pattern: SLUG })
  const label = o['label'] === undefined ? undefined : asString(c, o['label'], `${path}.label`)
  const kind = asString(c, o['kind'], `${path}.kind`, { pattern: SLUG })
  // Not a SLUG: `model` is whatever the SERVICE calls the file, dots and all.
  const model = asString(c, o['model'], `${path}.model`)
  const inputs = asEnumArray(c, o['inputs'], `${path}.inputs`, WORKFLOW_INPUTS)
  // A SLUG, because it is compared for equality across services and `SDXL` vs `sdxl` would be two
  // families. Open — the app ships no list of them: a lineage nobody here has heard of is one the
  // library published, and refusing it would be this app having an opinion about whose models
  // exist.
  const lineage = o['lineage'] === undefined
    ? undefined
    : asString(c, o['lineage'], `${path}.lineage`, { pattern: SLUG })
  const params = o['params'] === undefined ? undefined : asParams(c, o['params'], `${path}.params`)
  const graph = o['graph'] === undefined ? undefined : parseGraph(c, o['graph'], `${path}.graph`)
  const notes = o['notes'] === undefined ? undefined : asString(c, o['notes'], `${path}.notes`)
  // ⚠️ WHICH OF THE MEDIUM'S KNOBS THIS ONE READS — for a workflow with no graph to declare its own
  // holes with. Empty is a real answer: `cutout` takes a picture and nothing else.
  const knobs = o['knobs'] === undefined ? undefined : asStringArray(c, o['knobs'], `${path}.knobs`)
  const presets = o['presets'] === undefined
    ? undefined
    : parsePresets(c, o['presets'], `${path}.presets`, graph)
  const dflt = o['default'] === undefined
    ? undefined
    : asBoolean(c, o['default'], `${path}.default`)

  let controls: Control[] | undefined
  if (o['controls'] !== undefined) {
    const arr = asArray(c, o['controls'], `${path}.controls`)
    if (arr) {
      controls = []
      for (const [i, entry] of arr.entries()) {
        const control = parseControl(c, entry, `${path}.controls[${i}]`)
        if (control) controls.push(control)
      }
    }
  }

  let loras: Lora[] | undefined
  if (o['loras'] !== undefined) {
    const arr = asArray(c, o['loras'], `${path}.loras`)
    if (arr) {
      loras = []
      for (const [i, entry] of arr.entries()) {
        const lora = parseLora(c, entry, `${path}.loras[${i}]`)
        if (lora) loras.push(lora)
      }
    }
  }

  // The workflow names its checkpoint in `model`; a `model` param would be a second answer, and the
  // merge order would decide which one ran.
  if (params && 'model' in params) {
    issue(c, `${path}.params.model`, 'a workflow names its checkpoint in `model`, not in `params`')
  }
  if (inputs && !inputs.length) {
    issue(c, `${path}.inputs`, 'a workflow that takes nothing cannot be asked for anything')
  }
  // ⚠️ A GRAPH ALREADY SAYS THIS, hole by hole, and two answers would mean deciding which wins.
  if (knobs && graph) {
    issue(c, `${path}.knobs`,
      'a graph declares its own holes — `knobs` is for a workflow that has none')
  }
  // ⚠️ A CONTROL POINTS AT A SLOT THIS WORKFLOW TAKES, or the picture it reads can never arrive: the
  // tray only draws the slots in `inputs`, and the render path only accepts those. Caught here
  // because the symptom otherwise is a workflow that looks right and renders as though the adapter
  // were not there.
  for (const [i, control] of (controls ?? []).entries()) {
    if (inputs && !inputs.includes(control.from)) {
      issue(c, `${path}.controls[${i}].from`,
        `nothing fills a ${control.from} slot here — add it to \`inputs\``)
    }
  }
  // ⚠️ AND A HOLE NAMING A SLOT OBEYS THE SAME RULE, for the same reason one line up: the tray only
  // draws the slots in `inputs` and the render path only accepts those, so a `ref` hole on a workflow
  // that takes no `ref` is a node nothing will ever reach. Every other hole name is a knob, and
  // knobs are open — the graph may expose one this build has never heard of.
  for (const key of Object.keys(graph?.holes ?? {})) {
    if ((REF_SLOTS as readonly string[]).includes(key) && inputs && !inputs.includes(key as RefSlot)) {
      issue(c, `${path}.graph.holes.${key}`,
        `nothing fills a ${key} slot here — add it to \`inputs\``)
    }
  }
  if (!slug || !kind || !model || !inputs?.length) return undefined
  return {
    slug, kind, model, inputs,
    ...(label === undefined ? {} : { label }),
    ...(dflt === undefined ? {} : { default: dflt }),
    ...(lineage === undefined ? {} : { lineage }),
    ...(params === undefined ? {} : { params }),
    ...(presets === undefined ? {} : { presets }),
    ...(knobs === undefined ? {} : { knobs }),
    ...(controls === undefined ? {} : { controls }),
    ...(loras === undefined ? {} : { loras }),
    ...(graph === undefined ? {} : { graph }),
    ...(notes === undefined ? {} : { notes }),
  }
}

// ⚠️ NO `medium` SINCE 2026-09-06. A file still carrying one is refused rather than ignored —
// a stray key here is a claim somebody wrote and expected to be read, and a service's medium is
// now read off its workflows' kinds (./kinds.ts) where it can be right about a ComfyUI.
const ROW_KEYS = [
  'id', 'label', 'role', 'platforms', 'where', 'transport', 'launch', 'health', 'canary',
  'caps', 'engines', 'workflows', 'defaults', 'tiers', 'supervise', 'notes', 'help',
] as const

/** A guide this app ships (`/guides/…`) or a page on the web (`https://…`), and nothing else.
 *  ⚠️ THE SCHEME IS THE POINT. This string ends up in an `href` on a card, so `javascript:` and
 *  `data:` would make a registry file — including the one in your app-data folder, which anything
 *  that can write a file can edit — a place to put code. Plain http is out for the same reason a
 *  key needs `tls`: a guide fetched over a hostile network is a guide someone else wrote. */
const HELP_URL = /^(?:https:\/\/\S+|\/[\w./-]*)$/

/**
 * The checks that are about the ROW AS A WHOLE rather than about one field.
 *
 * ⚠️ Separate from the parse because they must run on the MERGED row (see the header): an
 * override that names only a transport is not a row missing a medium, it is two lines of a row
 * that has one. Returns true when the row is usable.
 */
export function checkRow(c: Ctx, row: InferenceRow, path: string): boolean {
  const before = c.issues.length
  // ONE row schema, not two — so the row must say which half it is using.
  if (row.tiers && row.launch) {
    issue(c, path, 'a tiered row resolves its launch per tier; a row-level launch would be ignored')
  }
  // A generator nobody can pick and nothing can reach is a row that only looks configured.
  //
  // ⚠️ EXCEPT A CLOUD ROW, WHICH MAY SHIP UNBOUND (2026-08-16). "Cloud" is not a vendor and has no
  // endpoint to declare: which service, which model and which key are the user's to choose, and
  // naming one here would be this app picking their provider for them. So a `where: cloud` row is
  // allowed to arrive as a SLOT — declared, not configured — and the transport is what you add in
  // 🔌 settings. The shelf already reports exactly that: "no endpoint declared, so there is nothing
  // to check". A LOCAL generator with no transport is still the mistake it always was.
  const effectiveRole = row.role ?? 'generator'
  const launches = row.tiers ? row.tiers.map((t) => t.launch) : [row.launch ?? { mode: 'external' }]
  const unbound = row.where === 'cloud'
  // ⚠️ EVERY ROLE IS HELD TO THIS, and since 2026-09-06 saying so takes no branch: the roles are
  // generator and brain, and the check was never about what a row PRODUCES — it is about being
  // REACHABLE. A connection with nowhere to connect to only looks configured.
  //
  // ⚠️ AND THE EXEMPTION IS "THE APP RUNS IT ITSELF", which is what `role: 'operator'` used to
  // stand in for. A `builtin` needs no endpoint because it is this process; a `child` naming an
  // `entry` is one of our own workers, started and spoken to by the supervisor rather than dialled.
  // A `child` naming a BINARY is a program that has to answer somewhere, so it still needs one.
  const ownWork = (l: { mode: string; entry?: string }) =>
    l.mode === 'builtin' || (l.mode === 'child' && !!l.entry)
  if (!row.transport && !unbound && !launches.every(ownWork)) {
    issue(c, path,
      `a ${effectiveRole} needs a transport — an endpoint is how it is reached`)
  }
  if (row.transport?.kind !== 'cli' && row.transport?.port === 'auto'
    && launches.some((l) => l.mode === 'external')) {
    issue(c, `${path}.transport.port`, '"auto" means the app probes a free port at launch, but it never launches an external engine')
  }
  return c.issues.length === before
}

/**
 * One row's fields.
 *
 * `partial` is the USER LAYER: every field is still validated exactly as strictly, but the
 * whole-row checks are left to `checkRow` after the merge, because an override is not a row.
 */
export function parseInferenceRow(
  c: Ctx, v: unknown, path: string, { partial = false } = {},
): InferenceRow | undefined {
  const o = asObject(c, v, path)
  if (!o) return undefined
  noStrayKeys(c, o, path, ROW_KEYS)

  const id = asString(c, o['id'], `${path}.id`, { pattern: SLUG })
  const label = o['label'] === undefined ? undefined : asString(c, o['label'], `${path}.label`)
  const role = o['role'] === undefined ? undefined : asEnum(c, o['role'], `${path}.role`, INFERENCE_ROLES)
  const platforms = o['platforms'] === undefined
    ? undefined
    : asEnumArray(c, o['platforms'], `${path}.platforms`, PLATFORMS)
  const where = o['where'] === undefined ? undefined : asEnum(c, o['where'], `${path}.where`, WHERES)
  const transport = o['transport'] === undefined
    ? undefined
    : parseTransport(c, o['transport'], `${path}.transport`)
  const launch = o['launch'] === undefined ? undefined : parseLaunch(c, o['launch'], `${path}.launch`)
  const health = o['health'] === undefined ? undefined : parseHealth(c, o['health'], `${path}.health`)
  const canary = o['canary'] === undefined ? undefined : parseCanary(c, o['canary'], `${path}.canary`)
  const caps = o['caps'] === undefined ? undefined : parseCaps(c, o['caps'], `${path}.caps`)

  let engines: Engine[] | undefined
  if (o['engines'] !== undefined) {
    const arr = asArray(c, o['engines'], `${path}.engines`)
    if (arr) {
      engines = []
      const files = new Set<string>()
      let defaults = 0
      for (const [i, entry] of arr.entries()) {
        const engine = parseEngine(c, entry, `${path}.engines[${i}]`)
        if (!engine) continue
        if (files.has(engine.file)) {
          issue(c, `${path}.engines[${i}].file`, `duplicate engine ${JSON.stringify(engine.file)}`)
          continue
        }
        files.add(engine.file)
        if (engine.default) defaults++
        engines.push(engine)
      }
      // Two defaults is not a preference, it is a coin flip that looks like a decision.
      if (defaults > 1) issue(c, `${path}.engines`, `${defaults} engines are marked default — at most one can be`)
    }
  }

  let workflows: Workflow[] | undefined
  if (o['workflows'] !== undefined) {
    const arr = asArray(c, o['workflows'], `${path}.workflows`)
    if (arr) {
      workflows = []
      const slugs = new Set<string>()
      for (const [i, entry] of arr.entries()) {
        const rec = parseWorkflow(c, entry, `${path}.workflows[${i}]`)
        if (!rec) continue
        if (slugs.has(rec.slug)) {
          issue(c, `${path}.workflows[${i}].slug`, `duplicate workflow ${JSON.stringify(rec.slug)}`)
          continue
        }
        slugs.add(rec.slug)
        workflows.push(rec)
      }
    }
  }

  const defaults = o['defaults'] === undefined
    ? undefined
    : asParams(c, o['defaults'], `${path}.defaults`)
  const supervise = o['supervise'] === undefined
    ? undefined
    : parseSupervise(c, o['supervise'], `${path}.supervise`)
  const notes = o['notes'] === undefined ? undefined : asString(c, o['notes'], `${path}.notes`)
  const help = o['help'] === undefined
    ? undefined
    : asString(c, o['help'], `${path}.help`, { pattern: HELP_URL })

  let tiers: InferenceTier[] | undefined
  if (o['tiers'] !== undefined) {
    const arr = asArray(c, o['tiers'], `${path}.tiers`)
    if (arr) {
      tiers = []
      for (const [i, entry] of arr.entries()) {
        const tier = parseTier(c, entry, `${path}.tiers[${i}]`)
        if (tier) tiers.push(tier)
      }
      if (!tiers.length) issue(c, `${path}.tiers`, 'a tiered row needs at least one usable tier')
    }
  }

  if (!id) return undefined
  const row: InferenceRow = {
    id,
    ...(label === undefined ? {} : { label }),
    ...(role === undefined ? {} : { role }),
    ...(platforms === undefined ? {} : { platforms }),
    ...(where === undefined ? {} : { where }),
    ...(transport === undefined ? {} : { transport }),
    ...(launch === undefined ? {} : { launch }),
    ...(health === undefined ? {} : { health }),
    ...(canary === undefined ? {} : { canary }),
    ...(caps === undefined ? {} : { caps }),
    ...(engines === undefined ? {} : { engines }),
    ...(workflows === undefined ? {} : { workflows }),
    ...(defaults === undefined ? {} : { defaults }),
    ...(tiers === undefined ? {} : { tiers }),
    ...(supervise === undefined ? {} : { supervise }),
    ...(notes === undefined ? {} : { notes }),
    ...(help === undefined ? {} : { help }),
  }
  if (!partial) checkRow(c, row, path)
  return row
}

/** Validate one registry FILE's parsed JSON. Exported for `npm run check`, which validates
 *  both layers without starting a server. */
export function parseInferenceRegistryFile(
  c: Ctx, v: unknown, { partial = false } = {},
): InferenceRow[] {
  const o = asObject(c, v, '')
  if (!o) return []
  noStrayKeys(c, o, '', ['services'] satisfies readonly (keyof InferenceRegistryFile)[])
  const arr = asArray(c, o['services'], 'services')
  if (!arr) return []
  const rows: InferenceRow[] = []
  const seen = new Set<string>()
  for (const [i, entry] of arr.entries()) {
    const row = parseInferenceRow(c, entry, `services[${i}]`, { partial })
    if (!row) continue
    if (seen.has(row.id)) {
      issue(c, `services[${i}].id`, `duplicate id ${JSON.stringify(row.id)} in the same file`)
      continue
    }
    seen.add(row.id)
    rows.push(row)
  }
  return rows
}

// ── the two-layer read ────────────────────────────────────────────────────────────────────

async function readLayer(
  file: string, issues: string[], partial = false,
): Promise<{ rows: InferenceRow[]; present: boolean }> {
  let text: string
  try {
    text = await readFile(file, 'utf-8')
  } catch (err) {
    // A missing user layer is the normal case on a fresh machine, and a missing shipped one is
    // a broken install — but neither is worth crashing over: the shelf reports what it found.
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { rows: [], present: false }
    issues.push(`${file}: ${(err as Error).message}`)
    return { rows: [], present: false }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    issues.push(`${file}: not valid JSON — ${(err as Error).message}`)
    return { rows: [], present: true }
  }
  const c = ctx(file)
  const rows = parseInferenceRegistryFile(c, parsed, { partial })
  issues.push(...c.issues)
  return { rows, present: true }
}

/** The SHIPPED rows alone — what an override is merged onto, and compared against to know which
 *  of its fields are actually yours (src/inference/services.ts). */
export async function readShippedRows(roots: Roots): Promise<readonly InferenceRow[]> {
  const issues: string[] = []
  return (await readLayer(resolveIn(roots.install, REGISTRY_FILE), issues)).rows
}

/**
 * The two engine lists, merged BY FILE — the one place a field is not atomic (see the header).
 *
 * ⚠️ A DEFAULT IS A FACT ABOUT THE LIST, not about a row, so naming one clears the shipped one.
 * Otherwise the merged row carries two `default: true` engines and the winner is whichever the
 * reader happens to see first — a coin flip that looks like a decision.
 */
function mergeEngines(base: readonly Engine[], mine: readonly Engine[]): Engine[] {
  const claimed = mine.some((e) => e.default)
  const out = new Map<string, Engine>(
    base.map((e) => [e.file, claimed && e.default ? { ...e, default: false } : e]))
  for (const e of mine) out.set(e.file, e)
  return [...out.values()]
}

/** `workflows` merges per SLUG, for exactly the reason `engines` merges per file: writing your own
 *  workflow must not delete the ten this app shipped. */
function mergeWorkflows(base: readonly Workflow[], mine: readonly Workflow[]): Workflow[] {
  const out = new Map<string, Workflow>(base.map((w) => [w.slug, w]))
  for (const w of mine) out.set(w.slug, w)
  return [...out.values()]
}

export async function loadInferenceRegistry(roots: Roots): Promise<LoadedRegistry> {
  const issues: string[] = []
  const shippedPath = resolveIn(roots.install, REGISTRY_FILE)
  const userPath = resolveIn(roots.data, REGISTRY_FILE)

  const shipped = await readLayer(shippedPath, issues)
  const mine = await readLayer(userPath, issues, true)

  const byId = new Map<string, InferenceRow>(shipped.rows.map((r) => [r.id, r]))
  const source = new Map<string, Layer>(shipped.rows.map((r) => [r.id, 'shipped' as const]))
  const patched = new Map<string, readonly string[]>()
  const patchedEngines = new Map<string, readonly string[]>()
  const patchedWorkflows = new Map<string, readonly string[]>()

  for (const row of mine.rows) {
    const base = byId.get(row.id)
    // ⚠️ FIELD BY FIELD, and each field whole. `{...base, ...row}` is the merge: `caps` you named
    // replaces `caps`, and `caps` you did not name is the shipped one — never a blend of the two.
    // `engines` is the exception, and only because a list is not a field (see `mergeEngines`).
    const merged = base
      ? {
          ...base, ...row,
          ...(base.engines && row.engines ? { engines: mergeEngines(base.engines, row.engines) } : {}),
          ...(base.workflows && row.workflows
            ? { workflows: mergeWorkflows(base.workflows, row.workflows) }
            : {}),
        }
      : row
    const c = ctx(userPath)
    if (!checkRow(c, merged, `services[${JSON.stringify(row.id)}]`)) {
      // Refused, not applied: the shipped row stands (or, for one that only you declare, it is
      // dropped like any unusable row) and the reason is on the shelf.
      issues.push(...c.issues)
      continue
    }
    byId.set(row.id, merged)
    if (row.engines?.length) patchedEngines.set(row.id, row.engines.map((e) => e.file))
    if (row.workflows?.length) patchedWorkflows.set(row.id, row.workflows.map((w) => w.slug))
    if (base) patched.set(row.id, Object.keys(row).filter((k) => k !== 'id'))
    else source.set(row.id, 'user')
  }

  return {
    rows: [...byId.values()],
    source,
    patched,
    patchedEngines,
    patchedWorkflows,
    layers: [
      { layer: 'shipped', path: shippedPath, present: shipped.present, rows: shipped.rows.length },
      { layer: 'user', path: userPath, present: mine.present, rows: mine.rows.length },
    ],
    issues,
  }
}
