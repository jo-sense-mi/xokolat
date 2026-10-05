// Pixels IN — the one place bytes on disk (or bytes off the wire) become the `RawImage` an
// adapter and `writeMaster` both speak.
//
// The mirror of src/content/master.ts, which is pixels OUT. Both are `sharp`; neither is allowed
// to be re-implemented at a call site, because "how do we decode an image" having two answers is
// how one of them ends up not handling EXIF rotation.

import { readFile } from 'node:fs/promises'

import sharp from 'sharp'

import type { RawImage } from '../inference/adapter.ts'
import { resolveIn } from '../paths.ts'

/**
 * The longest edge an imported picture is kept at.
 *
 * ⚠️ NOT A SAFETY LIMIT — a judgement about what this library is for. An import is a REFERENCE:
 * something an engine will start from at 1024 or 1536. A 6000px phone photo stored losslessly is
 * forty megabytes of detail that every downstream step immediately throws away, and it makes the
 * gallery that lists it crawl.
 */
export const MAX_IMPORT_EDGE = 2048

/**
 * Bytes → raw planes.
 *
 * `rotate()` with no argument applies the EXIF orientation and drops the tag — without it a photo
 * taken in portrait arrives sideways, and every render from it is sideways too.
 */
export async function decodePixels(
  bytes: Buffer, { maxEdge = 0 }: { maxEdge?: number } = {},
): Promise<RawImage> {
  const pipeline = sharp(bytes, { failOn: 'error' }).rotate()
  const sized = maxEdge
    ? pipeline.resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
    : pipeline
  const { data, info } = await sized.raw().toBuffer({ resolveWithObject: true })
  if (info.channels !== 1 && info.channels !== 3 && info.channels !== 4) {
    throw new Error(`that image has ${info.channels} channels, which is not something we read`)
  }
  return { data, width: info.width, height: info.height, channels: info.channels }
}

/** One asset in the library, by its content-root-relative path — resolved against the root first,
 *  because that path came from the browser (§15 rule 2). */
export async function readPixels(root: string, rel: string): Promise<RawImage> {
  return decodePixels(await readFile(resolveIn(root, rel)))
}
