// shared.js — the tiny common layer. No framework, no build step, and NOT TypeScript: this is
// the most settled thing in the project and it stays vanilla (PLAN §9, §14).
//
// Lifted from content-factory/studio/lib/shared.js. What changed and why:
//   - `loadManifest` reads /api/manifest (an endpoint) instead of ../manifest.json (a file the
//     browser fetched off disk). The index is a derived cache now, built in-process.
//   - stars are SERVER-BACKED ONLY. The factory falls back to localStorage under plain
//     http.server; here there is always a server, and a star that lives in one browser is a
//     star the library does not have.
//   - one rater, so no rater key: this is one user on their own machine (PLAN §3.15).

/**
 * HOW A MEDIUM IS DRAWN — an icon and a plural, per medium.
 *
 * ⚠️ THE VOCABULARY IS THE SERVER'S (`media` on /api/inference); this only says how to draw it, and
 * a medium missing from here still renders — fall back to `['·', m]` at the call site. It lives in
 * shared.js because THREE files wanted it: the nav and the run bar, xoko's `▶ <medium>:` lines, and
 * the 🔌 page's capability bands. A third copy is where a table starts disagreeing with itself
 * about what 3D is called.
 *
 * `text` is deliberately absent. It is the brain's medium, drawn as ✨ xoko wherever it appears,
 * and every caller already knows which one it is holding.
 */
/**
 * WHAT TO DO FIRST, and it depends on how empty the app is (2026-08-20).
 *
 * ⚠️ THE APP SHIPS NOTHING, so "take a workflow in 📚" is the SECOND step and saying it first sends
 * somebody to a press that refuses: a workflow is an override on a service row, and with no rows
 * there is nothing to put one on (src/library/take.ts). One service, then one workflow, then make.
 */
export const firstStep = (ctx, noun) => (ctx.services().length
  ? `nothing armed to make ${noun} with — take a workflow in 📚`
  : `nothing here yet — add a service in 🔌, then take a workflow for it in 📚`)

export const MEDIUM_FACE = {
  image: ['🖼', 'images'], music: ['🎼', 'music'],
  voice: ['🗣', 'voices'], model3d: ['🧊', '3D'],
}

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag)
  // Images default to lazy + async decode. A feed is hundreds of full-size masters served
  // straight off disk; over the LAN on a phone, paying only for what actually scrolls into
  // view is the difference between usable and not. This is the ONE place every image is
  // built, so it costs no call-site changes — pass `loading`/`decoding` to override.
  if (tag === 'img') { node.loading = 'lazy'; node.decoding = 'async' }
  for (const [k, v] of Object.entries(attrs)) {
    // ⚠️ `false` MEANS ABSENT, and it has to (2026-08-13). Everything here ends in setAttribute,
    // and for a boolean attribute the browser reads PRESENCE — so `disabled: false` wrote
    // `disabled="false"` and disabled the button exactly as firmly as `true` would have. That
    // shipped as every ★ on the 🔌 page being unclickable. `disabled`, `hidden`, `checked`,
    // `readonly`, `multiple` are all the same trap, and passing the flag straight through is the
    // natural thing to write, so this is the one place it can be made true.
    // ARIA is unaffected: `aria-*` wants the literal string "false", which is a string.
    if (v == null || v === false) continue
    if (k === 'class') node.className = v
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v)
    else node.setAttribute(k, v)
  }
  for (const c of children.flat(Infinity)) {
    if (c == null) continue
    node.append(c.nodeType ? c : document.createTextNode(String(c)))
  }
  return node
}

/** GET (no payload) or POST (with one). Errors carry the server's own message, which is the
 *  whole point of the server naming its refusals.
 *
 *  ⚠️ `signal` IS HOW ⏹ WORKS. Aborting the fetch closes the socket, and a server that is running
 *  something long for this request sees the disconnect and kills it (src/server/app.ts). There is
 *  no cancel endpoint, and nothing to leak when a tab is simply closed. */
