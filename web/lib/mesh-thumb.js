// 🧊 A MESH THAT DRAWS ITSELF ONCE, AND IS A PICTURE FOREVER AFTER.
//
// ⚠️ THE FIELD WAS ALWAYS THERE. `ManifestCell.preview` has been a separate string from `master`
// since the index was written, and its comment names this exact case — "something the browser
// cannot show (a `.glb`'s `preview.png`)". Nothing here invents a concept; it fills a field that
// has been null for every mesh ever made.
//
// ⚠️ THE RENDERER MAKES THE STILL, WHICH IS WHY THERE IS NO SECOND IMPLEMENTATION. A native
// rasteriser at index time would be a platform-specific binary times three inside something we have
// to sign and notarise, for a picture the webview can already draw (§15.3). The canvas draws, hands
// back a PNG, the server writes it beside the master, and from the next index on a mesh tile is a
// plain <img> like every other cell — no GL context, no cost at a thousand assets.
//
// ⚠️ AND IT IS BEST EFFORT, ALWAYS. No WebGL2, a file that will not parse, a write that fails: the
// card falls back to the glyph it drew before any of this existed. A thumbnail is worth zero
// refusals.

import { api, href } from './shared.js?v=129'
import { readGlb } from './glb.js?v=129'
import { meshView } from './mesh-view.js?v=129'

/** Meshes already fetched this page-load, so a re-render of the feed does not re-download three
 *  megabytes. Keyed by content path, and it never needs clearing: a master is immutable. */
const done = new Map()

/**
 * ⚠️ NOTHING STARTS UNTIL THE TILE IS ON SCREEN (2026-08-30). A feed is built for thousands of
 * assets, and a mesh is megabytes: painting the shelf must not kick off one fetch per cell. The
 * observer also settles the attachment question that broke the first version of this — a callback
 * only ever fires for a node that is IN the document, so there is no detached-node case left to
 * guess about.
 *
 * `rootMargin` starts a tile a screen early, so scrolling normally lands on a drawn one.
 */
const watcher = typeof IntersectionObserver === 'function'
  ? new IntersectionObserver((entries, obs) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      obs.unobserve(entry.target)
      const start = entry.target.__drawMesh
      delete entry.target.__drawMesh
      void start?.()
    }
  }, { rootMargin: '600px' })
  : null

/**
 * Draw a `.glb` into a node, and keep the picture.
 *
 * @param path   the master's content-relative path
 * @param into   the element to put the canvas in — it is replaced, so the caller's fallback stays
 *               on screen until there is something better to show
 * @param size   canvas size in CSS pixels
 * @param orbit  draggable. False in a feed, true in ⓘ.
 * @param keep   upload the still as this master's `preview.png`. Only the feed does — the pane may
 *               be showing a mesh from any angle you dragged it to.
 * @param when   `visible` waits for the node to scroll into view; `now` draws immediately. ⓘ is
 *               `now` because the pane you just opened is by definition the thing you are looking
 *               at, and a feed is `visible`.
 */
export function drawMesh(path, into, { size = 240, orbit = false, keep = false, when = 'now' } = {}) {
  const run = () => paint(path, into, { size, orbit, keep })
  if (when === 'visible' && watcher) {
    // ⚠️ THE WORK HANGS OFF THE NODE, not off a closure in a list. A feed repaints and throws its
    // elements away; a queue of pending jobs would keep every one of them alive, and the observer
    // drops its reference the moment the node is collected.
    into.__drawMesh = run
    watcher.observe(into)
    return
  }
  void run()
}

async function paint(path, into, { size, orbit, keep }) {
  try {
    const cached = done.get(path)
    const bytes = cached ?? await (await fetch(href(path))).arrayBuffer()
    if (!cached) done.set(path, bytes)
    // `slice` because `readGlb` builds typed-array views onto this buffer and the cache hands the
    // same one out again.
    const mesh = readGlb(bytes.slice(0))
    if (!mesh) return
    const view = meshView(mesh, { size, orbit })
    if (!view) return
    // ⚠️ CHECKED HERE AND ONLY HERE. A feed repaints while megabytes are in flight, and putting a
    // canvas into a node that left the page is a live WebGL context nothing will ever dispose.
    // ⚠️ AND THE FIRST VERSION OF THIS CHECKED AT THE TOP TOO, WHICH BROKE THE WHOLE FEATURE: the
    // caller builds the host and calls straight in, so the node is ALWAYS detached on entry and
    // every mesh returned before it fetched anything. A guard that runs before the thing it guards
    // against can happen is not a guard.
    if (!into.isConnected) { view.dispose(); return }
    into.replaceChildren(view.node)
    // ⚠️ AFTER THE APPEND. The renderer reads `--mesh-ground` off the canvas's computed style, and
    // a detached node has none — drawing first would paint the fallback ground into a still that
    // is then kept forever.
    view.draw()

    if (keep) {
      const png = await view.snapshot()
      // One context per mesh, released the moment the still exists — a browser allows about
      // sixteen live ones and kills the oldest past that, which in a feed is the tiles you
      // already scrolled past going blank.
      view.dispose()
      if (png) {
        await api('/api/preview', { path, png: await asBase64(png) })
        into.replaceChildren(Object.assign(document.createElement('img'), {
          src: URL.createObjectURL(png), alt: '',
        }))
      }
    }
  } catch {
    // The glyph card the caller drew is already on screen and stays there.
  }
}

async function asBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let s = ''
  // Chunked: `String.fromCharCode(...bytes)` on a few hundred KB blows the argument limit, which
  // is a crash that only shows up on the meshes big enough to matter.
  for (let i = 0; i < bytes.length; i += 8192) {
    s += String.fromCharCode(...bytes.subarray(i, i + 8192))
  }
  return btoa(s)
}
