// ★ — the whole of judging, since 2026-08-03.
//
// ⚠️ TWO STATES, not three. It was 👍 / 👎 / unseen, and 👎 only ever meant "hide this
// everywhere" — a delete that frees no disk and shortens no list. Once delete is real, 👎 is a
// second way of saying *not good* and one of them has to go (DECISIONS.md).
//
// ⚠️ A FILTER, NOT A GATE. Starring is available everywhere, is never a step anyone must
// complete, and gates nothing: selection into a bundle stays explicit. It exists to make picking
// out of two hundred candidates possible, and for nothing else.
//
// ⚠️ KEYS ARE STABLE AND SERVER-SIDE, never invented client-side (PLAN §9). The key is
// `<medium>:<the asset's content-relative path>`, minted by the indexer, and a reshaped index
// must never orphan a star somebody gave.
//
// The file is a sorted array of keys — small, rewritten whole, readable by hand — and it lives in
// app data, never in the content root, so a star survives content being moved and a content
// folder can be handed to someone else without your opinions in it.

import { readFile, rename, writeFile } from 'node:fs/promises'

import { resolveIn } from '../paths.ts'
import type { Roots } from '../paths.ts'

export const STARS_FILE = 'stars.json'

export async function readStars(roots: Roots): Promise<string[]> {
  try {
    const parsed: unknown = JSON.parse(await readFile(resolveIn(roots.data, STARS_FILE), 'utf-8'))
    if (!Array.isArray(parsed)) return []
    return parsed.filter((k): k is string => typeof k === 'string' && k.length > 0)
  } catch {
    return []
  }
}

async function write(roots: Roots, keys: readonly string[]): Promise<void> {
  const file = resolveIn(roots.data, STARS_FILE)
  // Write-then-rename: a crash mid-write must not leave a truncated file where every star used
  // to be. There is one writer (this process), so no lock is needed beyond that.
  const tmp = `${file}.tmp`
  await writeFile(tmp, `${JSON.stringify([...keys].sort(), null, 2)}\n`)
  await rename(tmp, file)
}

/** Set or clear one star. Returns the new state for that key. */
export async function setStar(roots: Roots, key: string, starred: boolean): Promise<boolean> {
  const all = new Set(await readStars(roots))
  if (starred) all.add(key)
  else all.delete(key)
  await write(roots, [...all])
  return starred
}

/** Forget a key entirely — what a deleted asset leaves behind if nobody clears it. Silent when
 *  the key was never starred, because deleting an unstarred asset is the common case. */
export async function forgetStar(roots: Roots, key: string): Promise<void> {
  const all = await readStars(roots)
  if (!all.includes(key)) return
  await write(roots, all.filter((k) => k !== key))
}
