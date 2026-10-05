// 🗣 WHAT A `text` STEP IS ACTUALLY ASKED — the one thing a chain needs that neither the workflow nor
// the step reliably carries.
//
// ⚠️ THE PROBLEM, PLAINLY. A `chat` workflow is "this model, over this transport". It has a label
// ("turn a sentence into a prompt") and notes, and no instruction — because what to ask a model is
// not a fact about the service it runs on. So a chain whose first step writes the prompt its second
// step renders would, with nothing here, send your sentence to a chat model and get back
// "Sure! Here's a vivid description:" — and then render THAT.
//
// ⚠️ TWO SOURCES, AND ONLY ONE OF THEM IS OURS:
//
//   the step's `says`   the composition author's own instruction. The whole of the task.
//   the frame           ⭣ ours, and it is two sentences: answer with the thing, not about it.
//
// ⚠️ THE WORKFLOW USED TO BE A THIRD, AND IT CANNOT BE ANY MORE (2026-08-24). It read the label and
// notes of the workflow the step named — "turn a sentence into a prompt" — which worked precisely
// because the step named a workflow chosen FOR that job. Words are xoko now: the model answering is
// whichever brain the person armed in 🔌, and its label says who it is rather than what this step
// is for. Borrowing from it would put "Claude Code, on the subscription you already have" in front
// of an instruction to write a character description.
//
// ⚠️ THE FRAME IS ALWAYS ADDED, even under a hand-written `says`. It is not advice about the task —
// it is the fact that this answer is being handed to a machine rather than read by a person, which
// the composition author should not have to remember to say and a small local model will otherwise
// get wrong every time.

import type { MakeStep } from '../types/composition.ts'

/**
 * ⚠️ NOT A PERSONALITY. Every word here earns its place by preventing a specific failure seen from
 * small models: the preamble ("Sure! Here's…"), the sign-off, the markdown fence, the helpful
 * explanation of what was done, and the question back.
 */
const FRAME = 'Answer with the result and nothing else: no preamble, no explanation, no quotation '
  + 'marks, no markdown, and no question back. What you write is handed straight to another '
  + 'program, so it has to stand alone.'

export function saysFor(step: Pick<MakeStep, 'says'>): string {
  const own = step.says?.trim()
  // ⚠️ A STEP WITH NOTHING TO GO ON STILL GETS THE FRAME, which is the difference between a chatty
  // answer and a usable one. It is the floor, not a guess at the task.
  return own ? `${own}\n\n${FRAME}` : FRAME
}
