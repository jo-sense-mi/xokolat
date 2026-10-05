// AN OPENAI-COMPATIBLE ENDPOINT — Ollama, LM Studio, llama.cpp's server, and every cloud that
// copied the same three fields.
//
// ⚠️ ONE ADAPTER, NOT ONE PER VENDOR, for the same reason the plain-http one is generic: what
// varies between these is a host, a port and a model name, and all three are already registry
// data. `POST {basePath}/chat/completions` with `{model, messages}` is the whole protocol this
// app needs from it.
//
// ⚠️ AND A KEY IS A NAME HERE TOO (2026-08-12). The row says WHICH key it wants; the value is read
// from the owner-only store at the moment of the call (src/secrets.ts) and never held, logged or
// returned. A cloud row and a row on `127.0.0.1` are otherwise the same code, which is the point:
// what changes between them is a host, a scheme and one header.

import type { Roots } from '../../paths.ts'
import { readSecret } from '../../secrets.ts'
import type { InferenceRow } from '../../types/inference.ts'
import type { AskInput, AskOutput, TextAdapter } from '../text.ts'

/**
 * Three minutes of SILENCE. A local 30B model on a cold load thinks for a long time before the first
 * token — and once it is emitting, it may go on for far longer than three minutes on a long answer.
 *
 * ⚠️ IT IS AN IDLE TIMEOUT, NOT A WALL CLOCK (2026-09-04). `AbortSignal.timeout` covers the body
 * stream as well as the connect, so a streamed answer was killed at three minutes however healthily
 * it was arriving. The same correction as the CLI transport's (src/inference/cli/run.ts): a model
 * that has been emitting for four minutes has not hung; one that has said nothing for three is the
 * only thing worth giving up on.
 */
const TIMEOUT_MS = 180_000

/** A signal that fires after `TIMEOUT_MS` of nothing. `alive()` starts the wait again; `stop()` ends
 *  it, so a finished answer does not leave a timer holding the process open. */
function idleSignal(id: string): { signal: AbortSignal; alive: () => void; stop: () => void } {
  const ctl = new AbortController()
  let timer: NodeJS.Timeout
  const arm = (): void => {
    timer = setTimeout(
      () => ctl.abort(new Error(`${id} went quiet for ${Math.round(TIMEOUT_MS / 1000)}s`)),
      TIMEOUT_MS)
  }
  arm()
  return {
    signal: ctl.signal,
    alive: () => { clearTimeout(timer); arm() },
    stop: () => clearTimeout(timer),
  }
}

export function baseUrl(row: InferenceRow): string {
  const t = row.transport
  if (t?.kind !== 'openai') throw new Error(`${row.id} is not an OpenAI-compatible endpoint`)
  if (t.port === 'auto') throw new Error(`${row.id} has no port yet — nothing has started it`)
  // `/v1` is where every one of these lives, and a row that says otherwise wins.
  return `${t.tls ? 'https' : 'http'}://${t.host}:${t.port}${t.basePath ?? '/v1'}`
}

/**
 * The request headers, with the key in them if this row wants one.
 *
 * ⚠️ READ AT THE MOMENT OF THE CALL, never cached. A key you rotate is a key that works on the next
 * press, and a process that has been running for a week holds nothing worth stealing from it.
 * ⚠️ AND A ROW THAT WANTS A KEY IT HAS NOT GOT SAYS SO HERE, by name, rather than sending the word
 * "undefined" to a cloud and reporting whatever 401 comes back.
 *
 * `need: false` for the one call where a key is not a requirement: several of these endpoints
 * publish their MODEL LIST to anyone, so the picker can fill in before the key does. Whether that
 * is true is the endpoint's business, so it is asked rather than assumed — and if it wants one, its
 * own 401 is the answer.
 */
export async function headersFor(
  row: InferenceRow, roots: Roots | null, extra: Record<string, string> = {},
  { need = true } = {},
): Promise<Record<string, string>> {
  const auth = row.transport?.kind === 'openai' ? row.transport.auth : undefined
  if (!auth) return extra
  const key = roots ? await readSecret(roots, auth.secret) : null
  if (key) {
    return auth.header
      ? { ...extra, [auth.header]: key }
      : { ...extra, authorization: `Bearer ${key}` }
  }
  if (!need) return extra
  if (!roots) throw new Error(`${row.id} needs a key, and this call has nowhere to read one from`)
  throw new Error(`${row.id} needs its ${auth.secret} key — set it on the service in 🔌 settings`)
}

