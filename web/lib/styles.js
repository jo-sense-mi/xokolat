// 🎨 THE STYLES BAND — one component, shown in the right pane for whatever you are standing in.
//
// PLAN §4c: a style list belongs to the SECTION that uses it. Image styles under 🖼 images, music
// genres under 🎼. There is no central styles page to navigate to, and this file is why that costs
// nothing — the tenth section that wants one passes its medium and is done.
//
// ⚠️ IT WAS A CENTER PAGE AND IT IS NOW A BAND (2026-08-29), and the argument for the center did
// not survive being written down. "The middle is what you made" — and NOTHING about a style is
// something you made: not the list, not the editor, not the swatch, which is evidence ABOUT a
// style and explicitly not content (src/styles/probe.ts). Worse, it was reachable from exactly one
// place — a child row under 🖼 — so the music list and the voice list existed on disk, in the
// parser and in the API, and there was no screen in the app that showed them. One band, one strip
// of scopes across the top of it, and every medium has an editor for the first time.
//
// ⚠️ AND ⚙ PICKS WHILE 🎨 MANAGES. The ⚙ band carries a `stylePicker` — a select and a door — and
// this file carries the list, the editor, the swatches and the delete. Same split, and the same
// door, as the engine chip and 🔌: a readout you can press.
//
// ⚠️ GRID ⇄ ONE, INSIDE THE BAND. A pane is one narrow column, so the grid and the thing you
// picked take turns rather than sharing: picking swaps to it, ⟨ comes back. It does NOT borrow the
// ⓘ band — ⓘ is what you picked IN THE FEED, and a style is not in the feed.
//
// ⚠️ A WORKBENCH, NOT A CATALOGUE (DECISIONS.md, 2026-08-04). The first version was a grid you
// could look at: one shoot button per card, no sweep, no re-shoot after an edit, and an editor
// that was five labelled fields with a hint under each. content-factory's styles page — which
// this is now measured against — is a grid with a filter, a tally, a sweep, and an editor that
// is a HEAD ROW and two boxes. The difference is not layout, it is that one of them lets you
// work.
//
// ⚠️ ONE LIST, ALL OF IT YOURS. The shipped file is a seed, copied once. Every style is editable
// and deletable, and there is no "copy to mine" — that was ceremony invented by a two-layer read.
// If you like one, you ★ it, exactly as you would an image.
//
// ⚠️ TECHNIQUE ONLY. Flat vector, pencil sketch, ink linework — how it is drawn, never what is
// in it. A theme belongs in the sentence.
//
// ⚠️ THE GRID IS ONE MODEL'S GRID. Every cell is shot on the model in the 🔌 band, the tally
// says which, and switching the band repaints. The same words are a different picture on a
// different checkpoint; a grid that mixed them would be comparing nothing.
//
// ⚠️ THE BAR, THE WINDOW, THE HEADINGS AND THE THUMBNAIL ARE NOT THIS FILE'S — they are
// web/lib/browse.js, shared with every other shelf in the app. This file supplies a ROW and the
// verbs that ride on it, and nothing else about the layout. It grew its own bar twice, its own
// headings once, and its own card family once; every one of them was a second answer to a solved
// question, and the card one silently diverged from the media feed's.
//
// ⚠️ ONE WAY TO LOOK, AND IT IS A ROW (2026-08-30). There were two — a ▦ grid of square tiles and
// a ☰ table of seven columns, the switch inherited from the middle pane, where a shelf is as wide
// as the feed. This is ONE NARROW COLUMN: the grid was two tiles across (too small to judge a
// look, too big to scan forty) and the table's seven columns could not be read at all. A row of
// a small swatch, a name and its words scans down a stable left edge, folds properly under a
// heading, and holds at the volume this is for. Everything the table said that the tile did not
// (`took`, the words) is ON the row; the one thing lost is sorting, which in a dock is chrome.
//
// ⚠️ AND THE MEDIUM NO LONGER CHANGES THE SHAPE. `swatchThumb` already answers "a picture, a ▶, a
// first frame or a ⬡" for all six media, so the ☰-for-audio special case went with the table.
//
// ⚠️ FILED BY COLLECTION, AND BY NOTHING ELSE (2026-08-30). `category` — a closed vocabulary of
// three image techniques, declared in the app — is deleted: it was the app owning CONTENT, it was
// images-only, and where it existed it repeated the title. What is left is one open axis, `★
// favourites` (derived from the star, never stored) over the collections a take wrote, over
// `unsorted`. Every row sits under a heading, and folding one is how you look at only the rest —
// which is why the app-wide ★ filter is not this shelf's answer to finding a favourite.
//
// ⚠️ THE FEED IS THE GRID; THE DOCK IS THE ONE YOU PICKED. Words, actions and the editor all
// live in the ⓘ band, because that is what this app's four bands mean — the feed is the things,
// ⓘ is the thing.
//
// ⚠️ ＋ NEW STYLE, ON `mine` ONLY (2026-08-30). This file refused one for a long time, and the
// refusal was aimed at the right thing — a blank form you hand-type comma-tags into is not how a
// good style gets written — but it left a machine that could not make one at all without a
// library answering. So ＋ exists, beside the two doors that were always the better ones: edit
// one that is close (the everyday case), or ✨ xoko. There is no ＋ on `xoko.lat`, because you
// cannot write into somebody else's shelf.
//
// ⚠️ AND NO ✨ BUTTON HERE EITHER (2026-08-05). The shell's ask bar is on every page now and it
// pre-frames itself with where you are, so a per-view door was a second entrance to one room.

import { api, el, chip, fieldRow, isStarred, select, starWidget, starsReady, took } from './launch-kit.js?v=129'
import { browser, detailHead, thumb } from './browse.js?v=129'
import { playButton } from './deck.js?v=129'

const asTags = (s) => (s || '').split(',').map((t) => t.trim()).filter(Boolean)

/**
 * THE TWO RUNS THE APP OWNS, and there are no others — every remaining heading is a name somebody
 * wrote. `★` is derived from the star on each paint and stored nowhere; `` is the absence of a
 * choice, which is a real state and not a collection called "mine".
 */
const FAV = '★'
const NONE = ''

/** What a collection is CALLED here.
 *
 *  ⚠️ DE-SLUGGED, NOT LOOKED UP. What a take writes onto a style is the collection's slug
 *  (src/library/take.ts), and a machine that has never opened xoko.lat still has to draw the
 *  heading — so this reads the slug rather than depending on a fetch. Slugs are written to be
 *  read. The library's own shelf keeps its published titles, because over there it has them. */
const collectionFace = (slug) => (slug || '').replace(/-/g, ' ')

/** Typed names → what they are stored as. "Picture Book" and "picture-book" must not become two
 *  runs out of one shelf. */
const asCollections = (s) => asTags(s).map((x) => x.toLowerCase().replace(/\s+/g, '-'))

/**
 * ONE ROW, BOTH SHELVES — yours and xoko.lat's. The two lists are the same list at different
 * stages, so switching between them must not change the shape of what is under the switch; the
 * only differences are the ones that are real (a published style has no swatch to lead with, and
 * its verb is ⤓ rather than shoot).
 *
 * @param thumbNode  the swatch, small. Absent on a published style, which has none.
 * @param meta       ⟳, how long it took, ★ — the facts that ride at the right of the name
 * @param verb       the row's one act
 * @param note       replaces the words line outright, for a style that will not parse
 */
function styleRow({ thumbNode = null, name, title = '', words = '', bad = false, meta = [], verb = null, note = null }) {
  return el('div', { class: 'style-item' },
    thumbNode,
    el('div', { class: 'style-item-body' },
      el('div', { class: 'style-item-head' },
        el('span', { class: 'browse-name', title }, name),
        el('span', { class: 'spacer' }),
        ...meta.filter(Boolean),
        verb),
      note ?? el('span', { class: `browse-ask${bad ? ' err-note' : ''}`, title: words }, words)))
}

/**
 * WHICH SWATCHES ARE HEARD RATHER THAN SEEN.
 *
 * ⚠️ A BROWSER FACT, which is why it lives here and not in the payload beside the ask and the noun.
 * The server decides what a probe COSTS and what it is CALLED; how a file is presented once it
 * exists is this file's question, and the same three media are audio in every shelf in the app.
 *
 * ⚠️ IT NO LONGER PICKS A LAYOUT (2026-08-30). It used to open these three as ☰ rows and the
 * other three as a ▦ grid, because a square with a ▶ in the middle of it compares nothing. Every
 * shelf here is rows now, so the only thing left to answer is what goes in the thumbnail slot.
 */
const HEARD = new Set(['music', 'sound', 'voice'])

/** What ⓘ is given while writing a style that does not exist yet — the band needs *something*
 *  selected to open, and null would read as "nothing picked". */
const NEW_STYLE = { slug: '', label: 'new style' }

/** A style's ★ key. Same store as an image's, different shape of subject — the star machinery
 *  takes any stable string (src/content/stars.ts). */
const starKey = (medium, slug) => `style:${medium}:${slug}`

const modelName = (file) => (file ?? '').replace(/\.(ckpt|safetensors|gguf)$/, '') || 'no model'

/** What the ⚙ picker remembers, per medium. The SECTION is not in the key for the same reason the
 *  engine plug's is not: a style list belongs to a medium, and a medium has one section.
 *
 *  ⚠️ A CHAIN OVERRIDES IT UNDER ITS OWN KEY (`xokolat:style:<comp>:<medium>`, passed as `key`).
 *  What you picked in 🖼 is for pressing ▶ in 🖼; a book's picture style is the book's. Same split
 *  the engine plug already keeps between a medium's and a chain step's. */
