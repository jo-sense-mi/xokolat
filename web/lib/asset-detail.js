// ⓘ FOR ONE ASSET — the band that tells you what you picked and what you can do about it.
//
// ⚠️ WHY IT IS HERE AND NOT IN 🖼 images (2026-08-17). It was written once, in images.js, and the
// moment 🎼 · 🗣 · 🧊 arrived it was about to be written four times: the same head, the same
// provenance chip, the same seed · took · quality line, the same tags, the same path, the same
// five buttons. Four copies of "what made this and where does it live" is four places for the
// answer to drift, and the drift would be invisible — a section quietly missing `quality`, or a
// delete that forgot to forget the star.
//
// What is genuinely per-medium is small and is what the options below name: the PICTURE in the
// head (a thumbnail · a player · nothing a browser can draw), what ⤢ means, and the medium's own
// verb (⧉ copy is pixels, and only pixels). Everything else is the asset, and the asset is the
// same object in every feed.
//
// ⚠️ NO DOWNLOAD, in any medium. The app already wrote this file to the user's disk; offering to
// write it again is web thinking. What an app owes is a way to GET TO it — ⤢, 📁 and ⇢.

import { api, chip, el, forgetStar, href, provChip, styleChip, took } from './launch-kit.js?v=129'
import { detailArt, detailHead } from './browse.js?v=129'
import { starWidget } from './shared.js?v=129'

/** Values the ⓘ "set to" block never repeats: they are already a line of their own above it, or
 *  they are the app talking to itself rather than anything anybody set. */
const NOT_A_SETTING = new Set(['seed', 'model', 'width', 'height', 'quality'])

/**
 * WHAT THIS ONE WAS SET TO — the knobs that made it, read out of the master's own record.
 *
 * ⚠️ IT IS HERE BECAUSE A SONG'S SETTINGS WERE WRITE-ONLY (2026-08-23). You could set a tempo, a
 * key, a length and eight lines of verse, press ▶, and then there was nowhere in the app that would
 * tell you what any of them had been — the ⓘ band showed the service, the seed and the clock. For a
 * picture that is nearly survivable, because the picture is the answer; for a song the settings ARE
 * most of what distinguishes two takes, and the lyrics are the thing you most want to read back.
 *
 * ⚠️ A LONG VALUE GETS ITS OWN BLOCK, and that is the whole layout decision. Label-left /
 * value-right is right for `bpm 72` and unreadable for a lyric sheet — which in a ~300px dock came
 * out as one line running off the side. Anything with a newline in it, or simply long, is stacked
 * under its name in a box that scrolls.
 */
function settingsBlock(gen) {
  const rows = Object.entries(gen?.params ?? {})
    .filter(([k, v]) => !NOT_A_SETTING.has(k) && v !== null && v !== undefined && String(v) !== '')
    .sort(([a], [b]) => a.localeCompare(b))
  // ⚠️ THE SPOKEN WORDS ARE A ROW HERE TOO, AND THEY ARE THE FIRST ONE (2026-08-31). A voice take
  // has two texts — the script and the description of who reads it — and it used to carry neither:
  // the script was borrowed from the run's `ask` and the description only appeared if somebody had
  // typed it. `gen.prompt` is now on the cell for a medium whose sentence IS the thing (see
  // `ProvenanceIdentity`), so the asset answers "what does it say" on its own.
  const said = typeof gen?.prompt === 'string' && gen.prompt.trim() ? gen.prompt : null
  if (!rows.length && !said) return null

  const short = rows.filter(([, v]) => !String(v).includes('\n') && String(v).length <= 48)
  const long = [
    ...(said ? [['says', said]] : []),
    ...rows.filter(([, v]) => String(v).includes('\n') || String(v).length > 48),
  ]
  return el('div', { class: 'set-to' },
    short.length
      ? el('p', { class: 'muted' }, short.map(([k, v]) => `${k} ${v}`).join(' · '))
      : null,
    ...long.map(([k, v]) => el('div', { class: 'set-long' },
      el('span', { class: 'muted' }, k),
      el('pre', {}, String(v)))))
}

/**
 * @param ctx     the section context
 * @param sel     `{ cell, group }` from `ctx.picked()`, or null
 * @param empty   the line shown when nothing is picked
 * @param head    (cell) => Node — the picture in the ⓘ head. Defaults to a thumbnail, which is
 *                right for anything a browser draws and wrong for a mesh.
 * @param open    ⤢ — `{ label, title }`, or null for a master no browser can open usefully.
 * @param actions (cell) => [Node] — the medium's own buttons, between ⤢ and 📁.
 * @param onAgain (cell, group) => void — after ↻ has refilled the ask line. Where a section
 *                clears its own fields (a seed that must not be reused).
 */