export async function api(path, payload, { signal } = {}) {
  const opts = {
    ...(signal ? { signal } : {}),
    ...(payload === undefined ? {} : {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  }
  const res = await fetch(path, opts)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

/**
 * POST, and read an NDJSON answer a line at a time.
 *
 * ⚠️ ONE OBJECT PER LINE, and the LAST one is the result — that is the whole protocol
 * (src/server/app.ts). It is not SSE: this app owns both ends, `EventSource` cannot POST, and
 * `data: ` framing would buy nothing.
 *
 * @param onLine  called with each parsed object as it arrives
 */
export async function stream(path, payload, onLine, { signal } = {}) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    ...(signal ? { signal } : {}),
  })
  // A refusal before the stream opens is still an ordinary error object.
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let pending = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    pending += decoder.decode(value, { stream: true })
    const lines = pending.split('\n')
    pending = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      // ⚠️ ONLY THE PARSE IS FORGIVEN, and the handler is NOT. This wrapped both for an hour, and
      // an exception thrown while drawing a delta was swallowed as though the line had been
      // malformed — so the answer arrived, was dropped one piece at a time, and the transcript sat
      // there saying "thinking…" until it was stopped. A blanket catch around someone else's
      // callback hides exactly the bugs you most need to see.
      let msg
      try { msg = JSON.parse(line) } catch { continue }
      onLine(msg)
    }
  }
}

/** An asset's URL. Every path in the manifest is content-root-relative; the server serves the
 *  content root under /content/. */
/**
 * WHAT THIS BROWSER REMEMBERS — the plugs (a section's, and a chain's), the route, the pane.
 *
 * ⚠️ IT LIVES HERE SO THERE IS ONE OF IT (2026-08-24). The shell has always had a private copy;
 * the moment a section needed to remember something of its own there were about to be two, with
 * two answers to what happens in private mode. Every key is namespaced `xokolat:`.
 */
export const store = {
  get: (k, dflt = null) => { try { return localStorage.getItem(k) ?? dflt } catch { return dflt } },
  set: (k, v) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } },
}

export const href = (contentRelPath) => `/content/${contentRelPath}`

export async function loadManifest({ rebuild = false } = {}) {
  return api(`/api/manifest${rebuild ? '?rebuild=1' : ''}`)
}

// ── ★ : starred, or not ────────────────────────────────────────────────────────
// TWO states. It was 👍 / 👎 / unseen until 2026-08-03, and 👎 only ever meant "hide this
// everywhere" — which is what delete does, properly (DECISIONS.md).
//
// ⚠️ A MARK, NOT A GATE. Starring gates nothing; it exists so that picking six out of two hundred
// is possible — it ranks workflows, lifts the favourites run in 🎨, and lives on the server.
// ⚠️ AND THERE IS NO APP-WIDE "SHOW ONLY ★" ANY MORE (2026-08-31). It was a body class hiding
// rendered cards, which is not a filter: the tally kept counting the ones it had hidden, the
// empty state could never fire, and the windowed shelf drew everything to reveal the few. A shelf
// that wants it back gets a facet in its own filter bar, where it is data. See app.css.
//
// ⚠️ The KEY comes from the server (`cell.ratingKey`) and is never invented here — a reshaped
// index must not orphan a star somebody gave (PLAN §9).

let stars = new Set()

export const starsReady = api('/api/stars')
  .then((all) => { stars = new Set(all); return all })
  .catch(() => [])

export const isStarred = (key) => stars.has(key)

export async function setStar(key, starred) {
  const before = stars.has(key)
  if (starred) stars.add(key)
  else stars.delete(key)
  try {
    await api('/api/star', { key, starred })
  } catch (err) {
    // Put it back: a widget showing a star the server does not have is a lie.
    if (before) stars.add(key)
    else stars.delete(key)
    throw err
  }
  return starred
}

/** Forget a key locally — for an asset that has just been deleted. */
export const forgetStar = (key) => stars.delete(key)

/**
 * ★ on one asset. One button that fills; the widget IS the star, there is no separate save.
 *
 * ⚠️ `onChange` EXISTS BECAUSE A STAR CAN MOVE A ROW (2026-08-30). 🎨 draws a `★ favourites` run
 * over the collections, so starring is not a class on a card there — it is a change to which
 * heading the thing lives under, and the shelf has to be rebuilt. Everywhere else it is still one
 * button repainting itself and the argument is simply absent.
 */
export function starWidget(key, onChange = null) {
  const b = el('button', { class: 'star', type: 'button', title: 'star this' }, '☆')
  const paint = () => {
    const on = isStarred(key)
    b.classList.toggle('on', on)
    b.textContent = on ? '★' : '☆'
    b.title = on ? 'starred — click to unstar' : 'star this'
  }
  b.addEventListener('click', async (ev) => {
    ev.stopPropagation()
    b.disabled = true
    try {
      await setStar(key, !isStarred(key))
      onChange?.(isStarred(key))
    } catch (err) {
      console.error(err)
    } finally {
      b.disabled = false
      paint()
    }
  })
  paint()
  starsReady.then(paint) // repaint once the stars arrive
  return b
}