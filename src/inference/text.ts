// THE TEXT BOUNDARY — the same shape as `./adapter.ts`, for the medium that is words.
//
// ⚠️ A SEPARATE INTERFACE, NOT A WIDER ONE. An image adapter returns pixels, a seed and the params
// that produced them; a brain returns a paragraph. Folding both into one `render()` would mean
// every implementation carrying fields it has no answer for, and the day a brain grows tool calls
// it is this interface that changes and not the one Draw Things is held to.
//
// ⚠️ AND THE DISPATCH IS ON THE TRANSPORT, exactly as it is for pictures: a second Ollama with
// your own id gets the same adapter, because the registry is data.

import type { Roots } from '../paths.ts'
import type { InferenceRow } from '../types/inference.ts'
import { adapter as cli } from './cli/adapter.ts'
import { adapter as openai } from './openai/adapter.ts'

/** One exchange that already happened. */
export interface Turn {
  readonly said: string
  readonly answered: string
}

export interface AskInput {
  readonly row: InferenceRow
  /** ⚠️ ONLY SO A KEY CAN BE READ, and only by the adapter that wants one. A cloud row's credential
   *  is fetched from the owner-only store (src/secrets.ts) at the moment of the call rather than
   *  held anywhere; every local row ignores this. */
  readonly roots?: Roots
  /**
   * The model, resolved — the alias or id the client is to be asked for.
   *
   * ⚠️ NULL IS A REAL ANSWER FOR A COMMAND-LINE CLIENT (2026-08-30). Some publish a model list this
   * build can name (`claude --model sonnet`); some do not, and for those the honest thing is to ask
   * the client as configured rather than to invent an id and pass it. An endpoint is the opposite —
   * `POST /chat/completions` has a required `model` field — so that adapter refuses a null and says
   * which of the two states it is in.
   */
  readonly model: string | null
  /** What was typed. */
  readonly prompt: string
  /**
   * What came before, oldest first — and the reason it arrives from OUTSIDE.
   *
   * ⚠️ NEITHER SIDE OF THIS HOLDS A CONVERSATION. The server keeps no session and the client keeps
   * no vendor handle: the browser owns the transcript it is already drawing, and sends it. That is
   * what makes a command-line brain and an OpenAI endpoint behave identically — `claude --resume`
   * would put conversation state in a place this app does not own, and Ollama has no equivalent at
   * all. Re-sending costs a few kB a turn, which at this scale is nothing.
   */
  readonly history?: readonly Turn[]
  /** How the brain is told what it is. Some clients take it as a flag, some get it prepended. */
  readonly system?: string
  readonly signal?: AbortSignal
  /**
   * Called with each piece of the answer as it arrives.
   *
   * ⚠️ OPTIONAL ON BOTH SIDES. A caller that does not pass one gets the whole answer at the end; a
   * client that cannot stream simply never calls it, and the caller cannot tell the difference
   * except in the timing. That is what keeps `ask` ONE method — a second `stream()` would mean
   * every adapter implementing the same thing twice and one of them rotting.
   */
  readonly onDelta?: (text: string) => void
  readonly log?: (line: string) => void
}

export interface AskOutput {
  readonly text: string
  /** What actually answered, for the transcript's byline. Null when the client was asked as
   *  configured and did not say. */
  readonly model: string | null
}

export interface TextAdapter {
  ask(input: AskInput): Promise<AskOutput>
}

export function textAdapterFor(row: InferenceRow): TextAdapter {
  if (row.transport?.kind === 'cli') return cli
  if (row.transport?.kind === 'openai') return openai
  throw new Error(
    `${row.id} cannot be asked a question: `
    + `${row.transport?.kind ?? 'no'} transport does not speak text`,
  )
}
