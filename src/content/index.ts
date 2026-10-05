// THE INDEX — a DERIVED CACHE, and the honest cost of embedding provenance (PLAN §9).
//
// A sidecar could be read without touching the master; now a full rebuild opens EVERY file. So:
// persisted in app data, updated incrementally by mtime, and a full rebuild is an explicit
// action rather than something that happens on a page load. `sharp` reads metadata without
// decoding pixels, so a rebuild is fast — but it is not free and it is not a hot path.
//
// What it produces is `Manifest` (src/types/manifest.ts), which the lifted front end reads
// directly. That type is the contract; this file must serve it exactly.

import { readFile, readdir, stat, writeFile } from 'node:fs/promises'

import { audioSeconds } from './audio.ts'
import { readMaster } from './master.ts'
import { resolveIn } from '../paths.ts'
import type { Roots } from '../paths.ts'
import type {
  ChainCell, ChainGroup, Manifest, ManifestCell, ManifestGroup, Player,
} from '../types/manifest.ts'
import { MEDIA } from '../types/medium.ts'
import type { Medium } from '../types/medium.ts'
import type { ProvenanceIdentity } from '../types/provenance.ts'
import { styleParamFor } from '../styles/param.ts'
import { CHAIN_DIR, MASTER_EXT, MEDIA_DIR, RUN_FILE, chainRel, titleFrom } from './run.ts'
import type { RunRecord } from './run.ts'
import { CHAIN_FILE } from '../compositions/chain.ts'
import type { ChainRecord } from '../compositions/chain.ts'

export const INDEX_FILE = 'index.json'

/** One remembered master: everything the manifest needs, plus what says it is still current. */
interface CachedCell {
  readonly mtimeMs: number
  readonly cell: ManifestCell
}

/**
 * ⚠️ BUMP THIS WHENEVER `ManifestCell` CHANGES SHAPE.
 *
 * The cache holds whole cells, so a renamed or added field means every cached entry is the old
 * shape and mtime says nothing is stale — the front end then reads a field that is not there.
 * That happened once already (`engine` → `inference`, DECISIONS.md), and a version is the only
 * thing that makes it impossible rather than merely unlikely.
 */
const CACHE_VERSION = 11

interface CacheFile {
  readonly version: number
  readonly cells: Record<string, CachedCell>
}

type Cache = Record<string, CachedCell>

/** How the browser plays each medium. WHICH file is the master is `MASTER_EXT` in run.ts — the
 *  module that names files owns that, and a second copy here is a second thing to keep in step.
 *  ⚠️ `model3d` read `img` until 2026-08-17, which was a claim the browser cannot honour: a `.glb`
 *  is not a picture and an <img> pointed at one draws a broken box. See `PLAYERS`. */
const PLAYER: Record<Medium, Player> = {
  // ⚠️ `model3d` READ `file` UNTIL 2026-08-30, and that was true for exactly as long as nothing
  // here could draw one. A `.glb` is not a picture and an <img> pointed at one still draws a broken
  // box — but the browser can read the triangles out of it and render them (web/lib/glb.js,
  // mesh-view.js), so the honest answer is now a player of its own rather than a card with a glyph
  // on it. What `mesh` means to the front end: draw it once with WebGL2, keep the still.
  image: 'img', music: 'audio', sound: 'audio', voice: 'audio', model3d: 'mesh',
  video: 'video',
}

/** What a mesh's kept still is called, beside the master it was drawn from. One name, here, because
 *  the browser posts it (`/api/preview`) and the index looks for it and neither may guess. */
export const PREVIEW_SUFFIX = '.preview.png'

/** The still beside a master, if the browser has drawn one yet. `null` — never the master's own
 *  path — because a `.glb` under an <img> is the broken box this whole player exists to avoid. */
async function previewBeside(root: string, rel: string): Promise<string | null> {
  const at = `${rel.slice(0, rel.lastIndexOf('.'))}${PREVIEW_SUFFIX}`
  try {
    await stat(resolveIn(root, at))
    return at
  } catch {
    return null
  }
}

async function dirs(path: string): Promise<string[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true })
    return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort()
  } catch {
    return []
  }
}

async function files(path: string, ext: string): Promise<string[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true })
    return entries.filter((e) => e.isFile() && e.name.endsWith(ext)).map((e) => e.name).sort()
  } catch {
    return []
  }
}

