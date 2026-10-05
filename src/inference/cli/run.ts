// RUNNING ONE COMMAND, once, with an argv array — the only place this app starts a process for
// an answer.
//
// ⚠️ NO SHELL, EVER (PLAN §15 rule 1). `spawn` with an array does not go through `sh`, so a
// sentence containing `; rm -rf ~` is a sentence. There is no string to quote and therefore no
// quoting to get wrong, which is the point of the argv discipline rather than a bonus of it.
//
// ⚠️ AND THE INPUT GOES ON STDIN. Unbounded text in argv is a length limit waiting to be hit and
// a copy of everything you typed in the process table.

import { spawn } from 'node:child_process'

export interface Ran {
  readonly code: number | null
  readonly stdout: string
  readonly stderr: string
}

/** The binary is not on PATH. Its own state on the shelf (`not-installed`), never `down`. */
export class NotInstalled extends Error {
  readonly bin: string

  constructor(bin: string) {
    super(`${bin} is not on your PATH`)
    this.name = 'NotInstalled'
    this.bin = bin
  }
}

/**
 * ⚠️ THE TIMEOUT MEASURES SILENCE, NOT DURATION (2026-09-04).
 *
 * It was a wall clock: 180 seconds from spawn to answer, whatever the client was doing in between.
 * That number has to be wrong in one of two directions, and it was wrong in both — long enough that
 * a genuinely hung process holds a chain for three minutes, and far too short for the longest thing
 * this app asks for. The composition builder's `shape` step reads node schemas and writes a whole
 * composition with a graph inside it, and it was killed mid-answer with "claude did not answer
 * within 180s" after the survey before it had already been paid for.
 *
 * A model that has been emitting text for four minutes has not hung. A model that has said nothing
 * for ninety seconds has. So the timer restarts on every byte, and the one number means the one
 * thing it should: how long we wait for a client that has gone quiet.
 *
 * ⚠️ WHICH ONLY WORKS IF THE CLIENT ACTUALLY STREAMS. `--output-format text` buffers — measured,
 * see brains.ts — so under it silence and duration are the same thing and this changes nothing.
 * The callers that ask for a long answer pass `onDelta`, which selects the streaming argv.
 */
export function run(
  bin: string,
  args: readonly string[],
  { input = '', timeoutMs = 120_000, signal, onLine }: {
    input?: string
    /** How long the client may be SILENT before it is killed. Reset by any output. */
    timeoutMs?: number
    signal?: AbortSignal
    /** Called with each COMPLETE line of stdout as it arrives — the streaming hook. Whole lines
     *  because every client that streams does so as JSONL, and half a line is not parseable. */
    onLine?: (line: string) => void
  } = {},
): Promise<Ran> {
  return new Promise<Ran>((resolve, reject) => {
    // ⚠️ cwd IS DELIBERATELY NOT THE CONTENT ROOT. An agentic client reads its surroundings —
    // project files, per-directory settings — and the answer to "what should xoko see" is nothing.
    const child = spawn(bin, [...args], { stdio: ['pipe', 'pipe', 'pipe'], cwd: '/' })
    let out = ''
    let err = ''
    let settled = false

    let timer: NodeJS.Timeout
    const quiet = (): void => {
      timer = setTimeout(() => {
        if (settled) return
        settled = true
        child.kill('SIGKILL')
        reject(new Error(`${bin} went quiet for ${Math.round(timeoutMs / 1000)}s`))
      }, timeoutMs)
    }
    /** Something arrived, so it is alive — start the wait again. */
    const alive = (): void => { if (!settled) { clearTimeout(timer); quiet() } }
    quiet()

    const onAbort = (): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.kill('SIGKILL')
      reject(new Error(`${bin} was stopped`))
    }
    signal?.addEventListener('abort', onAbort, { once: true })

    const done = (fn: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      fn()
    }

    let pending = ''
    child.stdout.on('data', (c: Buffer) => {
      alive()
      const text = c.toString('utf8')
      out += text
      if (!onLine) return
      pending += text
      // ⚠️ SPLIT ON NEWLINES, NEVER ON CHUNK BOUNDARIES. A pipe hands over whatever happens to be
      // in the buffer, so one JSONL record routinely arrives in two pieces and two arrive in one.
      const lines = pending.split('\n')
      pending = lines.pop() ?? ''
      for (const line of lines) if (line.trim()) onLine(line)
    })
    // ⚠️ STDERR COUNTS AS ALIVE TOO. Clients print progress, update notices and rate-limit warnings
    // there; a process talking on the wrong stream is still a process that is working.
    child.stderr.on('data', (c: Buffer) => { alive(); err += c.toString('utf8') })
    child.on('error', (e: NodeJS.ErrnoException) => {
      done(() => reject(e.code === 'ENOENT' ? new NotInstalled(bin) : e))
    })
    child.on('close', (code) => done(() => {
      // A client that exits without a trailing newline still wrote a line.
      if (onLine && pending.trim()) onLine(pending)
      resolve({ code, stdout: out, stderr: err })
    }))

    child.stdin.on('error', () => { /* it exited before reading; `close` carries the verdict */ })
    child.stdin.end(input)
  })
}
