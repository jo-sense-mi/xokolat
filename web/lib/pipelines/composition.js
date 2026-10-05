// 🧩 ONE COMPOSITION, AS A SECTION — a chain you own, the runs it has made, and what would run it.
//
// ⚠️ THIS FILE IS A FACTORY, LIKE made.js, AND IT HAS TO BE. Every other section in the nav is a
// module somebody wrote; a composition's row is a thing you TOOK, and there are as many of them as
// you have taken. So the descriptor is built from the record — the same shape `SECTIONS` holds,
// produced from data instead of from a file.
//
// ⚠️ AND THE ROW EXISTS BECAUSE THE COMPOSITION DOES, which is the whole rule this app runs on: the
// app owns the format, the library owns the content. Take a mascot chain and a 🧸 row appears; 🗑
// it and the row goes. Nobody edits a menu — and nobody compiles a glyph, a family or a default
// into this app either: the face is the composition's own (`icon`), and what each step runs at came
// down with it (`params`).
//
// ⚠️ THE MIDDLE IS WHAT YOU MADE, AND NOTHING ELSE (2026-08-24). This section used to paint its
// step list down the centre — a live readout of where the chain had got to, in the one column this
// app reserves for content. Where a run has got to is a QUEUE question and there is already a
// queue; what the chain WOULD run at is a ⚙ question and there is already a dock. So the middle is
// this composition's runs, exactly as 🖼's middle is its pictures, and a run of a chain is one card
// holding everything that press made.
//
// ⚠️ ▶ IS THE BAR'S, AS IT IS EVERYWHERE. A composition takes one sentence — the thing every `ask`
// input reads — and the app has exactly one place you type a sentence. A ▶ button of its own inside
// the feed would be a second composer, which is the thing the shell exists to prevent.
//
// ⚠️ AND THE CHOOSING HAPPENS IN THE FEED, because a `pick` is the one moment a chain shows you
// what it made and asks about it — which is content, and belongs in the middle. A dialog over the
// top would cover the twelve pictures it is asking you about, and a browser modal blocks every
// event this app needs (see the alerts note in CLAUDE.md).

import { api, chip, el, fieldRow, href, select, store, styleChip, took } from '../launch-kit.js?v=129'
import { stylePicker } from '../styles.js?v=129'
import { browser, detailArt, detailHead, thumb, tile } from '../browse.js?v=129'
import { starWidget } from '../shared.js?v=129'
import { when } from '../gallery.js?v=129'
import { startChain } from '../chain.js?v=129'
import { COMPOSITION_ICON } from './library.js?v=129'

/** ⚠️ PREFIXED, so a composition can be called anything. A chain whose slug is `library` would
 *  otherwise be a row that shadows 📚 — and refusing the take for it would mean this app having an
 *  opinion about a name the library chose. */
export const compositionId = (slug) => `comp-${slug}`

/**
 * ⚙ WHAT YOU PLUGGED INTO A STEP, and what you set it to — remembered per composition, per step.
 *
 * ⚠️ THE CHAIN IS A SHAPE AND THE ENGINE IS YOURS (2026-08-24). A composition says a step makes an
 * image from a picture; WHICH of your image workflows does it was decided by a resolver and could not
 * be argued with, which made "a composition plugs different engines" a sentence in a doc rather
 * than something anybody could do. Browser memory, never a rewrite of the file: the chain you took
 * stays the chain that was published, and forgetting it forgets your plugs with it.
 */
const plugKey = (slug, step) => `xokolat:plug:${slug}:${step}`
const knobKey = (slug, step, key) => `xokolat:knob:${slug}:${step}:${key}`

/** What YOU plugged into this step, if it is still something this machine has. */
const plugged = (comp, b) => {
  const want = store.get(plugKey(comp.slug, b.step.id), '')
  return want && (b.options ?? []).some((o) => o.workflow === want) ? want : null
}
/** What would actually run: yours, or what the resolver worked out. */
const engineOf = (comp, b) => plugged(comp, b) ?? b.workflow

/** Whose family a workflow is from, looked up across every step's option list — the same workflow may
 *  be offered to several steps, and they all carry the library's declaration of it. */
const lineageOf = (comp, workflow) => {
  for (const b of comp.bindings ?? []) {
    const hit = (b.options ?? []).find((o) => o.workflow === workflow)
    if (hit) return hit.lineage ?? null
  }
  return null
}

/**
 * WHOSE FAMILY THE PICTURE THIS STEP IS HANDED CAME FROM — null when it is handed none.
 *
 * ⚠️ ONLY A PICTURE SLOT COUNTS, NEVER `prompt` (2026-08-29). `founder` takes its prompt from
 * `brief`, which is xoko writing a sentence; words cross every family there is, and treating that
 * as a constraint would mark the first drawing step of every chain as a stranger to itself. What
 * carries the constraint is pixels: `mascot` takes `ref: founder`, and an SDXL cutout reading a
 * FLUX founder is the case this whole field exists for.
 *
 * ⚠️ AND IT WALKS THROUGH THE STEPS THAT MAKE NOTHING. A `pick` hands on whatever it was choosing
 * from; asking it what family it is would end the search one step short of the answer.
 */
function upstreamLineage(comp, b, seen = new Set()) {
  const by = new Map((comp.bindings ?? []).map((x) => [x.step.id, x]))
  const sources = [
    ...Object.entries(b.step.inputs ?? {}).filter(([slot]) => slot !== 'prompt').map(([, src]) => src),
    ...(b.step.pick ? [b.step.pick] : []),
  ]
  for (const src of sources) {
    if (src === 'ask' || seen.has(src)) continue
    seen.add(src)
    const up = by.get(src)
    if (!up) continue
    const rec = engineOf(comp, up)
    const lin = rec ? lineageOf(comp, rec) : null
    if (lin) return lin
    const deeper = upstreamLineage(comp, up, seen)
    if (deeper) return deeper
  }
  return null
}

