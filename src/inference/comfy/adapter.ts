// THE COMFYUI ADAPTER — queue a graph, wait for it, fetch what came out.
//
// ⚠️ THIS IS THE ADAPTER WITH NO OPINIONS, AND THAT IS THE ONLY WAY IT COULD WORK (2026-08-17).
// Every other adapter here knows what a render IS on the service it speaks to: Draw Things takes a
// prompt, a size, a step count and a sampler, and the app can build one from fields because the
// vocabulary is fixed. ComfyUI has no vocabulary. A song, a voice and a mesh come out of node
// families that share nothing — `TextEncodeAceStepAudio1.5`, `FB_Qwen3TTSVoiceDesign`,
// `VoxelToMesh` — and half of them are custom nodes this build will never have heard of.
//
// So the workflow brings the graph and says where the holes are (`Workflow.graph`, src/types/workflow.ts),
// and this file is the three calls around it. What that buys is the thing the whole app was blocked
// on: voice, music and 3D reachable through ONE adapter, with nothing about any of them in this
// source tree — the same trade the plain-http adapter made for small tools, one size up.
//
// The protocol, confirmed against ComfyUI 0.22.3:
//   POST /prompt        {prompt: <graph>, client_id} → {prompt_id, node_errors}
//   GET  /history/<id>  → {} until it is done, then {<id>: {status, outputs}}
//   GET  /view?filename=&subfolder=&type=  → the bytes
//
// ⚠️ IT POLLS FOR THE ANSWER AND LISTENS FOR THE PROGRESS, and the split is the whole design
// (2026-08-23). `/history` stays the sole authority on "is it done": a socket that dropped still
// leaves the answer sitting there, and that was the argument for having no socket at all. What it
// cost was a bar — the socket is the only thing that carries `{value, max}` per sampling step, and
// without it a ten-minute ACE-Step render was an elapsed clock and a log line every ten seconds
// against a medium with nothing on screen to look at.
//
// So the socket is a FEED AND NEVER A RESULT. It is opened after the graph is queued, its only
// output is `progress()`, and every failure mode — refused, dropped mid-render, never opened at
// all — costs a bar and nothing else. `ws://` is Node's own global WebSocket; no dependency, and
// no reconnect policy, because there is nothing to recover.

import { Buffer } from 'node:buffer'

import type { ParamValue, Params } from '../../types/request.ts'
import type { Graph } from '../../types/workflow.ts'
import { holeTargets } from '../../types/workflow.ts'
import type { Adapter, RenderInput, RenderOutput } from '../adapter.ts'
import { multipart } from '../multipart.ts'
import { randomSeed } from '../params.ts'

/**
 * ⚠️ THERE IS NO DEADLINE ON A RENDER (2026-09-04). There was one — twenty minutes, chosen as "the
 * measured shape of this work" — and a five-second MiniMax H3 clip walked straight through it. The
 * number was never a fact about anything: it was a guess about the slowest thing anybody would ask
 * for, made before the app could ask for video at all, and every model that lands makes it wronger.
 *
 * And it could only ever do harm. ComfyUI does not stop when this app stops waiting — the render
 * runs to completion and writes its file, and all the timeout achieved was to throw the answer
 * away and call twenty minutes of GPU a failure. What a person wants after twenty minutes is the
 * clip, or the ⏹ they pressed themselves. Both of those exist: `signal` is the queue's cancel, and
 * the poll logs every ten seconds so a long run is visibly a long run rather than a hang.
 */

/** How often to ask. A second is nothing against a render measured in minutes, and it is what
 *  keeps the ▶ queue's log honest about a run that is still going. */
const POLL_MS = 1_000

/**
 * WATCH THIS CLIENT'S SAMPLING, over ComfyUI's own socket. There is nothing to await — the answer
 * comes from `/history`; this only moves a bar.
 *
 * ⚠️ IT IS OPENED BEFORE THE GRAPH IS QUEUED, and that ordering is load-bearing. ComfyUI does not
 * broadcast progress: it sends it to the ONE socket registered under the `client_id` the prompt
 * was submitted with, and a message for a `client_id` with no socket yet is dropped on the floor.
 * Open it after the POST and the first steps of a short render are simply gone.
 *
 * The two message shapes, against ComfyUI 0.22.3: `progress` carries `{value, max}` for whatever
 * is sampling, and `executing` with `{node: null}` is the prompt finishing. `expect()` narrows to
 * one prompt id once the POST answers — the socket is already ours alone, so this only guards the
 * case where the same client id is somehow reused.
 *
 * ⚠️ EVERY FAILURE IS SWALLOWED ON PURPOSE. A render that worked must never be failed by the thing
 * that was drawing a line under it.
 */
