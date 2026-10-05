#!/usr/bin/env node
// `npm run clear` — put this machine back where a new user starts, so a test starts from the same
// place theirs does.
//
// ⚠️ TOTAL MEANS TOTAL. App data, the library, the key, the settings, the stars, everything. There
// is no "keep the key so it is less annoying": the point of the script is that what you test is a
// FRESH INSTALL, and an install that already has a key answered is not one. Anything kept back is
// a difference between your run and the user's, and differences you kept on purpose are the ones
// you stop seeing.
//
// ⚠️ NO CONFIRMATION, AND NO UNDO. Same reason ✕ delete has none (DECISIONS.md, 2026-08-03): this
// is a dev script in a repo, run deliberately, by the person whose data it is. It prints what it
// is about to remove and how big it is, which is what a prompt would have told you anyway.
//
// ⚠️ IT DOES NOT CLEAR THE BROWSER, AND DOES NOT NEED TO. The armed workflow, the armed kind, every
// shelf's layout, the route — all localStorage, which no script can reach. The app handles it
// itself: the data root carries an install id (src/install.ts), the page compares it at boot, and
// a root that was deleted comes back with a new one. Clear, reload, and the page is new too.
//
// ⚠️ IT ONLY REMOVES WHAT THE ROOTS RESOLVE TO — and it resolves them the same way the server
// does, env overrides included. `XOKOLAT_DATA=/tmp/x npm run clear` clears that throwaway and not
// the real one, which is exactly how the throwaway installs get tested.

import { spawnSync } from 'node:child_process'
import { rm, stat } from 'node:fs/promises'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

import { resolveRoots } from '../src/paths.ts'

const roots = resolveRoots()
const out = (line: string): void => { process.stdout.write(`${line}\n`) }

/** Bytes under a path, or null when it is not there. Directories are walked; nothing is followed
 *  out of the tree, because nothing here has any business leaving it. */
async function weigh(path: string): Promise<number | null> {
  let info
  try {
    info = await stat(path)
  } catch { return null }
  if (!info.isDirectory()) return info.size
  let total = 0
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue
    total += (await weigh(join(path, entry.name))) ?? 0
  }
  return total
}

const human = (bytes: number): string =>
  bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB`
    : bytes >= 1024 ** 2 ? `${Math.round(bytes / 1024 ** 2)} MB`
      : `${Math.max(1, Math.round(bytes / 1024))} KB`

// ⚠️ THE SERVER GOES FIRST. It holds settings, the registry and the index in memory and writes
// them back as it works — clear underneath a running server and it recreates half of what you
// just deleted, with the old contents. `serve.ts stop` is reused rather than reimplemented, so
// this inherits its one rule: it only ever stops its own.
const stopped = spawnSync(process.execPath, ['scripts/serve.ts', 'stop'], {
  cwd: roots.install, stdio: 'inherit',
})
if (stopped.status !== 0) {
  out('✗ the app is still running — nothing was cleared')
  process.exit(1)
}

// The two roots the app writes to. `install` is the repo (or the .app) and is never touched.
const targets = [
  { path: roots.data, what: 'app data — registries, styles, stars, settings, the key, the index' },
  { path: roots.content, what: 'the library — every run, every master' },
]

let removed = 0
for (const { path, what } of targets) {
  const size = await weigh(path)
  if (size === null) {
    out(`· already gone   ${path}`)
    continue
  }
  out(`· removing ${human(size).padStart(7)}  ${path}`)
  out(`             ${what}`)
  await rm(path, { recursive: true, force: true })
  removed += 1
}

out(removed ? '✓ cleared — `npm run dev`, then reload the page' : '✓ nothing to clear')