async function readRunRecord(dir: string): Promise<RunRecord | null> {
  try {
    return JSON.parse(await readFile(resolveIn(dir, RUN_FILE), 'utf-8')) as RunRecord
  } catch {
    // A run folder with no record is content someone put there by hand. Indexed anyway: the
    // library is what is on disk, not what this app remembers making.
    return null
  }
}

/** Read one master's embedded record. Metadata only — the pixels are never decoded. */
async function readCell(
  root: string, rel: string, inference: string, medium: Medium,
): Promise<ManifestCell> {
  let gen: ProvenanceIdentity | null = null
  let tags: string[] = []
  let createdAt: string | null = null
  // Not an image, or one `sharp` will not open, reads as null. It still exists, so it still shows.
  const prov = await readMaster(resolveIn(root, rel))
  if (prov) {
    gen = {
      provider: prov.provider, model: prov.model, workflow: prov.workflow, style: prov.style,
      seed: prov.seed, createdAt: prov.createdAt, durationMs: prov.durationMs,
      quality: prov.quality,
      params: prov.params,
      // ⚠️ ONLY WHERE THE SENTENCE IS THE THING ITSELF. 🗣's prompt is the SCRIPT — the words that
      // were spoken — and without it the asset carries no text of its own at all. Everywhere else
      // the prompt is a description of what you are already looking at, and the run's `ask` says
      // it once already.
      ...(styleParamFor(medium) ? { prompt: prov.prompt } : {}),
    }
    tags = [...prov.tags]
    createdAt = prov.createdAt
  }
  // ⚠️ READ FROM THE FILE, ONCE, HERE. It is the same trade the record is: the index opens every
  // master anyway, and a fact about a file belongs where the file is open. The browser could ask
  // an <audio> element instead — and would have to fetch every song in the feed to find out.
  const seconds = PLAYER[medium] === 'audio' ? await audioSeconds(resolveIn(root, rel)) : null
  return {
    // ⚠️ THE SERVICE THAT ANSWERED, from the master's own record — not from the file name. A
    // master is called `<service>--<stem>.<ext>` so that two checkpoints on one ask cannot
    // overwrite each other, but that name is a LAYOUT detail. What the feed groups by is who
    // rendered it, which only the provenance knows.
    inference: prov?.provider ?? inference,
    path: rel,
    master: rel,
    // ⚠️ A MESH'S STILL IS A DIFFERENT FILE, and for every other medium the master IS its own
    // preview. The picture is drawn once in the browser and posted back (web/lib/mesh-thumb.js);
    // until it exists this is null, and the card renders the mesh itself to produce it.
    preview: PLAYER[medium] === 'mesh' ? await previewBeside(root, rel) : rel,
    // ⚠️ Stable, server-side, and derived from the asset's own path — a reshaped index must
    // never orphan a rating somebody gave.
    ratingKey: `${medium}:${rel}`,
    gen,
    tags,
    createdAt,
    seconds,
  }
}

/**
 * 🧩 EVERY CHAIN RUN ON DISK — `compositions/<slug>/<run>/`, and everything inside it.
 *
 * ⚠️ A RUN IS ONE CARD, WHATEVER IT MADE (2026-08-24). Inside a chain run each press has its own
 * folder named after the STEP it belongs to, holding the same `run.json` and the same masters a
 * media run holds — so the walk below is the media walk, one level deeper, and every cell is read
 * by the same `readCell` through the same mtime cache. What differs is only the shape it comes out
 * in: one group per RUN rather than one per press, because twelve candidates and the cut-out of the
 * one you chose are a single act.
 *
 * ⚠️ AND THE MEDIUM COMES OFF THE PRESS'S OWN RECORD. A chain is free to draw a picture, write a
 * brief and put a song under it; there is no medium the RUN is, which is exactly why `ChainCell`
 * carries one and `ChainGroup` does not.
 */
