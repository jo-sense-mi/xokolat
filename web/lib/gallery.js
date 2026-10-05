// gallery.js — the media feed, for every visual medium (🖼 images · 🗣 voices · 🧊 3D · 🎼 music).
//
// ⚠️ IT IS A `browser()` (web/lib/browse.js) AND NOTHING ELSE NOW. It used to own a filter bar, a
// tile-size control, two layouts, a tile and a thumbnail; all five were answers to questions every
// shelf in this app asks, so they moved. What is left here is the only thing genuinely the media
// feed's: turning the index's RUN-shaped data into a flat list of assets.
//
// ⚠️ THE TILE IS `browse.tile`, NOT THIS FILE'S. It lived here, and the styles page — which has
// nothing to do with a media feed — imported it, which is how you know it was in the wrong house.
// One card shape, one CSS family, declared once (web/lib/browse.js).
//
// ⚠️ NO `sheet` / `runs` VIEWS (removed 2026-08-05). They were a second axis — about GROUPING —
// wearing the clothes of a view, and the app now has exactly one: ▦ grid or ☰ table. A run is a
// FACT about an asset, so it rides ON the asset: the ask is its search text and a table column,
// and "one ask, N engines" is a badge on the tile rather than a framed block around it. Nothing is
// lost — the ⓘ band has always been where an asset's own story is told — and what is gained is
// that a thousand renders read as a thousand pictures instead of a thousand headed bands.
//
// ⚠️ FLAT IS ALSO WHAT SCALES. A grouped feed cannot be windowed without deciding what half a
// group means; a flat list of assets can, and the window is what keeps a real library usable on a
// phone.

import { browser, thumb } from './browse.js?v=129'
import { el, href, took } from './launch-kit.js?v=129'
import { starWidget } from './shared.js?v=129'
import { playButton } from './deck.js?v=129'

export const when = (iso) => (iso ? String(iso).slice(0, 16).replace('T', ' ') : '')

/** The checkpoint's filename, as a name — the extension is on every one of them and tells you
 *  nothing about which one this is. */
const modelName = (a) => a.gen?.model?.replace(/\.(ckpt|safetensors)$/, '') ?? null

/**
 * WHAT A CARD SAYS UNDER ITS PICTURE — the label, its tooltip, and whether a duration belongs.
 *
 * ⚠️ IT WAS THE MODEL, ON EVERY CARD (2026-09-04). Which on a shelf that runs one checkpoint is
 * the same word forty times: a footer that distinguishes nothing, using the one line a card has.
 *
 * The rule is not "show the name instead" — it is that **the label is whatever tells this card
 * apart from the ones beside it**, and that is not one fixed field:
 *
 *   alone in the feed        → the NAME. The same word the ☰ table shows, so one thing has one
 *                              name in both views.
 *   one of several answers   → the ENGINE, and how long it took. Every card in a ⧉ group carries
 *      to one ask              the same name, so the name is the useless field there and the
 *                              engine is the entire point of the comparison.
 *
 * Nothing new is stored: `siblings` is already on the asset — it is what draws the ⧉ badge.
 */
export function mediaFace(a) {
  const engine = a.gen?.workflow ?? modelName(a) ?? a.inference ?? ''
  const name = a.group?.title ?? a.group?.slug ?? ''
  const many = a.siblings > 1
  return {
    label: many ? engine : name,
    // The other one, plus the ask — what a card cannot say in one line and ⓘ says in full.
    hint: [many ? name : engine, a.group?.ask].filter(Boolean).join('\n'),
    took: many ? (a.gen?.durationMs ?? null) : null,
  }
}

