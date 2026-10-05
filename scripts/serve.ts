#!/usr/bin/env node
// `npm run dev`, `npm run restart` and `npm run stop` — because "stop whatever is on that port" was a manual
// dance every time the server changed, and a manual dance is how you end up testing new code
// against an old process (DECISIONS.md, 2026-08-04: a browser sending `ids` to a server still
// expecting `id`).
//
// ⚠️ IT ONLY EVER STOPS ITS OWN. The port is identified, then the PROCESS holding it is checked
// against this repo's own entry point, and anything else is left alone and named. `npm start`
// refusing to move ports is deliberate (PLAN §9) — the answer to a busy port is to look at what
// is on it, not to have a script that clears it by force.
//
// ⚠️ NO SHELL, EVER (PLAN §15 rule 1). `lsof` and `ps` are argv arrays; nothing here is
// interpolated into a command line.
//
// ⚠️ WINDOWS HAS NEITHER, so there the server is asked instead: `/api/status` reports its own pid,
// and only something that answers as a xokolat is ever stopped. (No `--watch` parent to find —
// `npm run dev` is for this repo's own machine.)
//
// ⚠️ NO PID FILE. The port plus the command line is the truth and cannot go stale; a pid file
// written by a process that was killed -9 is a lie the next run has to work around.

import { spawnSync } from 'node:child_process'
import { connect } from 'node:net'

import { resolveHost, resolvePort, resolveRoots } from '../src/paths.ts'
import { xokolatAt } from '../src/server/open.ts'

const roots = resolveRoots()
const port = resolvePort()
/** What our own server's command line looks like — `node src/server/main.ts`, or `npm start`'s
 *  `node scripts/launch.ts`, which becomes the server in the same process. */
const OURS = /src[/\\]server[/\\]main\.ts|scripts[/\\]launch\.ts/

const out = (line: string): void => { process.stdout.write(`${line}\n`) }

/** The PIDs LISTENING on the port. `lsof` is the only portable-enough way to ask on macOS. */
function listeners(): number[] {
  const res = spawnSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], { encoding: 'utf-8' })
  // Status 1 with no output is lsof's "nothing matched" — not an error.
  if (res.error) {
    out(`! could not run lsof (${res.error.message}) — stop the server yourself`)
    return []
  }
  // `> 0`, not `isInteger`: the trailing newline splits to '', and `Number('')` is 0 — which
  // would then be reported as a mystery process nobody can find.
  return (res.stdout ?? '').split('\n').map((l) => Number(l.trim())).filter((n) => n > 0)
}

const commandOf = (pid: number): string =>
  (spawnSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf-8' }).stdout ?? '').trim()

const parentOf = (pid: number): number =>
  Number((spawnSync('ps', ['-o', 'ppid=', '-p', String(pid)], { encoding: 'utf-8' }).stdout ?? '').trim())

/**
 * WHO TO ACTUALLY STOP — the listener, or the `--watch` that will put it straight back.
 *
 * ⚠️ THE PROCESS ON THE PORT IS NOT ALWAYS THE PROCESS TO KILL (2026-08-18). `node --watch` runs
 * the script in a CHILD, so `lsof` names the child; SIGTERM it and the parent notices, shrugs, and
 * respawns it. `npm run dev` twice therefore left an orphaned watcher behind — quiet until the
 * next file save, when it woke up and raced the server you were actually using for the port. Two
 * runs, three watchers, and the one that won was whichever bound first.
 *
 * So: if this pid's PARENT is also ours, the parent is the one that owns the lifetime. One level
 * only — `--watch` nests exactly once, and walking further would be guessing.
 *
 * ⚠️ THE `OURS` CHECK IS APPLIED TO THE PARENT TOO, and that is the whole safety of it: a listener
 * of ours whose parent is a shell, a terminal or npm resolves back to the listener, because a
 * command line that is not this repo's entry point is never something this script stops.
 */
function ownerOf(pid: number): number {
  const parent = parentOf(pid)
  return parent > 1 && OURS.test(commandOf(parent)) ? parent : pid
}

/** Resolves once nothing is listening — a SIGTERM'd server takes a moment to release the port,
 *  and starting into that gap is the flaky-restart everyone writes a `sleep 2` for. */
async function waitForFree(timeoutMs = 5000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const free = await new Promise<boolean>((resolve) => {
      const sock = connect({ port, host: '127.0.0.1' })
      sock.once('connect', () => { sock.destroy(); resolve(false) })
      sock.once('error', () => { sock.destroy(); resolve(true) })
    })
    if (free) return true
    if (Date.now() > deadline) return false
    await new Promise((r) => setTimeout(r, 150))
  }
}

