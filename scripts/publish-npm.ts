#!/usr/bin/env node
// `npx xokolat`, PUBLISHED — `npm run publish-npm [-- --pack]`.
//
// Run after `npm run publish-public -- --push`: it publishes out/public, the cleaned tree the public
// repo has, so npm and GitHub carry the same files and nothing from private/ can reach either.
//
// ⚠️ THE PACKAGE npm SEES IS NOT THE REPO'S package.json. It is staged in out/npm:
//   - the app's real package.json and lockfile go to cli/app/ — cli/xokolat.mjs copies them into
//     the app's own folder, where launch.ts installs exactly the lockfile on the first start;
//   - the top-level package.json keeps the name, version, bin and files, and LOSES dependencies,
//     devDependencies and scripts. npx would otherwise install sharp and gRPC into its cache,
//     unpinned, for a copy of the app that never reads them — and npm will not ship a lockfile.
//
// --pack writes the tarball to out/ instead of publishing, to try with
// `npx --package=./out/xokolat-<v>.tgz xokolat` (XOKOLAT_OPEN=0 keeps the browser shut).
// Publishing asks for npm's 2FA in the terminal; there is no token, on purpose.

import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(HERE, 'out')
const PUBLIC = join(OUT, 'public')
const STAGE = join(OUT, 'npm')
const ACCOUNT = 'jo-sense-mi'

const say = (line: string): void => { process.stdout.write(`  ${line}\n`) }
const fail = (line: string): never => { process.stderr.write(`✗ ${line}\n`); process.exit(1) }

const pack = process.argv.includes('--pack')
// Without --pack the tree must be the public one; with it, this repo will do for trying things.
const SOURCE = pack && !existsSync(join(PUBLIC, 'package.json')) ? HERE : PUBLIC
if (!existsSync(join(SOURCE, 'package.json'))) fail('no out/public — run `npm run publish-public -- --push` first')

const pkg = JSON.parse(readFileSync(join(SOURCE, 'package.json'), 'utf-8')) as Record<string, unknown> & { files: string[], version: string }

rmSync(STAGE, { recursive: true, force: true })
mkdirSync(STAGE, { recursive: true })
for (const part of pkg.files) {
  const from = join(SOURCE, part)
  if (existsSync(from)) cpSync(from, join(STAGE, part), { recursive: true })
}
mkdirSync(join(STAGE, 'cli', 'app'), { recursive: true })
cpSync(join(SOURCE, 'package.json'), join(STAGE, 'cli', 'app', 'package.json'))
cpSync(join(SOURCE, 'package-lock.json'), join(STAGE, 'cli', 'app', 'package-lock.json'))

const { dependencies: _d, devDependencies: _dd, scripts: _s, allowScripts: _a, ...published } = pkg
writeFileSync(join(STAGE, 'package.json'), `${JSON.stringify(published, null, 2)}\n`)

if (pack) {
  execFileSync('npm', ['pack', '--silent', '--pack-destination', OUT], { cwd: STAGE, stdio: ['ignore', 'ignore', 'inherit'] })
  say(`→ out/xokolat-${pkg.version}.tgz — try it: npx --package=./out/xokolat-${pkg.version}.tgz xokolat`)
  process.exit(0)
}

// The tree has to pass its own checks before it goes where anybody can install it.
execFileSync('npm', ['run', '--silent', 'check'], { cwd: HERE, stdio: ['ignore', 'ignore', 'inherit'] })

// ⚠️ ONLY AS THE PROJECT'S ACCOUNT. Publishing under a personal npm login would put that name on the
// package page for good.
let who = ''
try { who = execFileSync('npm', ['whoami'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { /* not logged in */ }
if (who !== ACCOUNT) fail(`npm is logged in as ${who ? `"${who}"` : 'nobody'} — run \`npm login\` as ${ACCOUNT} first`)

execFileSync('npm', ['publish', '--access', 'public'], { cwd: STAGE, stdio: 'inherit' })
say(`✓ published xokolat ${pkg.version} — npx xokolat`)