function watch(
  base: string, clientId: string, on: (fraction: number | null) => void,
): { expect: (promptId: string) => void; close: () => void } {
  let want: string | null = null
  // ⚠️ HELD, NOT DROPPED, UNTIL THE POST ANSWERS. The socket is open before the prompt id exists,
  // so the first steps of a short render arrive with nothing to compare them against — dropping
  // them loses exactly the window this early-open was for, and accepting them blind would let a
  // neighbour's render move the bar. Held and replayed is the only version that does both.
  let held: (() => void)[] | null = []
  let sock: WebSocket | null = null
  try {
    const url = new URL(base)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    url.pathname = `${url.pathname.replace(/\/$/, '')}/ws`
    url.searchParams.set('clientId', clientId)
    sock = new WebSocket(url)
  } catch {
    return { expect: () => {}, close: () => {} }
  }
  const live = sock
  live.addEventListener('error', () => {})
  live.addEventListener('message', (ev) => {
    if (typeof ev.data !== 'string') return
    try {
      const msg = JSON.parse(ev.data) as { type?: string; data?: Record<string, unknown> }
      const data = msg.data ?? {}
      const id = data['prompt_id']
      const apply = (): void => {
        if (typeof id === 'string' && id !== want) return
        if (msg.type === 'progress') {
          const value = Number(data['value'])
          const max = Number(data['max'])
          if (Number.isFinite(value) && Number.isFinite(max) && max > 0) {
            on(Math.min(1, Math.max(0, value / max)))
          }
          return
        }
        // The last thing a finished prompt says. Held at 1 rather than cleared, so the row does
        // not flick back to empty between the final step and the file arriving.
        if (msg.type === 'executing' && data['node'] === null) on(1)
      }
      if (held) held.push(apply)
      else apply()
    } catch { /* a message shape we do not speak is not our business */ }
  })
  return {
    expect: (promptId: string) => {
      want = promptId
      const waiting = held ?? []
      held = null
      for (const fn of waiting) fn()
    },
    close: () => { try { live.close() } catch { /* already gone */ } },
  }
}

/** One saved file, as every ComfyUI save node reports it. */
interface Saved {
  readonly filename: string
  readonly subfolder: string
  readonly type: string
}

const isSaved = (v: unknown): v is Saved =>
  Boolean(v) && typeof v === 'object'
  && typeof (v as Saved).filename === 'string' && typeof (v as Saved).subfolder === 'string'

/**
 * WHAT ONE NODE SAVED, whatever it called the list.
 *
 * ⚠️ THE KEY IS NOT PREDICTABLE AND MUST NOT BE DECLARED. `SaveAudioMP3` reports under `audio`,
 * `SaveGLB` under `3d`, `SaveImage` under `images`, and a custom node reports under whatever its
 * author typed. Every one of them holds the SAME three fields, because that is what `/view` takes —
 * so the shape is the thing to look for, and the key is the thing to ignore.
 */
function savedIn(outputs: unknown): Saved[] {
  const found: Saved[] = []
  for (const value of Object.values((outputs ?? {}) as Record<string, unknown>)) {
    if (Array.isArray(value)) found.push(...value.filter(isSaved))
  }
  return found
}

/** `<node>.<input>`, split. The parser already refused anything else. */
const holeAt = (where: string): [string, string] => {
  const dot = where.indexOf('.')
  return [where.slice(0, dot), where.slice(dot + 1)]
}

/** The extension the service answered with, lower-cased and without the dot. */
const extOf = (filename: string): string => filename.slice(filename.lastIndexOf('.') + 1).toLowerCase()

async function ask(
  base: string, path: string, init: RequestInit & { signal: AbortSignal | null },
): Promise<Response> {
  const answer = await fetch(`${base}${path}`, init)
  if (!answer.ok) {
    throw new Error(`ComfyUI answered ${answer.status} to ${path}: `
      + `${(await answer.text()).slice(0, 400)}`)
  }
  return answer
}

/**
 * Put a picture where a `LoadImage` node can see it.
 *
 * ⚠️ AN ATTACHMENT IS A SECOND ROUND TRIP HERE, and there is no way around it: a graph names its
 * image by FILENAME, in ComfyUI's own input folder, so the picture has to exist there before the
 * graph is queued. `/upload/image` is that, and what comes back is the name the node must be given
 * — which may not be the name that was sent, because ComfyUI renames a collision rather than
 * overwriting somebody's file.
 */
