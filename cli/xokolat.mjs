#!/usr/bin/env node
// `npx xokolat` — and `npx xokolat background`, `npx xokolat stop`.
//
// ⚠️ PLAIN JAVASCRIPT, AND IT EXISTS ONLY BECAUSE OF WHERE npx PUTS A PACKAGE. The app is
// TypeScript that Node runs directly — but Node refuses to strip types under node_modules
// (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING), and node_modules is exactly where npx installs.
// So this file copies the app OUT, once per version, into app data, and runs it there with the same
// scripts a zip user runs: scripts/launch.ts (install once, then start) and scripts/serve.ts (stop).
//
//   <data>/versions/<version>/    src · web · services · registries · scripts · package.json …
//
// No build step: what runs is the published source, byte for byte.

import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PKG_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(PKG_DIR, 'package.json'), 'utf-8'))

const say = (line) => process.stdout.write(`${line}\n`)
const fail = (line) => { process.stderr.write(`✗ ${line}\n`); process.exit(1) }

// ── what was asked ───────────────────────────────────────────────────────────
const COMMANDS = {
  start: ['scripts/launch.ts', '--open'],
  background: ['scripts/launch.ts', '--background', '--open'],
  stop: ['scripts/serve.ts', 'stop'],
}
const asked = process.argv[2] ?? 'start'
if (asked === '--version' || asked === '-v') { say(pkg.version); process.exit(0) }
if (!(asked in COMMANDS)) fail(`unknown command "${asked}" — npx xokolat [${Object.keys(COMMANDS).join(' | ')}]`)

// ── the Node it needs ────────────────────────────────────────────────────────
// `engines` says the range; npx does not enforce it, so this does, by name.
const [major, minor, patch] = process.versions.node.split('.').map(Number)
const [needMajor, needMinor, needPatch] = /(\d+)\.(\d+)\.(\d+)/.exec(pkg.engines.node).slice(1).map(Number)
const older = major !== needMajor
  || minor < needMinor || (minor === needMinor && patch < needPatch)
if (older) fail(`xokolat needs Node ${pkg.engines.node} — this is ${process.version}. https://nodejs.org`)

// ── where the app lives on this machine ──────────────────────────────────────
// The same data root src/paths.ts resolves, written again because that file is TypeScript and this
// one cannot load it from where npx put it.
function dataRoot() {
  const env = process.env.XOKOLAT_DATA
  if (env) {
    const v = env.startsWith('~/') ? join(homedir(), env.slice(2)) : env
    if (!isAbsolute(v)) fail(`XOKOLAT_DATA must be an absolute path (got ${JSON.stringify(env)})`)
    return resolve(v)
  }
  if (platform() === 'darwin') return join(homedir(), 'Library', 'Application Support', 'xokolat')
  if (platform() === 'win32') {
    const roaming = process.env.APPDATA
    return roaming && isAbsolute(roaming) ? join(roaming, 'xokolat') : join(homedir(), 'AppData', 'Roaming', 'xokolat')
  }
  const xdg = process.env.XDG_DATA_HOME
  return xdg && isAbsolute(xdg) ? join(xdg, 'xokolat') : join(homedir(), '.local', 'share', 'xokolat')
}

const versions = join(dataRoot(), 'versions')
const here = join(versions, pkg.version)

// ── copy it out, once per version ────────────────────────────────────────────
if (!existsSync(join(here, 'package.json'))) {
  say(`· setting up xokolat ${pkg.version}…`)
  mkdirSync(versions, { recursive: true })
  // Built beside, then renamed into place: an interrupted copy never looks like an installed one.
  const partial = `${here}.partial`
  rmSync(partial, { recursive: true, force: true })
  for (const part of ['src', 'web', 'services', 'registries', 'scripts', 'LICENSE']) {
    cpSync(join(PKG_DIR, part), join(partial, part), { recursive: true })
  }
  // ⚠️ THE APP'S OWN package.json AND LOCKFILE ARE IN cli/app/, not at the top. The published
  // package.json lists no dependencies on purpose — npx would install them into its cache, unpinned,
  // for nothing, since the app runs from this copy — and npm will not publish a lockfile at all.
  // scripts/publish-npm.ts puts both here; launch.ts installs them, exactly, on the first start.
  const app = existsSync(join(PKG_DIR, 'cli', 'app')) ? join(PKG_DIR, 'cli', 'app') : PKG_DIR
  cpSync(join(app, 'package.json'), join(partial, 'package.json'))
  cpSync(join(app, 'package-lock.json'), join(partial, 'package-lock.json'))
  writeFileSync(join(partial, '.npmrc'), 'engine-strict=true\nomit=dev\n')
  renameSync(partial, here)

  // Older copies go — each carries its own node_modules. One still running (Windows locks its
  // files) stays until next time; nothing depends on it going now.
  for (const old of readdirSync(versions)) {
    if (old !== pkg.version) {
      try { rmSync(join(versions, old), { recursive: true, force: true }) } catch { /* in use */ }
    }
  }
}

// ── is there a newer one ─────────────────────────────────────────────────────
// One request, a short wait, and silence on any failure: being offline must not stop the app.
if (asked !== 'stop') {
  try {
    const res = await fetch('https://registry.npmjs.org/xokolat/latest', { signal: AbortSignal.timeout(1500) })
    const latest = (await res.json()).version
    const newer = (a, b) => {
      const [x, y] = [a, b].map((v) => v.split('.').map(Number))
      for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]
      return false
    }
    if (typeof latest === 'string' && newer(latest, pkg.version)) {
      say(`· xokolat ${latest} is out (this is ${pkg.version}) — run: npx xokolat@latest`)
    }
  } catch { /* offline, or the registry is slow — not a reason to wait */ }
}

// ── run it ───────────────────────────────────────────────────────────────────
// ⚠️ npm_execpath IS HOW launch.ts RUNS `npm ci` WITHOUT A SHELL. npx sets it; when it is missing
// (an unusual npm, or this file run directly) the npm beside this Node is the next answer.
const env = { ...process.env, XOKOLAT_STOP_HINT: 'npx xokolat stop' }
if (!env.npm_execpath) {
  const guess = join(dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')
  const win = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
  env.npm_execpath = existsSync(guess) ? guess : win
}
const res = spawnSync(process.execPath, COMMANDS[asked], { cwd: here, stdio: 'inherit', env })
process.exit(res.status ?? 1)