export const pickedKey = (medium) => `xokolat:style:${medium}`

/**
 * ⚙ THE PICKER — the row that says which style ▶ will use, and the door to 🎨.
 *
 * ⚠️ ONE CONTROL, NOT TWO (2026-08-29). 🖼 built a grouped select with a ⭐ shelf and a category
 * shelf; 🗣 built a flat one with a different empty option and a different storage key; 🎼 and 🧊
 * had none at all, so a music genre could be written and never chosen. Three answers to "which
 * style", diverging, on top of ONE list each. The differences that were real are the two options
 * below; everything else was two people solving the same problem on different days.
 *
 * @param ctx      the section context (needs .flash, .openStyles, .onStyles)
 * @param medium   which list
 * @param label    the row's word — `style` everywhere, `voice` in 🗣, because a voice IS a style
 *                 and calling it one there would be the app's vocabulary over the person's.
 * @param none     what the empty option says. ⚠️ IT IS NOT ALWAYS "NONE": pressing ▶ without a
 *                 voice does not make a silent file — the workflow's graph has a description of its
 *                 own and that is who speaks. Saying so is the difference between a control that
 *                 looks broken and one that is honest about the default it overrides.
 * @param key      where the choice is remembered. Defaults to the medium's; a chain passes its own.
 */
export function stylePicker(ctx, medium, { label = 'style', none = 'none', key = null } = {}) {
  const remembers = key ?? pickedKey(medium)
  /** What the EMPTY option falls back to, when something above this row supplies one — a chain
   *  style naming a media style. Null means the empty option is a real "none". */
  let inherited = null
  const sel = select([])
  const door = el('button', {
    class: 'btn mini', type: 'button', title: `see and edit the ${medium} styles`,
  }, '🎨')
  door.addEventListener('click', () => ctx.openStyles?.(medium))
  let list = []

  const byName = (a, b) => (a.label ?? a.slug).localeCompare(b.label ?? b.slug)
  const opt = (v) => el('option', { value: v.slug, title: v.notes ?? v.positive ?? '' }, v.label ?? v.slug)

  /**
   * ★ FIRST, THEN BY COLLECTION. This dropdown is where you choose under time pressure, so the
   * ones you starred are lifted into their own group at the top — that is the whole payoff of
   * starring a style.
   *
   * ⚠️ THE SAME RUNS AS 🎨, IN THE SAME ORDER (2026-08-30). It grouped by `category` while the
   * band grouped by collection, so the list you pick from and the list you manage were two
   * readings of one shelf. `category` is deleted; this is the other half of that.
   *
   * ⚠️ EVERY STYLE APPEARS EXACTLY ONCE HERE, which is the one place this differs from the band.
   * A style belongs to every collection that names it and the shelf draws it under each — but a
   * dropdown you scroll blind is not a shelf, and two identical entries under two headings would
   * make you stop and check whether they were the same style. First run wins, ★ before all of
   * them.
   *
   * ⚠️ ALWAYS GROUPED, EVEN AT ONE GROUP (2026-08-30). There used to be a `shelves.length > 1`
   * gate, on the ordinary rule that a control with one answer is not a control — and it made the
   * SAME list read differently per medium: four image styles across three runs got headings, four
   * music genres that all came from one collection got a flat list with no word over them. A
   * heading is not a filter here, it is what says which run you are choosing from, and that
   * sentence is worth the same in every section.
   */
  function fill() {
    const chosen = sel.value || localStorage.getItem(remembers) || ''
    const starred = list.filter((s) => isStarred(starKey(medium, s.slug))).sort(byName)
    const rest = list.filter((s) => !isStarred(starKey(medium, s.slug)))
    const sets = [...new Set(rest.flatMap((s) => s.collections ?? []))]
      .sort((a, b) => collectionFace(a).localeCompare(collectionFace(b)))
    const placed = new Set()
    const shelves = [
      { label: '★ favourites', styles: starred },
      ...sets.map((c) => ({
        label: collectionFace(c),
        styles: rest.filter((s) => {
          if (placed.has(s.slug) || !(s.collections ?? []).includes(c)) return false
          placed.add(s.slug)
          return true
        }),
      })),
      { label: 'unsorted', styles: rest.filter((s) => !(s.collections ?? []).length) },
    ].filter((g) => g.styles.length)

    // ⚠️ THE EMPTY OPTION SAYS WHAT IT WOULD ACTUALLY DO. "from the chain style" is a promise the
    // row cannot keep on its own — naming the style it inherits is the difference between a blank
    // control and a readout of a default you can see.
    const inheritedFace = inherited
      ? `${none} · ${list.find((x) => x.slug === inherited)?.label ?? inherited}`
      : (list.length ? none : `${none} — 📚 has more`)
    sel.replaceChildren(
      el('option', { value: '' }, inheritedFace),
      ...(list.length > 1 ? [el('option', { value: 'random' }, 'surprise me')] : []),
      ...shelves.map((g) => el('optgroup', { label: g.label }, ...g.styles.sort(byName).map(opt))))
    // A style that was just deleted must not stay selected — it would be sent and refused.
    sel.value = [...sel.options].some((o) => o.value === chosen) ? chosen : ''
  }

  sel.addEventListener('change', () => localStorage.setItem(remembers, sel.value))

  const load = async () => {
    // A machine with no generator at all cannot answer this, and a picker that threw would take
    // the section down with it. An empty list is a real state and the first option says so.
    try {
      const got = await api(`/api/styles/${medium}`)
      list = got.styles ?? []
    } catch { list = [] }
    fill()
  }

  // ⚠️ THE BAND AND THIS ROW READ ONE LIST. Saving a style in 🎨 has to reach the select without a
  // reload, or an editor feels like a different program — which is what the old per-section copy
  // of this code did by hand, in one section, and nowhere else.
  ctx.onStyles?.((m) => { if (m === medium) void load() })

  // ⚠️ ★ DECIDES A GROUP, AND IT ARRIVES AFTER THE FIRST FILL (web/lib/shared.js). Without this
  // the favourites group was a race: the styles were fetched, the stars were not back yet, and
  // the one you starred sat under its collection with no ★ run over it until something else
  // happened to repaint the row. Same one-line fix every ★ widget already makes for itself.
  starsReady.then(fill)

  return {
    row: fieldRow(label, el('div', { class: 'style-pick' }, sel, door)),
    style: () => sel.value || null,
    /** What the empty option inherits from — see `inherited`. */
    setInherited: (slug) => { if (slug !== inherited) { inherited = slug; fill() } },
    list: () => list,
    /** ✨ "draw that in ink linework" — the select moves, then ▶ is pressed normally. Returns null
     *  when it took, or the sentence to say when it did not. */
    use: (slug) => {
      if (![...sel.options].some((o) => o.value === slug)) {
        return `there is no ${medium} style called "${slug}" here — 📚 is where they come from`
      }
      sel.value = slug
      localStorage.setItem(remembers, slug)
      return null
    },
    load,
  }
}

/**
 * @param ctx     the band context (needs .flash, .engineFor, .stylesChanged)
 * @param medium  which style list — 'image', 'music', …
 * @returns { node, refresh, list, categories, engineChanged }
 */
