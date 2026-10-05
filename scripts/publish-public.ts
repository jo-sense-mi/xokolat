#!/usr/bin/env node
// THE PUBLIC REPO, MADE FROM THIS ONE — `npm run publish-public [-- --push] [-- --message "…"]`.
//
// This repo is private and primary: its history, its operator's machine setup and its deploy notes
// stay here. github.com/jo-sense-mi/xokolat gets the committed tree of HEAD, minus what is listed
// below, as ONE new commit per publish, authored by the project's public name. The two histories
// never share a commit, so nothing about this one's authorship travels.
//
// Without --push it stops at a committed, unpushed clone in out/public, to look at first.
//
// ⚠️ IT REFUSES, IT DOES NOT SCRUB. A personal identifier found in the tree aborts the publish and
// names the file. Silently rewriting text on the way out would publish a tree nobody has read.

import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(HERE, 'out')
const STAGE = join(OUT, 'public-stage')
const PUBLIC = join(OUT, 'public')

/** Where the public repo is pushed. An ssh host alias, so the key that pushes is the publishing
 *  account's and not the operator's — the push itself is public (a repo's event feed names who
 *  pushed), not only the commit. */
const REMOTE = process.env['XOKOLAT_PUBLIC_REMOTE'] ?? 'git@github-jo-sense-mi:jo-sense-mi/xokolat.git'
const AUTHOR = { name: 'jo-sense-mi', email: 'jo-sense-mi@users.noreply.github.com' }

/** Tracked here, and not part of the project anyone else gets: this machine's service setup, the
 *  operator's deploy and release notes for their own server. */
const EXCLUDE = [/^_brew-service-/, /^deploymentguide/, /^deployment-/, /^RELEASING\.md$/]

const say = (line: string): void => { process.stdout.write(`  ${line}\n`) }
const fail = (line: string): never => { process.stderr.write(`✗ ${line}\n`); process.exit(1) }
const git = (cwd: string, args: readonly string[], env: Record<string, string> = {}): string =>
  execFileSync('git', args, { cwd, encoding: 'utf-8', env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'inherit'] })

/** What must never appear in a published file — read from `.public-leaks`, one regex per line,
 *  which is gitignored: the list of a person's identifiers is itself the thing not to publish.
 *  A home path is always checked; `/Users/YOU` is the guides' placeholder. */
const LEAKS_FILE = join(HERE, '.public-leaks')
if (!existsSync(LEAKS_FILE)) fail('no .public-leaks — one regex per line: names, emails, hosts that must never be published')
const LEAKS = new RegExp([
  ...readFileSync(LEAKS_FILE, 'utf-8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')),
  '\\/Users\\/(?!YOU\\b)[a-z]',
].join('|'), 'i')

const push = process.argv.includes('--push')
const msgAt = process.argv.indexOf('--message')
const version = (JSON.parse(readFileSync(join(HERE, 'package.json'), 'utf-8')) as { version: string }).version
const message = msgAt > 0 ? process.argv[msgAt + 1] ?? fail('--message needs a value') : `xokolat ${version}`

// ── the tree: HEAD as committed, never the working copy ──────────────────────
if (git(HERE, ['status', '--porcelain', '--untracked-files=no']).trim()) {
  fail('uncommitted changes — publish is made from HEAD, so commit first')
}
rmSync(STAGE, { recursive: true, force: true })
mkdirSync(STAGE, { recursive: true })
const tarball = join(OUT, 'public-stage.tar')
git(HERE, ['archive', '-o', tarball, 'HEAD'])
execFileSync('tar', ['-xf', tarball, '-C', STAGE])
rmSync(tarball)
for (const entry of readdirSync(STAGE)) {
  if (EXCLUDE.some((re) => re.test(entry))) rmSync(join(STAGE, entry), { recursive: true, force: true })
}

// ── the check ────────────────────────────────────────────────────────────────
const hits: string[] = []
const walk = (dir: string): void => {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) { walk(path); continue }
    const text = readFileSync(path, 'utf-8')
    text.split('\n').forEach((line, i) => {
      const m = LEAKS.exec(line)
      if (m) hits.push(`${relative(STAGE, path)}:${i + 1}  …${m[0]}…`)
    })
  }
}
walk(STAGE)
if (hits.length) fail(`personal identifiers in the tree — fix them here, commit, publish again:\n    ${hits.join('\n    ')}`)
say(`tree clean (${EXCLUDE.length} exclusions)`)

// ── the public clone ─────────────────────────────────────────────────────────
if (!existsSync(join(PUBLIC, '.git'))) {
  say(`cloning ${REMOTE}…`)
  try {
    execFileSync('git', ['clone', '--quiet', REMOTE, PUBLIC], { stdio: ['ignore', 'ignore', 'pipe'] })
  } catch {
    // Not reachable yet (no repo, no key): start the clone locally so the tree can be looked at.
    // A first --push then fills an empty remote; a remote with history refuses it, which is safe.
    say('  not reachable — starting a local one; --push will need the remote')
    rmSync(PUBLIC, { recursive: true, force: true })
    mkdirSync(PUBLIC, { recursive: true })
    git(PUBLIC, ['init', '--quiet', '-b', 'main'])
    git(PUBLIC, ['remote', 'add', 'origin', REMOTE])
  }
}
for (const entry of readdirSync(PUBLIC)) {
  if (entry !== '.git') rmSync(join(PUBLIC, entry), { recursive: true, force: true })
}
cpSync(STAGE, PUBLIC, { recursive: true })
rmSync(STAGE, { recursive: true, force: true })

git(PUBLIC, ['add', '-A'])
if (!git(PUBLIC, ['status', '--porcelain']).trim()) {
  say('nothing changed since the last publish')
  process.exit(0)
}

// ⚠️ EVERY IDENTITY FIELD IS SET HERE, not inherited: author, committer, a UTC date (a local one
// carries the operator's timezone), and no signing (a signature is a personal key).
const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
git(PUBLIC, [
  '-c', `user.name=${AUTHOR.name}`, '-c', `user.email=${AUTHOR.email}`, '-c', 'commit.gpgsign=false',
  'commit', '--quiet', '-m', message, '-m', 'Co-Authored-By: Claude <noreply@anthropic.com>',
], {
  GIT_AUTHOR_NAME: AUTHOR.name, GIT_AUTHOR_EMAIL: AUTHOR.email, GIT_AUTHOR_DATE: now,
  GIT_COMMITTER_NAME: AUTHOR.name, GIT_COMMITTER_EMAIL: AUTHOR.email, GIT_COMMITTER_DATE: now,
})
say(`committed: ${git(PUBLIC, ['log', '-1', '--format=%h %an <%ae> %ad %s', '--date=iso-strict']).trim()}`)

if (!push) {
  say(`not pushed — look in out/public, then run again with --push`)
  process.exit(0)
}
execFileSync('git', ['push', '--quiet', 'origin', 'HEAD:main'], { cwd: PUBLIC, stdio: 'inherit' })
say(`✓ pushed to ${REMOTE}`)
