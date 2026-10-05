// DELETING AN ASSET — and it is a real delete (DECISIONS.md, 2026-08-03).
//
// ⚠️ NO TRASH, NO SOFT-DELETE STATE, NO UNDO. Generation is cheap and the user is an adult.
// A trash would be a second lifetime to manage and a second thing to explain, to protect against
// a loss the user chose.
//
// ⚠️ THE RECORD GOES WITH THE FILE, and that is the design working. Provenance is embedded in
// the master, so it has exactly one lifetime and can never be orphaned — which is precisely why
// there is no ledger of deleted things here. A log of what no longer exists would reintroduce
// the orphan problem embedding exists to solve, and would then need its own deletion rule.
//
// ⚠️ THE BROWSER SENDS A CONTENT-RELATIVE PATH, never an absolute one and never a command
// (PLAN §15 rules 1 and 2). `resolveIn` is what makes that safe, and it is the first thing here.

import { readdir, rm, stat } from 'node:fs/promises'
import { basename, dirname, extname } from 'node:path'

import { resolveIn } from '../paths.ts'
import type { Roots } from '../paths.ts'
import { forgetStar } from './stars.ts'
import { CHAIN_FILE } from '../compositions/chain.ts'
import { CHAIN_DIR, MEDIA_DIR } from './run.ts'

export class RemoveError extends Error {
  readonly status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'RemoveError'
    this.status = status
  }
}

/** Nothing outside `media/` and `compositions/` is deletable through the API. The library is the
 *  user's folder and they may put anything in it; this endpoint only removes what the app itself
 *  produced — the assets its engines rendered, and the runs its 🧩 chains made. */
const isOurs = (rel: string): boolean =>
  (rel.startsWith(`${MEDIA_DIR}/`) || rel.startsWith(`${CHAIN_DIR}/`)) && !rel.includes('..')

/**
 * Is this directory now empty of everything that matters? A run folder left holding only its
 * `run.json` (or a `.DS_Store` the Finder dropped in it) is a husk, not content.
 */
async function isHusk(dir: string): Promise<boolean> {
  try {
    const names = await readdir(dir)
    return names.every((n) => n === 'run.json' || n === CHAIN_FILE || n.startsWith('.'))
  } catch {
    return false
  }
}

/**
 * Delete one asset, then prune what it leaves behind.
 *
 * The run folder goes when its last master does — including its `run.json`, because a run record
 * describing no assets is a card for a picture that is not there. Pruning stops at
 * `media/<medium>/`, which is structure rather than content.
 *
 * ⚠️ ONE LEVEL (2026-08-07). It climbed two while every master sat in a cell folder inside the
 * run; masters are the run folder's own children now (src/content/run.ts → cellName).
 *
 * Returns what was actually removed, so the caller can say so rather than guess.
 */
export async function removeAsset(roots: Roots, rel: string, ratingKey: string | null): Promise<{
  path: string; prunedRun: boolean
}> {
  if (!isOurs(rel)) {
    throw new RemoveError('only what this app made — under media/ or compositions/ — can be deleted')
  }
  const file = resolveIn(roots.content, rel)

  let dir = false
  try {
    dir = (await stat(file)).isDirectory()
  } catch {
    throw new RemoveError('there is nothing there — it may already be gone', 404)
  }

  // 🧩 A WHOLE CHAIN RUN GOES AT ONCE, and it is the only folder this endpoint deletes. A run of a
  // composition is ONE thing in its feed — the brief, the candidates, the cut-out and the bound
  // book are one act — so 🗑 on that card removes the act, not one page of it. Guarded by the
  // record: a folder with no `chain.json` is not a run this app started.
  if (dir) {
    try {
      await stat(resolveIn(file, CHAIN_FILE))
    } catch {
      throw new RemoveError('that is a folder, and not a run this app made', 400)
    }
    await rm(file, { recursive: true, force: true })
    if (ratingKey) await forgetStar(roots, ratingKey)
    return { path: rel, prunedRun: true }
  }

  await rm(file)
  if (ratingKey) await forgetStar(roots, ratingKey)

  // ⚠️ THE SIDECARS GO WITH IT (2026-08-30). A master that cannot hold its own record has a
  // `<stem>.gen.json` beside it (src/content/master.ts), and a mesh now also has a
  // `<stem>.preview.png` — the still the browser drew of it. Neither is a master, so neither shows
  // in any feed, and deleting the asset used to leave both sitting in the folder forever: invisible
  // files that also stop `isHusk` from ever pruning the run. One rule rather than two names, so a
  // sidecar invented later is covered the day it is written.
  const stem = basename(file).slice(0, -extname(file).length)
  try {
    for (const name of await readdir(dirname(file))) {
      if (name !== basename(file) && name.startsWith(`${stem}.`)) {
        await rm(resolveIn(dirname(file), name), { force: true })
      }
    }
  } catch { /* the folder went with the file — nothing to prune */ }

  // media/<medium>/<run>/<file> and compositions/<slug>/<run>/<step>/<file> — climb one either way.
  const runDir = dirname(file)
  let prunedRun = false
  if (await isHusk(runDir)) {
    await rm(runDir, { recursive: true, force: true })
    prunedRun = true
  }
  return { path: rel, prunedRun }
}
