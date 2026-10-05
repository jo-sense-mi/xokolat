// Serving files — the front end from the install root, and (later) masters from the content
// root. One module, because there is exactly one rule that matters and it must not be written
// twice: RESOLVE AGAINST A ROOT, THEN VERIFY (PLAN §15 rule 2).

import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { extname } from 'node:path'

import { PathEscapeError, resolveIn } from '../paths.ts'

/** Only what this app actually serves. An unknown extension gets a byte stream rather than a
 *  guess — a wrong content type is how a `.glb` ends up rendered as text. */
const TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  // ⚠️ EVERY MASTER THIS APP WRITES HAS TO BE IN THIS TABLE. `MASTER_EXT` (src/content/run.ts)
  // names four — webp, mp3, glb, mp4 — and mp4 was the one missing, so every clip a video model
  // scored went out as `application/octet-stream` and played only because the browser sniffed the
  // container behind our back. Add the row when a medium's master extension changes.
  '.mp4': 'video/mp4',
  '.glb': 'model/gltf-binary',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
}

export const contentType = (file: string): string =>
  TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream'

/** ⚠️ `Cache-Control: no-cache` on EVERYTHING (PLAN §14). A regenerated master keeps its path,
 *  and with only `Last-Modified` a browser serves the stale image for hours. Costs a bodyless
 *  304; learned the hard way in the factory. */
export const NO_CACHE = 'no-cache'

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body, null, 2) + '\n'
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': NO_CACHE,
  })
  res.end(text)
}

export function sendText(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': NO_CACHE,
  })
  res.end(body)
}

/**
 * WHICH SLICE OF THE FILE WAS ASKED FOR — `null` for the whole thing, `false` for a range that
 * cannot be satisfied.
 *
 * ⚠️ ONE RANGE, AND ONLY `bytes`. A multipart answer is a `multipart/byteranges` body with its
 * own boundaries, and no player has ever needed one: what a media element sends is
 * `bytes=<n>-` while it seeks and `bytes=0-` on the second pass. A header we do not understand
 * is ignored rather than refused, which is exactly what the spec asks for.
 */
export function rangeOf(header: string | undefined, size: number): { start: number; end: number } | null | false {
  const m = /^bytes=(\d*)-(\d*)$/.exec((header ?? '').trim())
  if (!m) return null
  const [, from, to] = m
  // `bytes=-500` is the LAST 500 bytes, not "from the start to 500". Getting this backwards
  // serves the wrong half of the file with a 206 on it, which nothing downstream can detect.
  const start = from ? Number(from) : Math.max(0, size - Number(to || 0))
  const end = from ? (to ? Math.min(Number(to), size - 1) : size - 1) : size - 1
  if (!from && !to) return false
  if (start > end || start >= size) return false
  return { start, end }
}

/**
 * Serve `urlPath` from under `root`. Returns false when there is nothing to serve, so the
 * caller decides what a miss means (a 404, or the next handler).
 *
 * The URL is decoded, stripped of its query, and resolved against the root — a request for
 * `/../../.ssh/id_rsa` resolves outside and is refused, not served.
 *
 * ⚠️ IT ANSWERS A `Range`, AND A MEDIA FILE IS WHY (2026-08-22). Without it every response was a
 * 200 with the whole body and no `accept-ranges`, and a browser given that CANNOT SEEK — Safari
 * and Chrome both stop an <audio> element at whatever arrived in the first buffer, so a two-minute
 * song played for twelve seconds and then sat there looking finished. Nothing was wrong with the
 * mp3; the server had told the player there was no way to ask for the rest of it. `req` is
 * therefore not optional-for-convenience — a caller that omits it serves whole files forever.
 */
export async function serveFile(
  res: ServerResponse, root: string, urlPath: string,
  { index = 'index.html', req = undefined as IncomingMessage | undefined } = {},
): Promise<boolean> {
  let rel: string
  try {
    rel = decodeURIComponent(urlPath.split('?')[0] ?? '').replace(/^\/+/, '')
  } catch {
    return false // a malformed percent-escape is not a path
  }
  if (rel === '' || rel.endsWith('/')) rel += index

  let file: string
  try {
    file = resolveIn(root, rel)
  } catch (err) {
    if (err instanceof PathEscapeError) return false
    throw err
  }

  let info
  try {
    info = await stat(file)
  } catch {
    return false
  }
  if (!info.isFile()) return false

  const common = {
    'content-type': contentType(file),
    'cache-control': NO_CACHE,
    'last-modified': info.mtime.toUTCString(),
    // ⚠️ ON EVERY ANSWER, not only on a partial one. This header is how a player learns it may
    // seek at all; a 200 without it means "this is the whole thing and there is no more to ask
    // for", which is what silently broke playback.
    'accept-ranges': 'bytes',
  }
  const slice = rangeOf(req?.headers.range, info.size)
  if (slice === false) {
    // 416, and it says the size — which is the one thing that lets a client ask again correctly.
    res.writeHead(416, { ...common, 'content-range': `bytes */${info.size}`, 'content-length': 0 })
    res.end()
    return true
  }

  const { start, end } = slice ?? { start: 0, end: info.size - 1 }
  res.writeHead(slice ? 206 : 200, {
    ...common,
    'content-length': end - start + 1,
    ...(slice ? { 'content-range': `bytes ${start}-${end}/${info.size}` } : {}),
  })
  const stream = createReadStream(file, slice ? { start, end } : {})
  stream.on('error', () => res.destroy())
  stream.pipe(res)
  return true
}
