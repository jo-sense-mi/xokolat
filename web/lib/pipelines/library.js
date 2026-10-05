// 📚 library — WHAT THIS MACHINE CAN BE MADE TO DO, AND WHETHER IT CAN DO IT.
//
// ⚠️ THIS APP COMES EMPTY AND THIS IS WHERE IT FILLS FROM. It ships the ability to REACH things —
// transports, service rows, the words a parser accepts — and nothing to run. Every workflow and
// every checkpoint description arrives here (DECISIONS.md, 2026-08-16).
//
// ⚠️ STYLES DO NOT. They arrive from the library too, but through ❖ styles, per medium — see the
// note on `TYPE` below for why a shelf built around `needs` was the wrong room for a thing that
// needs nothing.
//
// ⚠️ IT REPLACED A PASTE BOX, and the operator's verdict on that was blunt: taking by pasting an
// id is fine for whoever wrote the id and useless for everyone else, who has no way to find out
// what exists. Browsing is not a nicety on top of ⤓ — it is the half that makes ⤓ usable.
//
// ⚠️ THE COLUMN THAT MATTERS IS `needs`. A catalog can tell you what a thing is; only the app can
// tell you whether it will run *here*, and that answer — you have SDXL, you are missing this
// adapter — is the difference between a list and a shop you can buy from. It comes from the
// cached engine catalog, so a service nobody has asked says "not checked" rather than "fine".
//
// ⚠️ THE SHELF IS browse.js, like every other list in this app. No bar of its own, no search of
// its own, no card family of its own — this file supplies items, facets, columns and the slots of
// a tile, and nothing about layout.

import { api, el, chip } from '../launch-kit.js?v=129'
import { browser, detailHead, thumb, tile } from '../browse.js?v=129'

/** What each type is called on screen, and the glyph a pictureless tile carries.
 *
 *  ⚠️ NO STYLE ROW (2026-08-29). This shelf is organised around `needs` — can this machine run
 *  it — and a style has none: it is words, and it installs anywhere unconditionally, so it sat
 *  here as a permanent "fine" in the one column the shelf exists for. It was also the only kind
 *  whose chip you had to read to learn what it was FOR. It lives in ❖ styles now, per medium,
 *  where the section you are standing in is already the filter (web/lib/styles.js). */
/** ⚠️ THE COMPOSITION GLYPH, AND THIS IS ITS ONE DEFINITION. A run of a chain wears it too
 *  (web/lib/pipelines/composition.js) — 📚 saying 🧩 while the shelf of what 🧩 made said something
 *  else is one word for one thing spelled two ways. */
export const COMPOSITION_ICON = '🧩'

const TYPE = {
  workflow: { icon: '⚗', label: 'workflow' },
  composition: { icon: COMPOSITION_ICON, label: 'composition' },
}

const face = (item) => TYPE[item.type] ?? { icon: '•', label: item.type }

/** One line for the state column, and the same words in ⓘ. */
function state(item) {
  const { installed, takeable, why, missing, asked, brings } = item.app
  if (!takeable) return { text: '—', cls: '', title: why ?? '' }
  // Before anything about files: this row would add a service. It is the biggest thing the press
  // does and the one nothing else on the page would tell you.
  if (brings) {
    return {
      text: `+ ${brings}`,
      cls: 'warn',
      title: `taking this also adds the ${brings} service — it is not in this app yet.\n`
        + 'That writes a row of configuration; it installs nothing and starts nothing.',
    }
  }
  if (missing.length) {
    return {
      text: `needs ${missing.length}`,
      cls: 'warn',
      title: `not on this machine yet:\n${missing.join('\n')}`,
    }
  }
  if (!asked) {
    return {
      text: installed ? 'installed' : 'not checked',
      cls: '',
      title: item.service
        ? `${item.service} has not been asked what it has — open 🔌 inference to find out`
        : '',
    }
  }
  return { text: installed ? 'installed' : 'ready', cls: 'ok', title: '' }
}

