// THE DECK — one sound at a time, for the whole app.
//
// ⚠️ ONE <audio> ELEMENT, NOT ONE PER ROW (2026-08-22). A feed of songs built for a real library is
// hundreds of rows, and an <audio> element in each is hundreds of media elements the browser has to
// keep — every one of them a decoder slot, and Safari runs out. The list draws a ▶ per row, which
// is a button; the sound comes from here.
//
// ⚠️ AND ONE AT A TIME IS A RULE, NOT A HABIT. Two songs playing over each other is not a
// comparison, it is noise, and it is what a grid of players gives you the moment you press the
// second one. The deck pauses whatever else was going, and anything that starts anywhere else —
// the full player in ⓘ — pauses the deck. Both directions, or the rule only holds half the time.
//
// ⚠️ NO SCRUBBER IN THE LIST. A row is for finding the one you want; judging it properly is ⓘ,
// which carries a real player with a timeline on it — the same split as ▦ and `⤢ full size`.
//
// ⚠️ BUT THE LIST DOES ADVANCE, AND IT SHOWS WHERE IT IS (2026-09-04). Judging forty takes was
// forty clicks, and between them the app said nothing about how far through one you were or which
// one was even sounding once you had scrolled past its row. Three things fix that without adding
// any furniture: a track that ends starts the next one down the list, the playing row carries its
// own progress, and space / ↑ / ↓ drive it from the keyboard. What is NOT here is still a
// scrubber — seeking is judging, and judging is ⓘ.

const deck = new Audio()
let source = ''

/** The ▶ glyphs currently on screen. Detached ones are dropped as they are found, which is what
 *  keeps this from growing every time the shelf repaints. */
const marks = new Set()

/** The ▶s on screen, in the order they are drawn — which is the order the list is sorted and
 *  filtered into, because a repaint rebuilds them. Asking the document rather than trusting the
 *  set's insertion order: a shelf appends a window at a time, and a row that was drawn later can
 *  still sit higher up. */
