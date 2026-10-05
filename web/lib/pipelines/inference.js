// 🔌 inference — WHERE IT RUNS, and WHAT IT CAN BE ASKED FOR. One page.
//
// ⚠️ THIS WAS TWO SECTIONS UNTIL 2026-08-07: 🔌 inference (is it there) and 🧩 engines (what can
// I ask it for). The vocabulary is still right — a service runs, an engine is what it serves —
// but that is an ONTOLOGY split, not a task split, and it does not earn two nav rows. The 🧩
// page already drew the service as its own header, its endpoint, and its catalog line: it WAS
// this page with the list expanded. Two pages showing one tree at two zoom levels.
//
// So: one card per service. Collapsed, it is the old 🔌 page. Expanded, it is the old 🧩 page.
//
// ⚠️ THREE STATES, and `declared` is not `missing`:
//   known       declared AND reported by the service → its facts apply
//   discovered  reported, nothing declared           → it gets the SERVICE's caps
//   declared    declared, not on this machine        → listed, never offered, never default
//
// ⚠️ ONE SELECTION, TWO EDITORS, ONE BAND (2026-08-07). The feed is a two-level tree, so a pick is
// either a SERVICE or an ENGINE, and ⚙ shows whichever you picked:
//
//   a service  →  where it is: endpoint, what its models inherit, and ＋ for one not here yet
//   an engine  →  what it IS, and what it runs at — per checkpoint
//
// That is the answer to "a fresh install has nothing in it". Everything the app knew about was a
// row it SHIPPED; the registry was always two layers and only one of them had a writer.
//
// ⚠️ AND CAPABILITY IS A CHECKPOINT'S, NOT A SERVICE'S (2026-08-08). One Draw Things serves a
// checkpoint distilled to 4 steps with no negative prompt, one that takes 28 free steps and has
// one, and one that only makes sense with an `edit` reference — text-to-image and image-editing on
// the same port. So there is no true answer to "what can this service do": its `caps` are what an
// undescribed checkpoint INHERITS, and each checkpoint declares where it differs. Before this the
// only describable capability was the service's, which meant one answer for everything it served
// and none at all for anything the catalog could not report.
//
// ⚠️ NO ⓘ HERE (see shell.js → paintDetail). On a making page ⓘ earns its seat because the feed
// is a wall of pictures and there is nowhere else to read one. Here the feed row IS the detail —
// it is already six lines of text — so a selection band would be a second copy of the row you
// just clicked.
//
// ⚠️ AND THE ⚙ BAND IS NOT REDRAWN UNDER YOUR HANDS. The shelf is polled every 15s; an editor
// rebuilt on that poll is one that eats a half-typed hostname. It is drawn when the SELECTION
// changes and when this page itself changes something — never on the way past.

import { el, chip, select } from '../launch-kit.js?v=129'
import { MEDIUM_FACE } from '../shared.js?v=129'

// ⚠️ ONE STATE, ONE WORD, ONE SMALL DOT. Reachability was drawn three times over — a ✓/✗/⤓ glyph,
// a full-height coloured rail down the card, and a sentence under the head — which is three
// things to keep in agreement, and the rail was the loudest element in the section: a green
// stripe as tall as the card, shouting "this is fine" once per service. The class sets `--st`;
// the dot and the word read it, and nothing else is tinted.
const SERVICE = {
  ready: { cls: 'ok', say: 'reachable' },
  down: { cls: 'err', say: 'not running' },
  'not-installed': { cls: 'warn', say: 'not installed' },
  unknown: { cls: '', say: 'unknown' },
}

const ENGINE = {
  known: { cls: 'ok', say: 'here, and described' },
  discovered: { cls: '', say: 'here — nothing declared, so it takes the service’s settings' },
  declared: { cls: 'warn', say: 'described, but not on this machine' },
}

/** How each cap reads as a phrase. One table, used for the engine's facts and the service's —
 *  two spellings of "16 steps, fixed" is how a page ends up disagreeing with itself. */
const CAP_WORDS = {
  stepsLocked: (v) => (v == null ? 'steps free' : `${v} steps, fixed`),
  negatives: (v) => (v ? 'negative prompt' : 'no negative prompt'),
  idiom: (v) => `${v} prompts`,
  resolution: (v) => `${v[0]}–${v[1]}px`,
  words: (v) => `${v[0]}–${v[1]} words`,
  batch: (v) => (v ? 'batches' : 'one at a time'),
}

/**
 * ⚠️ THE CAPABILITY FIELDS — ONE TABLE, TWO EDITORS (2026-08-08).
 *
 * A service declares these outright; a CHECKPOINT declares only the ones where it differs. Both
 * draw from here, because they are the same seven questions asked of two things, and two tables
 * would be two vocabularies the day an eighth is added.
 *
 * ⚠️ WHAT IT CAN BE ASKED FOR IS NOT HERE (2026-08-08). `takes` and `needs one` were, and they
 * were on the wrong shape: plain SDXL takes no style reference while SDXL plus an IP-Adapter does,
 * and they are the same file. That belongs to the WORKFLOW, and workflows are listed further down.
 * What is left here is the narrower, more durable question of how this file reads a prompt.
 */
const CAP_FIELDS = [
  { key: 'idiom', label: 'prompts', kind: 'choice', from: 'idioms',
    hint: 'prose = a sentence; tags = comma-separated phrases. It decides how a style is composed.' },
  { key: 'negatives', label: 'negative', kind: 'bool',
    hint: 'does it carry a negative prompt at all' },
  { key: 'stepsLocked', label: 'steps', kind: 'steps',
    hint: 'blank = free. A number means this one is distilled to exactly that many.' },
  { key: 'resolution', label: 'pixels', kind: 'band', hint: 'the sizes it accepts' },
  { key: 'words', label: 'words', kind: 'band', hint: 'how long a prompt it wants' },
  { key: 'batch', label: 'batches', kind: 'bool', hint: 'can it be asked for several at once' },
]

/** The registry field a row edits. */
const capKey = (f) => f.on ?? f.key

/** What each KIND of workflow is, in one line — from `registries/kinds.json` via `vocab.kinds`.
 *  There were two hardcoded copies of this table in web/ and they disagreed about `i2i`. */
const kindFace = (ctx, slug) => (ctx.vocab()?.kinds ?? []).find((k) => k.slug === slug)?.face ?? ''
const kindKnown = (ctx, slug) => (ctx.vocab()?.kinds ?? []).some((k) => k.slug === slug)
/** What a kind PRODUCES — the band it sits in. Declared on its registry row, never read off the
 *  service running it (src/types/workflow.ts → `Kind.medium`). Undefined for one nobody described. */
const kindMedium = (ctx, slug) => (ctx.vocab()?.kinds ?? []).find((k) => k.slug === slug)?.medium
/** Described kinds in the registry's order, then anything a workflow used that nobody described. */
const kindOrder = (ctx, used) => {
  const known = (ctx.vocab()?.kinds ?? []).map((k) => k.slug)
  return [...known, ...[...new Set(used)].filter((k) => !known.includes(k)).sort()]
}

/** A workflow's slug must be a slug — the same shape the parser insists on, checked before the
 *  round trip so a typo is a sentence rather than a 400. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const when = (iso) => (iso ? String(iso).slice(11, 16) : '')

/**
 * HOW MANY ROWS A LIST SHOWS BEFORE IT ASKS.
 *
 * ⚠️ THIS PAGE HAD A 412-ROW LIST IN IT (2026-08-13). One cloud service reports 409 models, each
 * becomes a checkpoint and a synthesised workflow, and the capability view drew all of them under
 * `chat` — 412 of the machine's 433 workflows in one band. Nine local checkpoints and a cloud's whole
 * menu arrive through the same door, and only one of them is a list a person reads.
 *
 * ⚠️ AND THE CAP IS WHY THE ORDER MATTERS. Showing eight rows you cannot press while hiding the
 * three that work would be worse than the wall — see `workflowRank`.
 */
const CAP = 8

/** A workflow you could actually press: its checkpoint is here, and so are its controls and LoRAs. */
const canRun = (w) => w.state !== 'declared' && !w.missing?.length

/** A workflow's identity across the whole app — the same `<service>|<slug>` the ask bar stores under
 *  its capability. The slug alone collides: two services may both call their editor `kontext`. */
const starKey = (w, s) => `${s.id}|${w.slug}`
/** What comes first when a list is cut: the starred one, then what runs, then the rest. */
const workflowRank = (w, s, star) => (starKey(w, s) === star ? 0 : canRun(w) ? 1 : 2)

/** Everything a filter should look at. Not `notes` — a paragraph makes every query match. */
const workflowText = (w, s) =>
  `${w.slug} ${w.label ?? ''} ${w.kind} ${w.model ?? ''} ${s.label ?? ''} ${s.id}`.toLowerCase()
const engineText = (e, s) => `${e.file} ${e.label ?? ''} ${s.label ?? ''} ${s.id}`.toLowerCase()

/** Which way the feed is grouped. Remembered, unlike the folds: a fold is about one card on one
 *  visit, and this is a way of reading the page that a person has an opinion about. */
const VIEW_KEY = 'xokolat:inference-view'
const readView = () => {
  try { return localStorage.getItem(VIEW_KEY) === 'capability' ? 'capability' : 'service' }
  catch { return 'service' }
}
const keepView = (v) => { try { localStorage.setItem(VIEW_KEY, v) } catch { /* private mode */ } }

const clone = (v) => JSON.parse(JSON.stringify(v ?? null))

/** The two ways up the same tree. Data, so the bar is built once from it. */
const VIEWS = [
  ['service', '🔌', 'services', 'where things run, and how to fix one that is not'],
  ['capability', '✦', 'capabilities', 'what this machine can be asked for, whoever runs it'],
]

/** The numbers a press would actually use, shortest honest form. */
function numbersOf(e) {
  const p = e.params ?? {}
  const steps = e.caps?.stepsLocked ?? p.steps
  return [steps != null ? `${steps} steps` : null, p.cfg != null ? `cfg ${p.cfg}` : null]
    .filter(Boolean).join(' · ')
}

