// launch-kit.js — the shared form/dock building blocks every section builds its launch UI
// from. Lifted from content-factory/studio/lib/launch-kit.js, thinned to what exists here:
// field rows, chips, the tabbed dock, and the provenance chip.
//
// ⚠️ `provChip` reads OUR provenance names (`provider`, not `engine`) — the manifest is the
// contract and the type won (PLAN, "How to read this"). That is the one conscious change to a
// lifted primitive; everything else is the factory's, verbatim in spirit.

export * from './shared.js?v=129'
import { el } from './shared.js?v=129'

// ── form helpers ──────────────────────────────────────────────────────────────
export const field = (label, input) => el('label', { class: 'f-row' }, el('span', {}, label), input)
/** Like field(), but a plain <div> row — for controls whose interactivity should not be
 *  hijacked by label-forwarding. */
export const fieldRow = (label, control) => el('div', { class: 'f-row' }, el('span', {}, label), control)
export const chip = (text, cls = '') => el('span', { class: `chip ${cls}` }, text)

/** How long a render took, in the shortest form that is still honest. Sub-minute work is the
 *  common case here, so seconds carry one decimal and minutes do not pretend to. */
export const took = (ms) => {
  if (ms == null) return ''
  const sec = ms / 1000
  if (sec < 60) return `${sec.toFixed(1)}s`
  const m = Math.floor(sec / 60)
  return `${m}m${String(Math.round(sec % 60)).padStart(2, '0')}s`
}

export const select = (opts, anyLabel) => {
  const s = el('select', {})
  if (anyLabel) s.append(el('option', { value: '' }, anyLabel))
  for (const o of opts) s.append(el('option', { value: o.value }, o.label ?? o.value))
  return s
}

export const number = (val, min, max) =>
  el('input', { type: 'number', value: String(val), min: String(min), max: String(max) })

// ── the dock: TABS, not stacked bands ─────────────────────────────────────────
// ⚠️ IT WAS FOUR COLLAPSIBLE BANDS, THEN TWO, NOW TABS (2026-08-05). Stacked accordions ask you
// to manage them: each one remembers its own open state, two open ones fight for the same column,
// and a shut one leaves a header saying nothing. Two panels that are never both wanted at once
// are a TAB STRIP — one visible body, full height, and the strip itself says what else is there.
//
// Panels are registered ONCE and their bodies are stable nodes: the shell repaints INTO them on
// every poll, and rebuilding the container would take your scroll position and your focus with
// it. Which tab is showing is the only state here.
export function tabbed({ key = '', trailing = null } = {}) {
  const strip = el('div', { class: 'dock-tabs' })
  const host = el('div', { class: 'dock-body' })
  const node = el('div', { class: 'dock-tabbed' }, strip, host)
  // ⚠️ THE CALLER'S NODE, NOT A CLOSE BUTTON THIS KIT INVENTS. The shell hangs a ✕ here, and a ✕
  // that shuts a pane is the SHELL's idea — this kit knows about tabs and nothing else. The
  // spacer is what pins it to the strip's trailing edge whatever the tabs in front of it do.
  if (trailing) strip.append(el('span', { class: 'spacer' }), trailing)
  const panels = []
  let current = null

  const sync = () => {
    // A tab whose panel is hidden must not be the one showing — a section with no ⚙ would
    // otherwise land you on an empty pane with no way to tell why.
    const shown = panels.filter((p) => !p.hidden)
    if (!shown.some((p) => p.id === current)) current = shown[0]?.id ?? null
    for (const p of panels) {
      p.tab.style.display = p.hidden ? 'none' : ''
      p.tab.classList.toggle('on', p.id === current)
      // ⚠️ THE DOT IS WHAT LETS THE STRIP STAY PUT. Nothing switches tabs but you (shell.js →
      // onPick no longer does), so a panel whose content changed while you were on another one
      // needs a way to say so. One dot, gone the moment you look at it, and never a jump.
      if (p.id === current) p.mark = false
      p.tab.classList.toggle('has-new', !!p.mark)
      p.body.style.display = p.id === current ? '' : 'none'
    }
    // One tab is not a choice; it reads as the pane's title, so the strip stays but stops
    // looking pressable.
    strip.classList.toggle('single', shown.length < 2)
  }

  function show(id) {
    if (!panels.some((p) => p.id === id && !p.hidden)) return
    current = id
    if (key) { try { localStorage.setItem(key, id) } catch {} }
    sync()
  }

  return {
    node,
    /** Register a panel. Returns its body — a stable node the caller fills and refills. */
    add({ id, icon = '', label = '' }) {
      const tab = el('button', { class: 'dock-tab', type: 'button', title: label },
        icon ? el('span', { class: 'dock-tab-ic' }, icon) : null,
        el('span', {}, label))
      tab.addEventListener('click', () => show(id))
      const body = el('div', { class: 'dock-panel' })
      panels.push({ id, tab, body, hidden: false })
      // ⚠️ BEFORE THE SPACER, NOT AT THE END. Panels register as the shell assembles them, so a
      // plain append would file every tab after the trailing ✕ and push it to the left.
      strip.insertBefore(tab, strip.querySelector('.spacer'))
      host.append(body)
      // Restore the remembered tab as soon as the panel that owns it exists.
      if (key && !current) {
        try { if (localStorage.getItem(key) === id) current = id } catch {}
      }
      sync()
      return body
    },
    /** A panel with nothing to say is not drawn — the four bands' rule, kept. */
    setHidden(id, hidden) {
      const p = panels.find((x) => x.id === id)
      if (!p || p.hidden === !!hidden) return
      p.hidden = !!hidden
      sync()
    },
    /** "This panel has something new." Ignored when it is the panel you are already on. */
    mark(id, on = true) {
      const p = panels.find((x) => x.id === id)
      if (!p) return
      p.mark = !!on
      sync()
    },
    show,
    current: () => current,
  }
}

