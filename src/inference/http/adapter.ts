// THE PLAIN-HTTP ADAPTER — a picture in, a picture out, and every detail of the call declared in
// the registry (`transport.call`, src/types/inference.ts).
//
// ⚠️ WHY THIS IS GENERIC AND NOT "THE REMBG ADAPTER" (2026-08-12). Background removal was going to
// be the first non-gRPC service and the obvious way to ship it was a `rembg` module. That would
// have bought one tool and paid for it with a release every time someone runs a different one. The
// shape is the same for all of them: POST a picture somewhere, get a picture back. So the SHAPE is
// the code and the tool is a registry row — nothing about rembg appears in this source tree, and
// the ＋ service form can add it in four fields.
//
// ⚠️ WHAT IT SENDS IS THE WORKFLOW'S KNOBS, NOT THE REQUEST'S. The merged params a render carries are
// full of things that mean nothing here — width, height, seed, steps, the composer's defaults — and
// posting them at a stranger's endpoint is how a cutout ends up with a `cfg` field. What travels is
// the checkpoint the workflow names (as `model`, the word every one of these tools uses) plus the
// knobs the workflow itself declares. Anything else is a hand-edit away in the registry.
//
// ⚠️ AND IT WRITES MULTIPART BUT NEVER PARSES IT. The app's own upload endpoint takes raw bytes
// with the name in a header, deliberately (no boundary parser, no dependency). Writing one is
// twelve lines and is what the tools on the other end expect — and it moved to `../multipart.ts`
// the moment a second adapter needed one (ComfyUI uploads a picture before it queues a graph).

import { Buffer } from 'node:buffer'

import sharp from 'sharp'

import { decodePixels } from '../../content/pixels.ts'
import type { HttpCall } from '../../types/inference.ts'
import type { ParamValue } from '../../types/request.ts'
import type { Adapter, RenderInput, RenderOutput } from '../adapter.ts'
import { multipart } from '../multipart.ts'

/**
 * ⚠️ THERE IS NO DEADLINE ON A RENDER HERE EITHER (2026-09-04). This was ninety seconds, on the
 * reasoning that a cutout is tens of seconds and a longer wait "is a service that is not coming
 * back". A service that is not coming back is what `src/inference/health.ts` is for, and it has its
 * own short timeout because a liveness probe SHOULD have one. A render is not a probe: the only
 * number that would be right is the length of the work, which nobody knows before it is done, and
 * a wrong one throws away an answer that was on its way.
 *
 * ⏹ is the cancel. It is the person's, and it is the only one.
 */

/** The picture out of an answer, whichever of the two shapes it came in. */
function pictureFrom(call: HttpCall, body: Buffer): Buffer {
  if (call.receive === 'image') return body
  let parsed: unknown
  try {
    parsed = JSON.parse(body.toString('utf-8'))
  } catch {
    throw new Error('that service answered with something that is not JSON, and JSON was declared')
  }
  const at = (parsed as Record<string, unknown>)?.[call.jsonField ?? '']
  if (typeof at !== 'string' || !at) {
    throw new Error(`its answer has no ${JSON.stringify(call.jsonField)} holding a picture`)
  }
  // A `data:` prefix is what half of these endpoints send, and stripping it is not a guess.
  return Buffer.from(at.replace(/^data:[^,]*,/, ''), 'base64')
}

export const adapter: Adapter = {
  async render(input: RenderInput): Promise<RenderOutput> {
    const { row, params, refs = [], workflow, log, signal } = input
    const transport = row.transport
    const call = transport?.kind === 'http' ? transport.call : undefined
    if (transport?.kind !== 'http' || !call) {
      throw new Error(`${row.id} has no call shape — say what one request looks like in 🔌 settings`)
    }
    const picture = refs[0]
    if (!picture) throw new Error(`${row.id} works on a picture, and nothing was attached`)

    // PNG on the way out: lossless, alpha-capable, and the one format every one of these tools
    // reads. What comes back becomes a master in the app's own format like any other render.
    const png = await sharp(picture.image.data, {
      raw: {
        width: picture.image.width,
        height: picture.image.height,
        channels: picture.image.channels,
      },
    }).png({ compressionLevel: 6 }).toBuffer()

    const fields: Record<string, ParamValue> = {
      ...(workflow?.params ?? {}),
      ...(workflow?.model ? { model: workflow.model } : {}),
    }
    const base = `http://${transport.host}:${transport.port}`
      + `${transport.basePath ?? ''}${call.path}`

    let body: Buffer
    const headers: Record<string, string> = {}
    if (call.send === 'form') {
      const made = multipart(fields, call.field ?? 'file', 'picture.png', png)
      body = made.body
      headers['content-type'] = made.contentType
    } else {
      body = png
      headers['content-type'] = 'image/png'
    }
    // With the picture AS the body there is nowhere for a field to ride but the query string.
    const query = call.send === 'body' && Object.keys(fields).length
      ? `?${new URLSearchParams(Object.entries(fields).map(([k, v]) => [k, String(v)]))}`
      : ''

    log?.(`${call.method} ${base}${query} (${Math.round(png.length / 1024)} kB)`)
    const answer = await fetch(`${base}${query}`, {
      method: call.method,
      headers,
      // A Buffer IS a Uint8Array, which is what `fetch` takes; the DOM lib that names the union is
      // not loaded here (this is a server with no DOM, deliberately).
      body: new Uint8Array(body),
      signal: signal ?? null,
    })
    if (!answer.ok) {
      // ⚠️ A 403 ON A LOCAL PORT IS USUALLY NOT THIS SERVICE (2026-08-31). rembg sits on
      // 127.0.0.1:7000 and macOS AirPlay Receiver listens on *:7000, so the moment the daemon is
      // between lives the wildcard listener takes the request and refuses it — and the app said
      // `rembg answered 403`, which sent somebody looking for a permission rembg does not have.
      // Whatever answered usually names itself in `server`, and that header is the diagnosis.
      const who = answer.headers.get('server')
      const squatter = (answer.status === 403 || answer.status === 401)
        ? ` — ${who ? `something calling itself ${who}` : 'something else'} is holding`
          + ` ${transport.host}:${transport.port}; ${row.id} is probably not running`
        : ''
      throw new Error(`${row.id} answered ${answer.status}${squatter}: `
        + `${(await answer.text()).slice(0, 200)}`)
    }
    const image = await decodePixels(pictureFrom(call, Buffer.from(await answer.arrayBuffer())))
    log?.(`got ${image.width}×${image.height}, ${image.channels} channels`)

    return {
      asset: { kind: 'image', image },
      model: workflow?.model ?? null,
      workflow: workflow?.slug ?? null,
      // ⚠️ NULL, NOT 0. Nothing here is random, so there is no number that would reproduce it, and
      // `0` is a seed someone could try to render with.
      seed: null,
      params,
    }
  },
}
