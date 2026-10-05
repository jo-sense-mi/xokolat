// browse.js — HOW A LIST OF THINGS IS LOOKED AT. One filter bar, one ▦/☰ switch, one window, for
// every shelf in this app: styles, images, songs, compositions, packs.
//
// ⚠️ WHY THIS EXISTS. The styles page grew its own filter bar, then its own category headings, and
// the media feed had a third answer of its own (sheet · runs). Every section that will ever ship
// here shows a list of things you filter and scan, so that belongs in ONE place.
//
// ⚠️ A SHELF DECLARES DATA — NEVER A CARD AND NEVER A STYLESHEET. The tile, the thumbnail, the
// bar, the switch, the sorting, the window and the empty line are all here. A section supplies its
// items, its facets, its columns and the SLOTS of a tile (`tile()` below). The first cut of this
// file left "the card is the medium's own", which sounded like flexibility and was really two
// copies of one component — see the note on `tile`.
//
// ⚠️ TWO VIEWS, NOT "VIEWS". ▦ grid compares LOOKS, ☰ table compares WORDS AND NUMBERS. That is
// the whole choice. `sheet`/`runs` — a second axis about GROUPING wearing the clothes of a view —
// is gone (DECISIONS.md, 2026-08-05): a group is a FACT about an asset and rides on the item as a
// chip and a column, never as a layout.
//
// ⚠️ NO SIZE CONTROL. It only ever traded pixels for pixels, and a control nobody has a preference
// about is a thing to maintain and a thing to be wrong about. One tile size, one thumb size, both
// picked to read well; "see it properly" is the selection detail's job.
//
// ⚠️ BUILT FOR THE FULL LIBRARY, NOT FOR TODAY'S. Design for thousands of assets on a phone, not
// for the handful on disk during development. Concretely:
//   · the DOM holds a WINDOW, never the whole list — the first wall is node count, and nothing
//     about markup or columns helps with it;
//   · filtering and sorting are DATA operations feeding that window, never DOM operations, which
//     is also what will let them move server-side without touching a call site;
//   · facet options are rebuilt when the DATA changes, never on a keystroke;
//   · the search is debounced.
// The remaining wall is the API: an endpoint that ships an entire index is the real ceiling, and
// that is a server change, not a table library.

import { el, took as tookText } from './launch-kit.js?v=129'

/** One tile size, fixed. Big enough to judge a look, small enough that a screen holds a dozen. */
export const TILE = 190
/** The table's thumbnail. Big enough to recognise a picture you have seen, not to judge one. */
export const THUMB = 64

/**
 * THE TILE. One card shape for every ▦ grid in this app — a picture, an optional badge, an
 * optional hover action, and a footer of label · took · ★.
 *
 * ⚠️ WHY IT IS HERE AND NOT WITH EACH SECTION. It used to be two: `.media-cell` in the media feed
 * and `.swatch-card` on the styles page. They differed in exactly three things — the aspect, one
 * hover button, and the order of the footer — and duplicated everything else, including two CSS
 * blocks saying "bordered box, hover accent, selected accent". That split had already cost real
 * behaviour: `.media-cell` never got a `.sel` rule, so selecting an image looked like nothing
 * happened, and it never got `width: 100%`, so a landscape render overflowed its tile. A shelf
 * declares its DATA — never a card and never a stylesheet.
 *
 * @param art     the picture (or a `.browse-blank` for missing / failed). Required.
 * @param aspect  `1` for a uniform square grid (a probe swatch is always square); omit and the
 *                picture keeps its own ratio (a render is 9:16 or 16:9 and cropping it lies).
 * @param badge   `{ text, title }` — a fact about this one item, in the corner of the picture.
 * @param action  a <button> the caller wired. Sits on the picture, quiet until you hover.
 * @param label   WHAT TELLS THIS ONE APART FROM THE ONES BESIDE IT — which is not one fixed
 *                field. A card standing on its own is told apart by its name; a card that is one
 *                of several engines answering ONE ask is told apart by the engine, because every
 *                card in that group carries the same name. See `mediaFace` (web/lib/gallery.js).
 * @param hint    the label's tooltip, when there is more to say than the label says.
 * @param took    milliseconds. On the SCANNING surface, not only in ⓘ: a 4-step engine against a
 *                28-step one is a 7× difference and that is worth seeing without clicking — which
 *                is an argument about COMPARISON, so it is drawn where a comparison is happening.
 * @param star    a `starWidget(key)` node — the key's shape is the section's business.
 */
