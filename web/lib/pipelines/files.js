// 📁 files — WHERE YOUR WORK LIVES. Only that.
//
// ⚠️ IT WAS CALLED `library` UNTIL 2026-08-16, and the word went to 📚 — the xoko.lat catalog
// everything is installed from. Two nav rows called library, one meaning "my folder of finished
// work" and one meaning "the shelf you take workflows off", is the vocabulary mistake this project
// keeps refusing to make (see `recipe` vs `workflow`, DECISIONS 2026-08-14). The API key moved
// with it: `/api/settings` answers `files`, not `library`.
//
// This section exists because the first answer was impossible to guess: the folder defaulted
// under ~/Library/Application Support, which is hidden in Finder and is not where anyone looks
// for their own files (DECISIONS.md). The fix is two halves — a conventional default, and this:
// the path in plain sight with a button that opens it.
//
// ⚠️ ONE folder, never several. And changing it NEVER MOVES FILES — new work goes to the new
// place, the old folder stays exactly where it is, and this page says so before you press.
//
// ⚠️ HOW work is written is NOT here — that is 🖼 media (DECISIONS.md, 2026-08-03). This section
// answers where, that one answers how, and mixing them is what made this page need a paragraph.
//
// ⚠️ THE INDEX BLOCK is here because the index is a cache OF this folder, and because `rebuild
// index` / `export stars` were two buttons sitting in the top bar of every screen for something
// done monthly (2026-08-05).

import { api, el, chip } from '../launch-kit.js?v=129'

const row = (label, value, action = null) => el('div', { class: 'path-row' },
  el('span', { class: 'muted path-label' }, label),
  el('code', { class: 'path-value' }, value),
  action)

export default {
  id: 'files',
  icon: '📁',
  label: 'files',
  group: 'settings',
  // ⚠️ ONE LINE, FOR THE MAP xoko IS GIVEN (web/lib/xoko-map.js). Not a docstring and
  // not a tooltip: it is what the assistant is told this place is FOR, so it can send
  // somebody here without having been taught the app.
  what: 'where your work is written on disk, and the index of it',

  create(ctx) {
    const feed = el('div', {})
    let state = null

    const reveal = (rootKey) => el('button', {
      class: 'btn mini', title: 'open this folder',
      onclick: async (ev) => {
        ev.currentTarget.disabled = true
        try {
          await api('/api/reveal', { root: rootKey })
        } catch (err) {
          ctx.flash(String(err.message || err), true)
        } finally {
          ev.currentTarget.disabled = false
        }
      },
    }, '📁 open')

    // ⚠️ MOVED OFF THE TOP BAR (2026-08-05). Both are monthly acts that were occupying permanent
    // chrome on every screen, beside the things you press hourly.
    const rebuildBtn = () => el('button', {
      class: 'btn', title: 'Re-read every master on disk into the index',
      onclick: async (ev) => {
        ev.currentTarget.disabled = true
        ctx.flash('re-reading every master on disk…')
        await ctx.reloadManifest({ rebuild: true })
        ctx.flash(`index rebuilt · ${ctx.manifestInfo().groups} run(s)`)
        paint()
      },
    }, '↻ rebuild the index')

    const exportBtn = () => el('button', {
      class: 'btn', title: 'Download every star as JSON',
      onclick: async () => {
        const all = await api('/api/stars')
        const url = URL.createObjectURL(
          new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' }))
        const a = el('a', { href: url, download: 'stars.json' })
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      },
    }, '★ export stars')

    function paint() {
      const index = ctx.manifestInfo()
      if (!state) {
        feed.replaceChildren(el('p', { class: 'empty' }, 'reading…'))
        return
      }
      const input = el('input', {
        type: 'text', class: 'path-input', value: state.path,
        spellcheck: 'false', autocapitalize: 'off', autocorrect: 'off',
      })
      const save = el('button', { class: 'btn primary' }, 'move it')
      save.addEventListener('click', async () => {
        const next = input.value.trim()
        if (next === state.path) return ctx.flash('that is where it already is')
        save.disabled = true
        try {
          const r = await api('/api/settings', { files: next })
          ctx.flash(`new work goes to ${r.files.path} — nothing was moved`)
          await load()
        } catch (err) {
          ctx.flash(String(err.message || err), true)
        } finally {
          save.disabled = false
        }
      })
      input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') save.click() })

      feed.replaceChildren(
        el('section', { class: 'block' },
          el('div', { class: 'engine-head' },
            el('b', {}, '📁 where your work lands'),
            state.custom ? chip('custom', 'type') : chip('default', 'type'),
            state.locked ? chip('fixed by XOKOLAT_CONTENT', 'type') : null),
          state.issue ? el('p', { class: 'muted note err-note' }, state.issue) : null,
          row('now', state.path, reveal('files')),
          state.locked
            ? el('p', { class: 'muted note' },
              'XOKOLAT_CONTENT is set for this run, so this folder is fixed and cannot be '
              + 'changed here. Unset it and restart to use the setting again.')
            : el('div', { class: 'path-edit' },
              el('label', { class: 'muted' }, 'move it to'),
              input,
              el('div', { class: 'row-actions' },
                save,
                el('button', {
                  class: 'btn',
                  onclick: () => { input.value = state.default },
                }, `use the default (${state.default})`))),
          el('p', { class: 'muted note' },
            'Everything you make lands here, one folder per run. Moving it changes where NEW '
            + 'work goes — nothing already on disk is moved, so an old folder stays readable by '
            + 'pointing this back at it.')),

        el('section', { class: 'block' },
          el('div', { class: 'engine-head' }, el('b', {}, '⚙ the app’s own folders')),
          el('p', { class: 'muted note' },
            'Not yours to keep — these hold settings, the inference registry, verdicts and the '
            + 'index cache. They stay where they are.'),
          row('app data', state.data, reveal('data')),
          row('installed at', state.install, reveal('install'))),

        // ⚠️ THE INDEX ANSWERS HERE NOW. A rebuild is a monthly act and the timestamp is a
        // diagnostic; both were permanent top-bar chrome. This is the page about the folder, so
        // this is where its cache is accounted for.
        el('section', { class: 'block' },
          el('div', { class: 'engine-head' }, el('b', {}, '🗂 the index')),
          el('p', { class: 'muted note' },
            'A derived cache of what is on disk, refreshed by itself whenever a job finishes. '
            + 'Rebuilding by hand re-opens every master — worth it after files were added or '
            + 'removed behind the app’s back, and never otherwise.'),
          row('holds', `${index.groups} run(s)`),
          row('as of', index.at ? String(index.at).slice(0, 19).replace('T', ' ') : 'unavailable'),
          el('div', { class: 'row-actions' }, rebuildBtn(), exportBtn())))
    }

    async function load() {
      try {
        state = (await api('/api/settings')).files
      } catch (err) {
        state = null
        ctx.flash(`could not read the settings: ${err.message}`, true)
      }
      paint()
    }

    void load()

    return {
      feed,
      refresh: () => { void load() },
      detail: () => el('p', { class: 'muted' },
        'One folder, never several. A second root would mean every feature after it grows a '
        + '“which one?” question.'),
    }
  },
}
