// ⚙ THE CONTROLS A WORKFLOW BRINGS — drawn from the server's knob table, never hand-written.
//
// ⚠️ WHY THIS IS DATA AND NOT FIVE FIELDS (2026-08-23). 🎼 music had ONE control, a length, written
// out by hand — while the graph it presses declares a tempo, a key, a language and a lyric sheet,
// every one of them reachable and none of them reachable from here. The fix is not four more
// hand-written rows: it is that a section stops knowing what its medium can be asked for. The
// server says (src/inference/knobs.ts), narrowed to the holes the ARMED workflow really declares
// (`settable`), and this file turns that list into controls.
//
// So the fifth medium costs nothing, and a workflow published tomorrow that exposes a knob this
// build has never drawn gets a control the moment the table names it. Same trade the ⚙ editor in
// 🔌 already makes; this is that idea in the launch pane, where the ASK-shaped knobs live.
//
// ⚠️ A KNOB WITH NOTHING SET SENDS NOTHING. Not its fallback — the graph's own value is a working
// one, chosen by whoever published it, and overwriting it with the app's idea of a default is how
// a published workflow stops meaning what it says. Blank is a real state and it means "as published".
//
// ⚠️ AND SINCE 2026-08-31 IT SAYS WHAT "AS PUBLISHED" IS. The rule above is right and it was kept
// as a SECRET: every box read the words `as published`, so the only way to learn the value behind
// them was to render. For `bpm` that is survivable; for `cfg` it is not — `ace-step` publishes the
// turbo checkpoint at `steps 8, cfg 1.0` and the sft profile wants `50 / 3.5`, and crossing them
// in either direction distorts. The placeholder is now the value itself (`Knob.published`), so
// blank still sends nothing and a moved box reads as moved.
//
// ⚠️ AND `what` GOES IN A `title`, NOT UNDER THE FIELD. A settings pane shows controls; the prose
// that explains one is a tooltip and a source comment.

import { el, fieldRow, select } from './launch-kit.js?v=129'

/**
 * Remember what was set — per WORKFLOW and knob.
 *
 * ⚠️ IT WAS KEYED PER MEDIUM UNTIL 2026-08-31, AND THAT WAS THE DISTORTION BUG. "A tempo you chose
 * is still your tempo tomorrow" is a good rule for a tempo and a wrong one for a knob that belongs
 * to a profile: set `cfg 3.5` correctly on a careful workflow, arm the quick one, and 3.5 was still
 * sitting in the box — on a turbo checkpoint that wants 1.0. The app carried a value across a
 * workflow change that made it wrong. A tempo is cheap to retype; a stale `cfg` ruins a render.
 */
const memoryKey = (workflow, key) => `xokolat:knob:${workflow}:${key}`

/** The word for "nobody set this", which is a different sentence when the list is not the edge of
 *  what the model does — see `Knob.subordinate` (src/inference/knobs.ts). */
const asPublished = (knob) => (knob.subordinate
  ? 'from the words'
  : (knob.published === undefined ? 'as published' : String(knob.published)))

/** Seconds as somebody would say them: `94` reads as `1m 34s`, `30` stays `30s`. */
const secs = (v) => (v < 60 ? `${v}s` : `${Math.floor(v / 60)}m ${v % 60}s`.replace(' 0s', ''))

/**
 * One control for one knob. Returns `{ row, value() }`, where `value()` is `undefined` for
 * untouched — which is what keeps the graph's own number in force.
 */
