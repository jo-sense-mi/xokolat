// Is the engine there? — and the rule that makes the answer trustworthy.
//
// ⚠️ A PLAIN TCP PROBE, never a request through the engine's own queue (PLAN §13.2). Draw
// Things' `--echo-on-queue` deadlocks it: the queue blocks in the echo handler and no render
// ever runs. A liveness check that shares a lane with the work is not a liveness check.
//
// ⚠️ THE THREE FAILURE MODES ARE DISTINCT, and `can't check` is NEVER reported as `missing`
// (PLAN §13). "Not installed" tells a user to download something; saying that when the truth
// is "a firewall ate the probe" sends them to fix the wrong thing.

import { createConnection } from 'node:net'

import type { CliAuth } from './cli/brains.ts'
import { NotInstalled, run } from './cli/run.ts'

export const SERVICE_STATES = [
  /** The endpoint accepted a connection. */
  'ready',
  /** Nothing is listening — the server is DOWN. Fix: start it. */
  'down',
  /** The thing it needs is NOT INSTALLED. Fix: provision it. Only an engine the app manages
   *  can be in this state; for an `external` row, absence is indistinguishable from down. */
  'not-installed',
  /** CAN'T CHECK — a timeout, a refused route, a name that will not resolve. Not a verdict. */
  'unknown',
] as const

export type ServiceState = (typeof SERVICE_STATES)[number]

export interface Probe {
  readonly state: ServiceState
  /** What the shelf shows under the state. Present whenever the state is not `ready`. */
  readonly detail?: string
  readonly ms: number
}

/**
 * Open a TCP connection and close it. That is the whole check: bytes are never written, so it
 * cannot enqueue anything, and it cannot be starved by a render in progress.
 */
export function tcpProbe(host: string, port: number, timeoutMs: number): Promise<Probe> {
  const started = Date.now()
  return new Promise<Probe>((resolve) => {
    const done = (state: ServiceState, detail?: string): void => {
      socket.destroy()
      resolve({ state, ...(detail === undefined ? {} : { detail }), ms: Date.now() - started })
    }
    const socket = createConnection({ host, port })
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => done('ready'))
    socket.once('timeout', () => done('unknown', `no answer from ${host}:${port} in ${timeoutMs}ms`))
    socket.once('error', (err: NodeJS.ErrnoException) => {
      // ECONNREFUSED is the one error that means something definite: the host is there and
      // nothing is listening on that port. Everything else is us being unable to tell.
      if (err.code === 'ECONNREFUSED') done('down', `nothing is listening on ${host}:${port}`)
      else done('unknown', `${err.code ?? 'error'}: ${err.message}`)
    })
  })
}

/**
 * IS IT OUR SERVICE ANSWERING? — the check for an `http` row, and the reason `tcp` is not enough.
 *
 * ⚠️ AN OPEN SOCKET IS NOT THE SERVICE (2026-08-31). rembg lives on 127.0.0.1:7000 and macOS
 * AirPlay Receiver (ControlCenter) listens on *:7000 on the same machine. Whenever the daemon is
 * down — a restart, a recycle — the wildcard listener takes the connection, so `tcpProbe` connects
 * happily and the shelf says READY while every render comes back `403`. A green dot on a port that
 * will refuse the work is the exact lie this file exists to avoid, so an http row is asked a
 * QUESTION, not merely dialled.
 *
 * ⚠️ THE QUESTION IS A GET AT THE CALL'S OWN PATH, and any answer at all means the service is
 * there: rembg replies `422` to a GET with no `url`, which is a service saying "not like that" and
 * is exactly the evidence wanted. `401`/`403` are the two that mean the opposite — something is
 * holding the port and refusing us — and that is reported as `down`, with whatever it called
 * itself, because "AirTunes" in the detail line is the whole diagnosis.
 *
 * ⚠️ IT NEVER POSTS. Same discipline as the TCP probe one function up: a check that could enqueue
 * a cutout is a check that cannot run every fifteen seconds.
 */