export function tile({
  art, aspect = null, badge = null, action = null,
  label = '', hint = null, took = null, star = null,
} = {}) {
  if (action) action.classList.add('browse-action')
  return el('div', { class: 'browse-card' },
    el('div', { class: `browse-art${aspect === 1 ? ' square' : ''}` },
      art,
      badge ? el('span', { class: 'browse-badge', title: badge.title ?? '' }, badge.text) : null,
      action),
    el('div', { class: 'browse-foot' },
      el('span', { class: 'browse-label', title: hint ?? label }, label),
      took != null ? el('span', { class: 'browse-took' }, tookText(took)) : null,
      star))
}

/** A thumbnail — the same picture at the size you RECOGNISE rather than judge at. One size, used
 *  by every ☰ table's first column AND by every ⓘ band's head (`detailHead`). Here rather than
 *  with any one section, because "what does a small picture of a thing look like" has one answer. */
/** ⚠️ `blank` IS WHAT STANDS THERE WHEN THERE IS NO PICTURE, and a caller that knows what it is
 *  showing should say so — the same rule `detailArt` keeps. The default ◻ means "an asset whose
 *  master no browser draws". */
export const thumb = (src, { blank = '◻' } = {}) => el('div', { class: 'browse-thumb' },
  src ? el('img', { src, alt: '', loading: 'lazy' }) : el('span', { class: 'muted blank-glyph' }, blank))

/**
 * THE ⓘ HEAD'S PICTURE — one box, one size, every medium.
 *
 * ⚠️ IT WAS FULL-WIDTH FOR A DAY AND THAT WAS WRONG (2026-09-04). Giving the picture the band's
 * whole width made a 9:16 render dominate the pane and pushed everything that EXPLAINS it below
 * the fold — and it could not be consistent, because a mesh viewer and a player are not pictures
 * and would not follow. The head is a thumbnail on top with the name under it, at the same size
 * whatever the medium is, so ⓘ has one shape. Judging the look is what the feed and ⤢ are for.
 */
/** ⚠️ `blank` IS WHAT STANDS THERE WHEN THERE IS NOTHING TO LOOK AT, and a caller that knows what
 *  it is showing should say so — a run of a chain that wrote words has no picture and is not a
 *  missing one. The default ◻ means "an asset whose master no browser draws". */
export const detailArt = (src, { blank = '◻' } = {}) => el('div', { class: 'detail-art' },
  src ? el('img', { src, alt: '' }) : el('span', { class: 'muted blank-glyph' }, blank))

/**
 * THE HEAD OF AN ⓘ BAND: the thing itself, its name, and whatever the section puts beside it.
 *
 * ⚠️ IT STACKS WHERE THERE IS SOMETHING TO LOOK AT (2026-09-04). It was always a row: a 64px
 * thumbnail with the name beside it, in a band about 320px wide. That picture is not a picture,
 * it is a receipt — too small to judge anything by, while four fifths of the pane's width went to
 * a name that needed a third of it. Stacked, the picture gets the whole width and the name reads
 * as its caption. It also unsqueezes 🎼 and 🗣, whose head is a player with a timeline that was
 * competing with the title for the same row.
 *
 * ⚠️ AND IT STAYS A ROW WHERE THE "PICTURE" IS A GLYPH. 📚 lists things you do not have yet: an
 * icon over a title is a card pretending to be a photograph. Stack when there is something to
 * look at — which is a fact the caller knows and this cannot guess.
 */
export const detailHead = (art, title, { extra = [], stack = false } = {}) =>
  el('div', { class: `detail-head${stack ? ' stack' : ''}` },
    art,
    // ⚠️ A NODE IS A NAME YOU CAN EDIT. Most heads are read-only and pass a string; a media asset
    // passes an <input>, because renaming a run is a field edit and the head is where the name is
    // (web/lib/asset-detail.js). One head either way — the alternative was a second head.
    title instanceof Node
      ? el('div', { class: 'detail-title' }, title)
      : el('b', { class: 'detail-title', title }, title),
    ...extra)