export function stylesView(ctx, medium) {
  let loaded = { styles: [], issues: [], axes: [], shotOn: {}, probe: {} }
  let picked = null    // the slug whose words are showing in ⓘ
  let editing = null   // the style being edited, '' for a new one, null for none
  // ⚠️ The editor NODE is kept, not rebuilt. `detail()` is called again on every repaint — an
  // engine poll, a queue tick — and rebuilding it there would wipe half-typed words. This is the
  // same problem content-factory solved with `data-keep`; keeping the node is the version that
  // cannot forget a field.
  let editorNode = null

  // ── WHICH LIST YOU ARE LOOKING AT ───────────────────────────────────────────
  //
  // ⚠️ TWO LISTS, ONE AT A TIME — NOT ONE LIST WITH THE LIBRARY GREYED INTO IT. A published style
  // has no swatch and CANNOT have one: shooting a swatch means rendering it here, on your model,
  // which is the act that makes it yours. Mixed into the grid it would be a row of blanks under a
  // ▶ that does not apply to it — the exact thing the probe pass existed to remove.
  //
  // ⚠️ AND THE HEAD CHANGES SHAPE WITH IT, deliberately. The ask and ▶ shoot are verbs of a shelf
  // that OWNS its content; over there they would be lies. So `xoko.lat` is a list, a search, and
  // one verb per row.
  //
  // ⚠️ NOT REMEMBERED. `mine` is where your work is; coming back to the library side because you
  // once looked at it would be the app deciding where you are standing.
  let source = 'mine'
  let libLoaded = { origin: null, items: [], collections: [], at: null, issue: null }
  let libRead = false   // has the fetch come back at all — "reading…" is not "nothing published"
  let pickedLib = null

  // ── the ask, PINNED UNDER THE BAR ───────────────────────────────────────────
  // The sentence every swatch below is judged on, in reach while you scroll the grid it made —
  // which is why it rides the shelf's own sticky head (`under`) rather than sitting above it as a
  // row of the page. It is not in ⚙ for the same reason: it is tuned WHILE you look at the grid.
  //
  // ⚠️ ONE FIELD, NOT A FORM. The label, the sentence and the verbs read as a single object —
  // the word is a divider-separated tab on the left, the box is borderless inside it, and the
  // whole thing takes the focus ring. A bordered input with two buttons floating beside it is
  // three controls where there is one decision.
  //
  // ⚠️ THE VERBS APPEAR WHEN THEY MEAN SOMETHING. `save` only exists while the box differs from
  // what is stored; `reset` only while what is stored differs from what the app ships. A button
  // that is always there and usually a no-op is what makes a strip look busy.
  //
  // ⚠️ AND NEITHER DELETES ANYTHING (2026-08-29). It was one button labelled `💾 save & clear`
  // that wiped every swatch of the medium, so the one control this page exists to tune was the one
  // control nobody would press. Every cell knows the sentence it was shot from, so the pictures
  // stay and the ones that moved are marked ⟳ and counted on the heading of every run they are in.
  //
  // ⚠️ THE WORD IS THE MEDIUM'S. `subject` for a picture, `line` for a voice, `event` for a sound
  // (src/styles/probe.ts) — sent with the list, never guessed here.
  const askWord = el('span', { class: 'probe-word' }, 'ask')
  const askBox = el('input', { type: 'text', spellcheck: 'false', class: 'probe-box' })
  const askSave = el('button', { class: 'btn mini primary probe-verb' }, 'save')
  const askReset = el('button', { class: 'btn mini probe-verb' }, '↺ reset')
  const askBar = el('div', { class: 'probe-bar' }, askWord, askBox, askSave, askReset)
  let askShown = null   // what the box was last filled FROM — see fillAsk()

  async function putAsk(ask, btn) {
    btn.disabled = true
    try {
      loaded = await api(`/api/styles/${medium}/ask`, { ask, ...where() })
      askShown = null      // the server may have trimmed it, or reset it to the shipped one
      const behind = todo(loaded.styles).length
      ctx.flash(behind ? `saved — ${behind} to shoot again` : 'saved')
      paint()
    } catch (err) {
      ctx.flash(String(err.message || err), true)
      askVerbs()
    }
    btn.disabled = false
  }

  askSave.addEventListener('click', () => void putAsk(askBox.value, askSave))
  askReset.addEventListener('click', () => void putAsk('', askReset))
  askBox.addEventListener('input', askVerbs)
  askBox.addEventListener('keydown', (ev) => {
    // Enter is save — the box holds one sentence and there is nothing else to submit.
    if (ev.key === 'Enter') { ev.preventDefault(); if (dirty()) void putAsk(askBox.value, askSave) }
    // Escape is "never mind", back to what is stored. Not a reset — that is the other verb.
    if (ev.key === 'Escape') { askBox.value = askShown ?? ''; askVerbs(); askBox.blur() }
  })

  const dirty = () => askBox.value.trim() !== (askShown ?? '')

  /** Which verbs are true right now. Called on every keystroke and after every fill. */
  function askVerbs() {
    const shipped = loaded.probe?.shipped ?? ''
    askBar.classList.toggle('dirty', dirty())
    askSave.hidden = !dirty()
    askSave.title = `save this ${loaded.probe?.word ?? 'ask'} — nothing is deleted, the cells it `
      + 'no longer matches are marked ⟳'
    askReset.hidden = dirty() || !shipped || (askShown ?? '') === shipped
    askReset.title = `back to “${shipped}”`
  }

  /** Refill only when the SAVED value changed — a repaint must not eat a half-typed sentence. */
  function fillAsk() {
    askWord.textContent = loaded.probe?.word ?? 'ask'
    // ⚠️ PROSE IN A TOOLTIP, NOT ON THE PAGE. What makes a good ask for this medium is a sentence
    // worth having and not a paragraph in a control strip.
    askBox.title = loaded.probe?.hint ?? ''
    if (loaded.probe?.ask !== askShown) {
      askShown = loaded.probe?.ask ?? ''
      askBox.value = askShown
    }
    askVerbs()
  }

  // ── the switch ──────────────────────────────────────────────────────────────
  // Built twice, once per shelf, because it rides each one's sticky head (`over`) and only one
  // shelf is in the DOM at a time. Two buttons is cheaper than a slot that can be moved.
  const strips = []
  function sourceStrip() {
    const btn = (value, label, title) => {
      const b = el('button', { class: 'seg', type: 'button', title }, label)
      b.addEventListener('click', () => setSource(value))
      return b
    }
    const mine = btn('mine', 'mine', 'the styles you have — the ones with pictures')
    const lib = btn('library', 'xoko.lat', 'what the library publishes for this medium')
    const node = el('div', { class: 'wb-seg src-strip', role: 'tablist' }, mine, lib)
    const sync = () => {
      mine.classList.toggle('active', source === 'mine')
      lib.classList.toggle('active', source === 'library')
    }
    sync()
    strips.push(sync)
    return node
  }

  function setSource(value) {
    if (source === value) return
    source = value
    picked = null
    pickedLib = null
    closeEditor()
    for (const sync of strips) sync()
    if (value === 'library' && !libRead) void loadLibrary()
    paintPanel()
  }

  // ── the shelf ───────────────────────────────────────────────────────────────
  // Everything about looking at a list — search, the window, the headings, the folding, the
  // tally, the empty line — belongs to web/lib/browse.js. What is ours is the ROW, the HEADING
  // and the verbs on them.
  //
  // ⚠️ THE BAR IS A SEARCH, A COUNT AND ＋, and that is the whole of it. It carried five controls:
  // a ▦/☰ switch (one layout now), a `collection` dropdown (the headings ARE that filter, and
  // folding a run is the same act with fewer parts), the `clear` that only existed to reset the
  // dropdown, and a ▶ sweep over "whatever survived the filter" — which is a set nobody can name.
  // The sweep moved onto each heading, where it means THESE, the run you are looking at.
  //
  // ⚠️ AND THE APP-WIDE ★ FILTER WAS NEVER THIS SHELF'S ANSWER — nor, it turned out, anybody's:
  // `body.starred-only` is deleted (2026-08-31, see app.css). Here the first run IS the
  // favourites, so finding them is folding the rest.
  const plus = el('button', { class: 'btn', title: 'write a new style' }, '＋ new')
  plus.addEventListener('click', () => {
    picked = null
    editing = ''
    editorNode = null
    paintPanel()
  })
  const shelf = browser({
    id: `styles:${medium}`,
    // ⚠️ THE MEDIUM'S OWN WORD, and it is not cosmetic. "Style" is right for four of the six and
    // actively confusing for the other two — a music style is an IDIOM and a voice style is a
    // PERSON — so the shelf says genres and voices where that is what they are. It arrives with
    // the fetch, hence the getter (src/styles/probe.ts `PROBE`).
    noun: () => loaded.probe?.noun ?? 'styles',
    over: sourceStrip(),
    under: askBar,
    search: (r) => `${r.style.slug} ${r.style.label ?? ''} ${r.style.positive ?? ''} `
      + `${(r.style.tags ?? []).join(' ')} ${collectionFace(r.set)}`,
    card: myRow,
    group: { of: (r) => r.set, head: myHead },
    // ⚠️ ROWS AND STYLES ARE NOT THE SAME NUMBER, because a style in two collections is two rows —
    // and the ★ run makes a starred one three. Counting rows would say `14 styles` over nine.
    //
    // ⚠️ AND IT NAMES THE MODEL, because this is ONE MODEL'S SHELF: every swatch below was shot on
    // whatever is armed in 🔌, and the same words are a different picture on a different
    // checkpoint. It used to ride on the sweep's tooltip, which went with the sweep.
    tally: (shown) => {
      const n = new Set(shown.map((r) => r.style.slug)).size
      return n ? `${n} · ${modelName(loaded.shotOn?.model)}` : ''
    },
    key: (r) => r.key,
    extra: [plus],
    // ⚠️ THE EMPTY LINE IS THE DOOR. It used to point at a library that was not in this room.
    // Pressing it flips the switch IN PLACE — it does not navigate, and it does not move your pane.
    empty: () => {
      const go = el('button', { class: 'btn mini', type: 'button' }, 'see what xoko.lat publishes')
      go.addEventListener('click', () => setSource('library'))
      return el('span', { class: 'empty-door' }, 'none here yet — ', go, ' or ＋ write one')
    },
    onOpen: (r) => {
      picked = r?.style.slug ?? null
      closeEditor()
      paintPanel()
    },
  })
  // ⚠️ THE SAME SHAPE AS xoko.lat's, deliberately (2026-08-30). Two lists at two stages of one
  // life, so the switch above them must not change what is under it: same rows, same headings,
  // one verb per run and one per row. Only the verb differs, because only the act does.
  shelf.node.classList.add('browse-rows')

  /**
   * THE RUNS — ★ favourites, then every collection, then what is filed under nothing.
   *
   * ⚠️ ONE ROW PER (RUN, STYLE), which is how xoko.lat's shelf has always been built: a style
   * belongs to every collection that names it and neither reading is the wrong one, so it is two
   * entries with two keys rather than one entry a grouping would have to fan out. The ★ run is
   * the same mechanism and nothing new — one more key, computed rather than stored.
   *
   * ⚠️ ALPHABETICAL BY NAME, not by anything the library said. A take writes slugs onto the style
   * and the order the collections were published in is not among them; inventing a sequence out
   * of whatever arrived first would be an order nobody chose.
   */
  function myRows() {
    const rows = []
    for (const st of loaded.styles) {
      if (isStarred(starKey(medium, st.slug))) rows.push({ key: `★/${st.slug}`, set: FAV, style: st })
    }
    const sets = [...new Set(loaded.styles.flatMap((st) => st.collections ?? []))]
      .sort((a, b) => collectionFace(a).localeCompare(collectionFace(b)))
    for (const c of sets) {
      for (const st of loaded.styles) {
        if ((st.collections ?? []).includes(c)) rows.push({ key: `${c}/${st.slug}`, set: c, style: st })
      }
    }
    for (const st of loaded.styles) {
      if (!(st.collections ?? []).length) rows.push({ key: `/${st.slug}`, set: NONE, style: st })
    }
    return rows
  }

  /** ★ arrives after the first paint (web/lib/shared.js), and it decides a run — so the shelf is
   *  rebuilt once when it lands, exactly as every ★ widget repaints itself. */
  starsReady.then(() => shelf.set(myRows()))

  /**
   * A HEADING: what the run is, how many, and one press for all of it.
   *
   * ⚠️ THE SWEEP LIVES HERE AND NOT ON THE BAR. On the bar it acted on "everything that survived
   * the search", which is a set with no name; on a heading it is THESE — the same sentence
   * xoko.lat's `⤓ take 4` already makes one shelf over. Missing and stale both count as behind,
   * because both are "not a picture of what this would send now".
   */
  function myHead(set, rows, { collapsed, toggle }) {
    const behind = todo(rows.map((r) => r.style))
    const missing = behind.filter((st) => !st.swatch).length
    const old = behind.length - missing
    const left = el('div', { class: 'set-name' },
      el('span', { class: 'set-fold' }, collapsed ? '▸' : '▾'),
      el('b', {}, set === FAV ? '★ favourites' : set === NONE ? 'unsorted' : collectionFace(set)),
      el('span', { class: 'muted' }, `${rows.length}`))
    const go = el('button', {
      class: `btn mini${behind.length ? ' primary' : ''}`,
      title: behind.length
        ? `${missing} missing${old ? `, ${old} shot from an older ask` : ''}`
          + ` · on ${modelName(loaded.shotOn?.model)}`
        : `every one of these is a current picture on ${modelName(loaded.shotOn?.model)}`,
    }, behind.length ? `▶ shoot ${behind.length}` : 'all shot')
    go.disabled = !behind.length
    go.addEventListener('click', (ev) => {
      ev.stopPropagation()
      void shoot(behind.map((st) => st.slug), go, `… shooting ${behind.length}`)
    })
    const node = el('div', {
      class: 'set-head',
      title: set === FAV ? 'the ones you starred — each is also under whatever collection names it'
        : set === NONE ? 'filed under nothing — ✎ edit gives one a collection'
          : '',
    }, left, go)
    node.addEventListener('click', (ev) => { if (!ev.target.closest('button')) toggle() })
    return node
  }

  // ── ⤓ THE OTHER LIST — what xoko.lat publishes for this medium ──────────────
  //
  // ⚠️ THIS IS THE ONLY DOOR NOW. Styles left 📚 (src/library/catalog.ts): that shelf is organised
  // around `needs` — can this machine run it — and a style has none, so it sat there as a permanent
  // "fine" in the one column the shelf exists for, wearing a chip you had to read to learn which
  // medium it was even for. Here the section IS the filter.
  //
  // ⚠️ ONE ROW, ONE VERB. No swatch (see above), no ★ — starring something you do not have is a key
  // nobody can ever clear, which this file already learned from deleting one.
  const reload = el('button', { class: 'btn', title: 're-ask xoko.lat' }, '⟳')
  reload.addEventListener('click', () => void loadLibrary(true))
  /**
   * THE ROWS — one per (collection, style) pair, plus one per style in none.
   *
   * ⚠️ EXPANDED HERE, NOT GROUPED IN browse.js. A style belongs to every collection that names it —
   * `soft-watercolour` is a way of putting paint on a surface AND a picture-book register, and
   * neither reading is the wrong one — so it is TWO ROWS with two keys rather than one row a
   * grouping slot would have to fan out. That keeps `group` in browse.js the simple thing it is:
   * one key per row, headings drawn when the key changes, order supplied by whoever built the list.
   *
   * ⚠️ AND THE ORDER IS THE CURATOR'S. The library publishes the styles of a collection in the
   * sequence somebody chose; nothing here re-sorts them.
   */
  function libRows() {
    const by = new Map(libLoaded.items.map((i) => [i.slug, i]))
    const rows = []
    const placed = new Set()
    for (const c of libLoaded.collections ?? []) {
      for (const slug of c.styles) {
        const item = by.get(slug)
        if (!item) continue
        placed.add(slug)
        rows.push({ key: `${c.slug}/${slug}`, set: c.slug, item })
      }
    }
    // ⚠️ AND THE ONES IN NO COLLECTION ARE A GROUP TOO, not a silence. Partial membership is an
    // ordinary state — plenty of styles are in none — and a shelf that only showed the curated
    // ones would be hiding half the library behind an editorial decision nobody made.
    for (const i of libLoaded.items) {
      if (!placed.has(i.slug)) rows.push({ key: `~/${i.slug}`, set: '', item: i })
    }
    return rows
  }

  /** Every collection a style is in — ALL of them, not the header you pressed. Written onto the
   *  style by the take, so your own shelf groups the way the shelf you took it from did. */
  const setsOf = (slug) =>
    (libLoaded.collections ?? []).filter((c) => c.styles.includes(slug)).map((c) => c.slug)

  const untaken = (rows) => rows.filter((r) => !r.item.installed && r.item.style)

  /** ⤓ SEVERAL, IN ONE REQUEST. The loop is the server's (src/library/take.ts `takeMany`) — N calls
   *  from here would each re-read the shelf they just changed, four times while you watch. */
  async function takeRows(rows, btn) {
    const todo = untaken(rows)
    if (!todo.length) return
    btn.disabled = true
    try {
      const answer = await api('/api/take', {
        what: todo.map((r) => ({ id: r.item.id, collections: setsOf(r.item.slug) })),
      })
      const failed = answer.failed ?? []
      ctx.flash(failed.length
        ? `took ${(answer.tookAll ?? []).length}, ${failed.length} did not land: ${failed[0].error}`
        : `took ${(answer.tookAll ?? []).length}`, failed.length > 0)
      await refresh()
      await loadLibrary()
      ctx.stylesChanged?.(medium)
    } catch (err) {
      ctx.flash(String(err.message || err), true)
    } finally {
      btn.disabled = false
    }
  }

  /**
   * The heading over a run of rows: what the set is, why it is one, and one press for all of it.
   *
   * ⚠️ IT FOLDS, AND THAT IS NOT DECORATION. Three collections of four is a list you read; the
   * shelf this is built for has ten of thirty, and the only way to read that is to shut the ones
   * you are not looking at. Shut is remembered per shelf, and a shut run draws its heading and
   * none of its rows (web/lib/browse.js).
   *
   * ⚠️ AND THE ONLY ⤓ THAT TAKES SEVERAL IS THIS ONE. There is no take-everything on the bar: a
   * collection is a set somebody chose and pressing it is a decision, where "all twenty-seven,
   * whatever they are" is not.
   */
  function libHead(set, rows, { collapsed, toggle }) {
    if (!(libLoaded.collections ?? []).length) return null
    const c = (libLoaded.collections ?? []).find((x) => x.slug === set)
    const left = el('div', { class: 'set-name' },
      el('span', { class: 'set-fold' }, collapsed ? '▸' : '▾'),
      el('b', {}, c?.title ?? 'everything else'),
      el('span', { class: 'muted' }, `${rows.length}`))
    const n = untaken(rows).length
    const go = el('button', {
      class: `btn mini${n ? ' primary' : ''}`,
      title: n ? 'take the ones you do not have yet' : 'you have all of these',
    }, n ? `⤓ take ${n}` : 'all taken')
    go.disabled = !n
    go.addEventListener('click', (ev) => { ev.stopPropagation(); void takeRows(rows, go) })
    // ⚠️ THE NOTE IS A TOOLTIP, NOT A PARAGRAPH. It is the reason the collection exists and it is
    // worth carrying, but a shelf in a 340px column is a place to choose from, not to read in.
    const node = el('div', {
      class: 'set-head', title: c?.note ?? 'published on its own, in no collection',
    }, left, go)
    // The whole heading is the target, minus the button standing on it.
    node.addEventListener('click', (ev) => { if (!ev.target.closest('button')) toggle() })
    return node
  }

  function libCard(row) {
    const item = row.item
    // ⚠️ A PUBLISHED STYLE THAT WILL NOT PARSE SAYS SO HERE, not by being a ⤓ that fails after the
    // press. The server runs it through this app's own reader — the same call the take makes.
    if (!item.style) {
      return styleRow({
        name: item.slug,
        note: el('p', { class: 'muted note err-note' }, item.issue),
      })
    }
    const st = item.style
    const verb = el('button', {
      class: `btn mini${item.installed ? '' : ' primary'}`,
      title: item.installed
        ? 'already yours — taking it again replaces your copy and drops its swatch'
        : 'copy this into your list',
    }, item.installed ? 'taken' : '⤓')
    verb.addEventListener('click', (ev) => { ev.stopPropagation(); void takeStyle(item, verb) })
    // ⚠️ NO THUMBNAIL AND NO ★, and both absences are the same fact: this one is not yours yet.
    // A published style has no swatch and cannot have one — shooting it is the act that makes it
    // yours — and starring something you do not have is a key nobody can ever clear.
    return styleRow({
      name: st.label ?? st.slug,
      title: item.slug,
      words: st.positive || (st.tags ?? []).join(', '),
      verb,
    })
  }

  const libShelf = browser({
    id: `styles:${medium}:library`,
    noun: () => loaded.probe?.noun ?? 'styles',
    over: sourceStrip(),
    search: (r) => `${r.item.slug} ${r.item.style?.label ?? ''} ${r.item.style?.positive ?? ''} `
      + `${(r.item.style?.tags ?? []).join(' ')} ${r.set}`,
    card: libCard,
    key: (r) => r.key,
    group: { of: (r) => r.set, head: libHead },
    extra: [reload],
    // ⚠️ ROWS AND THINGS ARE NOT THE SAME NUMBER HERE, because a style in two collections is two
    // rows. Counting rows would say `12 styles` over nine of them.
    tally: (shown) => {
      const n = new Set(shown.map((r) => r.item.slug)).size
      const sets = new Set(shown.map((r) => r.set).filter(Boolean)).size
      return n ? `${n}${sets ? ` · ${sets} collection${sets === 1 ? '' : 's'}` : ''}` : ''
    },
    // ⚠️ UNKNOWN IS NOT ZERO. A library that did not answer says so; "nothing published" is a claim
    // about the library, and making it on a failed fetch is the app pretending it looked.
    empty: () => (libLoaded.issue
      ? `xoko.lat did not answer — ${libLoaded.issue}`
      : libRead ? `nothing published for ${medium} yet` : 'reading xoko.lat…'),
    onOpen: (r) => { pickedLib = r?.item.slug ?? null; paintPanel() },
  })
  libShelf.node.classList.add('browse-rows')

  async function loadLibrary(refresh = false) {
    try {
      libLoaded = await api(`/api/library/styles/${medium}${refresh ? '?refresh=1' : ''}`)
    } catch (err) {
      libLoaded = { origin: null, items: [], at: null, issue: String(err.message || err) }
    }
    libRead = true
    libShelf.set(libRows())
  }

  async function takeStyle(item, btn) {
    btn.disabled = true
    try {
      // ⚠️ EVERY COLLECTION IT IS IN, not the header you pressed — or your shelf would group it
      // differently from where you found it.
      await api('/api/take', { what: item.id, collections: setsOf(item.slug) })
      ctx.flash(`took ${item.slug}`)
      // Both sides moved: your list has one more, and this one now says `taken` for it.
      await refresh()
      await loadLibrary()
      ctx.stylesChanged?.(medium)
    } catch (err) {
      ctx.flash(String(err.message || err), true)
      btn.disabled = false
    }
  }

  // Anything wrong with the style FILE sits above the bar: it is about the list, not about any
  // one entry, and it must not scroll away with the grid.
  const issueHost = el('div', {})
  /** GRID or ONE — the band is one narrow column, so they take turns. See the header. */
  const body = el('div', { class: 'styles-body' })
  const node = el('div', { class: 'styles-view' }, issueHost, body)

  const back = el('button', { class: 'btn mini', type: 'button', title: 'back to the list' }, '⟨ all')
  back.addEventListener('click', () => {
    picked = null
    pickedLib = null
    closeEditor()
    paintPanel()
  })

  /** Whichever half of the band is showing. Called by every verb in here; nothing else moves it. */
  function paintPanel() {
    const list = source === 'library' ? libShelf.node : shelf.node
    const open = source === 'library' ? pickedLib !== null : (picked !== null || editing !== null)
    if (!open) {
      body.replaceChildren(list)
      return
    }
    body.replaceChildren(
      el('div', { class: 'styles-back' }, back),
      detail(picked ? { slug: picked } : NEW_STYLE))
  }

  /** Which grid this is — the 🔌 band's service and armed workflow. Every read and every shoot
   *  carries it, so the page can never show a picture from an engine you are not using. */
  // ⚠️ FOR THIS MEDIUM, NOT FOR THE SECTION (2026-08-29). The band shows the image list while you
  // are standing in a chain, so `ctx.engine()` — which answers for whatever section is active —
  // would have shot image swatches on nothing at all.
  // ⚠️ AND THE WORKFLOW, NOT ONLY ITS MODEL (2026-08-29). A swatch is a press: on a graph service
  // the workflow IS the ask, and sending the checkpoint alone got back "this workflow carries no
  // graph" the first time a music style was shot.
  const where = () => {
    const e = ctx.engineFor?.(medium) ?? ctx.engine?.() ?? null
    return { inference: e?.id ?? '', model: e?.model ?? '', workflow: e?.workflow ?? '' }
  }

  // ── shooting ────────────────────────────────────────────────────────────────
  /** Queue N probes and wait for the lane to drain them. A swatch shares the one serial queue
   *  with real renders, so this watches rather than blocks. */
  async function shoot(slugs, btn, label = '…') {
    if (!slugs.length) return
    const old = btn.textContent
    btn.disabled = true
    btn.textContent = label
    try {
      const { jobIds } = await api(`/api/styles/${medium}/swatch`, { ids: slugs, ...where() })
      const left = new Set(jobIds)
      // 20 minutes of patience: a sweep of a dozen styles on a slow model is a real wait, and
      // giving up early would leave the grid claiming cells are missing while they render.
      for (let i = 0; i < 1500 && left.size; i++) {
        await new Promise((r) => setTimeout(r, 800))
        const { jobs } = await api('/api/queue')
        for (const id of [...left]) {
          const job = jobs.find((j) => j.id === id)
          if (!job || job.state === 'done' || job.state === 'failed' || job.state === 'cancelled') {
            left.delete(id)
          }
        }
        // Repaint as they land, so a sweep fills in rather than arriving all at once.
        if (i % 3 === 0) await refresh()
      }
      await refresh()
    } catch (err) {
      ctx.flash(String(err.message || err), true)
    }
    btn.disabled = false
    btn.textContent = old
  }

  // ── how one style draws ─────────────────────────────────────────────────────
  /** Is the picture on screen a picture of the sentence that would be sent now?
   *
   *  ⚠️ THE PAIR WAS ALREADY IN THE PAYLOAD AND NOTHING READ IT. `prompt` is what this swatch was
   *  actually shot from, read back off its own master; `sends` is what this model would be given
   *  today. Different means the ask moved underneath it. That is why saving a new ask no longer
   *  deletes anything — a marked picture is more useful than no picture. */
  const stale = (s) => Boolean(s.swatch && s.prompt && s.sends && s.prompt !== s.sends.prompt)

  /**
   * A CLIP SHOWING FRAME ONE — 🎬's whole presentation, and it is the image case.
   *
   * ⚠️ A STYLE HERE IS A TECHNIQUE AND A TECHNIQUE READS IN ONE FRAME. Nothing in the style
   * vocabulary describes motion — no style says "slow dolly" — so the grid can be the same square
   * grid 🖼 uses, which is what makes "what does this look do on my image engine vs my video
   * engine" a question you can answer by looking. `preload="metadata"` paints the first frame for
   * free; hovering plays it, for the same reason a thumbnail exists at all.
   */
  function clip(s, cls) {
    const v = el('video', {
      class: cls, src: s.swatch, muted: '', playsinline: '', loop: '', preload: 'metadata',
    })
    v.addEventListener('mouseenter', () => void v.play().catch(() => {}))
    v.addEventListener('mouseleave', () => { v.pause(); v.currentTime = 0 })
    return v
  }

  /** THE PICTURE SLOT, whatever this medium's picture is: a swatch, a ▶, a first frame, a ⬡.
   *  Small on a row and larger in an ⓘ head, same node either way — recognise, not judge.
   *
   *  ⚠️ THIS IS WHY THE LAYOUT SWITCH COULD GO. Audio opened as a table because a square with a ▶
   *  in the middle of it compares nothing; in a row the ▶ is simply what this medium's thumbnail
   *  is, and all six media draw the same row. */
  function swatchThumb(s) {
    if (!s.swatch) return thumb(null)
    if (HEARD.has(medium)) {
      return el('div', { class: 'browse-thumb' },
        playButton(s.swatch, 'play this swatch — press again to stop'))
    }
    if (medium === 'video') return el('div', { class: 'browse-thumb' }, clip(s, 'browse-video'))
    // ⚠️ 🧊 HAS NO PREVIEW AND DOES NOT PRETEND TO. A `.glb` is not something a browser draws, and
    // an <img> pointed at one is a broken box — the mistake the gallery's PLAYER map made once.
    if (medium === 'model3d') return el('div', { class: 'browse-thumb' }, el('span', { class: 'muted' }, '⬡'))
    return thumb(s.swatch)
  }

  /**
   * ONE STYLE, AS A ROW: the swatch small, the name, the words under it, and what the picture
   * cost at the right.
   *
   * ⚠️ THE THUMB IS SMALLER THAN AN ⓘ HEAD'S, and the two sizes are not an accident. 64px is the
   * size you CONFIRM at — you have already picked, and the head is telling you which one. This is
   * the size you SCAN at: eighteen on screen in a dock rather than six, on a surface whose job is
   * "find the one called bossa nova". The picture you actually judge is one ⤢ away.
   *
   * ⚠️ AND A FAILURE READS BETTER HERE THAN IT DID ON A TILE. The engine's own words go in the
   * line the style's words would have been in, instead of eighty characters set inside a square.
   */
  function myRow(r) {
    const st = r.style
    const roll = el('button', {
      class: 'btn mini row-verb',
      title: st.swatch ? 'shoot this swatch again' : 'shoot a swatch for this style',
    }, 'shoot')
    roll.addEventListener('click', (ev) => { ev.stopPropagation(); void shoot([st.slug], roll) })
    return styleRow({
      thumbNode: swatchThumb(st),
      name: st.label ?? st.slug,
      title: st.slug,
      words: st.error || st.positive || (st.tags ?? []).join(', '),
      bad: Boolean(st.error),
      meta: [
        // ⚠️ A STALE CELL IS MARKED, NOT HIDDEN. It is still the best picture of this style there
        // is; what it is not is a picture of the CURRENT ask.
        stale(st)
          ? el('span', { class: 'row-stale', title: 'shot from a different ask — shoot it again' }, '⟳')
          : null,
        // "3s each or 40s each" is the whole question before pressing ▶ on a run of twenty, and it
        // is a fact about this model as much as about this style.
        st.tookMs != null ? el('span', { class: 'browse-took' }, took(st.tookMs)) : null,
        // ⚠️ STARRING MOVES THE ROW, so this one rebuilds the shelf rather than repainting a
        // glyph: ★ is the first run here and the first group in every ⚙ picker for this medium,
        // and a style that just joined it has to appear in both.
        starWidget(starKey(medium, st.slug), () => { shelf.set(myRows()); ctx.stylesChanged?.(medium) }),
      ],
      verb: roll,
    })
  }

  function paint() {
    shelf.set(myRows())
    fillAsk()
    issueHost.replaceChildren(
      ...loaded.issues.map((i) => el('p', { class: 'muted note err-note' }, i)))
    paintPanel()
  }

  /** What a sweep would actually shoot: the cells with no picture, plus the ones whose picture is
   *  of an older ask. Both are "not current", and offering only the empty ones is what made
   *  editing the ask feel destructive — the alternative to deleting them is counting them. */
  const todo = (shown) => shown.filter((s) => !s.swatch || stale(s))

  // ── the editor, in ⓘ ────────────────────────────────────────────────────────
  // ⚠️ A STYLE HAS TWO WORD CHANNELS AND ONLY ONE OF THEM REACHES ANY GIVEN MODEL — `positive`
  // for a prose engine (FLUX's T5), `tags` for a tag one (SDXL's CLIP). Both boxes are always
  // shown, because saving REPLACES the entry and a hidden field is a deleted field. But the one
  // this grid's model does not read is labelled as such, and the composed sentence is printed
  // under them. Without that, typing "photorealistic" into `words`, pressing shoot on SDXL, and
  // getting a byte-identical picture back looks like a broken button rather than a channel you
  // were not writing to.
  const field = (label, control, note = null) => el('label', { class: 'style-row' },
    el('span', { class: 'muted' }, label,
      note ? el('em', { class: `field-note${note.live ? ' live' : ''}` }, note.text) : null),
    control)

  /**
   * WHAT A STYLE SENDS THAT IS NOT WORDS — a genre's tempo and key, a voice's description and its
   * pinned seed (src/jobs/generate.ts `styleParams`).
   *
   * ⚠️ IT IS MOST OF THE STYLE ON HALF THE MEDIA AND IT WAS INVISIBLE. The box printed one composed
   * sentence, which on 🎼 left out the two numbers that make a genre that genre — publish the words
   * alone and every genre comes back at the graph's own 120bpm in C major, which is the one thing
   * that makes them all sound the same.
   */
  const sentParams = (params) => {
    const rows = Object.entries(params ?? {})
    if (!rows.length) return null
    return el('div', { class: 'chips' },
      ...rows.sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => chip(`${k} ${v}`, 'tag')))
  }

  /** Which of the two word boxes this grid's model reads — and, for the other one, who does.
   *  `idiom` is a MODEL fact, so this is only ever true of the model in the 🔌 band. */
  function channelNote(channel) {
    const idiom = loaded.shotOn?.idiom
    if (!idiom) return null
    const live = idiom === (channel === 'tags' ? 'tags' : 'prose')
    return live
      ? { text: '← read', live: true }
      : { text: `— not read by ${modelName(loaded.shotOn?.model)}`, live: false }
  }

  function closeEditor() {
    editing = null
    editorNode = null
  }

  /**
   * One compact panel: the fields, the axes, one save.
   *
   * ⚠️ EVERY FIELD OF A STYLE IS HERE. Saving REPLACES the entry, so a field the form does not
   * show is a field the save deletes — that is why `tags` and `label` are rows and not hidden
   * conveniences. (A style carries both `tags` and `positive` because the engine's `idiom` cap
   * decides which one reaches the prompt.)
   */
  function editor(base) {
    const isNew = !base
    const slug = el('input', {
      type: 'text', class: 'path-input', spellcheck: 'false',
      value: base?.slug ?? '', placeholder: 'ink-linework',
    })
    const label = el('input', { type: 'text', class: 'path-input', value: base?.label ?? '' })
    // ⚠️ OPEN, AND THE ONLY AXIS (2026-08-30). This was a `category` select over three image
    // techniques the app declared — a taxonomy compiled into the app, which is the app owning
    // content, and empty for five of the six media. A collection is a name somebody chose; if
    // `painted` is worth a run, `painted` is a collection. Empty is normal and lands in `unsorted`.
    const sets = el('input', {
      type: 'text', class: 'path-input', spellcheck: 'false',
      placeholder: 'picture book, painted',
      title: 'the runs this style is filed under, comma separated — any names you like',
      value: (base?.collections ?? []).map(collectionFace).join(', '),
    })
    const positive = el('textarea', { rows: '3', spellcheck: 'false' }, base?.positive ?? '')
    // ⚠️ `{prompt}` is WHERE THE ASK GOES, and it is the single most useful thing to know about
    // this box on a tag model — a medium word in FRONT of the ask is structural, the same word
    // trailing is decoration. Invisible unless the box says so, so the box says so.
    const word = loaded.probe?.word ?? 'ask'
    const tags = el('textarea', {
      rows: '2', spellcheck: 'false',
      placeholder: 'line art drawing, {prompt}, black ink, hatched shadows',
      title: `{prompt} marks where the ${word} goes — put the medium word before it`,
    }, (base?.tags ?? []).join(', '))
    const negative = el('input', { type: 'text', class: 'path-input', value: base?.negative ?? '' })

    // Click-to-append goes to whichever box you were last in — the words for a prose engine, the
    // tags for a tag one. Defaulting to the words is right because that is where you start.
    let target = positive
    for (const box of [positive, tags]) box.addEventListener('focus', () => { target = box })
    const append = (word) => {
      const cur = target.value.trim()
      target.value = cur ? `${cur.replace(/,\s*$/, '')}, ${word}` : word
      target.focus()
    }

    /** The entry these boxes describe. ONE builder, used by the preview and by the save — a
     *  preview of a different object than the one that gets stored is worse than no preview. */
    const draft = () => ({
      slug: slug.value.trim(),
      ...(label.value.trim() ? { label: label.value.trim() } : {}),
      ...(asCollections(sets.value).length ? { collections: asCollections(sets.value) } : {}),
      ...(positive.value.trim() ? { positive: positive.value.trim() } : {}),
      ...(asTags(tags.value).length ? { tags: asTags(tags.value) } : {}),
      ...(negative.value.trim() ? { negative: negative.value.trim() } : {}),
    })

    const save = el('button', { class: 'btn primary' }, '💾 save & shoot')
    save.addEventListener('click', async () => {
      save.disabled = true
      try {
        const style = draft()
        loaded = await api(`/api/styles/${medium}`, { style, ...where() })
        // The server dropped the old swatch, because the words it was a picture of are gone.
        // Shooting the new one IS the rest of the save — an edited style with a stale picture is
        // the exact lie this page exists to not tell.
        ctx.flash(`saved ${style.slug}`)
        picked = style.slug
        closeEditor()
        paint()
        // The ⚙ row in every section reads the same list — a style you just wrote has to be
        // selectable without a reload.
        ctx.stylesChanged?.(medium)
        await shoot([style.slug], save)
      } catch (err) {
        ctx.flash(String(err.message || err), true)
        save.disabled = false
      }
    })

    // ── what this draft would actually send ───────────────────────────────────
    // ⚠️ COMPOSED BY THE SERVER, by the same function a render calls. Assembling it here would
    // be a second answer to "how is a prompt built", and the first time the two drifted this box
    // would be confidently showing a sentence nothing ever renders.
    const sendPrompt = el('p', { class: 'prompt-text' }, '…')
    const sendAvoid = el('p', { class: 'prompt-text muted' })
    const sendNote = el('span', { class: 'muted' })
    const sendParams = el('div', {})
    const sends = el('div', { class: 'style-sends' },
      el('div', { class: 'sends-head' },
        el('span', { class: 'muted' }, `sends to ${modelName(loaded.shotOn?.model)}`), sendNote),
      sendPrompt, sendAvoid, sendParams)

    let pending = null
    async function refreshSends() {
      try {
        const p = await api(`/api/styles/${medium}/preview`, { style: draft(), ...where() })
        sendPrompt.textContent = p.prompt
        sendAvoid.textContent = p.negative ? `avoid: ${p.negative}` : ''
        sendParams.replaceChildren(...[sentParams(p.params)].filter(Boolean))
        // The channel is the answer to "why did nothing change". Named out loud, every time —
        // and on a medium whose style goes to a channel of its own there is no box to name, which
        // is why `reads` is null there rather than a third word for the same idea.
        sendNote.textContent = p.reads === 'tags' ? '· from tags'
          : p.reads === 'positive' ? '· from words'
            : Object.keys(p.params ?? {}).length ? '· as settings, not words'
              : '· this style adds nothing'
        sendNote.classList.remove('err-note')
      } catch (err) {
        sendPrompt.textContent = ''
        sendAvoid.textContent = ''
        sendParams.replaceChildren()
        sendNote.textContent = String(err.message || err)
        sendNote.classList.add('err-note')
      }
    }
    // Debounced, because it is one round trip per keystroke otherwise — and no faster than the
    // eye, which is the only consumer.
    const bumpSends = () => {
      clearTimeout(pending)
      pending = setTimeout(() => void refreshSends(), 250)
    }
    for (const box of [slug, label, sets, positive, tags, negative]) {
      box.addEventListener('input', bumpSends)
      box.addEventListener('change', bumpSends)
    }
    void refreshSends()

    const axes = (loaded.axes ?? []).length
      ? el('details', { class: 'style-axes' },
        el('summary', {}, 'style axes — examples'),
        ...loaded.axes.map((a) => el('div', { class: 'axis-row' },
          el('span', { class: 'axis-name muted' }, a.name),
          el('span', { class: 'axis-words' }, ...a.examples.map((w) => {
            const b = el('button', { class: 'axis-word', type: 'button', title: `add "${w}"` }, w)
            b.addEventListener('click', () => append(w))
            return b
          })))))
      : null

    return el('div', { class: 'detail style-editor' },
      el('div', { class: 'engine-head' }, el('b', {}, isNew ? 'new style' : `edit ${base.slug}`)),
      isNew ? field('slug', slug) : null,
      field('name', label),
      field('collections', sets),
      field('words', positive, channelNote('positive')),
      field('tags', tags, channelNote('tags')),
      field('avoid', negative, loaded.shotOn?.negatives === false
        ? { text: `— ${modelName(loaded.shotOn?.model)} has no negative channel` }
        : { text: '← read', live: true }),
      sends,
      axes,
      el('div', { class: 'row-actions' }, save,
        el('button', {
          class: 'btn',
          onclick: () => { closeEditor(); paintPanel() },
        }, 'cancel')))
  }

  /** THE ONE YOU PICKED — facts, words, four verbs. Read rarely and browsed never, which is why
   *  they are here and not on every card. */
  function detail(sel) {
    if (editing !== null) {
      editorNode ??= editor(editing === '' ? null : editing)
      return editorNode
    }
    // ⚠️ ONE RENDERER, TWO VERB SETS. A published style is the same shape as a taken one minus the
    // things only this machine can produce — so it is read as a style with no swatch, no sends and
    // no timing, and every `s.swatch ? … : null` below already draws it correctly. What changes is
    // the row of verbs at the bottom and the ★, which belongs to something you have.
    const item = source === 'library'
      ? libLoaded.items.find((x) => x.slug === pickedLib) ?? null
      : null
    const s = item
      ? (item.style && { ...item.style, swatch: null, sends: null, tookMs: null, error: null })
      : (sel && sel !== NEW_STYLE ? loaded.styles.find((x) => x.slug === sel.slug) : null)
    if (!s) return el('p', { class: 'empty' }, item?.issue ?? 'pick a style')
    const shoot1 = el('button', { class: 'btn' }, '▶ shoot')
    shoot1.addEventListener('click', () => void shoot([s.slug], shoot1))
    const take1 = el('button', {
      class: `btn${item?.installed ? '' : ' primary'}`,
      title: item?.installed
        ? 'already yours — taking it again replaces your copy and drops its swatch'
        : 'copy this into your list',
    }, item?.installed ? '⤓ take again' : '⤓ take')
    if (item) take1.addEventListener('click', () => void takeStyle(item, take1))
    return el('div', { class: 'detail style-detail' },
      // ⚠️ STACKED, LIKE EVERY OTHER HEAD WITH A PICTURE IN IT (2026-09-04). This carried a note
      // arguing for a thumbnail over a hero, on the reasoning that the grid you picked from is
      // right there. The reasoning held while every head in the app was a row; the head stacks
      // now wherever there is something to look at, and a swatch is exactly that — so a shelf
      // whose whole subject is how something LOOKS gets the width to show it.
      detailHead(swatchThumb(s), s.label ?? s.slug, {
        // The same star as the row's, and it moves the same two lists — you are as likely to
        // decide something is a favourite while reading it as while scanning past it.
        extra: item ? [] : [starWidget(starKey(medium, s.slug), () => {
          shelf.set(myRows())
          ctx.stylesChanged?.(medium)
        })],
        stack: true,
      }),
      el('p', { class: 'muted band-note' }, [
        s.slug,
        item ? (item.installed ? 'on xoko.lat · already yours' : 'on xoko.lat') : null,
        item?.added ? `published ${item.added.slice(0, 10)}` : null,
        // Which runs it is under — on both sides, because on yours it is what the take wrote and
        // on theirs it is what you would get. The library's own title where there is one, because
        // over there it published one; the slug, read, on yours (see `collectionFace`).
        ...(item
          ? setsOf(s.slug).map((c) => (libLoaded.collections ?? []).find((x) => x.slug === c)?.title ?? c)
          : (s.collections ?? []).map(collectionFace)),
        s.swatch ? `shot on ${modelName(loaded.shotOn?.model)}` : null,
        s.tookMs != null ? `took ${took(s.tookMs)}` : null,
        s.error ? '✗ did not render on this model' : null,
      ].filter(Boolean).join(' · ')),
      s.positive ? el('p', {}, s.positive) : null,
      // ⚠️ TWO SENTENCES, AND THE PAIR IS THE POINT. `sends` is what this model would be given
      // NOW — composed server-side, with the channel it read named — and `prompt` is what the
      // picture on screen was actually made from, read back off its own embedded record and never
      // re-composed. Equal means the swatch is current. Different means it is stale, which is a
      // thing you can only see by being shown both.
      s.sends
        ? el('div', { class: 'style-sends' },
          el('div', { class: 'sends-head' },
            el('span', { class: 'muted' }, `sends to ${modelName(loaded.shotOn?.model)}`),
            el('span', { class: 'muted' }, s.sends.reads === 'tags' ? '· from tags'
              : s.sends.reads === 'positive' ? '· from words' : '· adds nothing')),
          el('p', { class: 'prompt-text' }, s.sends.prompt),
          s.sends.negative ? el('p', { class: 'prompt-text muted' }, `avoid: ${s.sends.negative}`) : null,
          sentParams(s.sends.params),
          stale(s)
            ? el('p', { class: 'muted note err-note' }, '⟳ shot from a different ask — shoot it again')
            : null)
        : null,
      stale(s)
        ? el('details', { class: 'style-prompt' },
          el('summary', {}, 'what the one on screen was made from'),
          el('p', { class: 'muted prompt-text' }, s.prompt))
        : null,
      s.tags?.length ? el('div', { class: 'chips' }, ...s.tags.map((x) => chip(x, 'tag'))) : null,
      s.negative ? el('p', { class: 'muted note' }, `avoid: ${s.negative}`) : null,
      s.error ? el('p', { class: 'muted note err-note' }, s.error) : null,
      // ⚠️ THE VERB SET IS THE ONE THING THAT BRANCHES. Over on xoko.lat there is nothing to shoot,
      // nothing to open full size, and nothing of yours to edit or delete — there is one act, and
      // it is the act that makes the other four possible.
      item ? el('div', { class: 'row-actions' }, take1) : el('div', { class: 'row-actions' },
        shoot1,
        // The thumbnail above says WHICH one; this is "let me actually look at it" — the same
        // verb, in the same place, as the media feed's ⓘ.
        s.swatch
          ? el('button', {
            class: 'btn', title: 'open this swatch at full size',
            onclick: () => window.open(s.swatch, '_blank'),
          }, '⤢ full size')
          : null,
        el('button', {
          class: 'btn',
          onclick: () => { editing = s; editorNode = null; paintPanel() },
        }, '✎ edit'),
        el('button', {
          class: 'btn danger',
          onclick: async (ev) => {
            ev.currentTarget.disabled = true
            try {
              loaded = await api(`/api/styles/${medium}/delete`, { slug: s.slug, ...where() })
              ctx.flash(`deleted ${s.slug}`)
              picked = null
              paint()
              ctx.stylesChanged?.(medium)
            } catch (err) {
              ctx.flash(String(err.message || err), true)
              ev.currentTarget.disabled = false
            }
          },
        }, '🗑')))
  }

  async function refresh() {
    const w = where()
    try {
      loaded = await api(`/api/styles/${medium}?inference=${encodeURIComponent(w.inference)}`
        + `&model=${encodeURIComponent(w.model)}&workflow=${encodeURIComponent(w.workflow)}`)
    } catch (err) {
      ctx.flash(`could not read the ${medium} styles: ${err.message}`, true)
    }
    paint()
  }

  paint()
  return {
    node,
    refresh,
    /** Open the band ON one style — what a chain style's `uses` chip presses through. */
    pick: (slug) => { if (slug) { picked = slug; closeEditor(); paintPanel() } },
    list: () => loaded.styles,
    /** The armed workflow for THIS medium IS this grid's column — switching it changes every cell. */
    engineChanged: () => { void refresh() },
  }
}