function inOrder() {
  const live = [...marks].filter((m) => m.node.isConnected)
  return live.sort((a, b) => (a.node.compareDocumentPosition(b.node)
    & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
}

/** The row a ▶ belongs to, when it is in one — every shelf row is a `.browse-item`. */
const rowOf = (mark) => mark.node.closest?.('.browse-item') ?? null

/**
 * ⚠️ A BUTTON IS BORN DETACHED, AND PRUNING ON THAT KILLED THE WHOLE MECHANISM (2026-09-04).
 * `playButton` builds the node and calls this to paint its first state — but the cell is not in
 * the document yet at that moment, so `!isConnected` was true for every button ever made, and the
 * first thing this did was delete the mark it had just been given. Nothing was ever tracked: the
 * glyph never became ⏸, the playing row never lit, and the progress hairline never had a row to
 * draw on. A mark is dropped once it has been in the document and then left it — which is what
 * "this row was repainted away" actually looks like.
 */
function announce() {
  for (const mark of marks) {
    if (mark.node.isConnected) mark.seen = true
    else if (mark.seen) { marks.delete(mark); continue }
    const live = mark.src === source
    const on = live && !deck.paused
    mark.node.textContent = on ? '⏸' : '▶'
    mark.node.classList.toggle('on', on)
    // ⚠️ THE ROW SAYS IT TOO, not only the glyph. A 26px button changing shape is not something
    // you find again after scrolling; a row that is visibly the one playing is.
    const row = rowOf(mark)
    if (!row) continue
    row.classList.toggle('playing', live)
    if (!live) row.style.removeProperty('--played')
  }
  // `paintProgress` tells the ⓘ timeline; doing it twice per event only draws twice.
  paintProgress()
}

/** How far through, as a percentage, on the playing row alone. */
function paintProgress() {
  if (!source) return
  const at = deck.duration > 0 ? (deck.currentTime / deck.duration) * 100 : 0
  for (const mark of marks) {
    if (mark.src !== source) continue
    rowOf(mark)?.style.setProperty('--played', `${at.toFixed(2)}%`)
  }
  tell()
}

for (const ev of ['play', 'pause', 'ended', 'error']) deck.addEventListener(ev, announce)
deck.addEventListener('timeupdate', paintProgress)
for (const ev of ['loadedmetadata', 'seeked']) deck.addEventListener(ev, tell)

/**
 * ⚠️ ONE ENDS, THE NEXT STARTS. A list of takes is reviewed by listening down it, and stopping
 * dead after each one made that forty presses. It steps through what is DRAWN — the window, in
 * the order you are looking at — so it follows your sort and your filter, and it stops at the
 * edge of the window rather than fetching more behind your back.
 */
deck.addEventListener('ended', () => { step(1) })

/** Play the track `delta` rows from the one going. Returns false when there is nowhere to go,
 *  so a key press that did nothing can fall through to the browser. */
export function step(delta) {
  // ⚠️ NOTHING LOADED MEANS NOTHING TO STEP. An arrow key must not START the list — on a shelf of
  // songs you have not pressed play on, ↓ is you scrolling, and hijacking it to begin playing is
  // the app answering a question nobody asked.
  if (!source) return false
  const list = inOrder()
  if (!list.length) return false
  const at = list.findIndex((m) => m.src === source)
  const next = list[at < 0 ? (delta > 0 ? 0 : list.length - 1) : at + delta]
  if (!next) return false
  play(next.src)
  rowOf(next)?.scrollIntoView?.({ block: 'nearest' })
  return true
}

/** Play or pause whatever the deck is already holding. False when it is holding nothing. */
export function togglePlaying() {
  if (!source) return false
  if (deck.paused) void deck.play().catch(() => announce())
  else deck.pause()
  announce()
  return true
}

/** Start one outright — no toggle. What `step` needs, and what `toggle` is built on. */
function play(src) {
  if (source !== src) { source = src; deck.src = src }
  deck.play().catch(() => announce())
  announce()
}

// Anything else that starts — the full player in ⓘ — takes the deck's place, and vice versa.
// Capture, because a media element's `play` does not bubble.
document.addEventListener('play', (ev) => {
  if (ev.target !== deck) deck.pause()
}, true)
deck.addEventListener('play', () => {
  for (const other of document.querySelectorAll('audio')) if (other !== deck) other.pause()
})

/** Play `src`, or pause it if it is the one already going. */
export function toggle(src) {
  if (source === src && !deck.paused) return deck.pause()
  play(src)
}

/** Anything that wants to be told when the deck moves — the ⓘ timeline. ONE, because ⓘ shows one
 *  asset: a new player replaces the old one rather than piling up listeners on dead nodes. */
let watcher = null
// ⚠️ A DECLARATION, NOT A `const` ARROW. The listener that registers this sits above it in the
// file, and a const is in its temporal dead zone until the line that defines it runs — so the
// module threw `Cannot access 'tell' before initialization` while it was still evaluating, which
// takes down every module that imports it and leaves the app on "loading". A function declaration
// is hoisted, and the order of two lines stops being load-bearing.
function tell() { if (watcher) { try { watcher(look()) } catch { /* a dead panel */ } } }

/** What the deck is doing, for anything drawing it. */
export function look() {
  return {
    src: source,
    playing: !!source && !deck.paused,
    at: deck.currentTime || 0,
    duration: Number.isFinite(deck.duration) ? deck.duration : 0,
  }
}

/** m:ss — the only clock a track needs. */
const clock = (sec) => {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const s = Math.floor(sec)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * ⚠️ SEEKING IS THE ONE THING A ROW MUST NOT DO AND ⓘ MUST. Jumping to 1:12 is judging, and
 * judging is what the band is for — so the deck knows how, and only the band asks.
 */
export function seek(src, fraction) {
  const go = () => {
    const d = deck.duration
    if (Number.isFinite(d) && d > 0) deck.currentTime = Math.max(0, Math.min(1, fraction)) * d
  }
  if (source !== src) {
    play(src)
    deck.addEventListener('loadedmetadata', go, { once: true })
    return
  }
  go()
  if (deck.paused) void deck.play().catch(() => announce())
}

/**
 * THE ⓘ PLAYER — the same deck, with a timeline over it.
 *
 * ⚠️ IT IS NOT A SECOND PLAYER, AND THAT WAS THE BUG (2026-09-04). ⓘ built its own `<audio
 * controls>` and so did every card in ▦, so the app had three players for one sound: press ▶ in
 * ☰, switch to ▦ or open ⓘ, and what you saw was a player that had never been started while the
 * deck was still sounding behind it. One deck, three faces — a glyph in a row, a glyph on a card,
 * and this, which is the only one that can seek.
 */
export function deckPlayer(src, title = '') {
  const btn = playButton(src, title)
  btn.classList.add('play-big')
  const fill = el('span', { class: 'dp-fill' })
  const bar = el('div', { class: 'dp-bar', title: 'jump to a point' }, fill)
  const time = el('span', { class: 'dp-time' })
  bar.addEventListener('click', (ev) => {
    const box = bar.getBoundingClientRect()
    if (box.width > 0) seek(src, (ev.clientX - box.left) / box.width)
  })
  const paint = (st) => {
    const mine = st.src === src
    fill.style.width = `${mine && st.duration ? (st.at / st.duration) * 100 : 0}%`
    time.textContent = mine && st.duration ? `${clock(st.at)} / ${clock(st.duration)}` : ''
  }
  watcher = paint
  paint(look())
  const node = document.createElement('div')
  node.className = 'deck-player'
  node.append(btn, bar, time)
  return node
}

/** Small helper so this file needs nothing from the rest of web/. */
function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v)
  n.append(...kids)
  return n
}

/** A row's play button, wired and self-updating. */
export function playButton(src, title = 'play it — press again to stop') {
  const btn = document.createElement('button')
  btn.className = 'btn mini play-glyph'
  btn.title = title
  btn.textContent = '▶'
  btn.addEventListener('click', (ev) => { ev.stopPropagation(); toggle(src) })
  marks.add({ node: btn, src, seen: false })
  announce()
  return btn
}