async function readChains(roots: Roots, cache: Cache, next: Cache): Promise<{
  chains: ChainGroup[]; read: number
}> {
  const out: ChainGroup[] = []
  let read = 0
  const root = resolveIn(roots.content, CHAIN_DIR)
  for (const composition of await dirs(root)) {
    for (const runId of await dirs(resolveIn(root, composition))) {
      const rel = chainRel(composition, runId)
      const dir = resolveIn(roots.content, rel)
      let record: ChainRecord
      try {
        record = JSON.parse(await readFile(resolveIn(dir, CHAIN_FILE), 'utf-8')) as ChainRecord
      } catch {
        // A folder with no record is not a run this app started. Skipped rather than guessed at:
        // there is no filename convention here to read a sentence out of.
        continue
      }

      const cells: ChainCell[] = []
      for (const step of await dirs(dir)) {
        const stepDir = resolveIn(dir, step)
        const press = await readRunRecord(stepDir)
        if (!press) continue
        const medium = press.medium
        const ext = `.${MASTER_EXT[medium] ?? ''}`
        for (const name of await files(stepDir, ext)) {
          const cellRel = `${rel}/${step}/${name}`
          let mtimeMs: number
          try {
            mtimeMs = (await stat(resolveIn(roots.content, cellRel))).mtimeMs
          } catch {
            continue
          }
          const cached = cache[cellRel]
          const base = cached && cached.mtimeMs === mtimeMs
            ? cached.cell
            : await readCell(
              roots.content, cellRel, name.slice(0, -ext.length).split('--')[0] ?? '', medium)
          if (!cached || cached.mtimeMs !== mtimeMs) read++
          next[cellRel] = { mtimeMs, cell: base }
          cells.push({
            ...base,
            // ⚠️ THE STEP OFF THE PRESS'S RECORD, NOT OFF THE FOLDER NAME. `founder` and
            // `founder-2` are two presses of ONE step, and the second is not a step called
            // "founder-2" (src/content/run.ts `freeRunId`).
            step: press.step ?? step,
            run: step,
            medium,
            player: PLAYER[medium],
          })
        }
      }
      // ⚠️ IN THE ORDER THEY WERE MADE. A chain is a sequence and its run reads as one — the brief
      // first, the twelve candidates, then the cut-out of the one that was chosen.
      cells.sort((a, b) => String(a.createdAt ?? a.run).localeCompare(String(b.createdAt ?? b.run)))

      let bound: ChainGroup['bound'] = null
      if (record.bound) {
        const master = `${rel}/${record.bound.file}`
        try {
          bound = {
            master,
            step: record.bound.step,
            parts: record.bound.parts,
            bytes: (await stat(resolveIn(roots.content, master))).size,
            ratingKey: `chain:${master}`,
          }
        } catch {
          // The record says it bound and the file is gone — deleted by hand, or a crash between
          // the write and the patch. Not a card for a file that is not there.
          bound = null
        }
      }

      /**
       * A run with nothing in it is a chain that failed on its first step, or one whose assets were
       * all deleted. It stays on disk; it is not a card.
       *
       * ⚠️ AND WORDS ARE SOMETHING (2026-09-01). This test was written when every chain either
       * pressed an engine or bound a file, and the composition builder is the first whose entire
       * output is WORDS — no medium step, so no cells, and nothing bound, because what it produces
       * is a document you press ＋ install on. So a run that had surveyed the machine and written a
       * whole composition was thrown away here, one line before the group that already carries
       * `wrote` was built, and 🔩's feed sat empty while two complete answers lay on the disk. What
       * a chain wrote is the run, as much as what it rendered.
       */
      // ⚠️ AND A REASON IS SOMETHING TOO (2026-09-04). A run that failed on its first step has no
      // cells, nothing bound and nothing written — and it is exactly the run you want to look at,
      // because it is the one that can say why. A folder with nothing in it at all is still not a
      // card.
      if (!cells.length && !bound && !(record.wrote ?? []).length && !record.failed) continue

      out.push({
        composition,
        run: runId,
        path: rel,
        title: record.title || runId,
        ask: record.text || null,
        createdAt: record.createdAt ?? null,
        cells,
        wrote: record.wrote ?? [],
        picked: record.picked ?? [],
        failed: record.failed ?? null,
        bound,
        installed: record.installed ?? null,
        ratingKey: `chain:${rel}`,
      })
    }
  }
  out.sort((a, b) => String(b.createdAt ?? b.run).localeCompare(String(a.createdAt ?? a.run)))
  return { chains: out, read }
}

