// 🔎 WHAT CAN BE LOOKED AT — the table, and nothing that does any looking.
//
// ⚠️ IT IS ITS OWN FILE SO THAT A PARSER CAN READ IT (2026-08-31). `look.ts` reaches the registry,
// the catalogs, the library and the network; `compositions/registry.ts` has to check that a step's
// `sees` names a target that exists, and importing the whole of look.ts to learn six words would
// be a cycle (look.ts loads compositions). The table is data — this is where it lives, and look.ts
// re-exports it so there is still one name for it.

/**
 * ⚠️ `needsWord` IS WHAT DECIDES WHETHER A CHAIN STEP IS HANDED A LOOK OR HAS TO ASK FOR IT
 * (2026-09-01). Five of these answer with nothing after them — `workflows` is every service on this
 * machine, `library` is everything xoko.lat publishes — and a word only NARROWS them. Two cannot
 * run at all without one: `workflow` needs a slug and `node` needs a class, and which one is the
 * thing the brain has to work out. So a `text` step declaring `sees` is given the first kind up
 * front, in its first prompt, and keeps the hop loop for the second (src/server/app.ts → text).
 *
 * The cost of not making this distinction, measured: `workflow-builder`'s survey step declares
 * `workflows` and `library`, and spent FOUR spawned `claude -p` processes and several minutes asking
 * for 3.5KB that could have ridden along with the question — while the person watched a step that
 * said `survey` and nothing else. Same reasoning as the map (web/lib/xoko-map.js): what is small
 * and fixed rides along, what is unbounded is asked for a piece at a time.
 *
 * WHAT CAN BE LOOKED AT. ⚠️ THIS TABLE IS ALSO THE PROMPT — src/xoko/prompt.ts prints it, so a
 * fifth lookup is one row here and the brain knows about it. There is no second list of these
 * words anywhere, and therefore no way to offer one that does not answer.
 */
export const LOOKS = [
  {
    id: 'library',
    what: 'everything xoko.lat publishes — workflows, styles and compositions — and whether each one'
      + ' is already installed here',
  },
  {
    id: 'workflows',
    what: 'what this machine can actually be asked for: every service installed, its workflows, and'
      + ' whether the files are on the disk — and the services this app can add without a library',
  },
  { id: 'styles', what: 'the named looks saved for each medium' },
  {
    id: 'compositions',
    what: 'the chains they own — every step, what would answer it here, and what is still missing.'
      + ' Ask for one by name to read it in full',
  },
  { id: 'made', what: 'what has been made here already — how much, and the most recent asks' },
  {
    id: 'workflow',
    needsWord: true,
    what: 'ONE installed workflow in full, by slug — what it makes, what it needs attached, and every'
      + ' setting it takes with the values each one accepts. The map already gives you this for'
      + ' whichever workflow is ARMED; ask here about one that is not',
  },
  {
    id: 'node',
    needsWord: true,
    // ⚠️ IT NAMES NO SERVICE, and that is a rule the whole prompt is held to (tests/brain.test.ts):
    // everything specific to THIS machine arrives as the map. Only a graph service can answer this
    // one, and the refusal for anything else says so at the moment it matters.
    what: 'WHAT A NODE IN A GRAPH SERVICE REALLY TAKES, read off the running service — `node'
      + ' <service> <NodeClass>`, or a word to search the classes it has. Every widget with its'
      + ' type, its range, its exact enum strings and the value it ships with. This is what you'
      + ' need before writing a hole in a workflow, and it is the one thing about a graph that must'
      + ' never be remembered or inferred',
  },
] as const

/** Just the words, for anything validating a name against them. */
export const LOOK_TARGETS: readonly string[] = LOOKS.map((l) => l.id)

/** ⚠️ THE ONES THAT ANSWER WITH NOTHING AFTER THEM — what a step that declared `sees` is simply
 *  handed, rather than made to spend a whole round trip asking for. */
export const LOOKS_WITHOUT_A_WORD: readonly string[] = LOOKS
  .filter((l) => !('needsWord' in l && l.needsWord))
  .map((l) => l.id)