export default {
  id: 'library',
  icon: '📚',
  label: 'library',
  group: 'settings',
  // ⚠️ ONE LINE, FOR THE MAP xoko IS GIVEN (web/lib/xoko-map.js). Not a docstring and
  // not a tooltip: it is what the assistant is told this place is FOR, so it can send
  // somebody here without having been taught the app.
  what: 'the workflows and compositions xoko.lat publishes, each answered against this machine, and the button that installs one. Styles are not here — they live in ❖ styles, per medium',

  create(ctx) {
    let loaded = { origin: null, items: [], at: null, issue: null }
    let picked = null

    // ── one row's verb ────────────────────────────────────────────────────────
    //
    // ⚠️ AN INSTALLED ITEM IS STILL PRESSABLE. Taking it again is how you get the published
    // version back after editing it here — the same act, not a second one — so the button says
    // what it would do rather than going grey to mean "done".
    function takeButton(item) {
      const b = el('button', { class: 'btn mini' })
      if (!item.app.takeable) {
        b.disabled = true
        b.textContent = '—'
        b.title = item.app.why ?? 'this app cannot take that yet'
        return b
      }
      b.textContent = item.app.installed ? '↻ again' : '⤓ take'
      // ⚠️ THE SECOND THING THE PRESS DOES IS ON THE BUTTON (2026-08-23). A workflow whose service
      // is not here brings the shipped one with it, which is the only way the act named on the
      // map can be the whole act — but a press that adds a machine this app talks to has to say
      // so before it is pressed, not in the flash afterwards.
      b.title = item.app.installed
        ? 'take it again — the published version replaces the one here'
        : `install ${item.title}${item.app.brings
          ? `\nand add the ${item.app.brings} service, which is not here yet` : ''}`
      b.addEventListener('click', async (ev) => {
        ev.stopPropagation()
        b.disabled = true
        const was = b.textContent
        b.textContent = '…'
        try {
          const r = await ctx.take(item.id)
          ctx.flash(says(r.took))
          // The answer carries the whole library, re-answered against a machine that is now one
          // item different — so nothing here merges a result into what it was already showing.
          if (r.library) {
            loaded = r.library
            paint()
          }
        } catch (err) {
          ctx.flash(String(err.message || err), true)
          b.disabled = false
          b.textContent = was
        }
      })
      return b
    }

    /** What just landed, in one line — with the requirements check, which is the point of it. */
    function says(took) {
      if (!took) return 'nothing came back'
      const verb = took.replaced ? 'replaced' : 'took'
      // ⚠️ A SERVICE HAS NO `check`, because there is nothing yet to check. It carries no workflow,
      // so it needs no files — what it needs is to be reachable, and that is the 🔌 page's readout.
      if (took.type === 'service') return `${verb} ${took.label} · add its workflows from here`
      const line = [`${verb} ${took.label} · ${took.service}`]
      // ⚠️ AND WHAT ELSE THIS PRESS DID TO THE APP. The button warned that a service would be
      // added; the receipt confirms it was, because the two halves of an auditable act are the
      // warning and the confirmation and one of them on its own is neither.
      if (took.added?.length) line.push(`added the ${took.added.join(', ')} service`)
      if (took.check?.missing?.length) {
        line.push(`still needs ${took.check.missing.map((m) => m.file).join(', ')}`)
      } else if (!took.check?.asked) {
        line.push(`nothing checked yet — ${took.service} has not been asked what it has`)
      }
      return line.join(' · ')
    }

    // ── the shelf ─────────────────────────────────────────────────────────────
    const reload = el('button', { class: 'btn', title: 'ask the library what it has now' }, '↻')
    reload.addEventListener('click', () => { void load({ refresh: true }) })

    const shelf = browser({
      id: 'library',
      noun: 'items',
      // ⚠️ TABLE FIRST. A ▦ grid compares LOOKS and nothing published here has one — a workflow is
      // a verb, a checkpoint and a list of files. The grid is still one press away.
      layout: 'table',
      facets: [
        { key: 'type', label: 'what', of: (i) => face(i).label },
        { key: 'medium', label: 'for', of: (i) => i.media[0] ?? '' },
        { key: 'kind', label: 'does', of: (i) => i.kind ?? '' },
        { key: 'service', label: 'runs on', of: (i) => i.serviceLabel ?? i.service ?? '' },
        { key: 'have', label: 'state', of: (i) => state(i).text },
      ],
      search: (i) => [
        i.id, i.title, i.kind, i.kindFace, i.notes, i.model, i.modelFace, i.service,
      ].filter(Boolean).join(' '),
      key: (i) => i.id,
      /** ⚠️ THE ONE FAMILY THIS APP HAS AN OPINION ABOUT. `capabilities` holds the chain that
       *  makes new chains: taking it does not give you a place to make a picture, it gives you the
       *  thing that writes new places. In a shelf of otherwise-identical rows that was invisible,
       *  and it is the row somebody is most likely to be looking for. Every other family — and
       *  every family published tomorrow — passes through unmarked and unremarked. */
      mark: (i) => (i.family === 'capabilities' ? 'capability' : null),
      card,
      // ⚠️ NO COLUMN MAY BE `auto` WIDE — every width here is a fixed length or an `fr` with a
      // fixed minimum. A row is its own grid container and the header is another, so a
      // content-sized track resolves differently in each of them; see browse.js.
      columns: [
        {
          key: 'type', label: '', width: '1.6em',
          cell: (i) => el('span', { class: 'lib-ic', title: face(i).label }, face(i).icon),
        },
        {
          key: 'title', label: 'name', sort: true, width: 'minmax(9em, 1.4fr)',
          of: (i) => i.title,
          cell: (i) => el('span', { class: 'browse-name', title: i.id }, i.title),
        },
        {
          key: 'kind', label: 'does', sort: true, width: 'minmax(6em, 1fr)', of: (i) => i.kind ?? '',
          cell: (i) => (i.kind
            ? el('span', { class: 'lib-kind', title: i.kindFace ?? '' }, i.kindFace ?? i.kind)
            : el('span', {})),
        },
        {
          key: 'medium', label: 'for', width: 'minmax(5em, .8fr)', sort: true, of: (i) => i.media[0] ?? '',
          cell: (i) => el('span', { class: 'muted' }, i.media.join(' · ')),
        },
        {
          key: 'service', label: 'runs on', width: 'minmax(6em, .8fr)', sort: true,
          of: (i) => i.serviceLabel ?? '',
          cell: (i) => el('span', { class: 'muted', title: i.model ?? '' },
            i.serviceLabel ?? i.service ?? ''),
        },
        {
          key: 'state', label: 'state', width: '6em', sort: true, of: (i) => state(i).text,
          cell: (i) => {
            const st = state(i)
            return el('span', { class: `lib-state ${st.cls}`, title: st.title }, st.text)
          },
        },
        { key: 'take', label: '', width: '5.5em', cell: takeButton },
      ],
      extra: [reload],
      empty: 'nothing here — check the library address below, or ↻',
      onOpen: (i) => { picked = i; ctx.select(i ?? null) },
      onShow: () => ctx.openDetail?.(),
    })

    /** The ▦ tile. No picture exists, so the "art" is the thing's own words — its verb in plain
     *  language, which is what you would be reading anyway. */
    function card(i) {
      const st = state(i)
      return tile({
        art: el('div', { class: 'browse-blank lib-face' },
          el('span', { class: 'lib-face-ic' }, face(i).icon),
          el('small', {}, i.kindFace ?? i.kind ?? face(i).label)),
        aspect: 1,
        badge: st.text === '—' ? null : { text: st.text, title: st.title },
        action: takeButton(i),
        label: i.title,
      })
    }

    // Where these came from, under the shelf: one line, and it is the answer to "why is this list
    // not what I just published".
    const originLine = el('p', { class: 'muted note lib-origin' })
    const node = el('div', { class: 'lib-view' }, shelf.node, originLine)

    function paint() {
      shelf.set(loaded.items ?? [])
      const at = loaded.at ? String(loaded.at).slice(11, 16) : null
      originLine.textContent = loaded.issue
        ? `${loaded.origin ?? 'the library'} — ${loaded.issue}`
        : `${loaded.origin ?? ''}${at ? ` · read at ${at}` : ''}`
      originLine.classList.toggle('err-note', !!loaded.issue)
      originLine.title = 'XOKOLAT_LIBRARY sets this'
      ctx.repaintDock?.()
    }

    async function load({ refresh = false } = {}) {
      reload.disabled = true
      try {
        loaded = await api(`/api/library${refresh ? '?refresh=1' : ''}`)
      } catch (err) {
        loaded = { origin: null, items: [], at: null, issue: String(err.message || err) }
      }
      reload.disabled = false
      paint()
    }

    void load()

    return {
      feed: node,
      refresh: () => { void load() },

      // ── the ⓘ band: the one you picked, and what it would cost ──────────────
      detail: (sel) => {
        const i = sel ?? picked
        if (!i) return el('p', { class: 'empty' }, 'pick something in the list')
        const st = state(i)
        return el('div', { class: 'detail' },
          // ⚠️ NOT STACKED. 📚 lists things you do not have yet and its head is a glyph, not a
          // picture — stacked, an icon over a title is a card pretending to be a photograph.
          detailHead(thumb(null), i.title, { extra: [chip(face(i).label, 'type')] }),
          i.notes ? el('p', {}, i.notes) : null,
          el('p', { class: 'muted' }, [
            i.kindFace ?? i.kind,
            i.modelFace ?? i.model,
            i.memory ? `~${i.memory} GB` : '',
            i.where.join(' · '),
            i.added ? `added ${i.added}` : '',
          ].filter(Boolean).join(' · ')),
          // ⚠️ WHAT IT NEEDS, BY NAME, BEFORE THE PRESS. "sdxl-ref cannot run" is useless;
          // "sdxl-ref needs ip_adapter_plus_xl_base_open_clip_h14_f16.ckpt" is a download.
          i.needs.length
            ? el('div', { class: 'lib-needs' },
              el('div', { class: 'muted' }, 'files it names'),
              ...i.needs.map((f) => el('div', {
                class: `lib-need${i.app.missing.includes(f) ? ' missing' : ''}`,
                title: i.app.missing.includes(f) ? 'not reported by the service' : '',
              }, f)))
            : null,
          el('p', { class: `muted ${st.cls}` }, st.title || st.text),
          el('div', { class: 'row-actions' }, takeButton(i)),
          i.url ? el('p', { class: 'muted mono lib-url' }, i.url) : null)
      },
    }
  },
}