function control(workflow, knob) {
  const remembered = localStorage.getItem(memoryKey(workflow, knob.key)) ?? ''
  const blank = asPublished(knob)
  let node

  if (knob.kind === 'boolean') {
    // ⚠️ A SELECT, NOT A CHECKBOX. Blank has to stay reachable — every control here means "as
    // published" when it is empty, and a checkbox has no third state to say that with.
    node = select([{ value: 'true', label: 'on' }, { value: 'false', label: 'off' }], blank)
  } else if (knob.kind === 'choice' || knob.suggest?.length) {
    const opts = (knob.choices ?? knob.suggest ?? []).map((v) => ({
      value: String(v),
      // ⚠️ THE UNIT DECIDES, NOT THE KEY (2026-08-31). This compared the key to the literal
      // `duration`, so 🎼's length read `1m 34s` and 🔊's — the same word, the same seconds, a
      // different table — read `94`. A knob says what its numbers are counted in; anything counted
      // in seconds gets said the way a person says it, and everything else is left in the model's
      // own spelling, because a name translated here is a name you cannot type anywhere else.
      // ⚠️ AND A KNOB COUNTED IN SOMETHING ELSE SAYS WHAT IT IS WORTH (2026-09-04). 🎬's clock is
      // FRAMES, in blocks of 17 — 56 | 90 | 124 | 158 is four numbers a person has to divide by
      // hand and a brain reached past entirely, writing `duration 5` for a knob 🎬 does not have.
      // `perSecond` is the arithmetic as a number, so the menu reads `124 — 5s` and nobody has to
      // know the number 124 exists.
      label: /^seconds/.test(knob.unit ?? '')
        ? secs(Number(v))
        : (knob.perSecond ? `${v} — ${secs(Math.round(Number(v) / knob.perSecond))}` : String(v)),
    }))
    node = select(opts, blank)
  } else if (knob.kind === 'text') {
    // ⚠️ A TEXTAREA WHEN THE KNOB SAYS SO, NOT WHEN THE KEY IS SPELLED `lyrics` (2026-08-23). It
    // compared the key to that one literal, so a lyric sheet got four lines and 🗣's voice
    // description — prose, and the only field in the whole section — got a 190px strip beside a
    // 96px label, with the words running off the end sideways. `multiline` is now a fact a knob
    // carries, so the app's own table and a workflow published tomorrow can both declare it
    // (src/inference/knobs.ts).
    node = knob.multiline
      ? el('textarea', { rows: knob.key === 'lyrics' ? '8' : '3', placeholder: knob.what })
      : el('input', { type: 'text', placeholder: blank })
  } else {
    const [lo, hi] = knob.range ?? []
    node = el('input', {
      type: 'number', placeholder: blank,
      ...(lo === undefined ? {} : { min: String(lo) }),
      ...(hi === undefined ? {} : { max: String(hi) }),
      ...(knob.kind === 'integer' ? { step: '1' } : {}),
    })
  }

  // ⚠️ THE UNIT IS ON THE CONTROL, not only in the map xoko reads. `length 81` in a box beside the
  // word `length` is five numbers with no relation to the seconds anybody asks for; the sentence
  // that says so is already written and was going out to the brain and not to the person.
  node.title = knob.unit
    ? `${knob.what}\n\nin ${knob.unit}${knob.perSecond ? ` — ${knob.perSecond} a second` : ''}`
    : knob.what
  node.value = remembered
  node.addEventListener('change', () => localStorage.setItem(memoryKey(workflow, knob.key), node.value))

  const value = () => {
    const raw = String(node.value ?? '').trim()
    if (!raw) return undefined
    if (knob.kind === 'integer' || knob.kind === 'number') {
      const n = Number(raw)
      return Number.isFinite(n) ? n : undefined
    }
    if (knob.kind === 'boolean') return raw === 'true'
    return raw
  }

  const set = (v) => {
    node.value = v
    localStorage.setItem(memoryKey(workflow, knob.key), node.value)
  }

  // ⚠️ A BLOCK, NOT A ROW, FOR ANYTHING MULTI-LINE. `.f-row` is label-left / control-right with the
  // label eating 96 of a ~300px dock; that shape is right for a number and actively hostile to
  // eight lines of verse. Stacked, the words get the whole width and the box can be dragged taller.
  const row = knob.multiline
    ? el('div', { class: 'f-row stacked' }, el('span', {}, knob.key), node)
    : fieldRow(knob.key, node)
  return {
    key: knob.key, shaping: knob.shaping === true, advanced: knob.advanced === true, row, value, set,
  }
}

/**
 * THE WHOLE ⚙ BLOCK for one medium, rebuilt whenever the armed workflow changes.
 *
 * @returns `{ node, params(), show(knobs, workflow, presets) }` — `show` swaps the controls for a new
 *          workflow's list, and `workflow` is `<service>/<slug>`, which is what the memory is keyed by.
 */