export interface IndexResult {
  readonly manifest: Manifest
  /** How many masters had to be opened — 0 on a warm index over unchanged content. */
  readonly read: number
}

/**
 * Walk the content root and produce the manifest, reusing cached cells whose mtime has not
 * moved. `full: true` ignores the cache entirely — the explicit rebuild, for content changed
 * outside the app.
 */
export async function buildIndex(roots: Roots, { full = false } = {}): Promise<IndexResult> {
  const cachePath = resolveIn(roots.data, INDEX_FILE)
  let cache: Cache = {}
  if (!full) {
    try {
      const file = JSON.parse(await readFile(cachePath, 'utf-8')) as CacheFile
      // A cache from an older shape is DISCARDED, not migrated: every master is re-opened once
      // and the result is correct, which beats a migration for a file we can always rebuild.
      cache = file.version === CACHE_VERSION ? file.cells : {}
    } catch {
      cache = {}
    }
  }

  const next: Cache = {}
  const groups: ManifestGroup[] = []
  let read = 0

  for (const medium of MEDIA) {
    const ext = `.${MASTER_EXT[medium]}`
    const mediumDir = resolveIn(roots.content, `${MEDIA_DIR}/${medium}`)
    for (const runId of await dirs(mediumDir)) {
      const runDir = resolveIn(mediumDir, runId)
      const record = await readRunRecord(runDir)
      const cells: ManifestCell[] = []

      // ⚠️ ONE LEVEL, NOT TWO (2026-08-07). Masters sit DIRECTLY in the run folder, named
      // `<service>--<stem>.<ext>` — there is no cell folder, because there is no `count` for one
      // to hold. A run is its record and its siblings.
      for (const name of await files(runDir, ext)) {
        const rel = `${MEDIA_DIR}/${medium}/${runId}/${name}`
        let mtimeMs: number
        try {
          mtimeMs = (await stat(resolveIn(roots.content, rel))).mtimeMs
        } catch {
          continue // vanished between readdir and stat
        }
        const cached = cache[rel]
        if (cached && cached.mtimeMs === mtimeMs) {
          cells.push(cached.cell)
          next[rel] = cached
          continue
        }
        // The filename's service half is only the FALLBACK — provenance wins (see readCell).
        const cell = await readCell(
          roots.content, rel, name.slice(0, -ext.length).split('--')[0] ?? '', medium)
        read++
        cells.push(cell)
        next[rel] = { mtimeMs, cell }
      }

      // A run folder whose masters are all missing is a crashed or cancelled job. It stays on
      // disk (the gate rejects it), and it does not become a card for a file that isn't there.
      if (!cells.length) continue

      groups.push({
        medium,
        run: runId,
        path: `${MEDIA_DIR}/${medium}/${runId}`,
        slug: record?.text ? runId.replace(/-\d{8}-\d{6}$/, '') : runId,
        // ⚠️ DERIVED HERE FOR A RECORD THAT PREDATES THE FIELD, rather than left null: every run
        // on disk has an ask, so every run can have a readable name without a migration.
        // ⚠️ THE SUBJECT FIRST — for 🗣 the run's text is the SCRIPT and the speaker is the
        // thing that was made (`subject`, src/content/run.ts). Only reached on a record written
        // before names existed; every press since carries its own.
        title: record?.title ?? (titleFrom(record?.subject || record?.text || '') || null),
        player: PLAYER[medium],
        ask: record?.text ?? null,
        refs: [],
        createdAt: record?.createdAt
          ?? cells.map((c) => c.createdAt).filter(Boolean).sort()[0]
          ?? null,
        cells,
      })
    }
  }

  // Newest first — the one order a library of one-off assets can be browsed in. The run id is
  // the fallback for a group with no timestamp anywhere (both forms sort lexically).
  groups.sort((a, b) => String(b.createdAt ?? b.run).localeCompare(String(a.createdAt ?? a.run)))

  const chains = await readChains(roots, cache, next)
  const manifest: Manifest = {
    generatedAt: new Date().toISOString(),
    media: groups,
    chains: chains.chains,
  }
  read += chains.read
  await writeFile(cachePath, JSON.stringify({ version: CACHE_VERSION, cells: next } satisfies CacheFile) + '\n')
  return { manifest, read }
}
