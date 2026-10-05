// 🗺 THE MAP — what xoko is told this app currently holds, generated from the same lists the nav
// is drawn from.
//
// ⚠️ IT IS GENERATED, NEVER WRITTEN (2026-08-22). The alternative was a paragraph in the system
// prompt describing the sections — and that paragraph would be a second copy of the menu, wrong
// the day somebody added a row to the first one. Everything below reads SECTIONS, GROUPS and the
// armed workflows: install a composition and it appears here in the same second it appears in the
// nav, with no prompt to edit and no verb to add.
//
// ⚠️ AND IT IS COMPOSED IN THE BROWSER BECAUSE THE BROWSER IS WHERE THE APP IS. Which workflow
// answers a medium lives in the person's own storage, per capability; the nav is a registry in a
// module the server never loads. Rebuilding either server-side would be a second opinion about
// what is on screen, and the screen would win. It rides on stdin with the question, capped there
// (src/server/app.ts → MAP_CHARS) — the browser says what is true, the server decides what a press
// may cost.
//
// ⚠️ SMALL, FIXED, AND ALWAYS SENT. This is the part the brain should never have to ask for:
// where things are, and what each place is for. Everything unbounded — the library, the styles,
// every asset ever made — is asked for a piece at a time with `▶ look:` (src/xoko/look.ts). The
// split is the whole reason a map of an app with four thousand pictures in it is still ten lines.

/**
 * One nav row, as a line the brain can act on: the id is what `▶ go:` takes.
 *
 * ⚠️ A COMPOSITION ROW SAYS WHETHER IT CAN RUN, because it is the only row that is also a VERB —
 * `▶ make <it>: <sentence>` starts the whole chain. Offering to run one that would stop on step two
 * is worse than not offering, and the app already knows which is which.
 *
 * ⚠️ AND IT SAYS WHAT EACH STEP IS PLUGGED WITH (2026-08-29). A chain's engines are chosen per
 * STEP, in its own ⚙ band, and are not the shelf's — so the per-medium block below, which is the
 * only place this map used to name a workflow, says nothing true about what `▶ make mascot:` would
 * run. Without this line xoko can offer a chain and cannot answer "what with?", which is the first
 * thing anybody asks about one.
 */
const place = (s) => `    ${s.id} ${s.icon ?? ''} ${s.label}`
  + (s.what ? ` — ${s.what}` : '')
  + (s.ready === undefined ? '' : (s.ready
    ? ' [a chain — ▶ make it by this id, one sentence runs every step]'
    : ' [a chain, NOT READY — something it needs is not installed]'))
  + (s.plugs?.length
    // Not a settable list: a chain's plugs are the person's, set in its ⚙ band, and there is no
    // bracket that reaches them. This is a READOUT — what to say when asked, and what stops a
    // brain assuming the chain runs on whatever the medium's line says.
    ? `\n      its steps run on: ${s.plugs.map(
      (g) => `${g.step} → ${g.workflow ?? 'NOTHING — this step is unbound'}`).join(' · ')}`
    : '')

/**
 * @param groups    the GROUPS array — the menu's order, including the shelves that are empty
 * @param sections  the SECTIONS array — every row that exists, with its one-line `what`
 * @param media     the generated media, server-owned
 * @param armedFor  (medium) → the plugged workflow, or null. What ▶ would use in that section.
 */
export function xokoMap({ groups = [], sections = [], media = [], armedFor = () => null } = {}) {
  const lines = ['THE MENU, TOP TO BOTTOM — the id is what you name in ▶ go:']
  for (const g of groups) {
    lines.push(`  ${g.id}`)
    const rows = sections.filter((s) => s.group === g.id)
    if (rows.length) lines.push(...rows.map(place))
    // ⚠️ AN EMPTY SHELF IS SAID OUT LOUD, WITH ITS DOOR. The whole point of the compositions group
    // is that it starts empty and fills with what you own — a brain that simply did not see it
    // would answer "this app has no characters" instead of "you have not taken one yet, here is
    // where they come from".
    else lines.push(`    (empty — ${g.add?.label ?? 'nothing here yet'}${g.add?.href ? `, from ${g.add.href.replace('#/', '')}` : ''})`)
  }

  lines.push('', 'WHAT ▶ WOULD RUN, PER MEDIUM — you name the medium, this answers it. A chain is'
    + ' not covered by this: its steps are plugged one by one, on its own row above.'
    + ' Anything in [square brackets] is what THIS workflow can be set to: write them into the line'
    + ' as `▶ make <medium> [key value, key value]: …`, and leave out anything they did not ask'
    + ' for — an unset knob keeps the value the workflow was published with. One marked TEXT goes in'
    + ' a fence under the line instead, because it may run to several of them.')
  for (const m of media) {
    const w = armedFor(m)
    lines.push(`  ${m} — ${w ? `${w.slug} (${w.kind}) on ${w.service}${needs(w)}${dials(w)}` : 'NOTHING ARMED — nothing here can make one yet'}`)
  }
  return lines.join('\n')
}

/**
 * WHAT THIS WORKFLOW CAN BE SET TO — the whole of "xoko can operate a workflow", and it is a line of
 * the map rather than a paragraph of the prompt.
 *
 * ⚠️ IT COMES FROM THE WORKFLOW, WHICH IS WHY IT WORKS FOR ONE NOBODY HAS WRITTEN YET. `settable` is
 * the medium's knob table intersected with the holes this graph declares (src/inference/knobs.ts,
 * computed server-side), so arming `music-sung` over `music-fast` adds `lyrics` and `language`
 * here in the same second it adds them to the ⚙ pane. A prompt that listed knobs would be a copy
 * of the catalog and would be wrong the day after it was written — the same reason the four verbs
 * do not name a single section.
 *
 * ⚠️ AND THE RANGE AND THE CHOICES COME WITH IT. A brain told only the key writes `keyscale d
 * minor` and the render fails at prompt validation on a string the model compares exactly; told
 * the list, it writes one from the list. Long enumerations are trimmed — the point is to show the
 * SHAPE of a legal value, and `▶ look: workflow <slug>` gives the whole of it when it matters.
 */