export default {
  id: 'inference',
  icon: '🔌',
  label: 'inference',
  group: 'settings',
  // ⚠️ ONE LINE, FOR THE MAP xoko IS GIVEN (web/lib/xoko-map.js). Not a docstring and
  // not a tooltip: it is what the assistant is told this place is FOR, so it can send
  // somebody here without having been taught the app.
  what: 'the services that run models on this machine, their checkpoints, and the workflows that ask for them',

  create(ctx) {
    const feed = el('div', { class: 'engine-shelf' })
    /**
     * ⚠️ THE BAR IS NOT PART OF THE REPAINT, AND THE FILTER IS WHY (2026-08-13). It was rebuilt on
     * every paint, and rebuilding it moved the search input into a fresh, detached parent — which
     * takes the input out of the document, which BLURS IT. One letter per click was the symptom.
     *
     * "Keep one input node and re-parent it" was not enough, and could not have been: re-parenting
     * IS a detach. So the bar and the list are two children of the feed, and only the list is ever
     * replaced. Everything in the bar is built once and updated in place by `paintBar`.
     */
    const barNode = el('div', { class: 'shelf-bar' })
    const list = el('div', { class: 'shelf-list' })
    /** `svc:<id>` · `eng:<id>/<file>` · `new`, or null. */
    let picked = null
    /** What the ⚙ band was last built for, so a poll does not rebuild it. */
    let drawn = null
    /** The service form's working copy while it is open. It is the FORM's state, not the shelf's
     *  — that is what lets you type a host without a poll taking it away mid-word. */
    let draft = null
    /** Which cards are folded. IN MEMORY and open by default: this page is read when something
     *  is wrong, and a card you have to open to see the failure is a card that hid it. */
    const shut = new Set()
    let busy = false
    /** `service` — where things run, and how to fix one. `capability` — what this machine can be
     *  asked for, whoever runs it. Same rows, same selection, same editor. */
    let view = readView()
    /** What the top box says. NOT remembered: a filter you cannot see the box for is a page with
     *  half its content mysteriously missing, and this box is only visible while the page is. */
    let filter = ''
    /** Which capped lists have been opened past `CAP`, by key. In memory, like the folds. */
    const shown = new Set()

    /** Does this workflow / checkpoint survive the filter box? Empty filter → everything does. */
    const hit = (text) => !filter || text.includes(filter)

    /**
     * A LIST THAT SHOWS `CAP` AND OFFERS THE REST.
     *
     * ⚠️ NO SPECIAL CASE FOR THE FILTER, on purpose. "Filtering lifts the cap" would be a second
     * rule to hold in your head; narrowing 409 rows to 6 already shows all six, because six is
     * fewer than eight. The arithmetic does what the rule would have.
     */
    function capped(key, items, draw) {
      const list = shown.has(key) ? items : items.slice(0, CAP)
      const nodes = list.map(draw)
      const hidden = items.length - list.length
      if (hidden > 0) {
        const more = el('button', {
          class: 'more-row', type: 'button',
          title: `${items.length} in all — the ones you can run are already at the top`,
        }, `show ${hidden} more`)
        more.addEventListener('click', (ev) => {
          ev.stopPropagation()
          shown.add(key)
          paint()
        })
        nodes.push(more)
      }
      return nodes
    }

    /** The two payloads are one tree: /api/inference has the state, /api/engines has the list. */
    /**
     * THE SERVICES THIS PAGE IS ABOUT — the shelf, with each row's catalogue merged onto it.
     *
     * ⚠️ WITHOUT THE CONNECTION (2026-08-30). A `role: 'brain'` row is xoko's
     * connection, and it is made, pinned and dropped in ✨ xoko — one place, or it is two places
     * that can disagree about which model an agent is thinking with. It stays on the shelf payload
     * because the shelf's question is "what does this machine have"; this page's question is
     * narrower, and it is written on the tin: what can be asked to MAKE something.
     */
    function tree() {
      const cat = ctx.services()
      return ctx.shelf().filter((s) => s.role !== 'brain')
        .map((s) => ({ ...s, ...(cat.find((c) => c.id === s.id) ?? {}) }))
    }
    const serviceAt = (id) => tree().find((s) => s.id === id) ?? null
    const engineAt = (key) => {
      for (const s of tree()) {
        for (const e of s.engines ?? []) if (`${s.id}/${e.file}` === key) return { service: s, engine: e }
      }
      return null
    }
    const workflowAt = (key) => {
      for (const s of tree()) {
        for (const w of s.workflows ?? []) {
          if (`${s.id}/${w.slug}` === key) return { service: s, workflow: w }
        }
      }
      return null
    }

    // ⚠️ THE ⚙ BAND IS A STABLE NODE THIS SECTION REPAINTS ITSELF, exactly like the gallery's
    // `renders with` readout. The shell owns WHERE the band is and this owns what is in it.
    const options = el('div', { class: 'band-rows' })

    function select_(key) {
      picked = picked === key ? null : key
      draft = null
      paint()
      paintEditor()
    }

    // ── the feed ──────────────────────────────────────────────────────────────
    //
    // ⚠️ A SERVICE IS A CARD. It carried `.block` — a 26px margin and nothing else — so the whole
    // section rendered as loose paragraphs on the bare stage with a coloured stripe down the
    // left. Nothing else about the page could read properly until that was a container.
    //
    // ⚠️ AND THE HEAD CARRIES A NAME, NOT A PILL RACK. Medium, launch mode, endpoint and the two
    // counts were a chip each — up to eight, all the same weight as each other and as the
    // service's own name, wrapping onto a second row. They are facts you read once and then stop
    // looking at, so they are one quiet meta line. A chip is now reserved for the exceptional:
    // `yours`, `✎ n`.
    function engineRow(e, service) {
      const st = ENGINE[e.state] ?? ENGINE.discovered
      const key = `eng:${service.id}/${e.file}`
      const tuned = Object.keys(e.tuned ?? {}).length
      // ⚠️ THE WORKFLOWS THIS FILE APPEARS IN, and it is the answer to "which one of these edits?".
      // Printed on the row rather than derived from its caps, because a checkpoint has no opinion
      // about what it is for — the workflow does, and one file can be in several.
      const workflows = (service.workflows ?? []).filter((w) => w.model === e.file)
      const kinds = [...new Set(workflows.map((w) => w.kind))]
      const node = el('div', {
        class: `eng ${st.cls}`,
        title: `${st.say}\n${kinds.join(' · ') || 'no workflow names it'}`
          + '\n— click to describe it and set what it runs at',
      },
        el('span', { class: 'eng-dot' }),
        el('span', { class: 'eng-name' },
          el('b', {}, e.label),
          ...kinds.map((k) => el('span', {
            class: 'eng-tag on', title: kindFace(ctx, k),
          }, k)),
          // ⚠️ NO STAR ON THIS ONE. It is the registry's preferred checkpoint — what `pickDefault`
      // reads to choose a service's fallback workflow — and the ★ on the workflow rows is a different
      // claim by a different author. Two stars meaning two things on one page is worse than a word.
      e.isDefault ? el('span', { class: 'eng-tag', title: 'the checkpoint the registry prefers — where a service’s fallback workflow comes from' }, 'preferred') : null,
          e.version ? el('span', { class: 'eng-tag' }, e.version) : null,
          // ⚠️ SAY WHEN A NUMBER IS YOURS. A row showing 20 steps where the registry ships 16 is
          // otherwise indistinguishable from a registry that ships 20.
          tuned ? el('span', { class: 'eng-tag on', title: `${tuned} of these numbers are yours` }, `✎ ${tuned}`) : null),
        el('span', { class: 'eng-nums' }, numbersOf(e)),
        // Where the press goes. A row that opens a panel should say so before it is pressed.
        el('span', { class: 'eng-go' }, '›'),
        el('span', { class: 'eng-file mono' }, e.file))
      node.classList.toggle('sel', key === picked)
      node.addEventListener('click', () => select_(key))
      return node
    }

    /** How the list was obtained — and an admission when it wasn't. */
    function catalogLine(service) {
      // ⚠️ A COMMAND HAS NOTHING TO ASK, so it gets no line. `claude --model` takes what the vendor
      // publishes, not what is on this disk; the models are declared in the build that knows the
      // client's flags. Saying "not asked yet" here would imply somebody ought to press ↻.
      if (service.transport?.kind === 'cli') return null
      const c = service.catalog ?? {}
      if (c.error) return el('p', { class: 'svc-why err-note' }, `could not ask it: ${c.error}`)
      if (c.askedAt == null) return el('p', { class: 'svc-why' }, 'not asked yet')
      const extra = [c.loras?.length ? `${c.loras.length} LoRAs` : '',
        c.controlNets?.length ? `${c.controlNets.length} controls` : '']
        .filter(Boolean).join(' · ')
      return el('p', { class: 'svc-why' },
        `it reports ${c.reports}, asked at ${when(c.askedAt)}${extra ? ` · ${extra}` : ''}`)
    }

    /**
     * HOW TO GET THIS ONE RUNNING — the sentence after "not running".
     *
     * ⚠️ TWO PLACEMENTS, ONE LINK, AND THE STATE DECIDES WHICH. On a reachable service it is a
     * quiet word in the meta line, because "how to install it" is not what you came to read about
     * something that works. On one that is down or missing it is a line of its own under the
     * failure, where the question actually got asked. A link in only the first place would be
     * invisible exactly when it is wanted; in only the second, unfindable when you want the OTHER
     * route (the app is open and you would rather it ran headless).
     *
     * ⚠️ AND IT IS A PLAIN ANCHOR. The href is registry data — `/guides/…` or `https://…`, the
     * writer refuses anything else (src/inference/registry.ts) — so no scheme can arrive here that
     * a click would execute.
     */
    function helpLink(s, loud) {
      if (!s.help) return null
      const external = /^https:/.test(s.help)
      return el('a', {
        class: loud ? 'svc-help loud' : 'svc-help',
        href: s.help,
        target: '_blank',
        rel: 'noopener noreferrer',
        title: external
          ? `${s.help} — opens in a new tab`
          : 'the two ways to have this one answering, and the traps in the second',
        onclick: (ev) => ev.stopPropagation(),
      }, loud ? 'how to get it running ›' : 'setup ›')
    }

    /** The meta line: facts, separated, in one weight. */
    function metaLine(...parts) {
      const kept = parts.filter(Boolean)
      const out = []
      for (const [i, p] of kept.entries()) {
        if (i) out.push(el('span', { class: 'sep' }, '·'))
        out.push(p)
      }
      return out
    }

    function serviceCard(s) {
      const st = SERVICE[s.state] ?? SERVICE.unknown
      const engines = s.engines ?? []
      const kept = engines.filter((e) => hit(engineText(e, s)))
      const here = engines.filter((e) => e.state !== 'declared').length
      const open = !shut.has(s.id)
      const mine = (s.patched ?? []).length

      // ⚠️ ↻ IS PER SERVICE, and it always was in reality: one of them is down, you start it, and
      // asking the others again is a ~40s wait for an answer nobody wanted.
      const rescan = el('button', { class: 'btn mini', title: `ask ${s.label ?? s.id} what it has` }, '↻')
      rescan.addEventListener('click', async (ev) => {
        ev.stopPropagation()
        if (busy) return
        busy = true
        rescan.disabled = true
        ctx.flash(`asking ${s.label ?? s.id} — a cold catalog scan takes a while`)
        try {
          await ctx.rescan(s.id)
          ctx.flash('catalog re-read')
        } finally {
          busy = false
          rescan.disabled = false
        }
      })

      // The disclosure goes at the LEFT, where a disclosure goes. It sat at the right beside ↻,
      // which put "show me more" a few pixels from "go ask the server", and neither read as the
      // one that costs 40 seconds.
      const fold = el('button', {
        class: 'svc-fold', type: 'button',
        title: open ? 'fold this one away' : `show ${engines.length} engine(s)`,
      }, open ? '▾' : '▸')
      fold.addEventListener('click', (ev) => {
        ev.stopPropagation()
        if (shut.has(s.id)) shut.delete(s.id)
        else shut.add(s.id)
        paint()
      })

      const name = el('span', { class: 'svc-name' }, s.label ?? s.id)
      const head = el('div', { class: 'svc-head', title: 'where this service is, and what it can do' },
        fold,
        name,
        el('span', { class: 'svc-state' }, el('span', { class: 'svc-dot' }), st.say),
        el('span', { class: 'spacer' }),
        s.source === 'user' ? chip('yours', 'type') : null,
        // A shipped row you have moved fields of is neither "yours" nor untouched, and the
        // difference is the whole reason ↺ has anything to put back.
        mine ? chip(`✎ ${mine}`, 'type') : null,
        rescan)

      const card = el('section', { class: `svc ${st.cls}` },
        head,
        el('div', { class: 'svc-meta' }, ...metaLine(
          s.endpoint ? el('span', { class: 'mono' }, s.endpoint) : null,
          // ⚠️ READ OFF THE WORKFLOWS, so it follows what you take (2026-09-06): one music workflow
          // onto a ComfyUI and this line starts saying `image · music` with nothing edited. It
          // used to be one word the row declared, which a service serving five could not supply.
          s.media?.length ? el('span', {}, s.media.join(' · ')) : null,
          el('span', {}, s.launch + (s.tier ? ` · ${s.tier}` : '')),
          engines.length ? el('span', {}, `${here} here`) : null,
          engines.length - here ? el('span', {}, `${engines.length - here} elsewhere`) : null,
          s.state === 'ready' ? helpLink(s, false) : null)),
        // Only when it says something the state word does not: "down" needs no gloss, "connection
        // refused after 500ms" does.
        s.detail ? el('p', { class: 'svc-why' }, s.detail) : null,
        s.state !== 'ready' ? helpLink(s, true) : null,
        ...(open
          ? [
              el('div', { class: 'svc-engines' },
                catalogLine(s),
                // ⚠️ CAPPED TOO, and for the same reason as the workflows: a cloud row reports its
                // whole menu, and 409 checkpoints is a wall whichever list they are drawn in.
                ...(kept.length
                  ? capped(`eng:${s.id}`, kept, (e) => engineRow(e, s))
                  : [el('p', { class: 'empty' }, filter
                    ? 'nothing here matches'
                    : 'nothing declared, and nothing reported')]),
                el('div', { class: 'eng-add' }, addModel(s))),
              workflowList(s),
            ]
          : []))
      card.classList.toggle('sel', picked === `svc:${s.id}`)
      // ⚠️ THE HEAD, NOT THE NAME. It was the name alone — six words with no other hover on the
      // card — so the only route to a service's settings was noticing that its title lit up. The
      // head is the row you would press; the whole CARD would fight every engine row inside it,
      // and the two buttons in the head stop the click themselves.
      head.addEventListener('click', () => select_(`svc:${s.id}`))
      return card
    }

    /**
     * WHAT THIS SERVICE CAN BE ASKED FOR — the workflows, GROUPED BY KIND.
     *
     * ⚠️ BY KIND, because that is the axis the picker uses (2026-08-12). Six lines all reading
     * "SDXL" is what a list ordered by checkpoint looks like once a real palette arrives —
     * content-factory has five SDXL workflows that differ only in which blocks an IP-Adapter targets.
     * The kind is what someone is looking for, and the third column is what makes two rows on one
     * file tell each other apart.
     *
     * ⚠️ AND A ROW IS SELECTABLE NOW. A workflow is a registry row like everything else on this page
     * and it has the form the checkpoints have had since August; until then, adding the one thing
     * you want to be able to DO was a JSON edit.
     *
     * ⚠️ SYNTHESISED ONES ARE MARKED. A `t2i` row nobody wrote is the app's one assumption
     * (src/inference/workflows.ts), and it should not read as something the registry says.
     */
    function workflowList(s) {
      const all = (s.workflows ?? []).filter((w) => hit(workflowText(w, s)))
      const total = (s.workflows ?? []).length
      return el('div', { class: 'svc-workflows' },
        el('div', { class: 'workflow-head muted' },
          !total ? 'nothing can be asked for here yet'
            : filter ? `${all.length} of ${total} workflows match`
              : `${total} workflows`),
        ...kindOrder(ctx, all.map((w) => w.kind)).flatMap((k) => {
          // ⚠️ SORTED BEFORE IT IS CUT. Registry order is meaningless once only the first eight
          // are drawn — what has to survive the cut is your star, then what you can press.
          const star = ctx.starOf?.(k) ?? null
          const mine = all.filter((w) => w.kind === k)
            .sort((a, b) => workflowRank(a, s, star) - workflowRank(b, s, star))
          if (!mine.length) return []
          return [
            el('div', { class: 'workflow-group muted', title: kindFace(ctx, k) },
              el('span', {}, k),
              // A kind the registry does not describe still works — but say so, because the
              // ordinary cause is a typo in a slug and nothing else will ever mention it.
              kindKnown(ctx, k)
                ? null
                : el('span', { class: 'eng-tag warn', title: 'no row in registries/kinds.json describes this kind' }, 'undescribed'),
              el('span', { class: 'spacer' }),
              mine.length > CAP ? el('span', {}, `${mine.length}`) : null),
            ...capped(`workflow:${s.id}/${k}`, mine, (w) => workflowRow(w, s)),
          ]
        }),
        el('div', { class: 'eng-add' }, addWorkflow(s)))
    }

    /**
     * ⚠️ WHAT IT NEEDS AND HAS NOT GOT — one line, naming the files (2026-08-12).
     *
     * A workflow is its checkpoint PLUS its control and LoRA files, and until controls existed there
     * was nothing to be missing that `declared` did not already say. Now there is: `sdxl-style-ref`
     * on a machine with SDXL but no IP-Adapter is a row that looks perfectly fine and cannot run.
     * The count is what the row shows and the NAMES are in the tooltip, because a name is a thing
     * you can go and get.
     */
    const needLine = (w) => (!w.missing?.length ? null : el('span', {
      class: 'eng-tag warn',
      title: `not on this machine:\n${w.missing.map((m) => `${m.what} · ${m.file}`).join('\n')}`,
    }, `⚠ needs ${w.missing.length} thing${w.missing.length === 1 ? '' : 's'}`))

    /**
     * ★ THE FAVOURITE — one lit star per capability, and it is a CONTROL.
     *
     * ⚠️ IT USED TO BE A BADGE, AND IT DESCRIBED SOMETHING ELSE (2026-08-13). `★ default` was
     * `pickDefault` (src/inference/workflows.ts) — one workflow per SERVICE, the t2i one on whichever
     * checkpoint the registry prefers. Per service is the wrong grain: it cannot answer "what
     * should `edit` use", and it is not a thing anybody chose. It stays as the fallback and loses
     * the star; the star now means WHAT ▶ PRESSES FOR THIS ASK, which is a per-capability question
     * with a per-capability answer.
     *
     * ⚠️ PER CAPABILITY, NOT PER MEDIUM. `t2i` and `cutout` are both image and are not the same
     * ask. And the medium is not in the key at all, because the kind already declares it — see
     * `workflowKey` in shell.js.
     *
     * ⚠️ RADIO, NOT TOGGLE. Starring another moves it; starring the lit one clears back to the
     * fallback. There is never more than one, and there is never a capability with none.
     *
     * ⚠️ AND WHAT CANNOT RUN CANNOT BE STARRED. A workflow missing its checkpoint or its IP-Adapter
     * would arm an ask that fails at press time — and the shell resolves the stored key against
     * what is actually there anyway, so a star on one would silently not take.
     */
    function starButton(w, s) {
      const star = ctx.starOf?.(w.kind) ?? null
      const on = star === starKey(w, s)
      const able = canRun(w)
      const b = el('button', {
        class: `star${on ? ' on' : ''}`,
        type: 'button',
        // ⚠️ SPREAD IN, NOT PASSED AS A BOOLEAN. `el` drops `false` now (shared.js), but the trap
        // was here, and a call site that never writes the attribute cannot fall into it again.
        ...(able ? {} : { disabled: 'disabled' }),
        title: !able ? `${w.kind}: this one cannot be starred until what it needs is here`
          : on ? `${w.kind}: this is what ▶ presses — click to fall back to the registry's pick`
            : `${w.kind}: make this the one ▶ presses`,
      }, on ? '★' : '☆')
      b.addEventListener('click', (ev) => {
        ev.stopPropagation()
        ctx.star(w.kind, on ? null : starKey(w, s))
        paint()
      })
      return b
    }

    function workflowRow(w, s, showService = false) {
      const key = `workflow:${s.id}/${w.slug}`
      const short = (w.controls ?? []).length
      const node = el('div', {
        class: `workflow${w.state === 'declared' || w.missing?.length ? ' off' : ''}`,
        title: [w.notes, kindFace(ctx, w.kind), `on ${w.model}`, `runs on ${s.label ?? s.id}`,
          w.state === 'declared' ? 'the checkpoint it names is not on this machine' : '',
          ...(w.controls ?? []).map((c) => `${c.inputType} · ${c.file} ← ${c.from}`),
          ...(w.loras ?? []).map((l) => `lora · ${l.file}`),
          '— click to change what it is and what it runs at',
        ].filter(Boolean).join('\n'),
      },
      starButton(w, s),
      el('b', {}, w.label),
      // ⚠️ THE SERVICE IS A SUBTITLE HERE, not a heading (2026-08-13). Grouped by capability, the
      // question a row answers is "what runs this, and is it up?" — and the answer carries the
      // service's own state colour, because a workflow on a service that is down is a workflow you
      // cannot press however complete it looks.
      showService
        ? el('span', {
          class: `eng-tag ${(SERVICE[s.state] ?? SERVICE.unknown).cls}`,
          title: `${s.label ?? s.id} — ${(SERVICE[s.state] ?? SERVICE.unknown).say}`,
        }, s.label ?? s.id)
        : null,
      w.slots.length ? el('span', { class: 'eng-tag' }, `+ ${w.slots.join(' + ')}`) : null,
      short ? el('span', { class: 'eng-tag' }, `⚙ ${short}`) : null,
      (w.loras ?? []).length ? el('span', { class: 'eng-tag' }, 'lora') : null,
      needLine(w),
      w.mine ? el('span', { class: 'eng-tag on', title: 'this workflow is yours' }, '✎') : null,
      // ⚠️ MARKED, BECAUSE IT IS NOT IN ANY FILE. You should be able to see which offers came from
      // a list somebody wrote and which follow from the model itself.
      w.implied ? el('span', { class: 'eng-tag', title: 'this follows from the model — nothing on disk says it' }, '⌁') : null,
      // ⚠️ TAKEN ONCE, NEVER REVISITED — and the row said nothing (2026-08-23). A workflow is copied
      // into this machine's registry the moment it is taken and no screen ever compares it against
      // 📚 again, so when the library replaced six music workflows with one that exposes twenty
      // widgets, the two that were installed here went on looking perfectly current: same row,
      // same star, same ⚙ pane, holes frozen at whatever they were on the day of the take. The
      // first sign was a render refused by name for knobs the current workflow has. Marked, not
      // hidden — it still runs, and it is still theirs to keep until they re-take it.
      w.stale
        ? el('span', {
          class: 'eng-tag warn',
          title: 'the library does not publish this any more — it has been replaced.\nWhat is here'
            + ' is the shape it had when it was taken, holes and all.\nTake the new one from 📚,'
            + ' and 🗑 remove this one when you no longer want it in the picker.',
        }, '⚠ replaced on 📚')
        : null,
      el('span', { class: 'spacer' }),
      el('span', { class: 'eng-go' }, '›'),
      el('span', { class: 'eng-file mono' }, w.model))
      node.classList.toggle('sel', key === picked)
      node.addEventListener('click', () => select_(key))
      return node
    }

    /** ＋ — the door that turns "I want to be able to do X" from a JSON edit into a form. */
    function addWorkflow(s) {
      const add = el('button', {
        class: 'btn mini', type: 'button',
        title: 'a new workflow on this service — a checkpoint plus what it adds on top',
      }, '＋ add a workflow')
      add.addEventListener('click', (ev) => {
        ev.stopPropagation()
        picked = `new-workflow:${s.id}`
        draft = null
        paint()
        paintEditor(true)
        // Same shape as ＋ connect a service: the form is in the ⚙ band and nowhere else, so with
        // the pane shut this press had no visible result at all.
        ctx.openOptions?.()
      })
      return add
    }

    /** ＋ — for a checkpoint the service cannot be asked about. Only Draw Things answers a catalog
     *  request today, so on anything else this is the ONLY way a model gets onto the shelf. */
    function addModel(s) {
      const add = el('button', {
        class: 'btn mini', type: 'button',
        title: 'describe a checkpoint this service does not report',
      }, '＋ add a model')
      add.addEventListener('click', (ev) => {
        ev.stopPropagation()
        picked = `new-eng:${s.id}`
        draft = null
        paint()
        paintEditor(true)
        // Same shape as ＋ connect a service: the form is in the ⚙ band and nowhere else, so with
        // the pane shut this press had no visible result at all.
        ctx.openOptions?.()
      })
      return add
    }

    /** ＋ — the door that did not exist. A fresh install has an empty shelf, and every service on
     *  it arrives through here. */
    function addButton(primary = false) {
      // ⚠️ ＋ add ON THE BAR, ＋ connect a service ON AN EMPTY SHELF. Same button, and the length
      // of the words is set by what is around them: on the bar it stands beside a switch and a
      // filter, where a five-word button is the loudest thing in a row of controls and the ＋
      // already says which direction it goes. On a first run it is the only thing on the page and
      // has to say what it is FOR.
      const add = el('button', {
        class: `btn mini${primary ? ' primary' : ''}`, type: 'button',
        title: 'connect a service — point xokolat at something that already runs',
      }, primary ? '＋ connect a service' : '＋ add')
      add.addEventListener('click', () => {
        picked = 'new'
        draft = null
        paint()
        paintEditor(true)
        // ⚠️ AND IT OPENS THE PANE (2026-09-04). The form this press builds exists ONLY in the ⚙
        // band — with the dock shut, ＋ was a button that visibly did nothing, which is the worst
        // thing a first-run control can be. `openOptions` is the same door `openStyles` is: the
        // pane is yours, and a press you made is the one thing allowed to move it.
        ctx.openOptions?.()
      })
      return add
    }

    /**
     * WHAT THIS MACHINE CAN BE ASKED FOR — the same workflows, grouped the other way up, in bands
     * by MEDIUM.
     *
     * ⚠️ THIS ANSWERS A QUESTION THE SERVICE VIEW CANNOT: "does this machine have anything at all
     * that can inpaint?" Grouped by service, finding out means opening every card and reading, and
     * the absence of something is the one thing a list of what you HAVE can never show. So a kind
     * nobody has a workflow for is still a line here, saying so — the empty ones are half the value.
     *
     * ⚠️ BANDED BY MEDIUM (2026-08-13), because a flat list already mixed them: eight image verbs
     * and `chat` as peers, with music, voice, 3D and video each bringing five or six more. Thirty
     * rows in one column with no organising principle is the wall the 🧩 merge existed to end. The
     * medium comes from the KIND's own row (registries/kinds.json), never from whichever service
     * happens to run it — see `Kind.medium`.
     *
     * ⚠️ AND A CAPABILITY IS A HEADING, NOT A CARD. It was drawn with `.svc` — the same panel,
     * border, dot and fold as a service — so a kind rendered as if it were a thing you configure,
     * and the page had two identical-looking objects that are not the same. The weight belongs on
     * the WORKFLOW rows, which are what can be clicked and edited; a kind is the label above them.
     *
     * ⚠️ IT IS A VIEW, NOT A REPLACEMENT. Everything irreducibly about a service — where it is,
     * whether it answers, its checkpoints, ↻, ＋, its key — lives on the service card and would be
     * homeless here (see this file's header, and the 🧩 merge of 2026-08-07).
     */
    function capabilityBands(rows) {
      const all = rows.flatMap((s) => (s.workflows ?? []).map((w) => ({ w, s })))
        .filter(({ w, s }) => hit(workflowText(w, s)))
      const kinds = kindOrder(ctx, all.map(({ w }) => w.kind))
      // The server's own order, so a fifth medium needs no edit here. `null` is the last band:
      // kinds nobody described, which have no medium to sort by.
      //
      // ⚠️ AND THERE IS NO ✨ words BAND ANY MORE (2026-08-30). It sat here beside the media,
      // holding the `chat` kind, because xoko's brain was a service on this shelf. An LLM connects
      // to xoko now — one connection, in ✨ xoko — so this page is exactly what its name says:
      // what this machine can be asked to MAKE.
      const bands = [...(ctx.media?.() ?? []), null].filter((m, i, a) => a.indexOf(m) === i)
      return bands.flatMap((m) => {
        let mine = kinds.filter((k) => (kindMedium(ctx, k) ?? null) === m)
        // ⚠️ AN EMPTY KIND IS INFORMATION UNTIL YOU ARE SEARCHING, and then it is noise. "Nothing
        // here can inpaint" is the whole point of this view; "nothing here can inpaint" in answer
        // to the word you typed is a row about a question you did not ask.
        if (filter) mine = mine.filter((k) => all.some(({ w }) => w.kind === k))
        // A band with nothing in it at all is not drawn. A whole medium no kind has named yet is
        // the app listing its own future, and music is not a capability of this machine because
        // the word appears in a type.
        if (!mine.length) return []
        const [icon, label] = MEDIUM_FACE[m] ?? ['·', m ?? 'somewhere else']
        const ready = all.filter(({ w }) => mine.includes(w.kind)
          && w.state !== 'declared' && !w.missing?.length).length
        return [el('section', { class: 'cap-band' },
          el('div', { class: 'cap-band-head' },
            el('span', { class: 'cap-ic' }, icon),
            el('span', { class: 'cap-band-name' }, label),
            el('span', { class: 'spacer' }),
            el('span', { class: 'muted' },
              ready ? `${ready} ready` : 'nothing usable here yet')),
          ...mine.map((k) => capabilityGroup(k, all.filter(({ w }) => w.kind === k))))]
      })
    }

    /**
     * One capability: the verb, what it means, what currently answers it, and the workflows.
     *
     * ⚠️ THE SERVICE IS A LEVEL HERE ONLY WHEN THERE IS MORE THAN ONE (2026-08-13) — so the tree is
     * `medium > capability > service > workflow` where that says something, and stays
     * `medium > capability > workflow` where it would not. Every image kind on this machine is Draw
     * Things alone; a service heading over each would be a line per kind saying what the row's own
     * subtitle already says. `chat` is the opposite case: 3 workflows on claude-code and 409 on
     * openrouter, and ONE cap across the pair hid claude-code's three behind the cloud's menu
     * entirely. Split, each service gets its own cap and its own count, so nothing can be buried
     * by a catalog you only browse.
     */
    function capabilityGroup(k, mine) {
      // Usable = the checkpoint is here AND its controls and LoRAs are. A plain count would say
      // "3" for three rows that all need a file you have not got.
      const usable = mine.filter(({ w }) => canRun(w)).length
      const star = ctx.starOf?.(k) ?? null
      const armed = mine.find(({ w, s }) => starKey(w, s) === star)
      // ⚠️ SORTED BEFORE IT IS CUT — the star first, then what runs. Eight rows you cannot press
      // hiding the three you can is worse than the wall the cap replaced.
      const rank = (a, b) => workflowRank(a.w, a.s, star) - workflowRank(b.w, b.s, star)
      const svcIds = [...new Set(mine.map(({ s }) => s.id))]

      const rows = () => {
        if (svcIds.length < 2) return capped(`cap:${k}`, [...mine].sort(rank), ({ w, s }) => workflowRow(w, s, true))
        // The service holding the star leads, because the one that answers is the one you came for.
        const order = [...svcIds].sort((a, b) => (a === armed?.s.id ? -1 : b === armed?.s.id ? 1 : 0))
        return order.flatMap((id) => {
          const here = mine.filter(({ s }) => s.id === id).sort(rank)
          const s = here[0].s
          const st = SERVICE[s.state] ?? SERVICE.unknown
          return [
            el('div', { class: `cap-svc ${st.cls}`, title: `${s.label ?? s.id} — ${st.say}` },
              el('span', { class: 'svc-dot' }),
              el('span', { class: 'cap-svc-name' }, s.label ?? s.id),
              el('span', { class: 'spacer' }),
              el('span', { class: 'muted' }, `${here.length}`)),
            // Its own cap key, so opening a cloud's 409 does not also unfold the other service.
            ...capped(`cap:${k}/${id}`, here, ({ w }) => workflowRow(w, s)),
          ]
        })
      }

      return el('div', { class: `cap-kind${mine.length ? '' : ' none'}` },
        el('div', { class: 'cap-kind-head' },
          el('b', {}, k),
          kindKnown(ctx, k)
            ? el('span', { class: 'cap-face' }, kindFace(ctx, k))
            : el('span', { class: 'eng-tag warn', title: 'no row in registries/kinds.json describes this kind' }, 'undescribed'),
          el('span', { class: 'spacer' }),
          // ⚠️ WHAT ANSWERS THIS, IN THE HEADING. The star is on a row that may be below a fold, a
          // filter or another service's subhead; the question "so what does this machine use for
          // `edit`?" should not need any of them opened to answer.
          armed
            ? el('span', { class: 'cap-star', title: `▶ presses ${armed.w.label} on ${armed.s.label ?? armed.s.id}` },
              `★ ${armed.w.label}`)
            : null,
          // ⚠️ THE TRUE TOTAL, ALWAYS — never the number of rows drawn. Knowing what is there is
          // the whole value of this view, and a heading that said 8 because 8 are on screen would
          // throw it away at exactly the scale that made the cap necessary.
          el('span', { class: 'muted' },
            !mine.length ? '' : usable === mine.length ? `${usable}` : `${usable} of ${mine.length}`)),
        // ⚠️ AN EMPTY CAPABILITY IS NOT AN ERROR, and must not read as one. No machine has every
        // kind; this line is what tells "nothing here does that" apart from "you looked in the
        // wrong place", and it is the only place the app can say the first one at all.
        ...(mine.length ? rows() : [el('p', { class: 'cap-empty' }, 'nothing here answers for this yet')]))
    }

    /**
     * WHICH WAY THE PAGE IS GROUPED — a segmented control, and an obvious one.
     *
     * ⚠️ IT WENT TOO QUIET ONCE (2026-08-13). The first version was two `.btn.mini` beside ＋,
     * which gave a way of READING the page the same chrome as the one control that acts; the fix
     * for that was a plain text switch, which nobody could find. Both were wrong in the same way —
     * treating weight as the only knob. The answer is a control that looks like a control, and
     * SEPARATION from ＋: this leads the bar, ＋ ends it.
     */
    const segBtns = new Map()
    const segNode = el('div', { class: 'seg', role: 'group' })
    for (const [id, icon, label, what] of VIEWS) {
      const b = el('button', { class: 'seg-b', type: 'button', title: what },
        el('span', { class: 'seg-ic' }, icon), label)
      b.addEventListener('click', () => {
        if (view === id) return
        view = id
        keepView(id)
        paint()
      })
      segBtns.set(id, b)
      segNode.append(b)
    }

    /**
     * THE FILTER — the thing that actually answers "where is the one I want".
     *
     * ⚠️ STRUCTURE HELPS BROWSING; IT DOES NOT HELP FINDING. Grouping and a cap make 433 workflows a
     * page you can read; neither gets you to `flux_1_kontext` without scrolling past everything.
     * One box, both views, matching a workflow's slug, label, kind, checkpoint and service.
     *
     * ⚠️ AND IT IS NEVER RE-PARENTED. Moving an input into a freshly built bar detaches it from the
     * document, which blurs it — one letter per click. It is appended to `barNode` once, below,
     * and the bar is not part of what `paint` replaces.
     */
    const filterIn = el('input', {
      class: 'flt', type: 'search', placeholder: 'filter…',
      title: 'matches a workflow or checkpoint by name, kind, file or service',
    })
    filterIn.addEventListener('input', () => {
      filter = filterIn.value.trim().toLowerCase()
      paint()
    })

    /** What the counts say. Text only — the node is permanent. */
    const countNode = el('span', { class: 'muted' })

    // ⚠️ BUILT ONCE, HERE. Everything above is a node with a listener on it; `paintBar` only ever
    // sets text and toggles a class.
    //
    // ⚠️ ＋ LEADS THE BAR NOW, AND IT USED TO END IT (2026-09-04). It was pushed to the right edge
    // by a spacer, on the reasoning that reading and acting want separating — true of WEIGHT, and
    // never true of DISTANCE. A control alone against the right edge of a wide pane is a control
    // nobody's eye reaches. It goes first because it is the one thing on this bar that ADDS
    // something, and the first place a person looks is where the page starts. Separation is still
    // there, in the chrome — ＋ is a button, the switch beside it is a segmented control.
    barNode.append(addButton(), segNode, filterIn, countNode)
    feed.append(barNode, list)

    function paintBar(text) {
      countNode.textContent = text
      for (const [id, b] of segBtns) {
        b.classList.toggle('on', view === id)
        b.setAttribute('aria-pressed', view === id ? 'true' : 'false')
      }
    }

    function paint() {
      const rows = tree()
      if (picked?.startsWith('eng:') && !engineAt(picked.slice(4))) picked = null
      if (picked?.startsWith('svc:') && !serviceAt(picked.slice(4))) picked = null
      if (picked?.startsWith('new-eng:') && !serviceAt(picked.slice(8))) picked = null
      if (picked?.startsWith('new-workflow:') && !serviceAt(picked.slice('new-workflow:'.length))) picked = null
      if (picked?.startsWith('workflow:') && !workflowAt(picked.slice('workflow:'.length))) picked = null

      // ⚠️ AN EMPTY SHELF IS A FIRST RUN, NOT A FAILURE. It said "nothing here yet" in grey with
      // the one action that fixes it in a footer below the fold of an empty list.
      // ⚠️ AN EMPTY SHELF IS A FIRST RUN, NOT A FAILURE. It said "nothing here yet" in grey with
      // the one action that fixes it in a footer below the fold of an empty list. The bar goes
      // with it: there is nothing to group and nothing to filter.
      barNode.hidden = !rows.length
      if (!rows.length) {
        list.replaceChildren(el('div', { class: 'shelf-empty' },
          el('h3', {}, 'Nothing runs yet'),
          el('p', {}, 'xokolat does not generate anything itself — it asks something that does. '
            + 'Point it at a service you already have running, and its checkpoints appear here.'),
          // ⚠️ AND THE OTHER HALF OF A FIRST RUN: not everyone HAS one running. "Add a service"
          // is the wrong first press for someone whose answer is "which service?".
          el('p', {}, el('a', {
            class: 'svc-help loud', href: '/guides/', target: '_blank', rel: 'noopener noreferrer',
          }, 'how to get an engine running ›')),
          addButton(true)))
        return
      }

      /** What the filter did, in the one place that can say it about the whole page. */
      const matched = (shownN, total, noun) =>
        (filter ? `${shownN} of ${total} ${noun} match` : `${total} ${noun}`)

      if (view === 'capability') {
        const all = rows.flatMap((s) => (s.workflows ?? []).map((w) => ({ w, s })))
        const kept = all.filter(({ w, s }) => hit(workflowText(w, s)))
        const kinds = new Set(kept.map(({ w }) => w.kind))
        paintBar(`${matched(kept.length, all.length, 'workflows')} · `
          + `${kinds.size} capabilit${kinds.size === 1 ? 'y' : 'ies'}`)
        list.replaceChildren(...(kept.length || !filter
          ? capabilityBands(rows)
          : [el('p', { class: 'empty' }, 'nothing on this machine matches that')]))
        return
      }

      const engines = rows.reduce((n, s) => n + (s.engines ?? []).filter((e) => e.state !== 'declared').length, 0)
      // While filtering, a service with nothing that matches is not a service you are looking at.
      const cards = !filter ? rows : rows.filter((s) => (s.workflows ?? []).some((w) => hit(workflowText(w, s)))
        || (s.engines ?? []).some((e) => hit(engineText(e, s))))
      paintBar(matched(cards.length, rows.length, `service${rows.length === 1 ? '' : 's'}`)
        + (filter ? '' : ` · ${engines} engine${engines === 1 ? '' : 's'} here`))
      list.replaceChildren(...(cards.length
        ? cards.map(serviceCard)
        : [el('p', { class: 'empty' }, 'nothing on this machine matches that')]))
    }

    // ── the ⚙ band, part one: ONE CHECKPOINT'S OWN NUMBERS ────────────────────
    //
    // ⚠️ WHAT IS EDITABLE AND WHAT IS NOT, and the line is sharp:
    //
    //   caps    negatives · idiom · stepsLocked · resolution      READ-ONLY chips
    //   params  steps · cfg · sampler · shift · clipSkip          editable
    //
    // A cap is a FACT about the checkpoint — SDXL does not grow a prose encoder because someone
    // ticked a box, and an editable cap only makes the app lie to itself. A param is a
    // PREFERENCE about how to ask it, and reasonable people differ about 16 steps. (The SERVICE's
    // caps below ARE editable, and for the opposite reason: on a service you added, nobody else
    // has declared them.)
    //
    // ⚠️ THE FIELDS ARE DERIVED from the medium's knob table, which the server sends with the
    // catalogue. So the editor works on a checkpoint nobody described — every checkpoint on a
    // service you added — and a knob the app cannot put on the wire never appears.
    async function tune(service, file, params) {
      if (busy) return
      busy = true
      try {
        await ctx.tune(service, file, params)
      } catch (err) {
        ctx.flash(String(err.message || err), true)
      } finally {
        busy = false
        paint()
        paintEditor(true)
      }
    }

    /** One knob: its input, and ↺ when it is currently yours. */
    function knobRow(sel, knob) {
      const { service, engine } = sel
      const key = knob.key
      const ship = engine.shipped?.[key]
      const now = engine.params?.[key]
      const mine = key in (engine.tuned ?? {})
      const locked = key === 'steps' && engine.caps?.stepsLocked != null
      // What is sent when this is left empty: what the registry declared for this checkpoint, or
      // failing that what the app itself would send. An empty box is never a silent zero.
      const unset = ship ?? knob.fallback

      let input
      if (knob.kind === 'choice') {
        input = select([{ value: '', label: unset == null ? '— the service’s own —' : `— ${unset} —` },
          ...(knob.choices ?? []).map((v) => ({ value: v, label: v }))])
        input.value = mine || ship !== undefined ? String(now ?? '') : ''
      } else if (typeof ship === 'boolean') {
        input = el('input', { type: 'checkbox' })
        input.checked = Boolean(now)
      } else if (knob.kind === 'text') {
        input = el('input', { type: 'text', value: mine || ship !== undefined ? String(now ?? '') : '' })
        input.placeholder = unset == null ? 'the service’s own' : String(unset)
      } else {
        input = el('input', { type: 'number', step: knob.kind === 'integer' ? '1' : 'any' })
        input.value = mine || ship !== undefined ? String(now ?? '') : ''
        input.placeholder = unset == null ? 'the service’s own' : String(unset)
      }
      input.disabled = locked || busy
      // A disabled box with no reason is a bug to whoever meets it. The reason is a fact about
      // the checkpoint, so it goes where the box is rather than in a paragraph under the band.
      input.title = locked
        ? `fixed at ${engine.caps.stepsLocked} — this one is step-distilled, so more would not render it better`
        : (knob.what ?? '')
      input.addEventListener('change', () => {
        let raw
        if (typeof ship === 'boolean') raw = input.checked
        else if (input.value === '') raw = null
        else if (knob.kind === 'choice' || knob.kind === 'text') raw = input.value
        else {
          raw = Number(input.value)
          if (!Number.isFinite(raw)) {
            ctx.flash(`${key} is a number`, true)
            input.value = now == null ? '' : String(now)
            return
          }
        }
        // ⚠️ BACK TO THE SHIPPED VALUE IS A RESET, not a stored duplicate. Otherwise the file
        // grows an entry saying "16, same as shipped", and the day the registry ships 18 that
        // entry silently holds the old number.
        void tune(service.id, engine.file, { [key]: raw === ship ? null : raw })
      })

      const reset = el('button', {
        class: 'btn mini', type: 'button',
        title: mine
          ? `back to ${ship === undefined ? 'unset' : String(ship)}`
          : 'this one is not yours',
      }, '↺')
      reset.disabled = !mine || busy
      reset.addEventListener('click', () => { void tune(service.id, engine.file, { [key]: null }) })

      return el('div', { class: `f-row knob${mine ? ' mine' : ''}` },
        el('span', { title: knob.what ?? '' }, key),
        input,
        reset)
    }

    /** The working copy for one checkpoint's description — the FORM's state, so a poll cannot
     *  take a half-typed name away mid-word. */
    function engineDraft(engine) {
      const dec = engine?.declared ?? null
      return {
        kind: 'engine',
        file: engine?.file ?? '',
        label: dec?.label ?? '',
        isDefault: !!dec?.default,
        caps: clone(dec?.caps) ?? {},
        notes: dec?.notes ?? '',
        // ⚠️ WHAT WE DID NOT PUT ON THE FORM, kept verbatim. Engine rows merge WHOLE, so a row
        // sent back without the `params` the registry declares for it is a row that just deleted
        // them — the label edit would silently reset the checkpoint's numbers.
        raw: dec ? clone(dec) : null,
      }
    }

    /** Every RAW declaration this service has, ready to be sent back.
     *
     *  ⚠️ NEVER THE RESOLVED ROWS. Those have the service's caps already folded in, so posting
     *  them would declare every discovered checkpoint to be whatever its service happened to say
     *  today — and freeze that answer. `declared` is the row as the registry actually holds it. */
    const declaredRows = (s) => (s.engines ?? []).filter((e) => e.declared).map((e) => clone(e.declared))

    /** Write this service's declarations. The whole list travels; the server keeps only the rows
     *  that differ from what it ships (src/inference/services.ts). */
    async function postEngines(service, engines, said, then) {
      if (busy) return
      busy = true
      try {
        await ctx.saveService({ id: service.id, engines })
        ctx.flash(said)
        picked = then
        draft = null
      } catch (err) {
        ctx.flash(String(err.message || err), true)
      } finally {
        busy = false
        paint()
        paintEditor(true)
      }
    }

    async function saveEngine(service) {
      const file = draft.file.trim()
      if (!file) return ctx.flash('which file? the name this service calls it by', true)
      const row_ = { ...(draft.raw ?? {}), file }
      if (draft.label.trim()) row_.label = draft.label.trim(); else delete row_.label
      if (draft.notes.trim()) row_.notes = draft.notes.trim(); else delete row_.notes
      if (Object.keys(draft.caps).length) row_.caps = draft.caps; else delete row_.caps
      if (draft.isDefault) row_.default = true; else delete row_.default
      const rest = declaredRows(service).filter((r) => r.file !== file)
      // At most one default, and the one just chosen is it — two is a coin flip that looks like
      // a decision, and the parser refuses the row rather than pick for you.
      const others = draft.isDefault
        ? rest.map(({ default: _was, ...keep }) => keep)
        : rest
      return postEngines(service, [...others, row_], `${file} described`, `eng:${service.id}/${file}`)
    }

    /** ⚠️ ONE VERB, TWO OUTCOMES, exactly like removing a service: forget what I said about this
     *  checkpoint. A description this app ships comes back; one that was only yours disappears. */
    const dropEngine = (service, file) => postEngines(
      service, declaredRows(service).filter((r) => r.file !== file),
      `no longer described by you: ${file}`, `eng:${service.id}/${file}`)

    // ── the ⚙ band, part one-and-a-half: ONE WORKFLOW ───────────────────────────
    //
    // ⚠️ THE UNIT A PERSON PICKS (2026-08-08 for the type, 2026-08-12 for the form). A checkpoint
    // is not it: `sdxl-style-ref` is SDXL plus an IP-Adapter targeting the STYLE blocks and
    // `sdxl-ref` is the same file and the same adapter targeting ALL of them — one keeps a look,
    // the other keeps a character, and neither is a fact about `sd_xl_base_1.0.ckpt`.
    //
    // ⚠️ WHAT IS NOT HERE YET: `controls` — the IP-Adapter / ControlNet entries a workflow carries.
    // The wire cannot send one (the `hints` channel is unbuilt), and a form that lets you describe
    // a thing the app will silently drop is worse than one that does not offer it.

    /** The working copy. `kind` is the DRAFT's type; the workflow's own kind is `do`, because a
     *  field called `kind` on both would be one rename away from a very quiet bug. */
    function workflowDraft(w, s) {
      const dec = w?.declaration ?? null
      const kinds = ctx.vocab()?.kinds ?? []
      return {
        kind: 'workflow',
        slug: w?.slug ?? '',
        label: dec?.label ?? '',
        do: dec?.kind ?? w?.kind ?? kinds[0]?.slug ?? 't2i',
        model: dec?.model ?? w?.model ?? (s.engines ?? [])[0]?.file ?? '',
        inputs: [...(dec?.inputs ?? w?.inputs ?? ['prompt'])],
        params: clone(dec?.params) ?? {},
        // ⚠️ CLONED WHOLE, AND EDITED IN PLACE. The form manages four fields of a control and the
        // wire has ten; keeping the original object means `mode`, `start` and `end` survive an edit
        // that never mentioned them, exactly as `raw` does for the workflow itself.
        controls: clone(dec?.controls) ?? [],
        loras: clone(dec?.loras) ?? [],
        notes: dec?.notes ?? '',
        // Anything the form does not manage, kept verbatim — workflows merge WHOLE per slug, so a
        // row sent back without a field it had is a row that just deleted it.
        raw: dec ? clone(dec) : null,
      }
    }

    /** Every RAW workflow this service declares. Never the resolved rows: those have the
     *  checkpoint's params folded in, so posting them would freeze today's numbers onto every
     *  workflow you happened to save next to. */
    // ⚠️ AND NEVER AN IMPLIED ONE. A `chat` workflow on a command-line brain follows from the engine
    // (src/inference/workflows.ts); writing it into your registry on an unrelated save would put a
    // row in your file that says exactly what the app already knew, and then it could go stale.
    const declaredWorkflows = (s) => (s.workflows ?? [])
      .filter((w) => w.declaration && !w.implied).map((w) => clone(w.declaration))

    async function postWorkflows(service, workflows, said, then) {
      if (busy) return
      busy = true
      try {
        await ctx.saveService({ id: service.id, workflows })
        ctx.flash(said)
        picked = then
        draft = null
      } catch (err) {
        ctx.flash(String(err.message || err), true)
      } finally {
        busy = false
        paint()
        paintEditor(true)
      }
    }

    async function saveFlow(service) {
      const slug = draft.slug.trim()
      if (!SLUG.test(slug)) {
        return ctx.flash('a workflow needs a name for itself: lowercase words joined by dashes, e.g. `sdxl-style-ref`', true)
      }
      if (!draft.model) return ctx.flash('which checkpoint does it run on?', true)
      if (!draft.inputs.length) {
        return ctx.flash('a workflow that takes nothing cannot be asked for anything', true)
      }
      const row_ = {
        ...(draft.raw ?? {}),
        slug, kind: draft.do, model: draft.model, inputs: [...draft.inputs],
      }
      if (draft.label.trim()) row_.label = draft.label.trim(); else delete row_.label
      if (draft.notes.trim()) row_.notes = draft.notes.trim(); else delete row_.notes
      if (Object.keys(draft.params).length) row_.params = draft.params; else delete row_.params
      // An empty list is a field nobody wrote, not a field set to nothing.
      if (draft.controls.length) row_.controls = draft.controls; else delete row_.controls
      if (draft.loras.length) row_.loras = draft.loras; else delete row_.loras
      const orphan = draft.controls.find((c) => !draft.inputs.includes(c.from))
      if (orphan) {
        return ctx.flash(`nothing fills a ${orphan.from} slot here — tick it under "takes"`, true)
      }
      const rest = declaredWorkflows(service).filter((r) => r.slug !== slug)
      return postWorkflows(service, [...rest, row_], `${slug} saved`, `workflow:${service.id}/${slug}`)
    }

    /** ⚠️ ONE VERB, TWO OUTCOMES, as everywhere else on this page: forget my row. A workflow this
     *  app ships comes back as it shipped; one that was only yours leaves the list. */
    const dropWorkflow = (service, slug) => postWorkflows(
      service, declaredWorkflows(service).filter((r) => r.slug !== slug),
      `no longer yours: ${slug}`, null)

    function workflowEditor(sel) {
      const { service, workflow } = sel
      const isNew = !workflow
      const v = ctx.vocab() ?? {}
      if (!draft || draft.kind !== 'workflow') draft = workflowDraft(workflow, service)
      const st = workflow ? (ENGINE[workflow.state] ?? ENGINE.discovered) : null
      const files = (service.engines ?? []).map((e) => e.file)
      // The current value always appears, even when the service does not report it: a workflow that
      // names a file nobody has is `declared`, which is a state, not an error.
      const models = files.includes(draft.model) || !draft.model ? files : [draft.model, ...files]
      const kinds = kindOrder(ctx, [draft.do])

      const slugIn = textIn(() => draft.slug, (x) => { draft.slug = x },
        { placeholder: 'sdxl-style-ref' })
      // The slug is what a saved choice names — renaming one silently un-arms it in the bar. Set
      // once, like a service's id and a checkpoint's file.
      slugIn.disabled = !isNew || busy

      const takes = el('div', { class: 'f-takes' }, ...(v.inputs ?? []).map((slot) => {
        const box = el('input', { type: 'checkbox' })
        box.checked = draft.inputs.includes(slot)
        box.disabled = busy
        box.addEventListener('change', () => {
          draft.inputs = box.checked
            ? [...new Set([...draft.inputs, slot])]
            : draft.inputs.filter((x) => x !== slot)
        })
        return el('label', {
          class: 'f-take',
          title: slot === 'prompt'
            ? 'the sentence. A workflow without it is one you press with a picture and no words.'
            : `a picture in the ${slot} slot of the tray`,
        }, box, el('span', {}, slot))
      }))

      const notes = el('textarea', {
        class: 'f-notes', rows: '2', placeholder: 'what this one is for, in one line',
      })
      notes.value = draft.notes ?? ''
      notes.disabled = busy
      notes.addEventListener('input', () => { draft.notes = notes.value })

      const save = el('button', { class: 'btn primary mini', type: 'button' },
        isNew ? 'add it' : 'save')
      save.disabled = busy
      save.addEventListener('click', () => { void saveFlow(service) })

      // ⧉ THE COMMON REAL CASE — "this, but strength 0.4". Authoring one from blank is the rare
      // door; every palette in the world is mostly variations of a few workflows.
      const dup = el('button', { class: 'btn mini', type: 'button' }, '⧉ duplicate')
      dup.disabled = busy || isNew
      dup.title = 'a copy of this one, ready to change — nothing is written until you save it'
      dup.addEventListener('click', () => {
        draft = { ...workflowDraft(workflow, service), slug: `${workflow.slug}-copy`, raw: null }
        picked = `new-workflow:${service.id}`
        paint()
        paintEditor(true)
        ctx.openOptions?.()
      })

      const drop = el('button', { class: 'btn mini', type: 'button' }, '🗑 remove')
      drop.disabled = busy || !workflow?.mine
      // ⚠️ THREE STATES, NOT TWO. An implied workflow is on nobody's disk, so there is nothing to
      // remove and nothing to revert to — saving an edit is what turns it into a real row.
      drop.title = workflow?.implied
        ? 'nothing to remove — this one follows from the model, and is not written anywhere'
        : 'drop your version — a workflow this app ships comes back, one that was only '
          + 'yours leaves the list'
      drop.addEventListener('click', () => { if (workflow) void dropWorkflow(service, workflow.slug) })

      /**
       * ⇢ THE PUBLISH SHAPE — this row as xoko.lat's own source file wants it.
       *
       * ⚠️ IT EXISTS BECAUSE THE LIBRARY IS THE ORIGIN AND THIS IS NOT (2026-08-31). A workflow
       * authored here — by hand, or by a chain that binds to the registry — works on this machine
       * and nowhere else, and the rule everything is held to is that content lives on 📚 and comes
       * down. So the last step of authoring one is getting it back up, and until now the only way
       * was to open the app's own registry file and cut a row out of it.
       *
       * ⚠️ THE DECLARATION, NOT THE RESOLVED WORKFLOW. `workflow.declaration` is what somebody wrote;
       * the row beside it has the checkpoint's params already folded in, and publishing THAT
       * would freeze this machine's numbers onto everybody who takes it.
       */
      const publish = el('button', { class: 'btn mini', type: 'button' }, '⇢ publish shape')
      publish.disabled = busy || isNew
      publish.title = `copy this row as it goes into src/workflows/${service.id}.json on xoko.lat`
      publish.addEventListener('click', async () => {
        const shape = { service: service.id, workflow: workflow?.declaration ?? draft.raw ?? {} }
        try {
          await navigator.clipboard.writeText(`${JSON.stringify(shape, null, 2)}\n`)
          ctx.flash('copied — paste it into the library’s workflows file')
        } catch { ctx.flash('the browser would not let me copy that', true) }
      })

      return el('div', { class: 'detail' },
        el('div', { class: `ed-head ${st?.cls ?? ''}` },
          el('b', {}, isNew ? 'a new workflow' : (workflow.label ?? workflow.slug)),
          st ? el('span', { class: 'svc-state' }, el('span', { class: 'svc-dot' }), st.say) : null),
        el('p', { class: 'muted path mono' }, `${service.label ?? service.id}`),

        row('name for it', slugIn, 'what a saved choice names — set once, never renamed'),
        row('shows as', textIn(() => draft.label, (x) => { draft.label = x },
          { placeholder: workflow?.label ?? 'take this look' }), 'what the picker calls it'),
        row('do', pick(kinds, () => draft.do, (x) => { draft.do = x }),
          'which row of the picker it appears under — the capability it answers for'),
        row('runs on', pick(models, () => draft.model, (x) => { draft.model = x },
          { blank: models.length ? null : '— nothing to run on —' }),
        'the checkpoint, exactly as this service names it — ＋ add a model for one it does not report'),
        row('takes', takes, 'the sentence, and which slots of the reference tray it fills'),

        // ⚠️ WHAT MAKES THIS MORE THAN A CHECKPOINT. Six of this app's SDXL workflows are one file,
        // and what tells them apart is entirely in here.
        fold(draft.controls.length
          ? `controls (${draft.controls.length})`
          : 'controls — an IP-Adapter or a ControlNet', ...controlBand(service)),
        fold(draft.loras.length ? `loras (${draft.loras.length})` : 'loras', ...loraBand(service)),

        // ⚠️ THE KNOBS THE WORKFLOW BRINGS, on top of what the checkpoint declares. This is where
        // Kontext's `strength: 1` lives, and it belongs here rather than on the file because the
        // same file at 0.6 is simply a broken img2img.
        fold('what it runs at', ...workflowKnobs(service), notes),

        el('p', { class: 'rw-foot form-foot' },
          el('span', { class: 'muted' },
            isNew ? 'nothing is written until you press it'
              : workflow.mine ? 'this workflow is yours'
                : workflow.implied
                  ? 'this one follows from the model — save to make it yours'
                  : 'this app ships this workflow'),
          el('span', { class: 'spacer' }),
          !isNew ? publish : null,
          !isNew ? dup : null,
          !isNew ? drop : null,
          save))
    }

    /** A checkbox, for a field that is a yes or a no. */
    function tickIn(get, put) {
      const box = el('input', { type: 'checkbox' })
      box.checked = get()
      box.disabled = busy
      box.addEventListener('change', () => put(box.checked))
      return box
    }

    /**
     * 🔑 THE KEY — the one field on this page whose value the browser can write and never read.
     *
     * ⚠️ IT IS NOT PART OF THE DRAFT, and does not travel with `save`. The service row goes to the
     * registry, which is a file meant to be read, copied and shared; the key goes to its own
     * owner-only file through its own endpoint (src/secrets.ts). Two destinations, two writes, and
     * the box empties itself the moment it has been sent.
     *
     * ⚠️ THE SHELF ONLY EVER SAYS `set` OR NOT. Nothing here has ever seen a stored key, which is
     * what makes this box safe to leave on screen.
     */
    function keyRows(s) {
      // A service that does not exist yet has nowhere to keep a key: the row has to be saved
      // before there is something for the key to belong to.
      if (!s) return []
      const named = draft.transport.auth?.secret ?? s.secret?.id ?? null
      const have = !!s.secret?.set
      const box = el('input', {
        type: 'password', autocomplete: 'off', spellcheck: 'false',
        placeholder: have ? '•••••••• — set. Type a new one to replace it' : 'paste it here',
      })
      box.disabled = busy

      const set = el('button', { class: 'btn mini', type: 'button' }, have ? 'replace' : 'set')
      set.disabled = busy
      set.title = 'store it in an owner-only file on this machine. It is never sent back to a page.'
      set.addEventListener('click', () => {
        const value = box.value.trim()
        if (!value) return ctx.flash('paste the key first', true)
        box.value = ''
        return void saveKey(s, named ?? s.id, value)
      })

      const forget = el('button', { class: 'btn mini', type: 'button' }, '🗑 forget')
      forget.disabled = busy || !have
      forget.title = 'delete the stored key. The service stays; it simply has nothing to pay with.'
      forget.addEventListener('click', () => void saveKey(s, named ?? s.id, null))

      return [
        row('key', el('span', { class: 'f-pair' }, box, set, forget),
          named
            ? `stored under “${named}”, owner-only, and never sent back to this page`
            : 'this service does not ask for one yet — setting a key makes it ask'),
        have || named
          ? el('p', { class: 'muted' },
            have ? `a key is set under “${named}”.` : `it wants a “${named}” key, and there is none.`)
          : null,
      ]
    }

    /**
     * Store the key — and, when the row did not ask for one, teach it to.
     *
     * ⚠️ THE SERVICE IS SAVED FIRST. A key nobody reads is a key sitting in a file for nothing, so
     * the row learns its name before the value exists; if that save fails, nothing is stored.
     */
    async function saveKey(service, name, value) {
      if (busy) return
      busy = true
      try {
        if (!service.transport?.auth) {
          draft.transport.auth = { secret: name }
          await ctx.saveService({ id: service.id, transport: transportOf(draft) })
        }
        await ctx.setSecret(name, value)
        ctx.flash(value === null ? `forgot the ${name} key` : `${name} key stored`)
      } catch (err) {
        ctx.flash(String(err.message || err), true)
      } finally {
        busy = false
        paint()
        paintEditor(true)
      }
    }

    /** A number that can be UNSET. Clearing it deletes the key rather than storing 0, because 0 is
     *  a real weight and "the workflow says nothing" is not the same answer. */
    function numIn(get, put) {
      const input = el('input', {
        type: 'number', step: 'any', value: get() == null ? '' : String(get()),
      })
      input.disabled = busy
      input.addEventListener('input', () => put(input.value === '' ? undefined : Number(input.value)))
      return input
    }

    /** Set a key, or delete it when the value is empty — the same "unset is not zero" rule. */
    const put = (obj, key) => (value) => {
      if (value === undefined || value === '') delete obj[key]
      else obj[key] = value
    }

    /**
     * ⚙ THE CONTROLS — the adapters stacked on the checkpoint, each pointed at a slot.
     *
     * ⚠️ THE FILE LIST IS THE SERVICE'S OWN. A control is looked up by name in the server's catalog
     * and, for one it does not know, sent with its metadata attached — so offering a free-text file
     * name would be offering a workflow that renders exactly as if the adapter were not there. What
     * the service reports is what the select holds; a name it no longer reports still shows,
     * because a workflow naming a file you deleted is a state, not a typo.
     */
    function controlBand(service) {
      const v = ctx.vocab() ?? {}
      const have = service.catalog?.controlNets ?? []
      const slots = draft.inputs.filter((i) => i !== 'prompt')
      const add = el('button', { class: 'btn mini', type: 'button' }, '＋ control')
      add.disabled = busy || !have.length
      add.title = have.length
        ? 'stack another adapter on this checkpoint'
        : 'this service reports no control files — ↻ its card, or install one'
      add.addEventListener('click', () => {
        draft.controls.push({
          file: have[0], from: slots[0] ?? 'ref', inputType: 'Shuffle', weight: 0.7,
        })
        paintEditor(true)
      })

      return [
        ...draft.controls.flatMap((c, i) => {
          const files = have.includes(c.file) ? have : [c.file, ...have].filter(Boolean)
          const drop = el('button', { class: 'btn mini', type: 'button', title: 'take it off' }, '✕')
          drop.disabled = busy
          drop.addEventListener('click', () => {
            draft.controls.splice(i, 1)
            paintEditor(true)
          })
          return [
            row(`control ${i + 1}`, el('span', { class: 'f-pair' },
              pick(files, () => c.file, put(c, 'file'),
                { blank: files.length ? null : '— nothing reported —' }), drop),
            'the adapter or ControlNet file, as this service names it'),
            row('reads', pick(slots, () => c.from, put(c, 'from'),
              { blank: slots.length ? null : '— tick a slot under “takes” —' }),
            'which attached picture feeds it'),
            row('as', pick(v.controlTypes ?? [], () => c.inputType, put(c, 'inputType')),
              'what the picture IS — Shuffle for every IP-Adapter, Canny/Depth/Pose for a ControlNet. '
              + 'It also decides which channel the picture rides.'),
            row('weight', numIn(() => c.weight, put(c, 'weight')),
              'how hard it pulls. 1 for a ControlNet, 0.7–0.8 for an adapter, by long habit'),
            row('blocks', pick(v.targetBlocks ?? [], () => c.targetBlocks, put(c, 'targetBlocks'),
              { blank: '— unset —' }),
            'InstantStyle: which attention blocks the adapter may write into. `All` keeps the '
              + 'subject, `Style` takes only the look — the one word that separates two workflows on '
              + 'one file. Nothing on a ControlNet, which has no such blocks.'),
          ]
        }),
        el('p', { class: 'rw-foot' }, el('span', { class: 'spacer' }), add),
      ]
    }

    /** The same shape, one level simpler: a LoRA is a file and a weight. */
    function loraBand(service) {
      const have = service.catalog?.loras ?? []
      const add = el('button', { class: 'btn mini', type: 'button' }, '＋ lora')
      add.disabled = busy || !have.length
      add.title = have.length ? 'stack a LoRA on this checkpoint' : 'this service reports no LoRAs'
      add.addEventListener('click', () => {
        draft.loras.push({ file: have[0], weight: 1 })
        paintEditor(true)
      })
      return [
        ...draft.loras.flatMap((l, i) => {
          const files = have.includes(l.file) ? have : [l.file, ...have].filter(Boolean)
          const drop = el('button', { class: 'btn mini', type: 'button', title: 'take it off' }, '✕')
          drop.disabled = busy
          drop.addEventListener('click', () => {
            draft.loras.splice(i, 1)
            paintEditor(true)
          })
          return [
            row(`lora ${i + 1}`, el('span', { class: 'f-pair' },
              pick(files, () => l.file, put(l, 'file'),
                { blank: files.length ? null : '— nothing reported —' }), drop),
            'a step distillation or a style, stacked on the checkpoint'),
            row('weight', numIn(() => l.weight, put(l, 'weight')),
              'how much of it. ⚠️ the engine\'s own default is 0.6, not 1'),
          ]
        }),
        el('p', { class: 'rw-foot' }, el('span', { class: 'spacer' }), add),
      ]
    }

    /** One row per knob this medium has, holding the WORKFLOW's own value. Empty = the workflow says
     *  nothing and the checkpoint's number stands. */
    function workflowKnobs(service) {
      return (service.knobs ?? []).map((knob) => {
        const at = draft.params[knob.key]
        let input
        if (knob.kind === 'choice') {
          input = select([{ value: '', label: '— the checkpoint’s —' },
            ...(knob.choices ?? []).map((x) => ({ value: x, label: x }))])
          input.value = at == null ? '' : String(at)
        } else {
          input = el('input', {
            type: 'number', step: knob.kind === 'integer' ? '1' : 'any',
            value: at == null ? '' : String(at),
          })
          input.placeholder = 'the checkpoint’s'
        }
        input.disabled = busy
        input.title = knob.what ?? ''
        input.addEventListener('change', () => {
          if (input.value === '') { delete draft.params[knob.key]; return }
          const raw = knob.kind === 'choice' ? input.value : Number(input.value)
          if (typeof raw === 'number' && !Number.isFinite(raw)) {
            ctx.flash(`${knob.key} is a number`, true)
            input.value = at == null ? '' : String(at)
            return
          }
          draft.params[knob.key] = raw
        })
        return el('div', { class: 'f-row knob' }, el('span', { title: knob.what ?? '' }, knob.key), input)
      })
    }

    // ⚠️ AND THIS IS WHERE CAPABILITY IS DECLARED (2026-08-08). It used to be read-only here on
    // the grounds that a cap is a fact and ticking a box does not give a model a channel — true,
    // and the wrong conclusion: nobody else was going to declare it. The same server serves a
    // 4-step checkpoint with no negative prompt, a 28-step one with both, and one that only makes
    // sense with an `edit` reference. A service cannot answer for all three, so what a checkpoint
    // IS belongs on the checkpoint, and the service's own set is what an undescribed one inherits.
    function engineEditor(sel) {
      const { service, engine } = sel
      const isNew = !engine
      const v = ctx.vocab() ?? {}
      if (!draft || draft.kind !== 'engine') draft = engineDraft(engine)
      const st = engine ? (ENGINE[engine.state] ?? ENGINE.discovered) : null
      const svcCaps = ctx.capsOf(service.id) ?? {}
      const shipped = engine?.shipped ?? {}
      // The medium's vocabulary, plus anything the registry declared that it does not know about
      // — the same union the server will accept.
      const known = service.knobs ?? []
      const knobs = [
        ...known,
        ...Object.keys(shipped).filter((k) => !known.some((x) => x.key === k))
          .map((k) => ({ key: k, kind: typeof shipped[k] === 'number' ? 'number' : 'text', what: 'declared by the registry for this checkpoint' })),
      ]
      const mine = Object.keys(engine?.tuned ?? {})

      const resetAll = el('button', { class: 'btn mini', type: 'button' }, `↺ all ${mine.length}`)
      resetAll.disabled = !mine.length || busy
      resetAll.addEventListener('click', () => {
        void tune(service.id, engine.file, Object.fromEntries(mine.map((k) => [k, null])))
      })

      const fileIn = textIn(() => draft.file, (x) => { draft.file = x },
        { placeholder: 'flux_1_dev_q8p.ckpt' })
      // The file IS the identity — it is what the service is asked for by name. Renaming one is
      // describing a different checkpoint, so it is set once, like a service's id.
      fileIn.disabled = !isNew || busy

      const star = el('input', { type: 'checkbox' })
      star.checked = draft.isDefault
      star.disabled = busy
      star.addEventListener('change', () => { draft.isDefault = star.checked })

      const notes = el('textarea', { class: 'f-notes', rows: '2', placeholder: 'what this one is for' })
      notes.value = draft.notes ?? ''
      notes.disabled = busy
      notes.addEventListener('input', () => { draft.notes = notes.value })

      const save = el('button', { class: 'btn primary mini', type: 'button' },
        isNew ? 'describe it' : 'save')
      save.disabled = busy
      save.addEventListener('click', () => { void saveEngine(service) })

      const drop = el('button', { class: 'btn mini', type: 'button' }, '↺ forget mine')
      drop.disabled = busy || !engine?.mine
      drop.title = 'drop what you said about this one — a checkpoint this app ships a description '
        + 'for goes back to it, one that was only yours leaves the list'
      drop.addEventListener('click', () => { if (engine) void dropEngine(service, engine.file) })

      return el('div', { class: 'detail' },
        el('div', { class: `ed-head ${st?.cls ?? ''}` },
          el('b', {}, isNew ? 'a checkpoint it does not report' : engine.label),
          st ? el('span', { class: 'svc-state' }, el('span', { class: 'svc-dot' }), st.say) : null),
        !isNew ? el('p', { class: 'muted path mono' }, engine.file) : null,

        ...(isNew ? [row('file', fileIn, 'the name the service calls it by, exactly')] : []),
        row('name', textIn(() => draft.label, (x) => { draft.label = x },
          { placeholder: engine?.label ?? 'FLUX.1 dev' }), 'what to call it on this page'),
        row('default', star, 'what a press uses when nobody picked — one per service'),

        // ⚠️ FOLDED, AND THE SUMMARY IS THE ANSWER. These are set once and then read at a glance,
        // so open they would be seven rows of furniture on every visit — and shut they would hide
        // the one thing you came to find out. So the summary SAYS what it is; opening it is for
        // changing it.
        fold('how it reads a prompt', ...capRows(v, {
          inherit: svcCaps,
          own: (k) => k in draft.caps,
          value: (k) => (k in draft.caps ? draft.caps[k] : svcCaps[k]),
          set: (k, x) => { draft.caps[k] = x },
          clear: (k) => { delete draft.caps[k] },
        }), notes),

        el('p', { class: 'rw-foot form-foot' },
          el('span', { class: 'muted' },
            isNew ? 'nothing is written until you press it'
              : engine.mine ? 'you describe this one'
                : engine.declared ? 'described by this app'
                  : 'nobody has described this one — it takes the service’s'),
          el('span', { class: 'spacer' }),
          !isNew ? drop : null,
          save),

        // RUNS AT — editable, and applied on change rather than on a button: each knob is one
        // decision, unlike a description, which is several fields that are only true together.
        ...(isNew
          ? []
          : [
              el('div', { class: 'rw-head muted' }, 'runs at'),
              ...(knobs.length
                ? [
                    ...knobs.map((k) => knobRow(sel, k)),
                    el('p', { class: 'rw-foot' },
                      el('span', { class: 'muted' },
                        mine.length ? `${mine.length} of these are yours` : 'nothing set here yet'),
                      el('span', { class: 'spacer' }),
                      resetAll),
                  ]
                : [el('p', { class: 'empty' },
                  'nothing this app knows how to set on a service that makes several things')]),
            ]))
    }

    // ── the ⚙ band, part two: ONE SERVICE'S CONNECTION ────────────────────────
    //
    // ⚠️ SAVE, NOT LIVE. The knobs above apply on change because each is one decision; a
    // connection is several fields that are only true together, and applying half a hostname is
    // how you lose the service you were editing.
    //
    // ⚠️ AND THE FORM IS THE WHOLE STATEMENT of what is yours: a field you set back to the shipped
    // value stops being an override, exactly like a knob. There is no separate ↺ per field
    // because there is no separate act — retyping the shipped port IS the reset.
    //
    // ⚠️ WHAT IS NOT HERE: how to LAUNCH it. A service you add is one the app connects to, never
    // one it starts — a launch carries a binary and an argv array, and a page that could set those
    // is a page that chooses what this process executes (PLAN §15 rule 1).

    function startDraft(s) {
      const v = ctx.vocab() ?? {}
      if (!s) {
        // ⚠️ A PRESET, NOT A BLANK FORM. `grpc` vs `http` is a fact about the thing on the other
        // end, not a preference, and nobody adding a service can be expected to know which word
        // this app wants for it. The first preset is the default; picking another refills the row.
        // ⚠️ IT OPENS ON THE PLAIN HTTP ROW, NOT ON THE FIRST ONE (2026-09-06). Anybody who has
        // Draw Things or ComfyUI picks it by name in one click; the person who NEEDS this form is
        // the one connecting something the list has never heard of, and that thing almost always
        // speaks http. So the starting position is the general case and the named products are the
        // shortcuts, rather than the other way round.
        //
        // The list itself still leads with the named ones — that is a browsing order, and it is not
        // the same question as where the form starts.
        const offered = (v.presets ?? []).filter((x) => x.role !== 'brain')
        const preset = offered.find((x) => x.transport?.kind === 'http') ?? offered[0]
        return {
          kind: 'service',
          preset: preset?.id ?? '',
          // ⚠️ NO ID, AND THE NAME IS ALREADY FILLED IN (2026-09-06). The first preset is selected
          // when this opens, so its name has to be seeded HERE and not only in the picker's
          // `change` — the handler never fires for the option that was already showing, which is
          // how connecting Draw Things (the first row) used to fail on an id nobody was asked for.
          // ⚠️ NO `role` AND NO `medium` EITHER (2026-09-06). This form makes GENERATORS — the one
          // brain is connected in ✨ xoko — and what a service makes is read off the workflows you
          // take, never claimed by the row. Both were dropdowns, and neither was a question the
          // person installing a box could answer.
          id: '', label: preset?.name ?? '',
          transport: clone(preset?.transport)
            ?? { kind: (v.transports ?? ['http'])[0], host: '127.0.0.1', port: 8188, basePath: '' },
          caps: clone(v.capsDefault ?? {}), notes: '', help: '',
        }
      }
      return {
        kind: 'service',
        preset: '',
        id: s.id, label: s.label ?? '',
        transport: clone(s.transport) ?? { kind: (v.transports ?? ['http'])[0], host: '', port: 0, basePath: '' },
        caps: clone(s.caps ?? v.capsDefault ?? {}), notes: s.notes ?? '', help: s.help ?? '',
      }
    }

    /** ⚠️ WHAT THIS BUILD CAN SPEAK, and the honest end of the list. A row for something with no
     *  adapter would look configured and render nothing. */
    function presetRow() {
      const v = ctx.vocab() ?? {}
      // ⚠️ NOT THE TEXT ONES. Connecting a writing model is ✨ xoko's press, and offering it here
      // as well would be a second door onto the one thing this app has exactly one of.
      const presets = (v.presets ?? []).filter((p) => p.role !== 'brain')
      const s = select([
        ...presets.map((p) => ({ value: p.id, label: p.label })),
        { value: '', label: '⋯ something else' },
      ])
      s.value = draft.preset ?? ''
      s.disabled = busy
      s.title = presets.find((p) => p.id === draft.preset)?.what
        ?? 'a service speaking something this build does not know needs a new version of xokolat'
      s.addEventListener('change', () => {
        const p = presets.find((x) => x.id === s.value)
        // ⚠️ A NAME YOU TYPED SURVIVES A CHANGE OF MIND about the transport; one you never touched
        // follows the preset. Comparing against every preset's name is what tells the two apart —
        // an untouched box holds some preset's name, not an empty string.
        const untouched = !draft.label.trim()
          || presets.some((x) => x.name === draft.label)
        draft.preset = s.value
        if (p) {
          draft.transport = clone(p.transport)
          if (untouched) draft.label = p.name
        }
        paintEditor(true)
      })

      // ⚠️ THE SENTENCE UNDER THE PICKER, NOT INSIDE ITS TOOLTIP (2026-08-21). `what` says the
      // thing a first-time user most needs — for Claude Code, that they must install it and log in
      // from a terminal before any of this works — and it was a `title` on a <select>, which is
      // documentation nobody has ever hovered. It reads at the moment you choose, before save.
      const said = presets.find((p) => p.id === draft.preset)?.what
      return el('div', { class: 'preset-pick' }, s,
        said ? el('p', { class: 'preset-what' }, said) : null)
    }

    /** The four questions that describe one http call. Only for `http`, because that is the only
     *  transport where there is nothing to discover. */
    function callRows() {
      const call = (draft.transport.call ??= {
        method: 'POST', path: '/', send: 'form', field: 'file', receive: 'image',
      })
      const out = [
        row('send', textIn(() => call.path, (x) => { call.path = x }, { placeholder: '/api/remove' }),
          'the path one picture is POSTed to'),
        row('the picture', (() => {
          const s = select([
            { value: 'form', label: 'in a form field' },
            { value: 'body', label: 'as the whole body' },
          ])
          s.value = call.send
          s.disabled = busy
          s.addEventListener('change', () => { call.send = s.value; paintEditor(true) })
          return s
        })(), 'how the bytes are carried'),
      ]
      if (call.send === 'form') {
        out.push(row('field', textIn(() => call.field ?? 'file', (x) => { call.field = x },
          { placeholder: 'file' }), 'the multipart field the picture goes in'))
      }
      out.push(row('get back', (() => {
        const s = select([
          { value: 'image', label: 'the picture itself' },
          { value: 'json', label: 'JSON, with it inside' },
        ])
        s.value = call.receive
        s.disabled = busy
        s.addEventListener('change', () => { call.receive = s.value; paintEditor(true) })
        return s
      })(), 'what the answer is'))
      if (call.receive === 'json') {
        out.push(row('in field', textIn(() => call.jsonField ?? '', (x) => { call.jsonField = x },
          { placeholder: 'image' }), 'the key holding the picture, base64'))
      }
      // What the workflow's own knobs become on the wire: form fields, or query when the picture is
      // the body. Said once, here, because it is the one thing the four fields do not show.
      out.push(el('p', { class: 'band-note muted' },
        call.send === 'form'
          ? 'a workflow’s knobs ride as the other form fields, and its checkpoint as `model`'
          : 'a workflow’s knobs ride in the query string, and its checkpoint as `model`'))
      return out
    }

    /** One labelled control. `.knob` is the same row the engine editor uses — one shape for
     *  "a name on the left, a thing you change on the right". */
    const row = (label, input, hint) => el('div', { class: 'f-row knob' },
      el('span', { title: hint ?? '' }, label), input)

    /**
     * ⚠️ A FOLD, AND THE SUMMARY IS THE ANSWER (2026-08-08).
     *
     * This pane was a wall: every band carried a paragraph explaining itself, which is
     * documentation put where controls go — longer than the controls, read once, in the way
     * forever. What each field means lives in its `title` and in this file's comments; what the
     * panel owes the screen is the controls, and the ones you set once fold away behind a line
     * that already says what they add up to.
     */
    const fold = (summary, ...kids) => el('details', { class: 'cap-fold' },
      el('summary', { title: 'set once — open to change it' }, summary),
      ...kids.filter(Boolean))

    function textIn(get, put, { placeholder = '', type = 'text' } = {}) {
      const input = el('input', { type, value: get() == null ? '' : String(get()), placeholder })
      input.disabled = busy
      input.addEventListener('input', () => put(type === 'number' ? Number(input.value) : input.value))
      return input
    }

    function pick(values, get, put, { blank = null } = {}) {
      const s = select([...(blank ? [{ value: '', label: blank }] : []),
        ...values.map((v) => ({ value: v, label: v }))])
      s.value = get() ?? ''
      s.disabled = busy
      s.addEventListener('change', () => put(s.value))
      return s
    }

    function bandIn(get, put) {
      const one = (i) => {
        const input = el('input', { type: 'number', step: '1', value: String(get()[i] ?? 0) })
        input.disabled = busy
        input.addEventListener('input', () => {
          const next = [...get()]
          next[i] = Number(input.value)
          put(next)
        })
        return input
      }
      return el('div', { class: 'f-band' }, one(0), el('span', { class: 'muted' }, '→'), one(1))
    }

    /**
     * The capability rows — for a service, and for one checkpoint.
     *
     * ⚠️ TWO MODES, ONE BUILDER. `inherit` is null for a service: it declares all seven, and there
     * is nothing above it to fall back to. For a CHECKPOINT it is the service's own set, and then
     * the editor is a PATCH: an untouched row shows what it inherits, a touched one lights up as
     * yours and grows a ↺. Storing all seven on every checkpoint would freeze a copy of six
     * answers nobody gave — the same drift the registry merge exists to prevent.
     */
    function capRows(v, { own, value, set, clear, inherit = null }) {
      return CAP_FIELDS.map((f) => {
        const key = capKey(f)
        const at = () => value(key)
        const node = el('div', { class: 'f-row knob' })
        // ↺ is a PATCH verb, so a service — which has nothing above it — does not get one.
        const reset = inherit
          ? el('button', {
              class: 'btn mini', type: 'button',
              title: `back to what the service says: ${CAP_WORDS[key]?.(inherit[key]) ?? '—'}`,
            }, '↺')
          : null
        if (reset) reset.addEventListener('click', () => { clear(key); paintEditor(true) })
        const mark = () => {
          node.classList.toggle('mine', !!inherit && own(key))
          if (reset) reset.disabled = busy || !own(key)
        }
        const put = (x) => { set(key, x); mark() }

        let input
        if (f.kind === 'choice') {
          input = pick(v[f.from] ?? [], at, put)
        } else if (f.kind === 'bool') {
          input = el('input', { type: 'checkbox' })
          input.checked = !!at()
          input.disabled = busy
          input.addEventListener('change', () => put(input.checked))
        } else if (f.kind === 'band') {
          input = bandIn(() => at() ?? [0, 0], put)
        } else if (f.kind === 'steps') {
          input = el('input', {
            type: 'number', step: '1', placeholder: 'free',
            value: at() == null ? '' : String(at()),
          })
          input.disabled = busy
          input.addEventListener('input', () => put(input.value === '' ? null : Number(input.value)))
        }

        node.append(el('span', { title: f.hint }, f.label), input, ...(reset ? [reset] : []))
        mark()
        return node
      })
    }

    /** The service's own — it declares them outright, so every field is present. */
    const capsForm = (v) => capRows(v, {
      own: () => true,
      value: (k) => draft.caps[k],
      set: (k, x) => { draft.caps[k] = x },
      clear: () => {},
    })

    /** Only the fields that mean anything for the shape chosen — a `field` left over from a form
     *  send is a key the parser refuses once the picture became the body. */
    const callBody = (c) => ({
      method: 'POST',
      path: String(c.path ?? '/').trim() || '/',
      send: c.send,
      ...(c.send === 'form' ? { field: String(c.field ?? 'file').trim() || 'file' } : {}),
      receive: c.receive,
      ...(c.receive === 'json' ? { jsonField: String(c.jsonField ?? '').trim() } : {}),
    })

    /**
     * The draft's endpoint, as the writer takes it.
     *
     * ⚠️ A COMMAND ROW IS A NAME AND NOTHING ELSE — no host, no port, and above all no argv. This
     * page cannot compose one: the brain was chosen from the list the SERVER sent, the server
     * refuses any name that is not on it, and what actually runs lives in its source (§15 rule 1).
     */
    const transportOf = (d) => (d.transport.kind === 'cli'
      ? { kind: 'cli', brain: d.transport.brain }
      : {
        kind: d.transport.kind,
        host: String(d.transport.host ?? '').trim(),
        port: Number(d.transport.port),
        ...(String(d.transport.basePath ?? '').trim()
          ? { basePath: String(d.transport.basePath).trim() }
          : {}),
        ...(d.transport.tls ? { tls: true } : {}),
        // Which key it wants, by name. The key itself has its own endpoint and its own file.
        ...(d.transport.auth?.secret ? { auth: { secret: d.transport.auth.secret } } : {}),
        // The call shape belongs to `http` alone — sending it on a gRPC row is a validation
        // error, and the form only ever shows it for http.
        ...(d.transport.kind === 'http' && d.transport.call
          ? { call: callBody(d.transport.call) }
          : {}),
      })

    async function saveDraft(isNew) {
      if (busy) return
      // ⚠️ A NEW ROW SENDS NO ID. The server makes one from the name and answers with it
      // (`saved.id`), which is why the flash below reads what came back rather than what was typed.
      // An existing row sends the id it already has: that string is in run folders on disk.
      const body = {
        ...(isNew ? {} : { id: draft.id }),
        label: draft.label.trim(),
        transport: transportOf(draft),
        caps: draft.caps,
        ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
        // Where to read how to get it running. The writer takes `/guides/…` or `https://…` and
        // nothing else — a scheme in a registry file is a scheme that ends up in an href.
        ...(draft.help.trim() ? { help: draft.help.trim() } : {}),
      }
      // ⚠️ THE NAME IS THE REQUIRED FIELD NOW, and it is checked where it is typed rather than
      // three layers down: this form has no other way of naming the row it is about to make.
      if (isNew && !body.label) {
        ctx.flash('give it a name first', true)
        return
      }
      if (!body.label) delete body.label
      busy = true
      try {
        const done = await ctx.saveService(body)
        const id = done?.saved?.id ?? draft.id
        ctx.flash(isNew ? `${body.label} added — it writes into ${id}` : `${id} saved`)
        picked = `svc:${id}`
        draft = null
        paint()
        paintEditor(true)
      } catch (err) {
        ctx.flash(String(err.message || err), true)
        busy = false
        paintEditor(true)
        return
      }
      busy = false
    }

    async function dropService(s) {
      if (busy) return
      busy = true
      try {
        const r = await ctx.removeService(s.id)
        ctx.flash(r?.saved?.reverted
          ? `${s.id} is back to what the app ships`
          : `${s.id} removed`)
        picked = r?.saved?.reverted ? `svc:${s.id}` : null
        draft = null
        paint()
        paintEditor(true)
      } catch (err) {
        ctx.flash(String(err.message || err), true)
      } finally {
        busy = false
      }
    }

    function serviceEditor(s) {
      const v = ctx.vocab() ?? {}
      const isNew = !s
      if (!draft || draft.kind !== 'service') draft = startDraft(s)
      const mine = s?.patched ?? []
      const yours = s?.source === 'user'
      // ⚠️ THE ID IS SHOWN, NOT ASKED (2026-09-06). It is the `<engine>` segment of every run folder
      // and the `provider` in a provenance record, so it is set once and never renamed — but none
      // of that makes it a QUESTION. It is worked out from the name, on the way in, by the one
      // function allowed to (`idFromName`, src/inference/services.ts): a form computing its own
      // would be a second rule for the same string and the two would part company the first time
      // either moved. So a new row shows the sentence and an existing one shows the answer.
      const folderRow = isNew
        ? null
        : row('folder', el('span', { class: 'ed-fixed mono' }, draft.id),
          'the name in every run it made — set when you added it, never renamed')

      const save = el('button', { class: 'btn primary mini', type: 'button' },
        isNew ? 'add it' : 'save')
      save.disabled = busy
      save.addEventListener('click', () => { void saveDraft(isNew) })

      // ⚠️ DISCONNECT, NOT REMOVE (2026-08-21). A workflow or a character is a thing you OWN and
      // removing it deletes it; a service is a thing you POINT AT, and dropping the row uninstalls
      // nothing and logs nobody out — it forgets that you pointed here. "Remove" made people
      // wonder what else went, and the pair it belongs to is ＋ connect.
      //
      // ⚠️ AND IT IS ITS OWN BUTTON, not a label on a shared one. Leaving a connection and undoing
      // your edits to one are two different acts with two different homes, and one node that read
      // `⏻ disconnect` or `↺ revert 3` depending on the row could only ever sit in one of them.
      const disconnect = !yours ? null : (() => {
        const b = el('button', { class: 'btn danger', type: 'button' }, '⏻ disconnect')
        b.disabled = busy
        b.title = 'forget this connection — nothing is uninstalled and nobody is logged out'
        b.addEventListener('click', () => { if (s) void dropService(s) })
        return b
      })()

      const revert = yours ? null : (() => {
        const b = el('button', { class: 'btn mini', type: 'button' }, `↺ revert ${mine.length}`)
        b.disabled = busy || !mine.length
        b.title = 'drop your changes; the row this app ships comes back'
        b.addEventListener('click', () => { if (s) void dropService(s) })
        return b
      })()

      const st = isNew ? null : (SERVICE[s.state] ?? SERVICE.unknown)
      return el('div', { class: 'detail' },
        el('div', { class: `ed-head ${st?.cls ?? ''}` },
          el('b', {}, isNew ? 'a new service' : (s.label ?? s.id)),
          st ? el('span', { class: 'svc-state' }, el('span', { class: 'svc-dot' }), st.say) : null),
        // ⚠️ THE STATUS BELONGS TO THE IDENTITY BAND — the name, the dot, and the three lines that
        // say whether this connection works. What it is, before how it is configured.
        //
        // ⚠️ THE EXIT DOES NOT (2026-08-21, second try). It was here for a few hours and it was
        // wrong twice over: an exit between the status and the form interrupts the read — you are
        // told what this is, handed a way out, and only then shown the settings — and it made
        // "hard to find" into "hard to miss", which for a leave action is not an improvement. It
        // is in the sticky foot now, at the opposite end from the button you actually press.
        !isNew && s.detail ? el('p', { class: 'muted' }, s.detail) : null,

        // ⚠️ WHAT IT IS, FIRST — and then the only question left is where. Answering it fills the
        // transport, the port and the call shape, so nobody has to know that Draw Things wants the
        // word `grpc`.
        ...(isNew ? [row('what is it', presetRow(), 'the shapes this build can speak')] : []),
        // ⚠️ A PLACEHOLDER THAT IS NOT A PRODUCT. It said `ComfyUI`, and a real name greyed into an
        // empty box reads as a value somebody already chose — on the one row that has no name to
        // pre-fill, which is exactly where the box is empty.
        row('name', textIn(() => draft.label, (x) => { draft.label = x }, { placeholder: 'service 1' }),
          isNew ? 'what you call it — the folder it writes into is named from this' : undefined),
        folderRow,
        // ⚠️ `makes` AND `role` BOTH LEFT THIS FORM ON 2026-09-06, and they left for the same
        // reason the id did: neither is a question the person who just installed a box can answer.
        //
        // `makes` was one word for a whole service, so a ComfyUI — pictures, songs, voices, meshes,
        // shots — had to pick `— nothing of its own —`, and blank was then read as "answers for
        // anything". What a service makes is what its WORKFLOWS make, so the card says it and this
        // form does not ask it (`mediaOf`, src/inference/kinds.ts).
        //
        // `role` offered generator and operator, and nothing has ever been an operator — rembg,
        // the textbook case, ships as a generator, because taking a background out is a thing
        // people sit down to do. The word is retired. What is left of `role` is the one split
        // already on the screen: ✨ xoko is the brain, 🔌 inference is everything that makes
        // something you keep — and neither side is typed, it is which page you are on.
        // ⚠️ A COMMAND HAS NO ENDPOINT, so it has no endpoint fields — and `cli` is not offered in
        // the `speaks` list either: a brain is chosen BY NAME, from the shapes above, because that
        // list is the whitelist. There is nothing here to type, which is the point.
        ...(draft.transport.kind === 'cli' ? [
          row('runs', el('span', { class: 'ed-fixed' },
            (v.presets ?? []).find((p) => p.transport?.brain === draft.transport.brain)?.label
            ?? draft.transport.brain),
          'a client on this machine, answering on the account you logged it into'),
        ] : [
          row('speaks', pick([...(v.transports ?? [])].filter((k) => k !== 'cli'),
            () => draft.transport.kind,
            (x) => { draft.transport.kind = x; paintEditor(true) }),
          'the app CONNECTS to this — it never starts it'),
          row('host', textIn(() => draft.transport.host, (x) => { draft.transport.host = x },
            { placeholder: '127.0.0.1' })),
          row('port', textIn(() => draft.transport.port, (x) => { draft.transport.port = x },
            { type: 'number' })),
          row('path', textIn(() => draft.transport.basePath, (x) => { draft.transport.basePath = x },
            { placeholder: '/v1 — http only' })),
          // ⚠️ DECLARED, NOT GUESSED FROM :443. A cloud reached over plain http is a key on the
          // wire, and the parser refuses that pair for any host but this machine's own.
          draft.transport.kind === 'grpc' ? null : row('secure',
            tickIn(() => !!draft.transport.tls, (x) => { draft.transport.tls = x }),
            'https rather than http. Anything off this machine that takes a key needs it.'),
          ...(draft.transport.kind === 'grpc' ? [] : keyRows(s)),
        ]),
        // ⚠️ THE SENTENCE AFTER "not running". This shelf's whole job is to say a service is not
        // answering, and until now that is where it stopped — the next thing anyone wants is a
        // page, because the answer is two routes and a handful of flags. A row you added can name
        // its own; the ones this app ships point at web/guides/.
        row('guide', textIn(() => draft.help, (x) => { draft.help = x },
          { placeholder: '/guides/… or https://…' }),
        'how to get this one running — shown on its card, loudest when it is not'),
        // The four questions that describe one call. Only `http` has them: gRPC has a protocol,
        // and a protocol is a thing you speak rather than a thing you describe.
        ...(draft.transport.kind === 'http' ? callRows() : []),

        // ⚠️ FOLDED, AND THE SUMMARY SAYS WHOSE FACTS THESE ARE. A service is a pipe: this is
        // what a checkpoint here inherits when it declares nothing, never a claim about the
        // service. The per-checkpoint editor is where an exception is stated.
        //
        fold('what its checkpoints inherit',
          ...capsForm(v),
          (() => {
            const t = el('textarea', { class: 'f-notes', rows: '2', placeholder: 'what this is, and what someone might have to fix' })
            t.value = draft.notes ?? ''
            t.disabled = busy
            t.addEventListener('input', () => { draft.notes = t.value })
            return t
          })()),

        // ⚠️ LEAVING IS ON THE LEFT AND COMMITTING IS ON THE RIGHT, with the whole width between
        // them (the app's own rule, asset-detail.js: a real delete is "marked, and not next to
        // anything you press often"). ⏻ sat immediately beside `save` before, which is the one
        // place a leave action must never be. The foot is sticky, so neither ever scrolls away —
        // being found was a question of COLOUR and DISTANCE, not of size.
        el('p', { class: 'rw-foot form-foot' },
          !isNew ? disconnect : null,
          el('span', { class: 'muted' },
            isNew ? 'nothing is written until you press it'
              : yours ? 'this service is yours'
                : mine.length ? `yours: ${mine.join(', ')}`
                  : 'exactly as this app ships it'),
          el('span', { class: 'spacer' }),
          !isNew ? revert : null,
          save))
    }

    // ── which editor, and when it is allowed to be rebuilt ─────────────────────
    function paintEditor(force = false) {
      const key = picked ?? ''
      // ⚠️ NOT ON A POLL. The shelf refreshes every 15s and a form rebuilt under your hands is a
      // form that eats what you were typing. Selection changes it; this page changes it; the
      // clock does not.
      if (!force && drawn === key) return
      drawn = key
      if (picked === 'new') {
        options.replaceChildren(serviceEditor(null))
        return
      }
      if (picked?.startsWith('new-eng:')) {
        const s = serviceAt(picked.slice(8))
        options.replaceChildren(s
          ? engineEditor({ service: s, engine: null })
          : el('p', { class: 'empty' }, 'that service is gone'))
        return
      }
      if (picked?.startsWith('new-workflow:')) {
        const s = serviceAt(picked.slice('new-workflow:'.length))
        options.replaceChildren(s
          ? workflowEditor({ service: s, workflow: null })
          : el('p', { class: 'empty' }, 'that service is gone'))
        return
      }
      if (picked?.startsWith('workflow:')) {
        const sel = workflowAt(picked.slice('workflow:'.length))
        options.replaceChildren(sel
          ? workflowEditor(sel)
          : el('p', { class: 'empty' }, 'that workflow is gone'))
        return
      }
      if (picked?.startsWith('svc:')) {
        const s = serviceAt(picked.slice(4))
        options.replaceChildren(s
          ? serviceEditor(s)
          : el('p', { class: 'empty' }, 'that service is gone'))
        return
      }
      const sel = picked?.startsWith('eng:') ? engineAt(picked.slice(4)) : null
      options.replaceChildren(sel
        ? engineEditor(sel)
        : el('p', { class: 'empty' },
          'pick a service to see where it is, a checkpoint to see what it runs at, '
          + 'or a workflow to change what can be asked for'))
    }

    /** ⚠️ A DEEP LINK LANDS ON THE ENGINE (images.js → renders with). You read a checkpoint's
     *  numbers where you render with it, and one click brings you to the one place they are
     *  editable — already unfolded, already selected. The marker is consumed on arrival:
     *  `replaceState` rather than assigning the hash, so this does not re-route. */
    function takeDeepLink() {
      const want = /[?&]engine=([^&]+)/.exec(location.hash)
      if (!want) return
      picked = `eng:${decodeURIComponent(want[1])}`
      shut.delete(picked.slice(4).split('/')[0] ?? '')
      history.replaceState(null, '', '#/inference')
      // ⚠️ AND THE BAND OPENS. This link's whole purpose is "take me to where this checkpoint's
      // numbers are editable" — and they are editable in the ⚙ band only, so arriving with the
      // pane shut lands you NEXT TO the answer rather than at it. The press was made on the other
      // page; this is still that press.
      ctx.openOptions?.()
    }

    return {
      feed,
      options,
      refresh: () => { takeDeepLink(); paint(); paintEditor() },
      engineChanged: () => { paint(); paintEditor() },
    }
  },
}