/**
 * The SSE half of this family's protocol: `data: {…}` per line, `data: [DONE]` at the end.
 *
 * ⚠️ IT IS NOT REALLY SSE AND MUST NOT BE PARSED AS THOUGH IT WERE — there are no event names and
 * no ids, and `EventSource` cannot POST anyway. Lines beginning `data: `, everything else ignored.
 */
async function readStream(
  answer: Response, onDelta: (text: string) => void, id: string, alive: () => void = () => {},
): Promise<string> {
  const body = answer.body
  if (!body) throw new Error(`${id} answered with no body to read`)
  const decoder = new TextDecoder()
  let pending = ''
  let text = ''
  for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
    // It is still talking, so the wait starts again.
    alive()
    pending += decoder.decode(chunk, { stream: true })
    const lines = pending.split('\n')
    pending = lines.pop() ?? ''
    for (const line of lines) {
      const payload = line.startsWith('data:') ? line.slice(5).trim() : ''
      if (!payload || payload === '[DONE]') continue
      let parsed: { choices?: { delta?: { content?: string } }[] }
      try { parsed = JSON.parse(payload) } catch { continue }
      const bit = parsed.choices?.[0]?.delta?.content
      if (bit) { text += bit; onDelta(bit) }
    }
  }
  return text.trim()
}

export const adapter: TextAdapter = {
  async ask({
    row, roots, model, prompt, system, history = [], signal, onDelta, log,
  }: AskInput): Promise<AskOutput> {
    const url = `${baseUrl(row)}/chat/completions`
    const messages = [
      ...(system ? [{ role: 'system', content: system }] : []),
      // The transcript in the shape this family invented. Whatever came before is a pair of
      // messages, exactly as if the conversation had never left.
      ...history.flatMap((t) => [
        { role: 'user', content: t.said },
        { role: 'assistant', content: t.answered },
      ]),
      { role: 'user', content: prompt },
    ]
    // ⚠️ AN ENDPOINT HAS NO "AS CONFIGURED" STATE. `model` is a required field of the request, so
    // a null here is a connection nobody finished — say that, rather than sending `"model": null`
    // and reporting whatever the server makes of it.
    if (!model) {
      throw new Error(`${row.id} has no model chosen — pick one in ✨ xoko, or name one by hand`)
    }
    log?.(`POST ${url} · ${model}`)
    const idle = idleSignal(row.id)
    try {
      const answer = await fetch(url, {
        method: 'POST',
        headers: await headersFor(row, roots ?? null, { 'content-type': 'application/json' }),
        // Saying `stream: false` out loud is cheaper than being surprised by a server whose default
        // is not what the spec says.
        body: JSON.stringify({ model, messages, stream: !!onDelta }),
        signal: signal ? AbortSignal.any([signal, idle.signal]) : idle.signal,
      })
      if (!answer.ok) {
        throw new Error(`${row.id} answered ${answer.status}: ${(await answer.text()).slice(0, 300)}`)
      }
      if (onDelta) {
        return { text: await readStream(answer, onDelta, row.id, idle.alive), model }
      }
      const body = await answer.json() as {
        choices?: { message?: { content?: string } }[]
        model?: string
      }
      const text = body.choices?.[0]?.message?.content?.trim() ?? ''
      if (!text) throw new Error(`${row.id} answered with no content — is ${model} pulled?`)
      return { text, model: body.model ?? model }
    } finally {
      idle.stop()
    }
  },
}

/** What this endpoint says it has. Used by the catalog, which is why it is here and not there. */
export async function listModels(
  row: InferenceRow, roots: Roots | null = null, timeoutMs = 4000,
): Promise<string[]> {
  const answer = await fetch(`${baseUrl(row)}/models`, {
    headers: await headersFor(row, roots, {}, { need: false }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!answer.ok) throw new Error(`asking ${row.id} for its models answered ${answer.status}`)
  const body = await answer.json() as { data?: { id?: string }[] }
  return (body.data ?? []).map((m) => m.id).filter((id): id is string => typeof id === 'string')
}
