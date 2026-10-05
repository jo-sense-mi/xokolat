// IMPORT — bringing a picture the app did not make into the library.
//
// ⚠️ AN UPLOAD IS JUST AN IMPORTED ASSET (src/types/request.ts, on `Reference`). That sentence is
// the whole design: a reference points at an ASSET, so "upload one" and "pick one you already
// have" are not two features — the first is how something gets into the list the second reads.
//
// So an import lands in the library exactly like a render: a run folder, a master with provenance
// embedded, a rating key. It is findable, starrable, deletable and re-referencable, and the
// gallery needs no idea that it was not rendered. What says it was not is its provenance:
// `provider: "import"`, and no model, prompt or seed to name.

import { writeMaster } from './master.ts'
import { decodePixels, MAX_IMPORT_EDGE } from './pixels.ts'
import { masterRel, mintRunId, writeRun } from './run.ts'
import type { Roots } from '../paths.ts'
import type { Medium } from '../types/medium.ts'
import type { Provenance } from '../types/provenance.ts'

/** The row id an imported asset is filed under. Not a service — nothing ran — but the index and
 *  the gallery group by "who answered", and "you did" is the honest answer. */
export const IMPORT_PROVIDER = 'import'

/** What the app will read. A magic-byte check rather than the filename or the browser's
 *  Content-Type: both of those are the sender's opinion, and this one opens the bytes. */
const MAGIC: readonly { readonly kind: string; readonly at: number; readonly bytes: readonly number[] }[] = [
  { kind: 'png', at: 0, bytes: [0x89, 0x50, 0x4e, 0x47] },
  { kind: 'jpeg', at: 0, bytes: [0xff, 0xd8, 0xff] },
  { kind: 'gif', at: 0, bytes: [0x47, 0x49, 0x46, 0x38] },
  { kind: 'webp', at: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
  { kind: 'tiff', at: 0, bytes: [0x49, 0x49, 0x2a, 0x00] },
  { kind: 'tiff', at: 0, bytes: [0x4d, 0x4d, 0x00, 0x2a] },
]

export function sniffImage(bytes: Buffer): string | null {
  for (const sig of MAGIC) {
    if (sig.bytes.every((b, i) => bytes[sig.at + i] === b)) return sig.kind
  }
  return null
}

export class ImportError extends Error {
  readonly status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'ImportError'
    this.status = status
  }
}

export interface Imported {
  readonly runId: string
  /** Content-root-relative — what a `Reference` names, and what `/content/…` serves. */
  readonly asset: string
  readonly width: number
  readonly height: number
}

/**
 * Write one uploaded file into the library.
 *
 * ⚠️ THE NAME IS SLUGIFIED INTO A RUN ID AND NEVER USED AS A PATH. `filename` came from a
 * browser; `mintRunId` is the same server-side minting a render goes through (§15 rule 2).
 *
 * ⚠️ WRITTEN AT THE `exact` LEVEL. An import is an INPUT — something a render will start from —
 * and re-encoding it lossily means every picture made from it inherits artifacts nobody chose.
 * The long edge is capped instead (src/content/pixels.ts), which is the cost that is worth paying.
 */
export async function importImage(
  roots: Roots, { bytes, filename, medium = 'image' as Medium }: {
    bytes: Buffer; filename: string; medium?: Medium
  },
): Promise<Imported> {
  if (medium !== 'image') throw new ImportError(`${medium} imports are not a thing yet`)
  if (!bytes.length) throw new ImportError('that upload was empty')
  const kind = sniffImage(bytes)
  if (!kind) throw new ImportError('that file is not an image this app can read')

  const stem = filename.replace(/\.[^./\\]+$/, '').split(/[/\\]/).pop() ?? 'import'
  let image
  try {
    image = await decodePixels(bytes, { maxEdge: MAX_IMPORT_EDGE })
  } catch (err) {
    throw new ImportError(`that ${kind} would not open: ${(err as Error).message}`)
  }

  const runId = mintRunId(stem)
  const rel = masterRel(medium, runId, IMPORT_PROVIDER, null)
  const createdAt = new Date().toISOString()
  const provenance: Provenance = {
    modality: medium,
    provider: IMPORT_PROVIDER,
    // Nothing made this, so there is nothing to name. Absent, never a placeholder string — the
    // provenance chip draws what is there. The same is true of the style: a file that arrived
    // from outside was not made in one, and saying so is not the same as not knowing.
    model: null,
    style: null,
    workflow: null,
    prompt: null,
    seed: null,
    params: {},
    tags: [],
    refs: [],
    runId,
    createdAt,
    durationMs: null,
    quality: 'lossless',
  }
  await writeMaster(roots.content, rel, { kind: 'image', image }, provenance)
  await writeRun(roots, {
    runId,
    medium,
    // The ASK for an import is where it came from — which is what the gallery prints under it.
    text: filename,
    style: null,
    inference: [IMPORT_PROVIDER],
    createdAt,
  })
  return { runId, asset: rel, width: image.width, height: image.height }
}