/**
 * TRUE WHEN WHAT IS PLUGGED IN IS FROM ANOTHER FAMILY THAN THE PICTURE IT IS HANDED.
 *
 * ⚠️ UNKNOWN IS NOT A MISMATCH. A workflow the library published no lineage for says nothing about
 * whether it fits, and marking it would put a warning on every workflow nobody has got round to
 * describing — which teaches people to ignore the mark.
 */
const crossing = (comp, b) => {
  const wants = upstreamLineage(comp, b)
  const mine = lineageOf(comp, engineOf(comp, b) ?? '')
  return !!(wants && mine && wants !== mine)
}

/**
 * 🗺 WHAT EACH STEP IS PLUGGED WITH, for xoko's map (web/lib/xoko-map.js).
 *
 * ⚠️ THE MAP KNEW WHAT EVERY MEDIUM WOULD RUN AND NOTHING ABOUT A CHAIN (2026-08-29). It printed
 * `image — dev-fast (t2i) on draw-things-grpc` and, for a composition, only whether it was ready —
 * so asked "make me a mascot", xoko could offer the chain but could say nothing about what would
 * answer it, and could not tell that the chain runs on something other than the shelf's pick. That
 * gap is exactly what per-step plugs created, so it is closed in the same change.
 *
 * ⚠️ MAKING STEPS ONLY. A text step is xoko, a pick is the person and a bind is this app writing a
 * file — none of them reaches an engine, and listing them would be three lines saying "no engine"
 * in a block that rides on every question.
 */
export const chainPlugs = (comp) => (comp.bindings ?? [])
  .filter((b) => b.step.makes && b.step.makes !== 'text')
  .map((b) => ({ step: b.step.id, workflow: engineOf(comp, b), yours: !!plugged(comp, b) }))

const plugsFor = (comp) => Object.fromEntries(comp.bindings
  .map((b) => [b.step.id, store.get(plugKey(comp.slug, b.step.id), '')])
  .filter(([, v]) => v))

/** What you changed a published default to. Empty means "as published", which is the normal state
 *  and sends the composition's own value. */
function knobsFor(comp) {
  const out = {}
  for (const b of comp.bindings) {
    const set = {}
    for (const [key, value] of Object.entries(b.step.params ?? {})) {
      const mine = store.get(knobKey(comp.slug, b.step.id, key), '')
      if (mine === '' || mine === String(value)) continue
      set[key] = typeof value === 'number' ? Number(mine) : mine
    }
    if (Object.keys(set).length) out[b.step.id] = set
  }
  return out
}

