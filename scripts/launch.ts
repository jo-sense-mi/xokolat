#!/usr/bin/env node
// Start and background — what `npx xokolat` runs inside the copy it makes (cli/xokolat.mjs), and
// what `npm start` / `npm run background` run in a checkout.
//
// ⚠️ IT INSTALLS FIRST, ONCE. The copy carries no node_modules (sharp is per-platform, and the
// user's own npm fetches the right one), so the first start runs `npm ci` and every later one goes
// straight to the server. "Once" is a marker holding the lockfile's hash: a different lockfile in
// the same folder installs again; nothing else does.
//
// ⚠️ THIS FILE IMPORTS NOTHING THAT NEEDS node_modules — that is the whole reason it exists apart
// from src/server/main.ts, which loads sharp on its first line and would crash before it could
// install anything.
//
// ⚠️ NO SHELL (PLAN §15 rule 1). npm is run as `node <npm-cli.js>`: npm names its own script in
// `npm_execpath` for everything it starts, and on Windows the alternative — `npm.cmd` — can only be
// spawned through a shell.

import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { resolveHost, resolveIn, resolvePort, resolveRoots } from '../src/paths.ts'
import { openBrowser, wantsOpen, xokolatAt } from '../src/server/open.ts'

const roots = resolveRoots()
const out = (line: string): void => { process.stdout.write(`${line}\n`) }
const fail = (line: string): never => { process.stderr.write(`✗ ${line}\n`); process.exit(1) }

// ── install, the first time ──────────────────────────────────────────────────
const lock = join(roots.install, 'package-lock.json')
const marker = join(roots.install, 'node_modules', '.xokolat-installed')
const want = createHash('sha256').update(readFileSync(lock)).digest('hex')
const have = existsSync(marker) ? readFileSync(marker, 'utf-8').trim() : null

if (have !== want) {
  const npm = process.env['npm_execpath']
  if (!npm || !/\.[cm]?js$/.test(npm)) fail('dependencies are not installed — run `npm ci` in this folder first')
  out('· installing dependencies (once — a few seconds)…')
  // `ci`, not `install`: exactly the lockfile, nothing resolved fresh. Whether dev tools come
  // along is the folder's own `.npmrc` — the zip says omit=dev, a checkout says nothing.
  const res = spawnSync(process.execPath, [npm as string, 'ci', '--no-audit', '--no-fund'], { cwd: roots.install, stdio: 'inherit' })
  if (res.status !== 0) fail('npm ci failed — what it said is above')
  writeFileSync(marker, `${want}\n`)
}

// ── start ────────────────────────────────────────────────────────────────────
if (!process.argv.includes('--background')) {
  // The same process becomes the server: its logs here, Ctrl-C stops it. main.ts reads `--open`
  // off this process's own argv.
  await import('../src/server/main.ts')
} else {
  const host = resolveHost()
  const url = `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${resolvePort()}`
  // Already up is the answer, not a second server failing on the port into the log.
  if (await xokolatAt(url) !== null) {
    out(`✓ xokolat is already running · ${url}`)
    if (wantsOpen(process.argv)) openBrowser(url)
    process.exit(0)
  }

  // ⚠️ DETACHED, WITH ITS OWN LOG. The terminal can close; the server has nowhere to print, so it
  // prints to a file in app data, appended across runs.
  mkdirSync(roots.data, { recursive: true })
  const logPath = resolveIn(roots.data, 'xokolat.log')
  const log = openSync(logPath, 'a')
  const child = spawn(process.execPath, ['src/server/main.ts', ...(process.argv.includes('--open') ? ['--open'] : [])], {
    cwd: roots.install,
    detached: true,
    windowsHide: true,
    stdio: ['ignore', log, log],
  })
  let exited: number | null = null
  child.on('exit', (code) => { exited = code ?? 1 })
  child.unref()

  // Wait until it answers, so this says "running" only when it is. A child that exits early has
  // either found a xokolat already up (code 0 — that one answers) or failed (the log says why).
  const deadline = Date.now() + 30_000
  for (;;) {
    if (await xokolatAt(url) !== null) break
    if ((exited !== null && exited !== 0) || Date.now() > deadline) fail(`xokolat did not start — see ${logPath}`)
    await new Promise((r) => setTimeout(r, 250))
  }
  out(`✓ xokolat is running in the background · ${url}`)
  out(`  log   ${logPath}`)
  // How to stop it, in the words of however it was started — npx sets this, a folder does not.
  out(`  stop  ${process.env['XOKOLAT_STOP_HINT'] ?? 'npm run stop'}`)
  process.exit(0)
}
