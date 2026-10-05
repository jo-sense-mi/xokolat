// ✨ xoko — the assistant's own module. One import for the server, four files behind it:
//
//   grammar.ts  the directive line, the four verbs, and the parser
//   prompt.ts   who xoko is, composed from the tables in the other two
//   look.ts     the one verb this process answers, and what can be asked of it
//   here.ts     the server's half of the map — what is installed and published, per medium
//
// The loop that joins them — ask, look, ask again — is in src/server/app.ts, where the brain, the
// session and the abort signal already live.

export { ACT_VERBS, READ_VERBS, WORKFLOW_SETTING, readAnswer } from './grammar.ts'
export type { Act, ActVerb, Answer, Look } from './grammar.ts'
export { holdings, stalePublished } from './here.ts'
export { LOOKS, LOOKS_WITHOUT_A_WORD, LOOK_TARGETS, look } from './look.ts'
export type { Sight } from './look.ts'
export { FOLD, XOKO } from './prompt.ts'