/** How many items enter the DOM at once, and how many more each time you near the end. */
const WINDOW = 60

const stored = (key, dflt) => { try { return localStorage.getItem(key) ?? dflt } catch { return dflt } }
const remember = (key, v) => { try { localStorage.setItem(key, v) } catch { /* private mode */ } }

/**
 * The bar: search · facets · the section's own verbs · ▦/☰ · tally.
 *
 * Facets are `{ key, label, of(item), group? }`. Their options are derived from the items in hand
 * rather than declared, so a facet can never offer a value nothing has. An optional `group(item)`
 * nests them under a heading — see `fill()` for why that replaces a second dropdown.
 */
export function filterBar({ noun = 'items', facets = [], extra = [], controls = [] } = {}) {
  // ⚠️ `noun` MAY BE A FUNCTION, because a shelf can be told what it holds after it is built —
  // 🎨's list is called styles, genres or voices depending on the medium, and that word arrives
  // with the first fetch. A getter here beats a second copy of the vocabulary in the caller.
  const nounOf = () => (typeof noun === 'function' ? noun() : noun)
  const q = el('input', { type: 'search', placeholder: `search ${nounOf()}…`, class: 'song-q' })
  const cols = facets.map((f) => {
    const node = el('select', {})
    return { ...f, node, wrap: el('label', { class: 'ff' }, el('span', { class: 'muted' }, f.label), node) }
  })
  const tally = el('span', { class: 'muted song-tally' })
  // ⚠️ NO `clear` (2026-08-31). It reset the search box and every dropdown at once, and it was
  // already conditional on there BEING a facet — which is the tell: it earned its width only when
  // two filters happened to be set at the same time, and cost it on every shelf with any facet at
  // all. Everything it did is already one press elsewhere. The search field is `type="search"` and
  // nothing here strips `appearance`, so it keeps its own ✕ in all three engines this app ships
  // against (WKWebView · WebView2 · WebKitGTK), and clicking it fires `input` like a keystroke.
  // Every facet carries `all` at the top of its list, and `fill` hides a facet whose data cannot
  // offer a real choice — so a filter you set is a filter you can unset where you set it.
  const listeners = []
  const fire = () => { for (const fn of listeners) fn() }

  const node = el('div', { class: 'feed-filters' },
    q, ...cols.map((c) => c.wrap), ...extra, ...controls, tally)

  // ⚠️ DEBOUNCED. At ten thousand items a keystroke that re-filters, re-sorts and repaints
  // synchronously is a keystroke you feel. At nine it costs nothing to have done it right.
  let timer = null
  q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(fire, 120) })
  for (const c of cols) c.node.addEventListener('change', fire)

  return {
    node,
    tally,
    /** The current word, and the search box relabelled to match. Called from `paint`. */
    noun() {
      const word = nounOf()
      if (q.placeholder !== `search ${word}…`) q.placeholder = `search ${word}…`
      return word
    },
    onChange: (fn) => listeners.push(fn),
    /** Rebuild the facet options from what is actually here. Called when the DATA changes, never
     *  on a keystroke: at scale this is the expensive half of a repaint. A pick that still exists
     *  survives; one that does not is dropped rather than left filtering everything away. */
    fill(items) {
      for (const col of cols) {
        const keep = col.node.value
        // ⚠️ A FACET MAY DECLARE A `group`, and then its options nest under it. This is what lets
        // ONE control replace a pair where the second was a refinement of the first: an engine
        // belongs to exactly one service, so two dropdowns could express `service=A` +
        // `engine=of-B` — a contradiction the UI offered and the data can never satisfy. Nested,
        // that state does not exist, and the outer term becomes what it always was: a label.
        const groups = new Map()
        for (const i of items) {
          // ⚠️ A FACET MAY BE `many`, because a thing can be in more than one of something. A style
          // belongs to every collection that names it and neither reading is the wrong one; a
          // single-valued facet would have to pick one and would then filter the other away.
          const vs = col.many ? (col.of(i) ?? []) : [col.of(i)]
          const g = col.group ? String(col.group(i) ?? '') : ''
          for (const v of vs) {
            if (!v) continue
            if (!groups.has(g)) groups.set(g, new Set())
            groups.get(g).add(String(v))
          }
        }
        const rows = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
        const values = rows.flatMap(([, set]) => [...set])
        const opt = (v) => el('option', { value: v }, v)
        const grouped = rows.length > 1 || !!rows[0]?.[0]
        col.node.replaceChildren(el('option', { value: '' }, 'all'),
          // One unnamed group is not a grouping — a facet with no `group` is the flat list it was.
          ...(grouped
            ? rows.map(([g, set]) => el('optgroup', { label: g || 'other' }, ...[...set].sort().map(opt)))
            : [...(rows[0]?.[1] ?? [])].sort().map(opt)))
        if (values.includes(keep)) col.node.value = keep
        // ⚠️ A FACET WITH ONE ANSWER IS NOT A CONTROL. `all` over nothing cannot change the page,
        // which is the same rule that keeps ▦/☰ off a shelf with no columns — and the rule that
        // finished off `clear`. It appears the moment the data gives it something to say.
        col.wrap.hidden = values.length < 2
      }
    },
    /** The FACET test only — the free-text one is the caller's, because only it knows what its
     *  item is made of. */
    matches(item) {
      for (const col of cols) {
        if (!col.node.value) continue
        if (col.many) {
          if (!(col.of(item) ?? []).map(String).includes(col.node.value)) return false
        } else if (String(col.of(item) ?? '') !== col.node.value) return false
      }
      return true
    },
    term: () => q.value.trim().toLowerCase(),
  }
}