/**
 * 🧩 A COMPOSITION'S OWN STYLE LIST — the 🎨 band's first scope inside a chain.
 *
 * ⚠️ NOT A GRID, AND NOT BECAUSE IT WAS EASIER. A media style is a LOOK and the only honest way to
 * browse looks is to look at them, which is what the swatch grid is for. A chain style is a set of
 * decisions — what it says to the writing, and which media style it names per medium — and it has
 * NO cheap probe, because probing it is running the chain. So it is a list you read, and what it
 * shows instead of a picture is the thing it names, which is already rendered on the medium's own
 * grid one chip along.
 *
 * ⚠️ AND IT NEVER SHOWS THE MEDIA STYLES THEMSELVES. `uses` is slugs; the words behind them are one
 * scope over, in the medium that owns them. A second copy here would be a second place for
 * `ink-linework` to say something different.
 *
 * @param ctx    the band context
 * @param slug   the composition
 * @param media  the media its steps make — the rows the editor offers, derived by the section
 */
export function compStylesView(ctx, slug, media) {
  let loaded = { composition: slug, styles: [], issues: [] }
  let picked = null
  let editing = null
  let editorNode = null
  /** medium → that medium's styles, for the editor's selects. Fetched with the list. */
  const lists = {}

  const body = el('div', { class: 'styles-body' })
  const node = el('div', { class: 'styles-view' }, body)
  const back = el('button', { class: 'btn mini', type: 'button', title: 'back to the list' }, '⟨ all')
  back.addEventListener('click', () => { picked = null; editing = null; editorNode = null; paintPanel() })

  const nameOf = (s) => s.label ?? s.slug
  const styleKey = (x) => `style:comp:${slug}:${x}`

  /** What a media style is called on this machine, or the slug and a warning when it is not here
   *  yet. ⚠️ NOT AN ERROR: a chain style naming a style you have not taken is the ordinary order
   *  things arrive from 📚 in, and the fix is one ⤓ away. */
  function usedFace(medium, want) {
    const has = (lists[medium] ?? []).find((x) => x.slug === want)
    return has ? (has.label ?? has.slug) : `${want} — not taken yet`
  }

  const usesRow = (s) => el('div', { class: 'chips' },
    ...Object.entries(s.uses ?? {}).map(([m, want]) =>
      chip(`${m} · ${usedFace(m, want)}`, (lists[m] ?? []).some((x) => x.slug === want) ? 'tag' : 'ghost')))

  function row(s) {
    const b = el('button', { class: `pick-row${s.slug === picked ? ' on' : ''}`, type: 'button' },
      el('div', { class: 'pick-row-head' },
        el('b', {}, nameOf(s)), starWidget(styleKey(s.slug))),
      s.says ? el('p', { class: 'muted one-line' }, s.says) : null,
      usesRow(s))
    b.addEventListener('click', () => { picked = s.slug; editing = null; editorNode = null; paintPanel() })
    return b
  }

  /**
   * The editor: the words, and one select per medium the chain makes.
   *
   * ⚠️ EVERY FIELD IS HERE, because a save REPLACES the entry — the same rule the media editor
   * keeps. A medium whose select is on "—" is left out of `uses` rather than stored empty.
   */
  function editor(base) {
    const isNew = !base
    const slugIn = el('input', {
      type: 'text', class: 'path-input', spellcheck: 'false',
      value: base?.slug ?? '', placeholder: 'noir-picture-book',
    })
    const label = el('input', { type: 'text', class: 'path-input', value: base?.label ?? '' })
    const says = el('textarea', {
      rows: '4', spellcheck: 'false',
      placeholder: 'wry, second person. captions under eight words.',
      title: 'handed to every text step of this chain, under what the step already asks for',
    }, base?.says ?? '')
    const notes = el('input', { type: 'text', class: 'path-input', value: base?.notes ?? '' })

    const picks = media.map((m) => {
      const sel = select([])
      sel.replaceChildren(
        el('option', { value: '' }, (lists[m] ?? []).length ? '—' : '— 📚 has more'),
        ...[...(lists[m] ?? [])].sort((a, b) => nameOf(a).localeCompare(nameOf(b)))
          .map((x) => el('option', { value: x.slug }, nameOf(x))))
      sel.value = base?.uses?.[m] ?? ''
      return { medium: m, sel }
    })

    const draft = () => ({
      slug: slugIn.value.trim(),
      ...(label.value.trim() ? { label: label.value.trim() } : {}),
      ...(notes.value.trim() ? { notes: notes.value.trim() } : {}),
      ...(says.value.trim() ? { says: says.value.trim() } : {}),
      ...(picks.some((p) => p.sel.value)
        ? { uses: Object.fromEntries(picks.filter((p) => p.sel.value).map((p) => [p.medium, p.sel.value])) }
        : {}),
    })

    const save = el('button', { class: 'btn primary' }, '💾 save')
    save.addEventListener('click', async () => {
      save.disabled = true
      try {
        const style = draft()
        loaded = await api(`/api/styles/comp/${slug}`, { style })
        ctx.flash(`saved ${style.slug}`)
        picked = style.slug
        editing = null
        editorNode = null
        paintPanel()
        ctx.stylesChanged?.(`comp:${slug}`)
      } catch (err) {
        ctx.flash(String(err.message || err), true)
        save.disabled = false
      }
    })

    const field = (name, control, note = '') => el('label', { class: 'style-row' },
      el('span', { class: 'muted' }, name, note ? el('em', { class: 'field-note' }, note) : null),
      control)

    return el('div', { class: 'detail style-editor' },
      el('div', { class: 'engine-head' }, el('b', {}, isNew ? 'new chain style' : `edit ${base.slug}`)),
      isNew ? field('slug', slugIn) : null,
      field('name', label),
      field('says', says, '→ xoko'),
      ...picks.map((p) => field(p.medium, p.sel, '→ that step')),
      field('about', notes),
      el('div', { class: 'row-actions' }, save,
        el('button', {
          class: 'btn',
          onclick: () => { editing = null; editorNode = null; paintPanel() },
        }, 'cancel')))
  }

  function detail(s) {
    return el('div', { class: 'detail style-detail' },
      el('div', { class: 'engine-head' }, el('b', {}, nameOf(s)), starWidget(styleKey(s.slug))),
      el('p', { class: 'muted band-note' }, s.slug),
      s.notes ? el('p', {}, s.notes) : null,
      s.says
        ? el('div', { class: 'style-sends' },
          el('div', { class: 'sends-head' }, el('span', { class: 'muted' }, 'says to xoko')),
          el('p', { class: 'prompt-text' }, s.says))
        : null,
      // ⚠️ A LINK, NOT A COPY. Pressing one takes you to that medium's own list with it selected —
      // "what does noir picture book actually mean for the music" answered by going and looking,
      // which is the whole reason the scope strip is one press away.
      Object.keys(s.uses ?? {}).length
        ? el('div', { class: 'chips' }, ...Object.entries(s.uses).map(([m, want]) => {
          const b = el('button', { class: 'chip pick', type: 'button', title: `see the ${m} style` }, `${m} · ${usedFace(m, want)}`)
          b.addEventListener('click', () => ctx.openStyles?.(m, want))
          return b
        }))
        : el('p', { class: 'muted' }, 'names no media style — this one only shapes the words'),
      el('div', { class: 'row-actions' },
        el('button', {
          class: 'btn',
          onclick: () => { editing = s; editorNode = null; paintPanel() },
        }, '✎ edit'),
        el('button', {
          class: 'btn danger',
          onclick: async (ev) => {
            ev.currentTarget.disabled = true
            try {
              loaded = await api(`/api/styles/comp/${slug}/delete`, { slug: s.slug })
              ctx.flash(`deleted ${s.slug}`)
              picked = null
              paintPanel()
              ctx.stylesChanged?.(`comp:${slug}`)
            } catch (err) {
              ctx.flash(String(err.message || err), true)
              ev.currentTarget.disabled = false
            }
          },
        }, '🗑')))
  }

  const plus = el('button', { class: 'btn mini', type: 'button' }, '＋ new')
  plus.addEventListener('click', () => { picked = null; editing = ''; editorNode = null; paintPanel() })

  function paintPanel() {
    if (editing !== null) {
      editorNode ??= editor(editing === '' ? null : editing)
      body.replaceChildren(el('div', { class: 'styles-back' }, back), editorNode)
      return
    }
    const one = picked ? loaded.styles.find((s) => s.slug === picked) : null
    if (one) {
      body.replaceChildren(el('div', { class: 'styles-back' }, back), detail(one))
      return
    }
    body.replaceChildren(
      // ⚠️ ＋ EXISTS HERE AND NOT ON THE MEDIA LIST, and the difference is real. A media style is a
      // LOOK, and a blank form you hand-type comma-tags into is the one authoring shape we know
      // does not survive a model change — its door is ✨ xoko. A chain style is two decisions and a
      // sentence, both of which you already know before you open anything.
      el('div', { class: 'list-head' },
        el('span', { class: 'muted' }, `${loaded.styles.length || 'no'} chain style${loaded.styles.length === 1 ? '' : 's'}`),
        el('span', { class: 'spacer' }), plus),
      ...loaded.issues.map((i) => el('p', { class: 'muted note err-note' }, i)),
      ...(loaded.styles.length
        ? [...loaded.styles].sort((a, b) => nameOf(a).localeCompare(nameOf(b))).map(row)
        : [el('p', { class: 'empty' }, 'none yet — ＋ writes one, and it sets every step at once')]))
  }

  async function refresh() {
    try {
      loaded = await api(`/api/styles/comp/${slug}`)
    } catch (err) {
      ctx.flash(`could not read ${slug}'s styles: ${err.message}`, true)
    }
    // The media lists behind `uses` — read for the labels and for the editor's selects.
    await Promise.all(media.map(async (m) => {
      try { lists[m] = (await api(`/api/styles/${m}`)).styles ?? [] } catch { lists[m] = [] }
    }))
    paintPanel()
  }

  paintPanel()
  return { node, refresh, list: () => loaded.styles, engineChanged: () => {} }
}