export function assetDetail(ctx, sel, {
  empty = 'pick something in the feed',
  head = (cell) => detailArt(href(cell.preview ?? cell.master)),
  open = { label: '⤢ full size', title: 'open the master at full size' },
  actions = () => [],
  onAgain = null,
} = {}) {
  if (!sel) return el('p', { class: 'empty' }, empty)
  const { cell, group } = sel

  /**
   * A button that cannot be pressed twice while it is working.
   *
   * ⚠️ THE NODE IS CAPTURED BEFORE THE AWAIT. `ev.currentTarget` is only itself during dispatch —
   * it reads null on the far side of an await, so the "put it back" line in the version this was
   * extracted from would have thrown instead of re-enabling the button. Nobody saw it because it
   * only ran when the server had already refused something.
   */
  const busy = (fn) => async (ev) => {
    const btn = ev.currentTarget
    btn.disabled = true
    try {
      await fn()
    } catch (err) {
      ctx.flash(String(err.message || err), true)
    } finally {
      btn.disabled = false
    }
  }

  /**
   * ✎ THE NAME, EDITED IN PLACE.
   *
   * ⚠️ IT RENAMES THE RUN, NOT THE FILE, and nothing on disk moves (src/content/run.ts
   * `renameRun`). The folder is this asset's identity — it is in every master's provenance, in the
   * rating keys, and in whatever the person has open in the Finder — so a name is a field beside
   * it rather than a second copy of it. Blank goes back to the name read off the ask.
   */
  // ⚠️ THE TOOLTIP IS THE NAME ITSELF, FIRST. The field trails off with an ellipsis when the name
  // is longer than the band is wide, so the one thing hovering it should answer is "what does the
  // rest say" — the instructions come after, on their own line.
  const name = el('input', {
    class: 'detail-name', value: group.title ?? group.slug,
    title: `${group.title ?? group.slug}\n\nwhat this is called. Enter to save; empty goes back to the ask.`,
  })
  const save = async () => {
    if (name.value === (group.title ?? group.slug)) return
    try {
      await api('/api/rename', { path: group.path, title: name.value })
      ctx.flash('renamed')
      await ctx.reloadManifest()
    } catch (err) {
      ctx.flash(String(err.message || err), true)
      name.value = group.title ?? group.slug
    }
  }
  name.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); name.blur() } })
  name.addEventListener('blur', () => { void save() })

  return el('div', { class: 'detail' },
    // The same ⓘ head every section shows: a picture that says WHICH one you picked, the name,
    // the ★. Judging it properly is ⤢, below.
    // Stacked: a media asset's head is a picture, a player or a mesh — all things to LOOK at,
    // and all better across the band's full width than squeezed beside the name.
    detailHead(head(cell), name,
      { extra: cell.ratingKey ? [starWidget(cell.ratingKey)] : [], stack: true }),
    group.ask ? el('p', { class: 'muted ask-said' }, group.ask) : null,
    // ⚠️ NO 🧩 CHIP HERE ANY MORE (2026-08-24). It said which chain had drawn a picture, and it
    // existed because a mascot landed on this shelf among everything else you had ever drawn. A
    // section keeps what it makes now — a chain's runs are in the chain's own feed — so the
    // question this answered cannot be asked of anything in here.
    // ⚠️ THE STYLE FIRST, THEN THE ENGINE. One is a decision the person made and the other is
    // the machine that carried it out, and the first is what somebody is looking for when they
    // open a picture they made three months ago.
    el('p', { class: 'detail-made' },
      styleChip(cell.gen, (slug) => ctx.openStyles?.(group.medium, slug)),
      provChip(cell.gen)),
    el('p', { class: 'muted' }, [
      cell.gen?.seed != null ? `seed ${cell.gen.seed}` : '',
      // ⚠️ TWO TIMES, AND THEY ARE NOT THE SAME TIME. `length` is how long it plays; `took` is how
      // long it took to make. Named out loud because a song has both and they differ by minutes.
      cell.seconds != null ? `${took(cell.seconds * 1000)} long` : '',
      cell.gen?.durationMs != null ? `took ${took(cell.gen.durationMs)}` : '',
      // Which level this master got — a library holds several, and "how was this written?" is
      // asked long after the render (🖼 media).
      cell.gen?.quality ?? '',
    ].filter(Boolean).join(' · ')),
    settingsBlock(cell.gen),
    el('div', { class: 'chips' }, ...(cell.tags ?? []).map((t) => chip(t, 'tag'))),
    el('p', { class: 'muted path' }, cell.path),
    el('p', { class: 'row-actions' },
      open
        ? el('button', {
          class: 'btn', title: open.title,
          onclick: () => window.open(href(cell.master), '_blank'),
        }, open.label)
        : null,
      ...actions(cell),
      el('button', {
        class: 'btn', title: 'show this file in the Finder',
        onclick: busy(() => api('/api/reveal', { path: cell.path })),
      }, '📁 reveal'),
      el('button', {
        class: 'btn', title: 'copy the path to this file',
        onclick: async () => {
          try {
            await navigator.clipboard.writeText(cell.path)
            ctx.flash('path copied')
          } catch { ctx.flash('the browser would not let me copy that', true) }
        },
      }, '⇢ path'),
      el('button', {
        class: 'btn',
        title: 'same ask, same settings, a new seed',
        // ⚠️ IT FILLS THE ASK BAR, which is the shell's — a section has no textarea of its own.
        onclick: () => {
          ctx.askFill(group.ask ?? '')
          onAgain?.(cell, group)
          if (cell.gen?.model) ctx.flash(`made with ${cell.gen.model}`)
        },
      }, '↻ again'),
      // ⚠️ A REAL DELETE, and no confirmation (DECISIONS.md, 2026-08-03). Generation is cheap, the
      // user is an adult, and a modal here would block every browser event the app needs. Last in
      // the row and marked, so it is not next to anything you press often.
      el('button', {
        class: 'btn danger', title: 'delete this file — there is no undo',
        onclick: busy(async () => {
          const r = await api('/api/delete', { path: cell.path, key: cell.ratingKey })
          forgetStar(cell.ratingKey)
          ctx.flash(r.prunedRun ? 'deleted — that was the last one in the run' : 'deleted')
          ctx.select(null)
          await ctx.reloadManifest()
        }),
      }, '🗑 delete')))
}