/**
 * THE SHELF. A flat list of things, filtered, sorted, and drawn a window at a time.
 *
 * @param id       localStorage namespace — layout and sort are remembered per shelf
 * @param noun     plural, for the search placeholder and the tally. A function is called on every
 *                 paint, for a shelf whose word arrives with its data.
 * @param facets   [{ key, label, of(item), group?, many? }] — the dropdowns (`group` nests the
 *                 options; `many` means `of` returns a LIST and the item matches any of them)
 * @param search   (item) => string — the free-text haystack
 * @param card     (item) => Node — the ▦ tile. Required.
 * @param columns  [{ key, label, cell(item), of?(item), sort?, width? }] — the ☰ table. Omit it
 *                 and there is no toggle: a section with nothing to tabulate does not get a
 *                 control that does nothing. `sort: true` sorts on `of`; a function is a
 *                 comparator. `width` is a CSS grid track (`4.5em`, `minmax(0, 2fr)`); the shelf
 *                 composes them into one template, so a column is declared once and the header
 *                 and every row line up by construction.
 *
 *                 ⚠️⚠️ EVERY WIDTH MUST BE CONTENT-INDEPENDENT — NO `auto`, NO `min-content`, NO
 *                 `max-content`, AND NO OMITTING IT (2026-09-04, and this was THE alignment bug).
 *                 A row is its own grid container; the header is another. They share a TEMPLATE,
 *                 not a grid — so a content-sized track is measured separately in every row, and
 *                 in the header it is measured against an EMPTY cell. `width: 'auto'` on the ⓘ
 *                 and ★ columns therefore collapsed to 0 in the header and stood at 22px and 18px
 *                 in the rows, and every header label sat 40px to the left of the column it
 *                 names: `asset` printed above the thumbnails, `name` above the asset column, and
 *                 so on down the row. Nothing about the column LIST was wrong, which is why
 *                 checking that the header and the rows draw the same columns kept coming back
 *                 clean. Fixed lengths, percentages and `fr`/`minmax()` with a fixed minimum all
 *                 resolve identically in an empty cell and a full one; those are the only widths
 *                 a column may use.
 * @param key      (item) => string — a stable id, so a selection survives a repaint
 * @param onOpen   (item|null) => void — a click that was not on a control inside the item
 * @param onShow   () => void — the ⓘ DOOR. Declare it and every item grows a small ⓘ in its
 *                 corner, quiet until you hover, that selects the item AND asks for the panel;
 *                 double-clicking an item does the same. Omit it and neither exists — a shelf
 *                 whose selection has nowhere to be read does not get a control pointing there.
 * @param onPaint  (shown) => void — a section's own controls follow the FILTER, not the whole list
 * @param group    `{ of(item), head(key, members, { collapsed, toggle }) }` — draws a heading over
 *                 each run. ⚠️ ONE KEY PER ITEM, and the ORDER IS THE CALLER'S: a group is
 *                 contiguous because the list arrives that way, not because this file re-sorts it.
 *                 A thing that belongs under two headings is TWO ENTRIES with different keys —
 *                 which is what `key` is for, and what keeps this slot from having to grow a
 *                 fan-out nothing else needs. Every group folds: `toggle()` shuts it, the set is
 *                 remembered per shelf, and a shut run costs one heading rather than its rows.
 * @param tally    `(shown, items) => string | null` — replaces the count beside the bar, for a
 *                 shelf whose rows and whose things are not the same number.
 * @param over     a node pinned directly OVER the bar — the shelf's outermost switch, the thing
 *                 that changes what everything below it IS. ❖ puts `mine · xoko.lat` there.
 * @param under    a node pinned directly UNDER the bar — a second row that belongs to the shelf
 *                 rather than to the page. 🎨 puts the probe ask there: the sentence every swatch
 *                 below is judged on, which has to stay in reach while you scroll the grid it
 *                 made. Omit it and the head is the bar alone, exactly as before.
 */