/**
 * THE ☰ ROW, FOR EVERY MEDIUM — the table's answer to `tile()`.
 *
 * ⚠️ IT WAS FOUR HAND-WRITTEN COPIES, AND THEY DRIFTED (2026-09-04). 🖼, 🗣/🎼/🧊 and 🧩 each
 * declared their own list of columns, which were the same list wearing different labels — and
 * `made` had come to mean a DATE on one shelf and a COUNT of assets on another. Same header,
 * different fact, and nothing on screen to say so. One row shape, declared once, is the same rule
 * the card family already keeps.
 *
 * The order, and why:
 *
 *   ⓘ · asset · name · ★ · engine · [length] · made · took
 *
 * ⚠️ THE NAME, NEVER THE ASK. 🖼's first column was the generation prompt entire. 🗣/🎼 had this
 * exact bug fixed in August — "a list of forty songs whose first column all begin 'cinematic
 * orchestral, wide reverb…' is a list you cannot scan" — and the fix never reached images, where
 * the prompts are longer. The ask is a hover away and whole in ⓘ, which is where a paragraph
 * belongs; the column holds what tells two rows apart.
 *
 * ⚠️ THE LEAD IS THE MEDIUM'S OWN HANDLE. A picture where there is one, ▶ where there is a sound.
 * That preserves the August reasoning — a 64px square is a picture's way of saying "this one",
 * and a column of forty identical glyphs says nothing — without making a song's table a different
 * SHAPE from a render's: both lead with the one control that gets you to the thing itself.
 *
 * ⚠️ AND THE ENGINE COLUMN NAMES THE WORKFLOW. The workflow is what you pressed and what you would
 * press again; the checkpoint file is the tooltip. 🗣/🎼's CARD already said the workflow while its
 * own table said the model — one shelf disagreeing with itself about what "engine" means.
 *
 * @param sound  this medium plays rather than draws — ▶ leads, and `length` joins the numbers
 * @param icon   the medium's glyph, for an asset no browser draws (a .glb)
 */
export function mediaColumns({ sound = false, icon = '◻' } = {}) {
  return [
    sound
      ? {
        key: 'face', label: 'asset', width: '4.5em',
        cell: (a) => playButton(href(a.master), `play ${a.group?.title ?? a.group?.slug ?? 'it'}`),
      }
      : {
        key: 'face', label: 'asset', width: 'var(--thumb)',
        // A still if one was kept, the master when a browser draws it, the medium's glyph
        // otherwise — never a player, which is what the ▶ column is for.
        cell: (a) => (a.preview || (a.group?.player ?? 'img') === 'img'
          ? thumb(href(a.preview ?? a.master))
          : el('div', { class: 'browse-thumb browse-face' }, el('span', {}, icon))),
      },
    {
      key: 'name',
      label: 'name',
      // ⚠️ 3fr WAS THREE TIMES THE ENGINE COLUMN, and it looked it (2026-09-04). A run's name is
      // `titleFrom()` — a first clause, capped at 42 characters — so a column sized to take three
      // quarters of the slack is a column that is mostly gap. 1.6fr against the engine's 1fr is
      // the proportion the content actually has.
      width: 'minmax(0, 1.6fr)',
      of: (a) => a.group?.title ?? a.group?.slug ?? '',
      sort: true,
      // ⚠️ THE CELL IS THE NAME AND NOTHING ELSE. A ⧉N chip rode along inside it, which made this
      // the one cell in the table that was a flex box with two children instead of a line of text
      // — and a cell built differently from its neighbours lines up with them only by accident.
      // The count is the CARD's badge and nothing else now: it is a fact about a run, it is blank
      // on almost every row, and it does not earn a column between the asset and its name.
      cell: (a) => el('span', { title: a.group?.ask ?? '' }, a.group?.title ?? a.group?.slug ?? ''),
    },
    // ⚠️ 18px IS THE BUTTON, and it is a number rather than `auto` for the reason written out in
    // browse.js: a content-sized track is measured per row, and the header's cell here is empty.
    {
      key: 'star', label: '', width: '18px',
      cell: (a) => (a.ratingKey ? starWidget(a.ratingKey) : el('span', {})),
    },
    {
      key: 'engine',
      label: 'engine',
      width: 'minmax(8em, 1fr)',
      of: (a) => a.gen?.workflow ?? a.gen?.model ?? a.inference,
      sort: true,
      cell: (a) => el('span', { class: 'muted', title: modelName(a) ?? '' },
        a.gen?.workflow ?? modelName(a) ?? a.inference),
    },
    // ⚠️ HOW LONG IT PLAYS — read out of the file at index time (src/content/audio.ts), and NOT
    // `took`, which is how long the render took. Both are times about the same file and they are
    // nothing like each other: two minutes of music took seven minutes to make.
    ...(sound
      ? [{
        key: 'length', label: 'length', width: '5em',
        of: (a) => a.seconds ?? null,
        sort: true,
        cell: (a) => el('span', { class: 'browse-took' }, took(a.seconds == null ? null : a.seconds * 1000)),
      }]
      : []),
    {
      key: 'when',
      label: 'made',
      width: '10em',
      of: (a) => a.gen?.createdAt ?? a.group?.createdAt ?? null,
      sort: true,
      cell: (a) => el('span', { class: 'muted' }, when(a.gen?.createdAt ?? a.group?.createdAt)),
    },
    // Sorting by this across a whole library is how you find out what an engine really costs.
    {
      key: 'took',
      label: 'took',
      width: '4.5em',
      of: (a) => a.gen?.durationMs ?? null,
      sort: true,
      cell: (a) => el('span', { class: 'browse-took' }, took(a.gen?.durationMs ?? null)),
    },
  ]
}