/** kB / MB, for a file the browser will not draw. */
const size = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} kB`)

/** What a step DOES, in the fewest words that are still true. */
function stepFace(step) {
  if (step.pick) return `you choose one of the ${step.pick}`
  // ⚠️ THE LAST LINE IS WHAT THE CHAIN IS FOR, and it reads unlike every other because it is unlike
  // every other: no workflow, no engine, no medium. This app writes the file.
  if (step.binds) {
    return `one ${step.binds} — ${[step.parts, step.captions].filter(Boolean).join(' + ')}`
      + (step.page ? `, on ${step.page}` : '')
  }
  const n = step.repeat && step.repeat > 1 ? `${step.repeat} × ` : ''
  // ⚠️ `each` AND `repeat` READ DIFFERENTLY BECAUSE THEY ARE DIFFERENT, and this line is where a
  // person finds that out: "12 × image" is twelve takes of one thing, "one image per brief" is
  // twelve different things. Same row, opposite meaning.
  const per = step.each ? `one ${step.makes} per ${step.each === 'ask' ? 'line you type' : step.each}` : null
  const from = Object.entries(step.inputs ?? {})
    .map(([slot, src]) => (src === 'ask' ? `${slot}: your words` : `${slot}: ${src}`))
  const head = per ?? `${n}${step.makes}${step.list ? ' — a list, one per line' : ''}`
  return `${head}${from.length ? ` — ${from.join(', ')}` : ''}`
}

/** The binding, as a chip you can read at a glance. */
function bindingChip(b, yours) {
  if (b.binding === 'none') return chip('unbound', 'bad')
  // ⚠️ `yours` OUTRANKS BOTH OF THE OTHERS. A step you plugged yourself is neither "as published"
  // nor "substituted" — nothing resolved it, you did, and that is the one of the three states you
  // can act on.
  if (yours) return chip('yours', 'ok')
  if (b.missing?.length) return chip(`missing ${b.missing.join(', ')}`, 'bad')
  // ⚠️ `substitute` IS NOT A WARNING. A composition names the workflow it was BUILT with; running it
  // on something else of the same kind is the designed behaviour, not a degradation — it is what
  // lets a downloaded chain work on a machine with other checkpoints. It is marked because you
  // should be able to see that it happened, not because it is wrong.
  return chip(b.binding === 'exact' ? 'as published' : 'substituted', b.binding === 'exact' ? 'ok' : '')
}

/** The picture that stands for a whole run: the last thing it drew. A run that drew nothing —
 *  words and a bound PDF — has none, and says so rather than showing an empty frame. */
/**
 * THE PICTURE ON A RUN'S CARD — the last thing in it a browser can draw.
 *
 * ⚠️ AND THE BOUND FILE COUNTS WHEN IT IS ONE (2026-08-29). A chain can now end in an `svg`, which
 * is MARKUP — so its run has no presses at all, no cells, and the card would have been a blank
 * tile for a drawing sitting right there. An `<img>` draws an SVG exactly as it draws a WebP; a
 * `.pdf` it does not, which is why this reads the extension rather than assuming either way.
 */
const coverOf = (g) => [...g.cells].reverse().find((c) => c.player === 'img')?.preview
  ?? (g.bound?.master?.endsWith('.svg') ? g.bound.master : null)

/** The container a run ended in, or null — read off the file, which is the only thing that knows. */
const containerOf = (bound) => bound?.master.split('.').pop() ?? null

/**
 * WHAT A BOUND RESULT IS, IN THE FEED'S WORDS — and `pages` is the PDF's word, not every
 * container's. An `svg` is ONE document written from what a `text` step wrote; counting its pages
 * would be counting something it does not have.
 */
const boundLine = (bound) => {
  if (!bound) return ''
  return containerOf(bound) === 'svg' ? 'one svg written' : `${bound.parts} pages bound`
}

/**
 * IS WHAT THIS STEP WROTE A THING THE APP CAN INSTALL?
 *
 * ⚠️ IT ASKS THE CHEAPEST QUESTION THAT IS STILL TRUE — does it contain a JSON object with a
 * `composition` in it — and nothing more. Every real rule about what a composition may say lives in
 * one place, on the server, where a downloaded file meets it too (src/library/payload.ts). A second
 * opinion here would be a second parser, and the day they disagree is the day a button appears for
 * a document that cannot land, or fails to appear for one that can.
 */
function document_(words) {
  if (!words) return null
  const from = words.indexOf('{')
  const to = words.lastIndexOf('}')
  if (from < 0 || to < from) return null
  try {
    const doc = JSON.parse(words.slice(from, to + 1))
    return doc && typeof doc === 'object' && doc.composition ? words : null
  } catch {
    return null
  }
}

/**
 * ＋ INSTALL, AND ⇢ PUBLISH SHAPE — the two things you do with a written composition.
 *
 * ⚠️ INSTALLING IS A PRESS AND NOT A STEP (2026-09-04). It was the last step of the chain for four
 * days, which meant it happened once, while the run was going, and a document the parsers refused
 * was a dead run — the survey, the node reads and the whole composition sitting there with nothing
 * to press. A button can be pressed again after a fix, and it can be pressed on a run from
 * yesterday.
 *
 * ⚠️ AND THE ANSWER IS ADOPTED LIKE A ⤓ TAKE, because that is what happened: `/api/install` sends
 * the whole shelf and the whole chain list back, so the new row is in the nav and the workflows it
 * brought are in 🔌 without a reload.
 */
function installRow(ctx, g, words) {
  const put = el('button', {
    class: 'btn mini primary', type: 'button',
    title: 'put this in the app — the chain, and any workflows it brings with it',
  }, g.installed ? '＋ install again' : '＋ install')
  put.addEventListener('click', async () => {
    put.disabled = true
    try {
      const r = await api('/api/install', { composition: g.composition, run: g.run, document: words })
      ctx.flash(`installed — ${r.took?.slug ?? 'it'}`)
      // ⚠️ EVERY ONE THAT DID NOT LAND, SAID OUT LOUD. A chain that arrived without one of its
      // workflows still runs — its step just has nothing to press — and a take that was quietly
      // smaller than it looked is the one thing this must never be.
      for (const b of r.took?.blocked ?? []) ctx.flash(`${b.id}: ${b.why}`, true)
      ctx.adoptShelf?.(r)
      await ctx.reloadManifest()
    } catch (err) {
      ctx.flash(String(err.message || err), true)
    } finally {
      put.disabled = false
    }
  })

  // ⚠️ THE SECOND ACT, AND THE WHOLE OF IT. What the step wrote is already exactly what the library
  // repo takes, so publishing is a paste and not a reshape. The destination is in the tooltip
  // because a pane shows controls, not paragraphs.
  const copy = el('button', {
    class: 'btn mini', type: 'button',
    title: 'copy the document — its `composition` goes in src/compositions.json, each workflow it'
      + ' bundles in src/workflows/<service>.json',
  }, '⇢ publish shape')
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(words)
      ctx.flash('copied')
    } catch (err) {
      ctx.flash(String(err.message || err), true)
    }
  })

  return el('p', { class: 'row-actions' },
    put, copy,
    g.installed ? el('span', { class: 'muted' }, g.installed) : null)
}

/**
 * WHAT A RUN ALREADY PRODUCED, in the shape the chain loop reads — `{ [stepId]: {kind, items} }`.
 *
 * ⚠️ IT IS READ OFF THE RUN, NOT REMEMBERED (2026-09-04). The loop that made these lived on a page
 * that is gone; everything it produced is on disk, which is why resuming is possible at all. Three
 * kinds of output, three places they were kept: words on `wrote`, pictures as cells, a choice on
 * `picked`. A step missing from all three is a step that never ran.
 *
 * ⚠️ AND ORDER IS THE WHOLE PROMISE. Page three is the third concept, so a `list` step's answers
 * come back as `items` — the list it really produced — and never by splitting `text` on newlines,
 * which gives thirteen concepts the moment one of them wrapped.
 */
function alreadyDone(comp, g) {
  const out = {}
  for (const w of g.wrote ?? []) {
    const step = comp.bindings.find((b) => b.step.id === w.step)?.step
    const items = w.items?.length ? w.items : (step?.list ? String(w.text).split('\n') : [w.text])
    out[w.step] = { kind: 'words', items: items.filter((x) => String(x).trim()) }
  }
  const byStep = new Map()
  for (const cell of g.cells ?? []) {
    if (!byStep.has(cell.step)) byStep.set(cell.step, [])
    byStep.get(cell.step).push(cell.master)
  }
  for (const [step, masters] of byStep) out[step] = { kind: 'assets', items: masters }
  // ⚠️ AFTER the cells, deliberately: a `pick` step's id is its own, but a run whose pick was
  // answered has ONE master for that step and the feed may hold more.
  for (const pick of g.picked ?? []) out[pick.step] = { kind: 'assets', items: [pick.master] }
  if (g.bound?.step) out[g.bound.step] = { kind: 'assets', items: [g.bound.master] }
  return out
}

/** The steps of this chain that this run never got to. Empty means it finished. */
const stepsLeft = (comp, g) => {
  const done = alreadyDone(comp, g)
  return comp.bindings.map((b) => b.step.id).filter((id) => !done[id])
}

/** ⚠️ WHAT THE RUN IS, IN THE CORNER: how many things it made, and whether it bound one. A run of a
 *  chain is not one asset, and a card that looked like one would be lying about the eleven other
 *  pictures inside it. */
const boundBadge = (g) => {
  const container = containerOf(g.bound)
  // ⚠️ WHAT IT INSTALLED, IN THE CORNER. 🔩 is the one badge here that stands for something that is
  // not in this folder at all: the words beside it are the document, and the thing itself is a row
  // in the nav and workflows in 🔌.
  if (g.installed) return { text: '🔩', title: g.installed }
  if (container === 'svg') return { text: '✒', title: 'one svg, written rather than rendered' }
  if (container) {
    return {
      text: `📖 ${g.bound.parts}`,
      title: `a ${g.bound.parts}-page ${container} out of ${g.cells.length}`,
    }
  }
  return { text: `${g.cells.length}`, title: `${g.cells.length} made in this run` }
}

export function compositionSection(comp) {
  // ⚠️ THE FACE COMES WITH THE CHAIN. There was a family → glyph table in this file — mascots 🧸,
  // coloring 🖍, books 📖 — which is the library's vocabulary compiled into the app, in the one
  // place that still had one. 🧩 is the fallback and the only glyph this app has an opinion about.
  const face = comp.icon ?? '🧩'
  return {
    id: compositionId(comp.slug),
    icon: face,
    label: comp.label ?? comp.slug,
    group: 'compositions',
    /**
     * WHICH STYLE LISTS THIS CHAIN CAN REACH — one per medium its steps make (web/lib/shell.js →
     * `styleScopes`, and the 🎨 band's scope strip).
     *
     * ⚠️ DERIVED, NEVER DECLARED. Add a music step to a published chain and the strip grows a
     * chip; nothing in the library says what the list should be, so nothing in the library can say
     * it wrong. `text` is not here — words are xoko, and xoko is not shaped by a technique list.
     */
    styleMedia: comp.styles === false ? [] : [...new Set((comp.bindings ?? [])
      .map((b) => b.step.makes)
      .filter((m) => m && m !== 'text'))],
    /** ITS OWN LIST — the 🎨 band's first scope here, and the one that sets the others.
     *  ⚠️ NOT FOR A CHAIN THAT DECLARED IT TAKES NONE (`Composition.styles === false`). A scope is
     *  a place you write one, and offering ＋ new for a chain whose whole output is a document is
     *  offering to write something nothing will ever read. */
    ...(comp.styles === false ? {} : { styleScope: `comp:${comp.slug}` }),
    /** ⚠️ AND THE 🎨 BAND STAYS, SAYING SO. A band that disappears makes the pane a different
     *  shape depending on which chain you are standing in, and leaves the question unanswered. */
    styleless: comp.styles === false,
    /** ⚠️ ON THE DESCRIPTOR, so the MAP can say it. "You own four chains" is a list; "three are
     *  ready and one needs a workflow" is the thing xoko should say instead of offering to run
     *  something that would stop on step two. */
    ready: comp.ready,
    /** ⚠️ ALSO ON THE DESCRIPTOR, AND FOR THE SAME REASON AS `ready`: the map is built from the
     *  nav's two lists and nothing else, so anything xoko should know about a chain has to ride
     *  on the row. What each making step would actually run — yours where you plugged one. */
    plugs: chainPlugs(comp),
    /**
     * ITS FAMILY, CARRIED ONTO THE NAV ROW — and it exists for exactly one value.
     *
     * ⚠️ NOT A GLYPH TABLE COMING BACK. What the app does with this is one attribute
     * (`data-family` on the row) and one CSS rule for `capabilities`, the family of the chain that
     * makes new chains. That one is not a thing you make something WITH — what it produces is
     * another row in this list — and in a nav of otherwise-identical rows there was nothing saying
     * so. The library owns the vocabulary; the app styles one value of it and knows nothing about
     * the rest, which is why this is the family verbatim rather than a `special: true` the library
     * would have to remember to set.
     */
    ...(comp.family ? { family: comp.family } : {}),
    // The one line xoko is told this place is for. The composition's own words, trimmed — it is
    // the only section whose purpose was written by somebody else.
    what: (comp.notes ?? `a ${comp.family ?? 'composition'} in ${comp.steps.length} steps`)
      .replace(/\*\*/g, '').replace(/\s+/g, ' ').slice(0, 160),

    create(ctx) {
      /** The chain being run right now, or null. One at a time per composition — a second ▶ while
       *  one is going is a mistake, and the button says so. */
      let run = null

      /** This composition's runs, newest first — the index is already in that order. */
      const runs = () => (ctx.manifest().chains ?? []).filter((g) => g.composition === comp.slug)

      // ── the feed: what this composition has made ──────────────────────────────
      const shelf = browser({
        id: `chain:${comp.slug}`,
        noun: 'runs',
        empty: `nothing made here yet — say what this ${comp.family ?? 'chain'} is about, below`,
        search: (g) => [g.title, g.ask, ...(g.wrote ?? []).map((w) => w.text)].join(' '),
        key: (g) => g.path,
        onOpen: (g) => ctx.select(g ? { chain: g } : null),
        onShow: () => ctx.openDetail?.(),
        card: (g) => {
          const cover = coverOf(g)
          return tile({
            art: cover
              ? el('img', {
                src: href(cover), alt: '', loading: 'lazy',
                ondblclick: () => window.open(href(g.bound?.master ?? cover), '_blank'),
              })
              // ⚠️ ONE GLYPH, AND IT IS 📚'S (2026-09-04). This was a little vocabulary of its own
              // — ✍ for words, 📖 for a bound book, 🔩 for something installed — three answers to
              // "what am I looking at" on a shelf where the answer is always the same: a run of a
              // chain. 🧩 is what a composition is called in 📚, so it is what one looks like here.
              : el('div', { class: 'browse-blank' },
                el('span', { class: 'blank-glyph' }, COMPOSITION_ICON)),
            label: g.title,
            star: starWidget(g.ratingKey),
            // ⚠️ WHAT THE RUN IS, IN THE CORNER: how many things it made, and whether it bound one.
            // A run of a chain is not one asset, and a card that looked like one would be lying
            // about the eleven other pictures inside it.
            badge: boundBadge(g),
          })
        },
        /**
         * The ☰ table. ⚠️ THE SAME ORDER AS A MEDIUM'S (web/lib/gallery.js → `mediaColumns`):
         * ⓘ · face · name · ★ · … · made. It does NOT share that builder, and should not — a run
         * of a chain has no single engine and no single duration, so `engine` and `took` would be
         * two empty columns claiming a fact that does not exist. What it shares is the shape.
         *
         * ⚠️ AND `made` IS A DATE HERE NOW. This shelf used `made` for the COUNT of things a run
         * produced and `when` for the date, while 🖼 used `made` for the date — the same header
         * meaning two different facts on two shelves, with nothing on screen to say which. The
         * count is `output`, which is what it always was.
         */
        columns: [
          // ⚠️ THE RUN'S COVER, AND 🧩 WHEN IT HAS NONE (2026-09-04). A chain that renders has a
          // picture to show and should show it; a chain that WRITES has none, and drew an empty box
          // — `href(undefined)` is `/content/undefined`, a broken image once per row, on the one
          // shelf where writing is the normal case. The fallback is 📚's word for what this is
          // rather than ◻, which means "a file no browser draws" and is a different fact.
          {
            key: 'face',
            label: 'asset',
            width: 'var(--thumb)',
            cell: (g) => thumb(coverOf(g) ? href(coverOf(g)) : null, { blank: COMPOSITION_ICON }),
          },
          {
            key: 'title',
            label: 'run',
            // The same proportion a medium's name column takes (web/lib/gallery.js).
            width: 'minmax(0, 1.6fr)',
            of: (g) => g.title,
            sort: true,
            cell: (g) => el('span', { title: g.ask ?? '' }, g.title),
          },
          // 18px, never `auto` — see the width rule in browse.js.
          { key: 'star', label: '', width: '18px', cell: (g) => starWidget(g.ratingKey) },
          {
            key: 'output',
            label: 'output',
            width: 'minmax(6em, 1fr)',
            of: (g) => g.cells.length,
            sort: true,
            cell: (g) => el('span', { class: 'muted' },
              g.installed
                ? g.installed
                : [`${g.cells.length} asset${g.cells.length === 1 ? '' : 's'}`,
                  g.bound ? `${g.bound.parts} pages` : ''].filter(Boolean).join(' · ')),
          },
          {
            key: 'when',
            label: 'made',
            width: '10em',
            of: (g) => g.createdAt ?? null,
            sort: true,
            cell: (g) => el('span', { class: 'muted' }, when(g.createdAt)),
          },
        ],
      })

      /** The pictures a `pick` is asking about — the whole point of stopping, and the one live
       *  thing that belongs in the middle: it IS what the chain just made. */
      const choosing = el('div', {})
      function paintChoosing() {
        if (!run?.choosing) return choosing.replaceChildren()
        const { asks, from, step } = run.choosing
        choosing.replaceChildren(el('div', { class: 'block choose' },
          el('h3', {}, `✋ ${asks}`),
          el('div', { class: 'choose-grid' }, ...from.map((asset) => {
            const cell = el('button', { class: 'choose-cell', type: 'button', title: asset },
              el('img', { src: href(asset), alt: '' }))
            cell.addEventListener('click', () => {
              ctx.flash(`${step}: chosen`)
              run.choose(asset)
            })
            return cell
          }))))
      }

      const feed = el('div', { class: 'chain-feed' }, choosing, shelf.node)

      const refresh = () => {
        shelf.set(runs())
        paintChoosing()
        paintOptions()
      }

      // ── 🎨 THE STYLE, IN TWO LAYERS ───────────────────────────────────────────
      //
      // ⚠️ A COMPOSITION HAS ITS OWN, AND IT SETS THE OTHERS (2026-08-29). A chain rendered
      // styleless — `style: null` on every press — while the medium sections two rows up each had
      // a picker, so a book came out in whatever the checkpoint does by default and there was
      // nowhere to say otherwise. Two rows deep, because the two questions are different:
      //
      //   the chain style   ONE pick that shapes the WORDS (its `says` reaches xoko, which is the
      //                     part no media style can express) and NAMES a media style per medium
      //   the medium rows   pre-filled by it, and still yours to change for this chain only
      //
      // ⚠️ AND THE OVERRIDE IS THE CHAIN'S, NOT THE SHELF'S (`xokolat:style:<comp>:<medium>`).
      // What you picked in 🖼 is for pressing ▶ in 🖼; a book's picture style is the book's.
      const styleMedia = [...new Set(comp.bindings
        .map((b) => b.step.makes).filter((m) => m && m !== 'text'))]
      /**
       * ⚠️ THE CHAIN SAYS SO ITSELF — `styles: false` (Composition.styles).
       *
       * This was derived at first: no media step, every text step `verbatim`, therefore nothing to
       * shape. It was wrong about the one chain it was written for. The composition builder's
       * `survey` writes PROSE, so the rule said "styles apply here" and the band went on offering a
       * picker for a chain whose only real output is a document. Whether there is anything worth
       * shaping is a fact about what a chain is FOR, and the author is the one who knows it.
       *
       * The band STAYS and says so. A band that disappears makes the pane a different shape
       * depending on which chain you are standing in, and leaves the question unanswered.
       */
      const styleless = comp.styles === false
      const ownKey = `xokolat:style:comp:${comp.slug}`
      const ownSel = select([])
      const ownDoor = el('button', {
        class: 'btn mini', type: 'button', title: 'see and edit this chain\'s styles',
      }, '🎨')
      ownDoor.addEventListener('click', () => ctx.openStyles?.(`comp:${comp.slug}`))
      let ownList = []
      const ownStyle = () => ownList.find((s) => s.slug === ownSel.value) ?? null

      const mediumPicks = styleMedia.map((m) => ({
        medium: m,
        pick: stylePicker(ctx, m, {
          label: m,
          none: 'from the chain style',
          key: `xokolat:style:${comp.slug}:${m}`,
        }),
      }))

      function fillOwn() {
        const chosen = ownSel.value || store.get(ownKey, '')
        ownSel.replaceChildren(
          el('option', { value: '' }, ownList.length ? 'none' : 'none — ＋ writes one'),
          ...[...ownList].sort((a, b) => (a.label ?? a.slug).localeCompare(b.label ?? b.slug))
            .map((x) => el('option', { value: x.slug, title: x.notes ?? x.says ?? '' }, x.label ?? x.slug)))
        ownSel.value = [...ownSel.options].some((o) => o.value === chosen) ? chosen : ''
        // The medium rows read "from the chain style" — say WHICH one it would be, or the row is
        // a blank claiming a default nobody can see.
        for (const { medium, pick } of mediumPicks) {
          const from = ownStyle()?.uses?.[medium]
          pick.setInherited?.(from ?? null)
        }
      }
      ownSel.addEventListener('change', () => { store.set(ownKey, ownSel.value); fillOwn() })

      const loadOwn = async () => {
        try { ownList = (await api(`/api/styles/comp/${comp.slug}`)).styles ?? [] } catch { ownList = [] }
        fillOwn()
      }
      if (!styleless) {
        ctx.onStyles?.((scope) => { if (scope === `comp:${comp.slug}`) void loadOwn() })
        void loadOwn()
        // ⚠️ ONCE, HERE — not in `refresh`, which runs on every tick of a chain that is going. The
        // pickers keep themselves current through `ctx.onStyles` after this.
        for (const { pick } of mediumPicks) void pick.load()
      }

      /**
       * WHAT THE RUNNER IS HANDED — the two layers, already resolved (web/lib/chain.js).
       *
       * ⚠️ OUTSIDE IN, AND A TYPED VALUE ALWAYS WINS. chain style → what it names → your override
       * for this chain. The medium's OWN armed style is deliberately not in the chain: 🖼's picker
       * is for pressing ▶ in 🖼.
       */
      const styles = styleless ? null : {
        says: () => ownStyle()?.says ?? null,
        forMedium: (m) => {
          const mine = mediumPicks.find((x) => x.medium === m)?.pick.style()
          return mine || ownStyle()?.uses?.[m] || null
        },
      }

      // ── ⚙ the band: what ▶ will run, and what it will run it at ───────────────
      const optionsNode = el('div', { class: 'band-rows' })
      const styleRows = styleless
        ? el('div', { class: 'band-rows chain-styles' },
          el('p', { class: 'muted' }, 'no styles here'))
        : el('div', { class: 'band-rows chain-styles' },
          fieldRow('chain style', el('div', { class: 'style-pick' }, ownSel, ownDoor)),
          ...mediumPicks.map((x) => x.pick.row))

      /** One published default, as a control. Blank is not a state here — the composition HAS a
       *  value for this and it is the one that runs; changing it is yours and is remembered. */
      function knobRow(b, key, value) {
        const mine = store.get(knobKey(comp.slug, b.step.id, key), '')
        const node = el('input', {
          type: typeof value === 'number' ? 'number' : 'text',
          value: mine || String(value),
          title: `${b.step.id} · ${key} — published as ${value}`,
        })
        node.addEventListener('change', () => {
          const raw = String(node.value ?? '').trim()
          store.set(knobKey(comp.slug, b.step.id, key), raw === String(value) ? '' : raw)
          if (!raw) node.value = String(value)
        })
        return fieldRow(key, node)
      }

      function paintOptions() {
        const needs = comp.needs ?? []
        optionsNode.replaceChildren(
          styleRows,
          // ⚠️ THE FIX IS A BUTTON, NOT A SENTENCE TO FOLLOW. Every one of these is a ⤓ the app can
          // make, so sending somebody to the 📚 page would be telling them where the button is
          // instead of giving it to them. First in the band, because nothing below it can run
          // until it is done.
          ...(needs.length
            ? [el('div', { class: 'f-row stacked' },
              el('span', { class: 'muted' }, `${needs.length} still missing`),
              el('p', { class: 'row-actions' }, ...needs.map((n) => {
                const btn = el('button', { class: 'btn mini', type: 'button', title: `⤓ take ${n}` }, `⤓ ${n}`)
                btn.addEventListener('click', async () => {
                  btn.disabled = true
                  try { await ctx.take(n) } catch (err) { ctx.flash(String(err.message || err), true) }
                  btn.disabled = false
                })
                return btn
              })))]
            : []),

          // One block per step: what it does, what answers it, what it runs at.
          ...comp.bindings.map((b) => {
            const options = b.options ?? []
            const rows = []
            // ⚠️ RELATIVES FIRST, AND THE ORDER IS THE WHOLE OF THE FEATURE (2026-08-29). What may
            // answer this step is a flat set — anything that makes the right thing from the right
            // inputs — but what will answer it WELL depends on the step before it: an SDXL
            // IP-Adapter cannot carry a FLUX founder, and it does not fail, it renders something
            // plausible and wrong. So the list is grouped by whether it is from the same family as
            // the picture this step is handed. It never removes an option: crossing families is
            // sometimes exactly what you want, and finding out costs one press.
            const wants = upstreamLineage(comp, b)
            const label = (o) => (o.published ? `${o.workflow} · as published` : o.workflow)
              + (o.lineage ? ` · ${o.lineage}` : '')
            if (options.length > 1) {
            // ⚠️ AND A WORKFLOW WITH NO LINEAGE IS A RELATIVE, NOT A STRANGER. `rembg/cutout` reads
            // any picture there is — matting is architecture-blind — so the library declares no
            // family for it, and putting "another family, it may not read the picture" over the one
            // workflow that always can would be a warning that is simply false. Unknown sits with the
            // kin, unmarked; only a DECLARED difference is a difference.
              const kin = wants ? options.filter((o) => !o.lineage || o.lineage === wants) : options
              const rest = wants ? options.filter((o) => o.lineage && o.lineage !== wants) : []
              const sel = el('select', { class: 'sel', title: `what answers ${b.step.id}` },
                ...(rest.length && kin.length
                  ? [
                    el('optgroup', { label: `${wants}, or family-blind — safe with what it is handed` },
                      ...kin.map((o) => el('option', { value: o.workflow }, label(o)))),
                    el('optgroup', { label: 'another family — it may not read the picture' },
                      ...rest.map((o) => el('option', { value: o.workflow }, label(o)))),
                  ]
                  : options.map((o) => el('option', { value: o.workflow }, label(o)))))
              sel.value = engineOf(comp, b) ?? ''
              sel.addEventListener('change', () => {
                // ⚠️ CHOOSING WHAT WOULD HAVE RUN ANYWAY CLEARS THE PLUG rather than pinning it. A
                // pin to today's default is a pin that silently stops following the default.
                store.set(plugKey(comp.slug, b.step.id), sel.value === b.workflow ? '' : sel.value)
                paintOptions()
              })
              rows.push(fieldRow('engine', sel))
            }
            for (const [key, value] of Object.entries(b.step.params ?? {})) rows.push(knobRow(b, key, value))
            return el('div', { class: 'block step-block' },
              el('div', { class: 'rw-head muted' },
                el('span', { class: 'step-id' }, b.step.id),
                el('span', { class: 'step-what' }, stepFace(b.step))),
              el('p', { class: 'step-rec' },
                // A pick and a bind both name no workflow, and words are xoko: no service, nothing to
                // install, nothing that can be missing.
                b.step.pick
                  ? chip('✋ you', '')
                  : b.step.binds
                    ? chip('this app', 'ok')
                    : b.binding === 'xoko'
                      ? chip('✨ xoko', 'ok')
                      : (b.workflow
                        ? [el('code', {}, engineOf(comp, b)), bindingChip(b, !!plugged(comp, b)),
                          // ⚠️ A MARK, NOT A REFUSAL. It is on the READOUT rather than only in the
                          // menu because the mismatch usually arrives without anybody opening the
                          // menu — a substituted binding, or a plug that was fine until the step
                          // above it changed.
                          ...(crossing(comp, b) ? [chip(`≠ ${upstreamLineage(comp, b)}`, '')] : [])]
                        : [el('span', { class: 'muted' }, b.why), bindingChip(b, false)])),
              ...rows)
          }),

          el('p', { class: 'row-actions' },
            // ⏹ — the chain stops between steps. What is already queued still renders: those are
            // presses, they are yours, and cancelling them is the ▶ band's job, not this one's.
            el('button', {
              class: 'btn', title: 'stop this chain — anything already queued still renders',
              onclick: () => { run?.stop(); ctx.flash('stopped between steps') },
            }, '⏹ stop'),
            el('button', {
              class: 'btn danger', title: 'forget this chain — the runs it made are not touched',
              onclick: async (ev) => {
                ev.currentTarget.disabled = true
                try {
                  await api('/api/compositions', { slug: comp.slug, forget: true })
                  ctx.flash(`forgot ${comp.label ?? comp.slug}`)
                  await ctx.reloadCompositions()
                } catch (err) { ctx.flash(String(err.message || err), true) }
              },
            }, '🗑 forget this composition')))
      }
      paintOptions()
      shelf.set(runs())

      /**
       * ⓘ ONE RUN — everything that press made, in the order the chain made it.
       *
       * ⚠️ THE STEPS ARE HERE, IN THE PAST TENSE. A running chain is a queue row; a FINISHED one is
       * a thing you look at, and "which step drew this, and what did it write first" is exactly
       * what you want to know while looking. Same band, different question.
       */
      /**
       * ▶ WHY IT STOPPED, AND ONE PRESS TO CARRY ON — the two halves of the same answer.
       *
       * ⚠️ A CHAIN IS DRIVEN FROM THIS PAGE, so a reload, a restart or a closed tab ends a run
       * where it stood (web/lib/chain.js). Everything the finished steps produced is on disk the
       * whole time — the run was never lost, only the loop was — and starting over meant paying
       * again for work that was sitting right there. The composition builder is where this bites
       * hardest: its `survey` reads the machine and the library before it writes a word.
       *
       * ⚠️ AND IT IS THE SAME RUN, not a new one that looks like it. Same folder, same card, the
       * finished steps stepped over rather than pressed again.
       */
      function resumeRow(g) {
        const left = stepsLeft(comp, g)
        if (!left.length && !g.failed) return null
        const busy = run && (run.state === 'running' || run.state === 'choosing') && run.run === g.run
        const go = el('button', {
          class: 'btn mini primary', type: 'button',
          title: `carry on from ${left[0] ?? 'where it stopped'} — what is already done is not done again`,
        }, `▶ carry on from ${left[0] ?? 'the end'}`)
        go.disabled = !!busy || !left.length || !comp.ready
        go.addEventListener('click', () => {
          if (run && (run.state === 'running' || run.state === 'choosing')) {
            ctx.flash('this chain is already running — ⏹ it in ⚙ first')
            return
          }
          run = startChain(ctx, comp, g.ask ?? '', () => refresh(),
            plugsFor(comp), knobsFor(comp), styles,
            { run: g.run, done: alreadyDone(comp, g) })
          refresh()
        })
        return el('div', { class: 'block' },
          g.failed
            ? el('p', { class: 'wrote failed-why' }, `${g.failed.step} stopped — ${g.failed.why}`)
            : null,
          left.length
            ? el('p', { class: 'muted' },
              `${left.length} step${left.length === 1 ? '' : 's'} not run: ${left.join(', ')}`)
            : null,
          el('p', { class: 'row-actions' }, go))
      }

      function runDetail(g) {
        const name = el('input', {
          class: 'detail-name', value: g.title,
          title: 'what this run is called. Enter to save; empty goes back to the sentence.',
        })
        const save = async () => {
          if (name.value === g.title) return
          try {
            await api('/api/rename', { path: g.path, title: name.value })
            ctx.flash('renamed')
            await ctx.reloadManifest()
          } catch (err) {
            ctx.flash(String(err.message || err), true)
            name.value = g.title
          }
        }
        name.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); name.blur() } })
        name.addEventListener('blur', () => { void save() })

        const wrote = new Map((g.wrote ?? []).map((w) => [w.step, w.text]))
        const byStep = new Map()
        for (const cell of g.cells) {
          if (!byStep.has(cell.step)) byStep.set(cell.step, [])
          byStep.get(cell.step).push(cell)
        }

        const stepRow = (b) => {
          const id = b.step.id
          const cells = byStep.get(id) ?? []
          const words = wrote.get(id)
          const bound = g.bound?.step === id ? g.bound : null
          if (!cells.length && !words && !bound) return null
          // ⚠️ PER STEP, WHICH IS WHY IT IS NOT ON THE RUN. A chain names a style per medium
          // (`uses`), so one run holds several — the picture step's look and the music step's
          // idiom are different answers and the run has no single one to give.
          const made = cells[0]
          return el('div', { class: 'block' },
            el('div', { class: 'rw-head muted' },
              el('span', { class: 'step-id' }, id),
              made ? styleChip(made.gen, (slug) => ctx.openStyles?.(made.medium, slug)) : null,
              el('span', { class: 'step-what' },
                bound
                  ? `${bound.parts} pages · ${size(bound.bytes)}`
                  : (words ? 'written' : `${cells.length} ${cells.length === 1 ? 'asset' : 'assets'}`))),
            words ? el('p', { class: 'wrote' }, words) : null,
            // ⚠️ THE ONE PRESS THAT CHANGES THE APP, AND IT IS A BUTTON (2026-09-04). What a step
            // wrote stays words; installing is a separate act you can look at first and do twice.
            document_(words) ? installRow(ctx, g, words) : null,
            cells.length
              ? el('div', { class: 'run-strip' }, ...cells.map((c) => {
                const shot = el('button', {
                  class: 'choose-cell', type: 'button',
                  title: `${c.path} — ${took(c.gen?.durationMs ?? null)}`,
                  onclick: () => window.open(href(c.master), '_blank'),
                },
                c.player === 'img'
                  ? el('img', { src: href(c.preview ?? c.master), alt: '', loading: 'lazy' })
                  : el('span', { class: 'muted' }, c.medium))
                return shot
              }))
              : null,
            bound
              ? el('p', { class: 'row-actions' },
                el('button', {
                  class: 'btn mini', title: 'open it',
                  onclick: () => window.open(href(bound.master), '_blank'),
                }, '⤢ open'))
              : null)
        }

        const open = g.bound?.master ?? coverOf(g)
        return el('div', { class: 'detail' },
          // ⚠️ AND `coverOf` IS OFTEN NOTHING, which `href` turned into `/content/undefined` — a
          // broken image, drawn at full width, at the top of every ⓘ for every run that wrote
          // words. 🧩 stands there instead: what this is, in 📚's word for it.
          detailHead(
            detailArt(coverOf(g) ? href(coverOf(g)) : null, { blank: COMPOSITION_ICON }), name,
            { extra: [starWidget(g.ratingKey)], stack: true }),
          g.ask ? el('p', { class: 'muted ask-said' }, g.ask) : null,
          el('p', { class: 'muted' }, [
            g.cells.length ? `${g.cells.length} made` : '',
            boundLine(g.bound),
            when(g.createdAt),
          ].filter(Boolean).join(' · ')),
          // ⚠️ WHY IT STOPPED, WHERE YOU ARE LOOKING WHEN YOU ASK (2026-09-04). It used to be a
          // flash that was gone in seconds, on a loop that dies with the page — so a run with two
          // steps missing could not tell you whether they failed or were never reached.
          resumeRow(g),
          // In the chain's own order, and only the steps this run actually reached — a run you
          // stopped on step two is a run of two steps.
          ...comp.bindings.map(stepRow).filter(Boolean),
          el('p', { class: 'muted path' }, g.path),
          el('p', { class: 'row-actions' },
            open
              ? el('button', {
                class: 'btn', title: 'open what this run was for',
                onclick: () => window.open(href(open), '_blank'),
              }, '⤢ open')
              : null,
            el('button', {
              class: 'btn', title: 'show this run in the Finder',
              onclick: async () => {
                try { await api('/api/reveal', { path: g.path }) }
                catch (err) { ctx.flash(String(err.message || err), true) }
              },
            }, '📁 reveal'),
            el('button', {
              class: 'btn', title: 'same sentence, run again',
              onclick: () => ctx.askFill(g.ask ?? ''),
            }, '↻ again'),
            // ⚠️ THE WHOLE RUN, and no confirmation (DECISIONS.md, 2026-08-03). A run of a chain is
            // one act — the brief, the takes, the cut-out, the book — and deleting half of one is
            // not a thing anybody means.
            el('button', {
              class: 'btn danger', title: 'delete this whole run — there is no undo',
              onclick: async (ev) => {
                ev.currentTarget.disabled = true
                try {
                  await api('/api/delete', { path: g.path, key: g.ratingKey })
                  ctx.flash('deleted')
                  ctx.select(null)
                  await ctx.reloadManifest()
                } catch (err) {
                  ctx.flash(String(err.message || err), true)
                  ev.currentTarget.disabled = false
                }
              },
            }, '🗑 delete run')))
      }

      return {
        feed,
        refresh,
        /**
         * ▶ — one sentence, and the chain runs on it.
         *
         * ⚠️ IT REFUSES BEFORE IT SPENDS ANYTHING. A chain with an unbound step would render the
         * first four and stop, which is worse than not starting: the presses are already gone.
         */
        ask: {
          placeholder: `say what this ${comp.family ?? 'chain'} is about — every step reads it`,
          hint: comp.ready ? '' : 'this chain is not ready — take what is missing in ⚙',
          // ⚠️ `press: false` GREYS ▶ AND LEAVES IT THERE (2026-09-04). `make` below still exists,
          // because xoko's `▶ make <slug>:` calls it — what the composition is declining is the
          // PERSON'S press, not the run. See `Composition.press`.
          greyed: comp.press === false,
          make: (said) => {
            if (run && (run.state === 'running' || run.state === 'choosing')) {
              ctx.flash('this chain is already running — ⏹ it in ⚙ first')
              return false
            }
            if (!comp.ready) { ctx.flash('this chain is missing something — see ⚙', true); return false }
            if (!said.trim()) { ctx.flash('say what it is about first'); return false }
            run = startChain(ctx, comp, said.trim(), () => refresh(),
              plugsFor(comp), knobsFor(comp), styles)
            refresh()
            return true
          },
        },
        options: optionsNode,
        detail: (sel) => (sel?.chain
          ? runDetail(sel.chain)
          : el('p', { class: 'empty' }, 'pick a run in the feed')),
      }
    },
  }
}
