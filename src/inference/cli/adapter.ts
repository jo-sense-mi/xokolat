// ASKING A LOCAL CLIENT — the subscription path, and one command per question.
//
// The whole of the per-vendor knowledge is `./brains.ts`; this file only assembles what that says
// into an argv and reads the answer off stdout. That split is what keeps the promise made there:
// a row picks a brain by NAME, and there is no path from any input to the command that runs.

import type { AskInput, AskOutput, TextAdapter } from '../text.ts'
import { brainFor } from './brains.ts'
import { NotInstalled, run } from './run.ts'

export const adapter: TextAdapter = {
  async ask({
    row, model, prompt, system, history = [], signal, onDelta, log,
  }: AskInput): Promise<AskOutput> {
    const transport = row.transport
    if (transport?.kind !== 'cli') throw new Error(`${row.id} is not a command-line brain`)
    const brain = brainFor(transport.brain)
    if (!brain) {
      throw new Error(`${row.id} names a brain this build does not ship: ${transport.brain}`)
    }

    // Streaming is asked for by the CALLER and answered by the CLIENT: a different argv, and the
    // answer read off a JSONL stream instead of off stdout.
    const live = onDelta ? brain.stream : null
    const args = [...(live?.ask ?? brain.ask)]
    if (brain.modelFlag && model) args.push(brain.modelFlag, model)
    // The framing goes in the flag when the client has one, and on stdin when it does not — either
    // way the person's own words are the last thing in, and the only thing that varies.
    if (system && brain.systemFlag) args.push(brain.systemFlag, system)

    // ⚠️ THE TRANSCRIPT IS PLAIN TEXT, because a command line client has no message array to put
    // it in. `-p` starts a fresh session every time — which is the honest behaviour to build on:
    // there is no hidden state anywhere, and what the brain knows is exactly what is on screen.
    const before = history.map((t) => `You: ${t.said}\nxoko: ${t.answered}`).join('\n\n')
    const said = before ? `${before}\n\nYou: ${prompt}\nxoko:` : prompt
    const input = system && !brain.systemFlag ? `${system}\n\n${said}` : said

    log?.(`${brain.bin} ${args.join(' ')} · ${input.length} chars on stdin`)
    const started = Date.now()

    let streamed = ''
    let ran
    try {
      ran = await run(brain.bin, args, {
        input,
        timeoutMs: 180_000,
        ...(signal ? { signal } : {}),
        ...(live && onDelta ? {
          onLine: (line: string) => {
            let parsed: unknown
            // ⚠️ A LINE THAT WILL NOT PARSE IS SKIPPED, NOT THROWN. Clients print warnings, update
            // notices and progress to the same stream; one of them must not lose the answer.
            try { parsed = JSON.parse(line) } catch { return }
            const bit = live.delta(parsed)
            if (bit) { streamed += bit; onDelta(bit) }
          },
        } : {}),
      })
    } catch (err) {
      // ⚠️ THE TWO FAILURES A PERSON CAN ACT ON, kept apart. "Not installed" and "installed but
      // not logged in" send you to different places, and the shelf's whole discipline is that one
      // is never reported as the other.
      if (err instanceof NotInstalled) {
        throw new Error(`${brain.label} is not installed — ${brain.bin} is not on your PATH`)
      }
      throw err
    }

    // Streaming: the answer is what came through the deltas — stdout is a log of envelopes.
    const text = (live ? streamed : ran.stdout).trim()
    if (ran.code !== 0) {
      const said = (ran.stderr.trim() || text).split('\n').slice(0, 4).join(' ').slice(0, 400)
      throw new Error(
        `${brain.label} exited ${ran.code ?? '(killed)'}${said ? `: ${said}` : ''}`
        + `\nif it is asking you to sign in, ${brain.login}`,
      )
    }
    if (!text) {
      throw new Error(`${brain.label} answered nothing — ${brain.login}, then try again`)
    }

    log?.(`answered in ${((Date.now() - started) / 1000).toFixed(1)}s`)
    return { text, model }
  },
}
