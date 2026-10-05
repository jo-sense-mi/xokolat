// Writing a master — the one place an asset is created, and therefore the one place provenance
// is written (PLAN §4). No builder ever thinks about it: removing the agent removed the
// boilerplate, and this function is why.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, extname } from 'node:path'

import sharp from 'sharp'
import type { WebpOptions } from 'sharp'

import type { Rendered } from '../inference/adapter.ts'
import { resolveIn } from '../paths.ts'
import { fromXmp, toXmp } from '../provenance/xmp.ts'
import type { Provenance } from '../types/provenance.ts'

/**
 * WebP, always — alpha (which stickers will need), a fraction of PNG's bytes, and every browser
 * renders it as-is, which is what lets one gallery card serve every medium. One extension at
 * every level, so nothing downstream — the index, `/content/…`, the gallery, exports — ever
 * branches on how a master was encoded.
 *
 * ⚠️ WHAT A LEVEL MEANS FOR IMAGES lives here, and the LEVELS themselves live in
 * `src/types/quality.ts`. Measured on one 1024² render: balanced ~112 kB, exact ~623 kB, and PNG
 * would be 1133 kB — which is why PNG is never a stored format. What `balanced` costs is
 * exactness: a second lossy pass moves 31.6% of channel values (max delta 9), which matters for
 * line art and for anything a cutout will flood-fill, and not at all for the common case.
 *
 * effort 4 for both: 6 buys ~1% of bytes for double the encode, against a render that takes
 * seconds.
 *
 * An unknown level falls back to `balanced` rather than throwing — a master that exists and is
 * slightly larger than intended beats a job that died on a settings string.
 *
 * PNG is a BOUNDARY format, not a stored one: the clipboard takes it, LINE and KDP require it.
 * Exports converting to PNG is the export layer doing its job, not a second master.
 */
// ⚠️ THE KEYS ARE THE LEVEL IDS (src/types/quality.ts) and they say what they do — `webp-q92` is
// literally `quality: 92`. They were `balanced` and `exact`, and the gap between an adjective and
// the encoder setting under it is a gap somebody has to go and read the source to close.
const IMAGE_ENCODERS: Record<string, WebpOptions> = {
  'webp-q92': { quality: 92, effort: 4 },
  lossless: { lossless: true, effort: 4 },
}

/**
 * THE RECORD FOR A MASTER THAT CANNOT HOLD ONE — `<stem>.gen.json` beside it.
 *
 * ⚠️ A SIDECAR IS A COMPROMISE AND IT IS WORTH NAMING AS ONE. A WebP carries its own provenance in
 * XMP, so the file IS the record and the two cannot be separated by a copy, a move or a download.
 * An mp3 has ID3 and a `.glb` has almost nothing, and writing a record into either would mean two
 * embedders, two readers and two ways for the answer to "what made this" to drift. One sidecar,
 * one shape, one reader — and the honest cost is that dragging the mp3 somewhere leaves the record
 * behind.
 *
 * Stem-named, not `<file>.json`: it sorts beside its master and it is what the factory's
 * `<stem>.gen.yaml` already taught us to read.
 */
const sidecarFor = (file: string): string => `${file.slice(0, -extname(file).length)}.gen.json`

/**
 * Write one master at `<root>/<rel>` with `provenance` attached — embedded for pixels, beside it
 * for everything else.
 *
 * ⚠️ ONE PASS, for the image case. `sharp` cannot write metadata in place, so adding a field later
 * means piping the file through `sharp` again and re-encoding the pixels — generation loss on every
 * master (PLAN §6). Everything the record holds, tags included, is known before this is called.
 *
 * ⚠️ The ENCODER comes from `provenance.quality`, not from a second argument. A level beside the
 * record is a level that can disagree with it, and "how was this written?" would then have two
 * answers. One field decides the encoding AND describes it.
 *
 * ⚠️ AND BYTES ARE WRITTEN AS THEY ARRIVED. The engine already chose the container; a second
 * encode here would be lossy for no gain, and `quality` is a fact about what was ASKED for.
 */
export async function writeMaster(
  root: string, rel: string, asset: Rendered, provenance: Provenance,
): Promise<{ path: string; bytes: number }> {
  // `resolveIn` is what makes the path safe; `dirname` of its RESULT is then safe by
  // construction — asking `resolveIn` for `..` would (correctly) refuse to leave the root.
  const file = resolveIn(root, rel)
  await mkdir(dirname(file), { recursive: true })

  if (asset.kind === 'image') {
    const info = await sharp(asset.image.data, {
      raw: {
        width: asset.image.width, height: asset.image.height, channels: asset.image.channels,
      },
    })
      .withXmp(toXmp(provenance))
      .webp(IMAGE_ENCODERS[provenance.quality] ?? IMAGE_ENCODERS['webp-q92'])
      .toFile(file)
    return { path: file, bytes: info.size }
  }

  // ⚠️ THE EXTENSION IS THE MEDIUM'S, AND THE ENGINE HAS TO AGREE WITH IT. `MASTER_EXT` already
  // decided this run writes an `.mp3`; an adapter answering `wav` is a bug, and writing those bytes
  // under an mp3 name would hide it in a file that plays until something reads its header.
  const want = extname(file).slice(1).toLowerCase()
  if (asset.ext.toLowerCase() !== want) {
    throw new Error(
      `${provenance.provider} answered with ${asset.ext} where a ${want} master goes`)
  }
  await writeFile(file, asset.data)
  await writeFile(sidecarFor(file), `${JSON.stringify(provenance, null, 2)}\n`)
  return { path: file, bytes: asset.data.length }
}

/**
 * Read a master's embedded record back.
 *
 * ⚠️ METADATA ONLY — the pixels are never decoded, which is what makes reading a folder of them
 * affordable. Null for anything that is not ours, or that `sharp` will not open: the index walks
 * every file on disk, most of which it did not write.
 *
 * The one reader, because the record is the one source of truth about an asset (PLAN §4). A
 * second place that opened a master and pulled fields out of the XMP would be a second answer to
 * "what made this", and the first time they disagreed the honest one would lose.
 */
export async function readMaster(file: string): Promise<Provenance | null> {
  // ⚠️ WHICH READER IS DECIDED BY THE EXTENSION, and that is not a guess: `MASTER_EXT` (run.ts)
  // decided what this file is called when it was written, so the name and the record's location
  // were chosen by the same rule. Only a WebP carries its own.
  if (extname(file).toLowerCase() !== '.webp') {
    try {
      const parsed: unknown = JSON.parse(await readFile(sidecarFor(file), 'utf-8'))
      // The one shape check worth making: the index walks every file on disk and a stray `.json`
      // that happens to sit where a sidecar goes must read as "not ours", not as an asset.
      return parsed && typeof parsed === 'object' && 'modality' in parsed
        ? parsed as Provenance
        : null
    } catch {
      return null
    }
  }
  try {
    return fromXmp((await sharp(file).metadata()).xmp)
  } catch {
    return null
  }
}