async function upload(
  base: string, bytes: Buffer, filename: string, signal: AbortSignal | null,
): Promise<string> {
  const form = multipart({ overwrite: 'false' }, 'image', filename, bytes)
  const answer = await ask(base, '/upload/image', {
    method: 'POST',
    headers: { 'content-type': form.contentType },
    body: new Uint8Array(form.body),
    signal,
  })
  const said = await answer.json() as { name?: string; subfolder?: string }
  if (!said.name) throw new Error('ComfyUI took the picture and did not say what it called it')
  return said.subfolder ? `${said.subfolder}/${said.name}` : said.name
}

/**
 * Whatever the graph said, with the holes filled. Never the published object — a graph mutated in
 * place would carry this press's prompt into the next one.
 *
 * ⚠️ AND IT HANDS BACK WHAT EVERY HOLE ENDED UP AT, not only the ones it wrote (2026-08-31). The
 * record used to carry the bag the APP SENT, so a song pressed with nothing typed recorded nothing:
 * no tempo, no key, no language, no cfg — and "what was this made at?" had no answer anywhere on
 * the machine, for exactly the presses where the answer was least guessable. The values are already
 * here, in the nodes, at the addresses the holes name; reading them back costs one lookup and makes
 * the master self-describing whether or not anybody touched a control.
 */
function fill(
  graph: Graph, values: Readonly<Record<string, ParamValue>>, log?: (line: string) => void,
): { nodes: Record<string, unknown>; resolved: Params } {
  const nodes = structuredClone(graph.nodes) as Record<string, Record<string, unknown>>
  const resolved: Record<string, ParamValue> = {}
  for (const [key, hole] of Object.entries(graph.holes ?? {})) {
    const value = values[key]
    // A hole with nothing to put in it is not an error: the graph's own value is a working one,
    // which is exactly why a published workflow can expose a knob this app has not learned yet.
    // One word, one node, usually — and several when a graph states the same fact twice, which
    // ACE-Step does with its length. `holeTargets` is what makes the short and long hole forms
    // indistinguishable from here: this adapter writes a value at an address, and a declaration
    // about what the value may BE is somebody else's business (src/inference/knobs.ts).
    for (const where of holeTargets(hole)) {
      const [id, input] = holeAt(where)
      const inputs = nodes[id]?.['inputs']
      if (!inputs || typeof inputs !== 'object') {
        throw new Error(`node ${id} of this workflow's graph has no inputs to put ${key} in`)
      }
      if (value !== undefined) {
        ;(inputs as Record<string, unknown>)[input] = value
        log?.(`${key} → ${where}`)
      }
    }
    // ⚠️ READ BACK FROM THE FIRST TARGET, WRITTEN OR NOT. A word filling several nodes fills them
    // with one value by construction, so one address is the answer — and a wire (`["109", 0]`,
    // meaning "whatever that node produced") is not a value and is left out rather than recorded
    // as an array nobody can read.
    const first = holeTargets(hole)[0]
    if (!first) continue
    const [id, input] = holeAt(first)
    const at = (nodes[id]?.['inputs'] as Record<string, unknown> | undefined)?.[input]
    if (typeof at === 'string' || typeof at === 'number' || typeof at === 'boolean') resolved[key] = at
  }
  return { nodes, resolved }
}