export function browser({
  id, noun = 'items', facets = [], search = () => '', card, columns = null, extra = [],
  empty = '', key = null, onOpen = null, onShow = null, onPaint = null, layout: prefer = 'grid',
  over = null, under = null, group = null, tally = null, mark = null,
} = {}) {
  /**
   * ⚠️ ▦/☰ IS ONE ANSWER FOR THE WHOLE APP, NOT ONE PER SHELF (2026-09-04). The key was
   * `xokolat:<shelf>:layout`, so choosing ☰ in 🖼 and then walking to 🎼 or a composition put you
   * back in ▦ — the app changing the shape of what you were reading because you changed subject.
   * It is not a fact about the shelf; it is how this person reads. One key, every shelf.
   *
   * The section's own `layout` still seeds the FIRST run, and only that: 🗣/🎼 open as a list
   * because a song has no look to compare, 📚 does because it is rows of words. The moment you
   * press either glyph, that press is the answer everywhere.
   */
  const LAYOUT_KEY = 'xokolat:layout'
  const SORT_KEY = `xokolat:${id}:sort`

  let items = []
  let shown = []
  // ⚠️ WHAT SURVIVED THE SEARCH AND THE FACETS, BEFORE FOLDING. `shown` is what is DRAWN, and the
  // two stopped being the same thing the day a group could be shut. Everything that answers "is
  // there anything here" has to ask this one: folding hides rows, it does not remove them.
  let matched = []
  let drawn = 0            // how many of `shown` are in the DOM
  let cursor = 0           // how far into `plan` the window has been filled
  let selected = ''
  // ⚠️ THE PLAN, NOT A KEY WATCHED WHILE APPENDING. A collapsed group draws its HEADING and none
  // of its rows, so a heading cannot be something noticed when the key changes between two rows —
  // there are no rows. `recompute` lays out headings and rows in one ordered array and `extend`
  // walks a window of it, which is also what keeps a collapsed shelf from drawing what it is hiding.
  let plan = []
  const COLLAPSED_KEY = `xokolat:${id}:collapsed`
  const collapsed = new Set((() => {
    try { return JSON.parse(stored(COLLAPSED_KEY, '[]')) } catch { return [] }
  })())
  // ⚠️ WHICH VIEW A SHELF OPENS IN IS THE SHELF'S OWN ANSWER — until you have given one
  // (2026-08-16, narrowed 2026-09-04). ▦ compares LOOKS, and a shelf whose things have no picture
  // — 📚 the library is rows of words, numbers and a verb — has nothing to compare that way. So
  // `prefer` decides where a first-time reader lands, and the stored answer above decides
  // everywhere after that. A shelf with no columns has no choice to make and is always a grid.
  let layout = columns ? stored(LAYOUT_KEY, prefer) : 'grid'
  if (layout !== 'table') layout = 'grid'
  let sort = (() => {
    try { return JSON.parse(stored(SORT_KEY, 'null')) } catch { return null }
  })()

  // ── the ▦/☰ switch ──────────────────────────────────────────────────────────
  const seg = el('div', { class: 'wb-seg', role: 'tablist' })
  const paintSeg = () => seg.replaceChildren(...[
    ['grid', '▦', 'a grid of pictures — compare looks'],
    ['table', '☰', 'a table — compare words and numbers'],
  ].map(([value, icon, title]) => {
    const b = el('button', { class: `seg${layout === value ? ' active' : ''}`, type: 'button', title }, icon)
    b.addEventListener('click', () => {
      if (layout === value) return
      layout = value
      remember(LAYOUT_KEY, value)
      paintSeg()
      paint()
    })
    return b
  }))
  if (columns) paintSeg()

  const bar = filterBar({ noun, facets, extra, controls: columns ? [seg] : [] })
  const body = el('div', { class: 'browse-body' })
  // ⚠️ THE WINDOW'S EDGE. An observer on a sentinel rather than a scroll handler: it fires once
  // when the end comes into view instead of on every pixel, and it works the same in the grid and
  // in the table without either having to know a row height.
  const sentinel = el('div', { class: 'browse-more muted' })
  // ⚠️ ONE STICKY HEAD, NOT TWO STICKY SIBLINGS. A second `position: sticky` row would have to
  // know the first one's height to offset itself, and the filter bar WRAPS — so that number does
  // not exist. The head owns the pin and the edge bleed; the rows inside it are plain.
  // ⚠️ `over` AND `under` GO INSIDE THE ONE HEAD, never beside it. Two sticky siblings would each
  // have to know the other's height, and the bar wraps — see the note above.
  const head = over || under
    ? el('div', { class: 'browse-head' }, over, bar.node, under)
    : bar.node
  const node = el('div', { class: 'browse' }, head, body, sentinel)

  const observer = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting) && drawn < shown.length) extend()
  }, { rootMargin: '600px' })
  observer.observe(sentinel)

  // ── data → what is on screen ────────────────────────────────────────────────
  const idOf = (item) => (key ? key(item) : String(item?.slug ?? item?.path ?? ''))

  function compare(a, b) {
    const col = (columns ?? []).find((c) => c.key === sort.key)
    if (!col?.sort) return 0
    const dir = sort.dir === 'desc' ? -1 : 1
    if (typeof col.sort === 'function') return col.sort(a, b) * dir
    const x = col.of?.(a)
    const y = col.of?.(b)
    // Nothing sorts LAST in both directions — an absent value is not a small one, and a table
    // that floats every un-rendered swatch to the top when you sort by cost is answering a
    // question nobody asked.
    if (x == null && y == null) return 0
    if (x == null) return 1
    if (y == null) return -1
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir
    return String(x).localeCompare(String(y)) * dir
  }

  function recompute() {
    const term = bar.term()
    const found = items.filter((i) => bar.matches(i)
      && (!term || String(search(i) ?? '').toLowerCase().includes(term)))
    const ordered = sort ? [...found].sort(compare) : found
    matched = ordered
    if (!group) {
      shown = ordered
      plan = ordered.map((item) => ({ item }))
      return
    }
    // ⚠️ THE RUNS ARE CONTIGUOUS BECAUSE THE CALLER BUILT THEM THAT WAY — see the `group` doc. This
    // walks, it does not re-sort: re-grouping here would silently reorder a shelf somebody ordered.
    shown = []
    plan = []
    let at = null
    for (const item of ordered) {
      const k = group.of(item)
      if (!at || at.key !== k) {
        at = { key: k, members: [] }
        plan.push({ head: at })
      }
      at.members.push(item)
      if (!collapsed.has(k)) { plan.push({ item }); shown.push(item) }
    }
  }

  /** Fold a run shut, and remember it. The set is remembered per shelf, like the layout and sort. */
  function toggle(k) {
    if (collapsed.has(k)) collapsed.delete(k)
    else collapsed.add(k)
    remember(COLLAPSED_KEY, JSON.stringify([...collapsed]))
    paint()
  }

  // ── drawing ─────────────────────────────────────────────────────────────────

  /** Every control that lives INSIDE an item — ★, a player, a link, a button — acts on that item;
   *  none of them is a selection, or pressing play would move the ⓘ band. */
  const isControl = (t) => t.closest('.star, .rating, .votes, .player, audio, button, input, a, summary')

  /** Paint the selection ring wherever it belongs now. The ring is a class on the drawn rows, so
   *  it is set here rather than by a repaint — selecting must never rebuild a windowed shelf. */
  function ring() {
    for (const n of body.querySelectorAll('.browse-item')) {
      n.classList.toggle('sel', n.dataset.id === selected)
    }
  }

  /** SELECT ONE ITEM OUTRIGHT — no toggle, unlike the plain click, because the ⓘ door means
   *  "show me this one" and never "put that away". */
  function choose(item) {
    selected = idOf(item)
    ring()
    onOpen?.(item)
    onShow?.(item)
  }

  /**
   * ⓘ — THE DOOR TO WHAT THIS ONE IS. One button, two homes: a column at the head of a ☰ row, an
   * overlay in the corner of a ▦ card. Same press either way.
   */
  function door(item) {
    const b = el('button', {
      class: 'browse-open', type: 'button', title: 'show what this is (ⓘ)',
      'aria-label': 'show details',
    }, 'ⓘ')
    // No `stopPropagation`: the row's click handler already ignores anything inside a button, so
    // the row cannot toggle underneath this — one rule, kept in one place.
    b.addEventListener('click', () => choose(item))
    return b
  }

  /**
   * THE COLUMNS AS DRAWN — the caller's, with the ⓘ door added at the head.
   *
   * ⚠️ THE SHELF ADDS IT, NOT THE SECTION. It began as an overlay pinned to the right edge of a
   * row, which put it over whatever column happened to end there — the length of a song, the date
   * of a render. A leading column covers nothing, lands at the same x in every row of every shelf,
   * and sits where the eye starts. It is also where the card's overlay sits, so the door is in the
   * same relative place in both layouts.
   */
  // 22px is the button, exactly — see the width rule above: an `auto` here is 0 in the header.
  const DOOR_COL = { key: 'open', label: '', width: '22px', cell: door }
  const tableCols = () => (onShow && columns ? [DOOR_COL, ...columns] : columns)

  function draw(item) {
    const inner = layout === 'table' && columns
      ? el('div', { class: 'browse-tr' },
        ...tableCols().map((c) => el('div', { class: `browse-td col-${c.key}` }, c.cell(item))))
      : card(item)
    inner.dataset.id = idOf(item)
    /**
     * ⚠️ ONE WORD A SHELF MAY WRITE ON A ROW, AND THIS FILE NEVER READS IT. `mark` answers "is
     * this one a different KIND of thing" for shelves where one is — 📚's chain-that-makes-chains
     * is the first — and it lands as `data-mark` so a stylesheet can say what that looks like.
     *
     * Here rather than in `card` or a column because it has to reach BOTH LAYOUTS: a fact about
     * the item is not a fact about whether you are reading it as a tile or as a row, and marking
     * it in two places is how the two get to disagree. Absent when there is nothing to say, so a
     * selector cannot half-match an empty string.
     */
    const said = mark?.(item)
    if (said) inner.dataset.mark = said
    inner.classList.add('browse-item')
    inner.classList.toggle('sel', idOf(item) === selected)
    inner.addEventListener('click', (ev) => {
      if (isControl(ev.target)) return
      selected = selected === idOf(item) ? '' : idOf(item)
      ring()
      onOpen?.(selected ? item : null)
    })
    // ▦ — the same door, pinned to the corner of the card. The table gets it as a column above.
    if (onShow && !(layout === 'table' && columns)) inner.append(door(item))
    return inner
  }

  function header() {
    return el('div', { class: 'browse-tr browse-th' }, ...tableCols().map((c) => {
      const on = sort?.key === c.key
      const cell = el('div', {
        class: `browse-td col-${c.key}${c.sort ? ' sortable' : ''}${on ? ' sorted' : ''}`,
        title: c.sort ? `sort by ${c.label || c.key}` : '',
      }, c.label ?? '', on ? el('span', { class: 'sort-arrow' }, sort.dir === 'desc' ? '▾' : '▴') : null)
      if (c.sort) {
        cell.addEventListener('click', () => {
          sort = on && sort.dir === 'asc' ? { key: c.key, dir: 'desc' } : { key: c.key, dir: 'asc' }
          remember(SORT_KEY, JSON.stringify(sort))
          paint()
        })
      }
      return cell
    }))
  }

  /** Add the next slice to the DOM. APPENDS — never rebuilds what is already drawn, which is what
   *  keeps scrolling a long shelf from getting slower the further down you go. */
  function extend() {
    const into = body.querySelector('.browse-items')
    if (!into) return
    // A window of ROWS. Headings ride along free — a run of five collapsed groups is five headings,
    // not five windows spent drawing nothing.
    let added = 0
    while (cursor < plan.length && added < WINDOW) {
      const step = plan[cursor++]
      if (step.head) {
        const k = step.head.key
        const node = group.head(k, step.head.members,
          { collapsed: collapsed.has(k), toggle: () => toggle(k) })
        if (node) {
          node.classList.add('browse-group')
          node.classList.toggle('shut', collapsed.has(k))
          into.append(node)
        }
        continue
      }
      into.append(draw(step.item))
      added++
      drawn++
    }
    sentinel.textContent = drawn < shown.length ? `… ${shown.length - drawn} more` : ''
  }

  function paint() {
    recompute()
    drawn = 0
    cursor = 0
    const word = bar.noun()
    bar.tally.textContent = tally
      ? (tally(matched, items) ?? '')
      : matched.length
        ? `${matched.length}${matched.length === items.length ? '' : ` of ${items.length}`} ${word}`
        : ''
    // ⚠️ `matched`, NOT `shown`. Folding every group empties `shown` while the shelf is still full,
    // and this said "no styles match the filters" over nine styles and three headings.
    if (!matched.length) {
      sentinel.textContent = ''
      body.replaceChildren(el('p', { class: 'empty' },
        items.length ? `no ${word} match the filters`
          : (typeof empty === 'function' ? empty() : empty)))
    } else {
      const asTable = layout === 'table' && columns
      if (asTable) {
        // ⚠️ THE FALLBACK IS A LENGTH, NOT `auto`. A column that forgot to declare a width used to
        // get a content-sized track, which is the one thing a per-row grid cannot align.
        node.style.setProperty('--cols', tableCols().map((c) => c.width ?? '6em').join(' '))
      }
      // ⚠️ THE HEADER LIVES IN THE SAME BOX AS THE ROWS. It was a sibling of the container they
      // sit in, so the two lined up only for as long as those boxes stayed exactly the same
      // width — a padding, a border or a scrollbar on one of them would have shifted every
      // column against its header, silently. Same parent, same width, nothing to keep in step.
      const items = el('div',
        { class: asTable ? 'browse-items browse-table' : 'browse-items browse-grid' })
      if (asTable) items.append(header())
      body.replaceChildren(items)
      extend()
    }
    // A repaint drops nodes; a selection that filtering removed has to be let go of too. But a
    // FOLD is not a filter — what you picked is still on this shelf, one press of its heading
    // away — so this asks `matched`, not what happens to be drawn.
    if (selected && !matched.some((i) => idOf(i) === selected)) {
      selected = ''
      onOpen?.(null)
    }
    onPaint?.(shown)
  }

  bar.onChange(paint)

  /** ⚠️ THE APP-WIDE ANSWER, RE-READ. A section is built once and kept, so a shelf that existed
   *  before you pressed ☰ somewhere else is holding the old value in a local. Every shelf takes
   *  the stored answer again whenever its data arrives, which is what makes one key actually mean
   *  one view — otherwise it would only apply to shelves you had not visited yet. */
  function adoptLayout() {
    if (!columns) return
    const want = stored(LAYOUT_KEY, prefer) === 'table' ? 'table' : 'grid'
    if (want === layout) return
    layout = want
    paintSeg()
  }

  return {
    node,
    /** New DATA. Facets are rebuilt here and only here. */
    set(next) {
      items = next ?? []
      adoptLayout()
      bar.fill(items)
      paint()
    },
    /** What is on screen right now — a sweep acts on what you can see, not on the whole list. */
    shown: () => shown,
    /** Redraw with the same data (a star changed, a selection moved). */
    refresh: paint,
    select: (value) => { selected = value ?? ''; paint() },
  }
}
