#!/usr/bin/env node
// ONE DOWNLOAD FOR EVERY OS — `npm run package` → out/xokolat-<v>.zip.
//
// ⚠️ THERE IS NO BUILD STEP AND THIS DOES NOT ADD ONE. Node runs this app's TypeScript directly,
// so packaging is COPYING the files `npm start` reads into a folder and zipping it. What ships is
// what you tested.
//
// ⚠️ AND NOTHING PER-OS IS IN IT. Node 26 is the one requirement (`engines`, enforced by the
// `.npmrc` written below), so the runtime is the user's own — and the first `npm start` fetches
// the sharp prebuilt for THEIR platform. That is what lets one archive serve macOS, Windows and
// Linux alike, where carrying Node meant six (DECISIONS 2026-10-05).
//
//   xokolat-<v>/
//     README.txt         the three commands
//     .npmrc             engine-strict, omit=dev
//     package.json       start · background · stop, and nothing else
//     package-lock.json
//     src · web · services · registries
//     scripts/           launch.ts · serve.ts · update-services.sh

import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(HERE, 'out')
const pkg = JSON.parse(readFileSync(join(HERE, 'package.json'), 'utf-8')) as {
  version: string
  engines: { node: string }
  scripts: Record<string, string>
}
const VERSION = pkg.version

const say = (line: string): void => { process.stdout.write(`  ${line}\n`) }
const run = (bin: string, args: readonly string[]): void => {
  // COPYFILE_DISABLE: macOS tar otherwise writes a `._` twin of every file carrying its xattrs.
  execFileSync(bin, args, { cwd: HERE, stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, COPYFILE_DISABLE: '1' } })
}

// ── the source has to be good before it is copied ────────────────────────────
say('checking…')
run('npm', ['run', '--silent', 'check'])

const folder = `xokolat-${VERSION}`
const stage = join(OUT, folder)
rmSync(stage, { recursive: true, force: true })
mkdirSync(stage, { recursive: true })

// ⚠️ NAMED, NOT `cp -R .`. A working tree holds node_modules, out/, .git and your own notes; a
// package holds what the app reads at runtime. The repo is how to work ON xokolat; this is xokolat.
say('copying app…')
for (const part of ['src', 'web', 'services', 'registries', 'package-lock.json', 'LICENSE']) {
  cpSync(join(HERE, part), join(stage, part), { recursive: true })
}
// Of scripts/, only what a user runs: start and background (launch), stop (serve), and
// update-services.sh, which is a shipped app file (services/README.md). check, package, clear and
// the dev harnesses are the repo's.
mkdirSync(join(stage, 'scripts'))
for (const script of ['launch.ts', 'serve.ts', 'update-services.sh']) {
  cpSync(join(HERE, 'scripts', script), join(stage, 'scripts', script))
}
// ⚠️ package.json WITH ONLY THE USER'S COMMANDS. People type `npm run …` in this folder, so a
// `dev` or `check` listed there is a command that misbehaves (no .env.dev, no TypeScript). Every
// other field stays as it is — `npm ci` refuses a package.json that disagrees with its lockfile,
// devDependencies included (`omit=dev` is what keeps those out).
writeFileSync(join(stage, 'package.json'), `${JSON.stringify({
  ...pkg,
  scripts: {
    start: 'node scripts/launch.ts --open',
    background: 'node scripts/launch.ts --background --open',
    stop: 'node scripts/serve.ts stop',
  },
}, null, 2)}\n`)
// engine-strict: an old Node is refused by name at install, not by a stack trace at start.
// omit=dev: TypeScript and the types are this repo's checks, not the app's — `npm ci` skips them.
writeFileSync(join(stage, '.npmrc'), 'engine-strict=true\nomit=dev\n')
writeFileSync(join(stage, 'README.txt'), `xokolat ${VERSION}

Needs Node ${pkg.engines.node} — https://nodejs.org

    cd ${folder}
    npm start                 xokolat in this terminal; Ctrl-C stops it
    npm run background        xokolat with the terminal free to close
    npm run stop              stops a background one

The first start installs what xokolat needs (a few seconds, online). Your browser opens on
http://127.0.0.1:18080; starting again while it is up just opens the browser.

Your work is saved in Documents/xokolat, never in this folder — it can live anywhere and be
replaced by a newer one without touching your work.

https://xoko.lat
`)

const file = join(OUT, `${folder}.zip`)
rmSync(file, { force: true })
// Owned by nobody in particular: an archive otherwise carries the builder's user and group names.
run('tar', ['--format', 'zip', '-cf', file, '--uid', '0', '--gid', '0', '--uname', 'root', '--gname', 'root', '-C', OUT, folder])
rmSync(stage, { recursive: true, force: true })
say(`→ out/${folder}.zip  (${(statSync(file).size / 1e6).toFixed(1)} MB)`)
