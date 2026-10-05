#!/usr/bin/env node
// `npm run check` — the first script in the repo, and what stands in for a browser on the
// server side (PLAN §14). It runs before every commit, so it must stay fast, and:
//
// ⚠️ IT NEVER TOUCHES THE NETWORK. `npm audit` is a separate script (`npm run audit`), run
// when dependencies change rather than on every commit.
//
// Four steps, each reporting everything it found rather than the first thing:
//   1. tsc --noEmit           — the type check IS most of the old smoke test
//   2. node --check           — every front-end module parses, and then that it EVALUATES
//   3. registries             — JSON parsed and validated by hand-written guards, no `ajv`
//   4. node --test            — golden payloads and unit tests

import { spawnSync } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

import { KINDS_FILE, parseKindsFile } from '../src/inference/kinds.ts'
import { REGISTRY_FILE, parseInferenceRegistryFile } from '../src/inference/registry.ts'
import { resolveIn, resolveRoots } from '../src/paths.ts'
import { ctx } from '../src/validate.ts'

const roots = resolveRoots()
const rel = (p: string): string => relative(roots.install, p)

let failed = false

function step(name: string, ok: boolean, detail = ''): void {
  process.stdout.write(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}\n`)
  if (!ok) failed = true
}

function run(name: string, cmd: string, args: string[]): void {
  const res = spawnSync(cmd, args, { cwd: roots.install, stdio: 'inherit' })
  step(name, res.status === 0, res.status === 0 ? '' : `exit ${res.status ?? res.signal}`)
}

/** Every `.js` under a directory, recursively. */
async function jsFiles(dir: string): Promise<string[]> {
  const out: string[] = []
  for (const entry of await readdir(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && entry.name.endsWith('.js')) out.push(join(entry.parentPath, entry.name))
  }
  return out.sort()
}

// ── 1. types ──────────────────────────────────────────────────────────────────────────────
run('tsc --noEmit', 'node_modules/.bin/tsc', ['--noEmit'])

// ── 2. the front end parses ───────────────────────────────────────────────────────────────
{
  const files = await jsFiles(resolveIn(roots.install, 'web'))
  const bad: string[] = []
  for (const file of files) {
    const res = spawnSync(process.execPath, ['--check', file], { encoding: 'utf-8' })
    if (res.status !== 0) {
      bad.push(rel(file))
      process.stderr.write(res.stderr)
    }
  }
  step(`node --check (${files.length} front-end module${files.length === 1 ? '' : 's'})`,
    bad.length === 0, bad.join(', '))

  // ⚠️ AND THEY LOAD, WHICH IS NOT THE SAME QUESTION. `--check` parses; a module can parse and
  // still throw the instant a browser evaluates it — a top-level line touching a `const` declared
  // below it, an import of a name that is not exported. That failure takes the WHOLE app down
  // ("loading" forever) with every other check in this repo green, so it is worth the second and
  // a half this costs. The stub DOM is not a browser and renders nothing: the only claim is that
  // the module can be imported.
  const boot = spawnSync(process.execPath,
    [resolveIn(roots.install, 'scripts/boot-web.mjs'), ...files], { encoding: 'utf-8' })
  if (boot.stderr) process.stderr.write(boot.stderr)
  step('the front end loads (stub DOM)', boot.status === 0)

  // ⚠️ ONE CACHE TAG, APP-WIDE. There is no build step, so `?v=N` on every module import and on
  // the stylesheet is the whole cache story — and a HALF bump is worse than none: the browser
  // then runs some modules new and some old, which fails in ways that look like logic bugs.
  // (Bumping is still a human step; this only holds them all to the same number. The tag lives
  // in literal import specifiers, so nothing can derive it without the build step we refuse.)
  const tags = new Map<string, string[]>()
  for (const file of [...files, resolveIn(roots.install, 'web/index.html')]) {
    for (const m of (await readFile(file, 'utf-8')).matchAll(/\?v=(\d+)/g)) {
      tags.set(m[1]!, [...(tags.get(m[1]!) ?? []), rel(file)])
    }
  }
  const versions = [...tags.keys()].sort()
  step(`one cache tag (?v=${versions.join(' + ')})`, versions.length <= 1,
    versions.length > 1
      ? versions.map((v) => `v=${v} in ${[...new Set(tags.get(v))].join(', ')}`).join(' | ')
      : '')
}

// ── 3. the shipped data is on-contract ────────────────────────────────────────────────────
{
  const issues: string[] = []

  const registryPath = resolveIn(roots.install, REGISTRY_FILE)
  const c = ctx(rel(registryPath))
  try {
    parseInferenceRegistryFile(c, JSON.parse(await readFile(registryPath, 'utf-8')))
  } catch (err) {
    c.issues.push(`${rel(registryPath)}: ${(err as Error).message}`)
  }
  issues.push(...c.issues)

  const kindsPath = resolveIn(roots.install, KINDS_FILE)
  const kc = ctx(rel(kindsPath))
  try {
    parseKindsFile(kc, JSON.parse(await readFile(kindsPath, 'utf-8')))
  } catch (err) {
    kc.issues.push(`${rel(kindsPath)}: ${(err as Error).message}`)
  }
  issues.push(...kc.issues)

  // ⚠️ AND NOTHING ELSE IS SHIPPED TO CHECK (2026-08-16). There was a loop over every medium's
  // `styles/<medium>.json` here. The app ships no styles now, and no engines and no workflows — it
  // ships the ability to reach a service and the words a parser accepts. What runs is published
  // at xoko.lat, and the site's own `check.mjs` holds it to this app's vocabulary before it goes
  // out; `tests/library.test.ts` reads the built site back through this app's readers.
  for (const line of issues) process.stderr.write(`  ${line}\n`)
  step('shipped registries', issues.length === 0,
    issues.length ? `${issues.length} issue${issues.length === 1 ? '' : 's'}` : '')
}

// ── 4. the tests ──────────────────────────────────────────────────────────────────────────
run('node --test', process.execPath, ['--test', 'tests/**/*.test.ts'])

process.exit(failed ? 1 : 0)
