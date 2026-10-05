// WRITING MULTIPART, AND NEVER PARSING IT.
//
// ⚠️ THE APP'S OWN UPLOAD ENDPOINT TAKES RAW BYTES with the name in a header, deliberately: no
// boundary parser, no dependency, nothing to get wrong on the side of the wire where a stranger is
// talking. This is the other direction — what the tools out there expect — and writing it is
// twelve lines.
//
// ⚠️ IT LIVES HERE BECAUSE TWO ADAPTERS SEND ONE (2026-08-17). The plain-http adapter posts a
// picture to a small tool; the ComfyUI adapter posts one to `/upload/image` before it queues a
// graph. Two copies of a boundary writer is two places for a `\r\n` to go missing, and the symptom
// is not an error — it is a service that reads the field as empty and does the default thing.

import { Buffer } from 'node:buffer'

/** One form. Fields first, then exactly one file — which is what every one of these endpoints
 *  takes, and the shape both callers wanted. */
export function multipart(
  fields: Record<string, string | number | boolean>,
  name: string, filename: string, bytes: Buffer,
  contentType = 'image/png',
): { body: Buffer; contentType: string } {
  const boundary = `xk${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`
  const parts: Buffer[] = []
  for (const [key, value] of Object.entries(fields)) {
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${String(value)}\r\n`))
  }
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}";`
    + ` filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`))
  parts.push(bytes, Buffer.from(`\r\n--${boundary}--\r\n`))
  return {
    body: Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${boundary}`,
  }
}