export function knobControls() {
  const node = el('div', { class: 'knob-rows' })
  let live = []

  /**
   * ✎ WHAT TO CALL IT — the one control here that is not a knob on the graph.
   *
   * ⚠️ IT IS A CONTROL AND NOT A PAYLOAD FIELD, which is the rule the style picker and every knob
   * beside it already keep: what runs is the press you are watching, and a name xoko set is a name
   * sitting in a box you can see and change before ▶. Blank is the normal state — the server reads
   * a name off the ask (`titleFrom`, src/content/run.ts) — so this is for the times that is not
   * good enough.
   *
   * ⚠️ AND IT DOES NOT PERSIST. Every other control here remembers: a tempo you chose is still your
   * tempo tomorrow. A NAME belongs to one song, and a name left in the box would silently retitle
   * the next four.
   */
  const name = el('input', { type: 'text', placeholder: 'from the ask' })
  name.title = 'what to call this one in the list. Blank names it after the first words of the ask.'
  const nameRow = fieldRow('name', name)

  /**
   * ▧ THE PRESETS — the knobs that only mean anything together.
   *
   * ⚠️ IT WRITES INTO THE CONTROLS AND IS THEN DONE. Not a mode, not a stored choice: applying
   * `careful` fills the checkpoint, the steps and the cfg in front of you, and every one of them
   * can be moved afterwards. That is the same rule the style picker and xoko's `[key value]`
   * bracket keep — what runs is the press you are watching.
   *
   * ⚠️ AND IT DOES NOT CLEAR THE ONES IT DOES NOT NAME. A preset is a set of values, not a reset;
   * a tempo you chose is not part of the profile and is none of its business.
   */
  const presetRow = el('div', {})

  const show = (knobs, workflow = 'none', presets = null) => {
    live = (knobs ?? []).map((k) => control(workflow, k))
    const plain = live.filter((c) => !c.advanced)
    const deep = live.filter((c) => c.advanced)

    const names = Object.keys(presets ?? {})
    if (names.length) {
      const pick = select(names.map((n) => ({ value: n, label: n })), 'as published')
      pick.title = 'a combination known to work — it fills the boxes below, and you can change them'
      pick.addEventListener('change', () => {
        const chosen = presets[pick.value]
        if (chosen) for (const [k, v] of Object.entries(chosen)) set(k, v)
        // ⚠️ BACK TO BLANK AFTER IT HAS WRITTEN. Leaving the name showing would read as a mode the
        // press is IN, and a moment later the numbers under it may not be that preset any more.
        pick.value = ''
      })
      presetRow.replaceChildren(fieldRow('preset', pick))
    } else presetRow.replaceChildren()

    // ⚠️ NO "NOTHING TO SET HERE" LINE. An empty block is a block with no rows in it, and a
    // sentence saying so is a row — chrome that arrives exactly when there is least to look at.
    //
    // ⚠️ AND THE ADVANCED ONES ARE FOLDED (2026-08-31). `advanced` has been published per hole since
    // the day the long form landed, and only the map xoko reads ever honoured it — so 🎼 drew
    // twenty-one flat boxes with `topk`, `minp` and `bitrate` sitting among the tempo and the
    // lyrics. Folding is not hiding: `<details>` opens, and everything in it still sets.
    node.replaceChildren(nameRow, presetRow, ...plain.map((c) => c.row),
      ...(deep.length
        ? [el('details', { class: 'knob-deep' },
          el('summary', {}, `${deep.length} more this workflow exposes`),
          ...deep.map((c) => c.row))]
        : []))
  }

  /**
   * TYPE INTO ONE CONTROL, in front of them — what ✨ xoko presses through.
   *
   * ⚠️ IT MOVES THE CONTROL RATHER THAN SLIPPING A VALUE INTO THE PAYLOAD, which is the same rule
   * the style picker keeps: what runs is the press they are watching, and they can see what it was
   * set to and change it. Returns false when this workflow has no such knob, so the caller can say so
   * instead of dropping the ask.
   */
  const set = (key, value) => {
    const c = live.find((x) => x.key === key)
    if (!c) return false
    c.set(String(value ?? ''))
    return true
  }

  // Nothing armed yet: the name box, and no rows. `show` is called again the moment a workflow is.
  show([])

  /** Which knob this medium keeps for a style's words, if it keeps one (`shaping`). */
  const shaping = () => live.find((c) => c.shaping)?.key ?? null

  /**
   * SET SEVERAL AT ONCE, or refuse the lot BY NAME — what ✨ xoko's `[key value]` bracket calls.
   *
   * ⚠️ IT REFUSES RATHER THAN DROPPING, and that is the whole point of returning a sentence. A knob
   * this workflow has no hole for is a knob the graph will ignore in silence: the render succeeds, at
   * the published tempo, and the only clue that the ask went nowhere is that the song is not what
   * was asked for. Named, it is one line in the transcript and the next turn can fix it.
   *
   * ⚠️ AND IT IS ALL-OR-NOTHING. Applying three of four settings and reporting the fourth would
   * queue a press that is neither what was asked for nor what was refused.
   */
  const setAll = (values) => {
    const unknown = Object.keys(values).filter((k) => k !== 'title' && !live.some((c) => c.key === k))
    if (unknown.length) {
      const have = ['title', ...live.map((c) => c.key)].join(', ')
      return `this workflow has no ${unknown.join(' or ')} to set — it takes ${have}`
    }
    for (const [k, v] of Object.entries(values)) {
      // ⚠️ `title` IS ACCEPTED EVERYWHERE AND IS NOBODY'S HOLE. It is a fact about the RUN, not a
      // value the graph receives, so it is the one key here that is settable on every workflow.
      if (k === 'title') name.value = String(v ?? '')
      else set(k, v)
    }
    return null
  }

  const params = () => {
    const out = {}
    for (const c of live) {
      const v = c.value()
      if (v !== undefined) out[c.key] = v
    }
    return out
  }

  /** What this press should be called, or `undefined` for "read it off the ask". */
  const title = () => String(name.value ?? '').trim() || undefined

  /** Called after a press lands — see `name` above for why this one forgets. */
  const clearTitle = () => { name.value = '' }

  return { node, show, params, set, setAll, shaping, title, clearTitle }
}