export async function httpProbe(url: string, timeoutMs: number): Promise<Probe> {
  const started = Date.now()
  const ms = (): number => Date.now() - started
  let answer: Response
  try {
    answer = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(timeoutMs) })
  } catch (err) {
    const cause = (err as { cause?: NodeJS.ErrnoException })?.cause
    if (cause?.code === 'ECONNREFUSED') {
      return { state: 'down', detail: `nothing is listening at ${url}`, ms: ms() }
    }
    return { state: 'unknown', detail: `${cause?.code ?? 'error'}: ${(err as Error).message}`, ms: ms() }
  }
  if (answer.status === 401 || answer.status === 403) {
    const who = answer.headers.get('server')
    return {
      state: 'down',
      detail: `something on this port refused the check with ${answer.status}`
        + `${who ? ` and calls itself ${who}` : ''}`
        + ' — that is another process holding the address, not this service',
      ms: ms(),
    }
  }
  return { state: 'ready', ms: ms() }
}

/**
 * Is the command there? — the same three answers, for the one transport with no socket.
 *
 * ⚠️ IT RUNS THE VERSION ARGV AND NOTHING ELSE. That is the command-line equivalent of opening a
 * connection and closing it: offline, instant, and it cannot start a conversation, spend a
 * subscription, or leave anything behind. Every fifteen seconds, forever.
 *
 * ⚠️ AND `not-installed` IS EARNED HERE, not guessed. ENOENT from the spawn is the one signal that
 * means the binary is absent; a client that runs and exits non-zero is INSTALLED and unhappy,
 * which is a different sentence and a different fix.
 */
/**
 * ARE YOU SIGNED IN? — three answers, and `unknown` is one of them.
 *
 * ⚠️ SIGNED OUT IS EARNED, NEVER ASSUMED. A client that exits non-zero, prints something the
 * parser does not recognise, or times out leaves this `unknown`: the card then says the sign-in
 * could not be read, which sends nobody to run a login they may not need. Only the client saying
 * so in the shape we asked for produces `out`.
 */
export interface SignIn {
  readonly state: 'in' | 'out' | 'unknown'
  /** What they are on, when the client says — `pro`, `max`. Null when it does not.  */
  readonly plan: string | null
  readonly detail: string | null
  /** ⚠️ THE EXACT LINE THAT FIXES A SIGNED-OUT CLIENT, and only then. ✨ xoko shows it as
   *  something to select and paste — never as a button, because running a vendor's login flow
   *  would be this app taking hold of the one credential it deliberately never touches. */
  readonly fix?: string
}

export function signInProbe(
  bin: string, auth: CliAuth, timeoutMs: number,
): Promise<SignIn> {
  return run(bin, auth.args, { timeoutMs })
    .then((ran): SignIn => {
      const said = auth.read(ran.stdout)
      if (!said) {
        return {
          state: 'unknown', plan: null,
          detail: `${bin} ${auth.args.join(' ')} said something this build could not read`,
        }
      }
      return said.in
        ? { state: 'in', plan: said.plan, detail: null }
        : { state: 'out', plan: null, detail: `not signed in — run \`${auth.fix}\``, fix: auth.fix }
    })
    .catch((err: Error): SignIn => ({
      state: 'unknown', plan: null,
      detail: err instanceof NotInstalled ? `${bin} is not on your PATH` : err.message,
    }))
}

export function commandProbe(
  bin: string, args: readonly string[], timeoutMs: number,
): Promise<Probe> {
  const started = Date.now()
  const since = (): number => Date.now() - started
  return run(bin, args, { timeoutMs })
    .then((ran): Probe => (ran.code === 0
      ? { state: 'ready', ms: since() }
      : {
        state: 'unknown',
        detail: `${bin} ${args.join(' ')} exited ${ran.code ?? '(killed)'}`,
        ms: since(),
      }))
    .catch((err: Error): Probe => (err instanceof NotInstalled
      ? { state: 'not-installed', detail: `${bin} is not on your PATH`, ms: since() }
      : { state: 'unknown', detail: err.message, ms: since() }))
}