/** The port is held by something — whatever it is. */
const held = async (): Promise<boolean> => !await waitForFree(0)

/** Windows: the server names its own pid, and nothing that does not answer as one is touched. */
async function stopByAsking(): Promise<boolean> {
  const host = resolveHost()
  const pid = await xokolatAt(`http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`)
  if (pid === null) {
    if (!await held()) {
      out(`· nothing is listening on ${port}`)
      return true
    }
    out(`✗ something that is not xokolat is on port ${port}. Stop it yourself, or start with XOKOLAT_PORT=<n>.`)
    return false
  }
  out(`· stopping xokolat (pid ${pid})`)
  process.kill(pid)
  if (!await waitForFree()) {
    out(`✗ port ${port} is still held`)
    return false
  }
  out(`✓ port ${port} is free`)
  return true
}

/** @returns whether the port is now free. */
async function stop(): Promise<boolean> {
  if (process.platform === 'win32') return stopByAsking()
  const pids = listeners()
  if (!pids.length) {
    out(`· nothing is listening on ${port}`)
    return true
  }
  const strangers: string[] = []
  for (const listener of pids) {
    const command = commandOf(listener)
    if (!OURS.test(command)) {
      strangers.push(`  pid ${listener}: ${command || '(gone)'}`)
      continue
    }
    // ⚠️ THE OWNER, NOT THE LISTENER. See `ownerOf` — a watched server's parent puts it back.
    const pid = ownerOf(listener)
    out(pid === listener
      ? `· stopping xokolat (pid ${pid})`
      : `· stopping xokolat (pid ${listener}, watched by ${pid})`)
    // SIGTERM, and no follow-up SIGKILL: this server has no shutdown work to do, so one that
    // ignores a TERM is a bug to look at rather than a process to force.
    try {
      process.kill(pid, 'SIGTERM')
    } catch (err) {
      strangers.push(`  pid ${pid}: could not stop it — ${(err as Error).message}`)
    }
  }
  if (strangers.length) {
    out(`✗ something that is not xokolat is on port ${port}:`)
    for (const line of strangers) out(line)
    out('  Stop it yourself, or start with XOKOLAT_PORT=<n>.')
    return false
  }
  if (!await waitForFree()) {
    out(`✗ port ${port} is still held after SIGTERM`)
    return false
  }
  out(`✓ port ${port} is free`)
  return true
}

const MODES = ['restart', 'stop', 'dev'] as const
type Mode = (typeof MODES)[number]

const asked = process.argv[2] ?? 'restart'
if (!(MODES as readonly string[]).includes(asked)) {
  // Named rather than silently treated as `restart`: a typo that quietly restarted the server
  // would look like the thing you asked for right up until it mattered.
  out(`✗ unknown mode ${JSON.stringify(asked)} — one of ${MODES.join(' · ')}`)
  process.exit(1)
}
const mode = asked as Mode

const free = await stop()
if (!free) process.exit(1)
if (mode === 'stop') process.exit(0)

/**
 * ⚠️ `dev` IS `restart` PLUS `--watch`, and it goes through here for the port (2026-08-18).
 * `npm run dev` used to run `node --watch src/server/main.ts` directly, which meant the ordinary
 * case — the server you started an hour ago is still up — ended in `port 18080 is already in use`
 * and a watcher sitting there waiting for a file to change. Watching is about YOUR EDITS; freeing
 * the port is about the process you left running, and both are wanted every single time.
 *
 * ⚠️ IT STILL ONLY STOPS ITS OWN. `stop()` above refuses to touch anything whose command line is
 * not this repo's entry point, and adding a mode does not buy an exception: something else on the
 * port is a thing to go and look at, not a thing for a dev script to kill.
 *
 * The env arrives through the environment, not through argv — `--env-file` on THIS process
 * (package.json) populates `process.env`, and `spawnSync` hands the child a copy. So the library
 * origin reaches the server without this file knowing the name of a single variable.
 */
// Hand the terminal to the server: this becomes the same foreground process `npm start` gives
// you, logs and Ctrl-C included.
const res = spawnSync(
  process.execPath,
  mode === 'dev' ? ['--watch', 'src/server/main.ts'] : ['src/server/main.ts'],
  { cwd: roots.install, stdio: 'inherit' },
)
process.exit(res.status ?? 1)