export const adapter: Adapter = {
  async render(input: RenderInput): Promise<RenderOutput> {
    const { row, params, prompt, refs = [], workflow, log, progress, signal } = input
    const transport = row.transport
    if (transport?.kind !== 'comfy') {
      throw new Error(`${row.id} is not a ComfyUI endpoint`)
    }
    const graph = workflow?.graph
    if (!graph) {
      // The one thing this adapter cannot do without, and the message says where it comes from:
      // a ComfyUI workflow is a graph, and a graph arrives from the library.
      throw new Error(`${workflow?.slug ?? 'this workflow'} carries no graph — a ComfyUI workflow is one,`
        + ' and 📚 is where they come from')
    }

    const base = `${transport.tls ? 'https' : 'http'}://${transport.host}:${transport.port}`
      + `${transport.basePath ?? ''}`
    // ⏹ and nothing else. See the note at the top of this file.
    const until = signal ?? null

    // The seed is recorded whether or not the graph takes one: a run nobody can reproduce is worse
    // than a number that turned out to be ignored, and the record says which workflow it belongs to.
    const seed = typeof params['seed'] === 'number' ? params['seed'] : randomSeed()
    const values: Record<string, ParamValue> = { ...params, seed, ...(prompt ? { prompt } : {}) }

    for (const ref of refs) {
      if (!graph.holes?.[ref.role]) continue
      const name = await upload(base, ref.image.data, `${ref.role}.png`, until)
      log?.(`uploaded ${ref.asset} as ${name}`)
      values[ref.role] = name
    }

    const { nodes, resolved } = fill(graph, values, log)
    const clientId = `xokolat-${Date.now().toString(36)}`
    log?.(`queueing ${Object.keys(nodes).length} nodes at ${base}`)

    // Opened first — see `watch`: a progress message for a client id with no socket is dropped.
    const bar = watch(base, clientId, (f) => progress?.(f))
    let ran: { status?: { status_str?: string; messages?: unknown }; outputs?: unknown } | undefined
    let id = ''
    try {
      const queued = await ask(base, '/prompt', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: nodes, client_id: clientId }),
        signal: until,
      }).then((a) => a.json() as Promise<{ prompt_id?: string; node_errors?: unknown }>)
      if (!queued.prompt_id) {
        // ⚠️ THE NODE ERRORS ARE THE MESSAGE. "400" says nothing; "node 105 wants a clip_name1 it
        // does not have" is the sentence that tells somebody which model to go and download.
        throw new Error(`ComfyUI would not take this graph: ${JSON.stringify(queued.node_errors)}`)
      }
      id = queued.prompt_id
      bar.expect(id)

      // ⚠️ ASKED BEFORE THE FIRST SLEEP, not after. A graph on a warm model can finish in less than
      // a second, and a loop that sleeps first charges every render a second it did not spend
      // working.
      for (let waited = 0; !ran; waited += POLL_MS) {
        if (until?.aborted) throw new Error(`${row.id} was stopped`)
        const history = await ask(base, `/history/${id}`, { signal: until })
          .then((a) => a.json() as Promise<Record<string, typeof ran>>)
        ran = history[id]
        if (ran) break
        // Every ten seconds, not every second: a log tail that says "still going" sixty times a
        // minute is a log tail nobody reads.
        if (waited % 10_000 === 0) log?.(`still running (${waited / 1000}s)`)
        await new Promise((r) => setTimeout(r, POLL_MS))
      }
    } finally {
      bar.close()
    }
    if (ran.status?.status_str === 'error') {
      throw new Error(`ComfyUI could not run this graph: ${JSON.stringify(ran.status.messages).slice(0, 600)}`)
    }

    const outputs = (ran.outputs ?? {}) as Record<string, unknown>
    const made = savedIn(outputs[graph.out])
    if (!made.length) {
      // Named, so the fix is obvious: the graph ran, and the node the workflow pointed at is not the
      // one that wrote anything.
      throw new Error(`node ${graph.out} saved nothing — the workflow points at the wrong node, or `
        + `${Object.keys(outputs).join(', ') || 'none of them'} saved instead`)
    }
    const file = made[0]!
    const got = await ask(base, `/view?${new URLSearchParams({
      filename: file.filename, subfolder: file.subfolder, type: file.type || 'output',
    })}`, { signal: until })
    const data = Buffer.from(await got.arrayBuffer())
    log?.(`got ${file.filename}, ${Math.round(data.length / 1024)} kB`)

    return {
      // ⚠️ THE CONTAINER COMES OFF THE FILENAME, NOT OFF A DECLARATION. The graph chose it — the
      // save node did — and `writeMaster` refuses one that disagrees with the medium's master
      // extension, which is how a graph that quietly writes flac where an mp3 goes gets caught in
      // one sentence rather than in an export three days later.
      asset: { kind: 'bytes', data, ext: extOf(file.filename) },
      model: workflow?.model ?? null,
      workflow: workflow?.slug ?? null,
      // ⚠️ NULL WHEN THE GRAPH TOOK NO SEED, and that is not a detail. A recorded seed is a promise
      // that re-running with it lands in the same place; a graph with no seed hole runs on whatever
      // number was saved into it, and every press is identical rather than reproducible. Saying
      // `null` is the honest version of "nothing here was random".
      seed: graph.holes?.['seed'] ? seed : null,
      params: used(resolved),
    }
  },
}

/**
 * WHAT THE GRAPH RAN AT. The seed comes out — it has a field of its own on the record, and two
 * copies of it is two places for the answer to "what made this" to disagree.
 *
 * ⚠️ IT TAKES `fill`'s READ-BACK, NOT THE REQUEST'S BAG (2026-08-31). The bag is what the app SENT,
 * and an unset knob is not sent — so a press with nothing typed recorded nothing about itself. It
 * also carried keys that are nobody's hole here (an image size on a song, a negative on a mesh),
 * which the graph never saw. The read-back is exactly the holes this workflow declares, at the values
 * they held when it was queued: what happened, rather than what was asked for.
 */
function used(params: Params): Params {
  const out: Record<string, ParamValue> = { ...params }
  delete out['seed']
  return out
}