const SHOW = 6

function dials(w) {
  const knobs = w.settable ?? []
  if (!knobs.length) return ''
  // ⚠️ THE UNIT RIDES WITH THE NUMBERS, and leaving it off cost a press (2026-08-24). This line
  // prints shapes, never `what` — `what` is a sentence and the map goes out with every question —
  // so a frame count arrived as `length 17 | 33 | 49 | 81 | 121`: five numbers meaning nothing.
  // Asked for "five seconds", a brain reaches for `duration`, the word 🎼 and 🔊 use, and is
  // refused for a knob 🎬 does not have. `unit` is the one word that makes the numbers readable.
  const said = (k, body) => `${k.key} ${body}`
    + (k.unit ? ` (${k.unit}${k.perSecond ? `, ${k.perSecond} a second` : ''})` : '')
  const one = (k) => {
    if (k.choices?.length) {
      const shown = k.choices.slice(0, SHOW).join(' | ')
      // ⚠️ A SUBORDINATE LIST IS SAID TO BE A SHORTCUT, NOT AN EDGE (2026-08-31). Qwen3-TTS lists
      // eleven languages and reads Catalan perfectly when the DESCRIPTION says so — and a brain
      // handed the eleven as though they were the model's whole vocabulary either picks the
      // nearest wrong one or reports that it cannot. One clause is the difference between a
      // Catalan line and a Spanish accent reading Catalan words.
      const edge = k.subordinate
        ? ' — or name it in the description instead, for anything not on this list'
        : ''
      return said(k, `${shown}${k.choices.length > SHOW ? ` | …${k.choices.length} in all` : ''}`) + edge
    }
    if (k.suggest?.length) return said(k, k.suggest.join(' | '))
    if (k.range) return said(k, `${k.range[0]}–${k.range[1]}`)
    // ⚠️ A TEXT KNOB SAYS SO, AND THAT IS NOT COSMETIC (2026-08-23). `lyrics <words>` read exactly
    // like `voice <words>` — a phrase — so a lyric sheet went into the bracket, split on its own
    // commas, and arrived as four invented knobs. The bracket cannot hold a line break at all.
    // Marking it TEXT is what points at the fence, which needs no escaping (readBlocks).
    return `${k.key} TEXT — in a \`\`\`${k.key} fence under the line`
  }
  // ⚠️ THE ADVANCED ONES ARE COUNTED, NOT LISTED — and they are still settable (2026-08-23). One
  // ACE-Step workflow exposes twenty widgets; printing all of them, with a 44-entry sampler enum,
  // into the map that rides on EVERY question costs more context than the answer is worth. So the
  // line carries what somebody asking for a song actually names, and says how many more there are
  // and the one command that shows them whole. A trimmed line, never a trimmed capability.
  const plain = knobs.filter((k) => !k.advanced)
  const deep = knobs.length - plain.length
  // ⚠️ `workflow` IS OFFERED ALONGSIDE THEM, and it is the one setting that is not a knob: it swaps
  // which path answers rather than what that path is set to. It belongs in the same bracket
  // because it is the same kind of decision — a property of this press — and giving it punctuation
  // of its own would have meant a line nobody could read.
  // ⚠️ `title` IS THE OTHER NON-KNOB IN THE BRACKET, and it is settable on EVERY workflow: it names
  // the run in the library rather than reaching the graph at all. Worth offering because a media
  // list is read by name, and a name read off a generation prompt is only ever adequate.
  return ` [${plain.map(one).join(', ')}`
    + (deep ? `, +${deep} more — ▶ look: workflow <this slug>` : '')
    + ', title <what to call it — any workflow>'
    + ', workflow <another for this medium — ▶ look: workflows>]'
}

/**
 * WHAT THE ARMED WORKFLOW WANTS BEFORE IT WILL RUN — and it is not always a sentence.
 *
 * ⚠️ THIS IS THE 3D LINE (2026-08-22). Most image-to-3D workflows declare no `prompt` and one `ref`
 * slot: the PICTURE is the ask, and pressing ▶ with only words is refused by the section before it
 * queues. Without this the map said `model3d — mesh (i23d) on comfyui` and a brain read that as
 * armed and ready, promised a mesh from a sentence, and spent the person's turn on a refusal it
 * had been told nothing about.
 *
 * ⚠️ AND xoko CANNOT ATTACH THE PICTURE. Its four verbs are look, go, take and make — none of them
 * puts a file on the tray. So a workflow that needs one is a place to SEND somebody (▶ go:), never a
 * thing to promise, and the words here say so in the imperative rather than as a property.
 */
function needs(w) {
  const slots = w.slots ?? []
  const wordless = !(w.inputs ?? ['prompt']).includes('prompt')
  if (!slots.length) return wordless ? ' — TAKES NO WORDS: press it with an empty line' : ''
  return ` — NEEDS ${slots.join(' + ')} ATTACHED: only they can drop a picture on the bar, so send`
    + ' them there rather than offering to make one'
    + (wordless ? ', and the line is just a name for the run' : '')
}