// ⚠️ NO `promptDock` (2026-08-05). A section used to build its own textarea and its own ▶, and
// the shell mounted whichever one the active section handed it — which is why the one act every
// section performs had a per-section implementation and existed only on a feed. The bar is the
// SHELL's now (web/lib/shell.js → paintAsk); a section declares what ▶ MEANS and nothing about
// where it sits.

// ── provenance ────────────────────────────────────────────────────────────────
/** One chip saying what made this, from the identity subset the index projects out of the
 *  master's own embedded record. */
export function provChip(gen) {
  if (!gen) return null
  const model = (gen.model ?? '').replace(/\.(ckpt|safetensors)$/, '')
  const label = [model, gen.provider].filter(Boolean).join(' · ')
  if (!label) return null
  const detail = [
    gen.provider ? `engine: ${gen.provider}` : null,
    gen.model ? `model: ${gen.model}` : null,
    gen.workflow ? `family: ${gen.workflow}` : null,
    gen.seed != null ? `seed: ${gen.seed}` : null,
  ].filter(Boolean).join('\n')
  return el('span', { class: 'chip prov-chip', title: detail || label }, `⚙ ${label}`)
}

/**
 * 🎨 WHAT LOOK THIS WAS MADE IN — the other half of the ⚙ chip, and the human half.
 *
 * ⚠️ IT IS A CHIP AND NOT A LINE IN THE ⚙ TOOLTIP. "Which style is this?" is asked of a picture
 * months later and the answer has to be readable at a glance, not hovered for; every other fact
 * in that tooltip is a machine fact and this one is a decision somebody made.
 *
 * ⚠️ THE SLUG, DE-SLUGGED — not the style's label. The slug is identity (it is the ★ key and the
 * swatch path), so it survives a rename and it needs no style list to be read; the label lives one
 * press away, with the words, in 🎨. `bossa-nova` reads as `bossa nova` and that is the whole of
 * the translation.
 *
 * ⚠️ AND IT IS A DOOR when the section can open one — the same door a chain style's `uses` chip
 * presses through. Absent style, no chip: a master written before the field existed does not know,
 * and "no style" is a different sentence from "nobody wrote it down".
 */
export function styleChip(gen, onOpen = null) {
  const slug = gen?.style
  if (!slug) return null
  const face = slug.replace(/-/g, ' ')
  if (!onOpen) return el('span', { class: 'chip style-chip' }, `🎨 ${face}`)
  const b = el('button', {
    class: 'chip pick style-chip', type: 'button',
    title: `made in the ${slug} style — open it in 🎨`,
  }, `🎨 ${face}`)
  b.addEventListener('click', () => onOpen(slug))
  return b
}