/**
 * @param ctx     the section context (needs .manifest())
 * @param medium  which manifest.media rows to show
 * @param noun    plural, for the tally and the empty line ("images", "songs")
 * @param facets  [{ key, label, of(asset) }] — categorical dropdowns
 * @param search  (asset) => string — the free-text haystack
 * @param cell    (asset) => Node — one asset's tile, built with `browse.tile`
 * @param columns the ☰ table (web/lib/browse.js). Omit and the medium is grid-only.
 * @param extra   the section's own controls, in the bar
 * @param onPick  (asset|null, group|null) => void
 * @param empty   the line shown when the medium has made nothing yet
 * @param layout  which view this medium OPENS in (the user's last choice still wins). ▦ compares
 *                LOOKS, which is the whole of what a picture is and none of what a song is — see
 *                `browse.js`. A medium with nothing to look at opens as a list.
 */
export function mediaGallery(ctx, {
  medium, noun, facets = [], search = () => '', cell, columns = null, extra = [],
  onPick = null, empty = '', layout = 'grid',
}) {
  /**
   * The index is RUN-shaped — a group is one ask, its cells are the engines that answered it —
   * and this is the ONE place that shape is flattened. Every asset keeps a reference to its
   * group, so a column, a badge or the ⓘ band can say what it was part of without a layout
   * having to.
   */
  const assets = () => (ctx.manifest().media ?? [])
    .filter((g) => g.medium === medium)
    .flatMap((g) => g.cells.map((c) => ({ ...c, group: g, siblings: g.cells.length })))

  const shelf = browser({
    id: `media:${medium}`,
    noun,
    facets,
    search,
    card: cell,
    columns,
    extra,
    empty,
    layout,
    key: (a) => a.path,
    onOpen: (a) => onPick?.(a ?? null, a?.group ?? null),
    // ⚠️ THE ⓘ DOOR IS THE FEED'S, NOT EACH SECTION'S (2026-09-04). Every medium's band answers
    // the same question about the thing you picked, so the door to it is wired once here rather
    // than passed down by 🖼, 🗣, 🧊 and 🎼 in four identical lines.
    onShow: ctx.openDetail ? () => ctx.openDetail() : null,
  })

  return {
    root: shelf.node,
    refresh: () => shelf.set(assets()),
  }
}
