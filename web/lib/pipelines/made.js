// 🎼 music · 🗣 voices · 🧊 3D — the three media that are NOT pictures, as one factory.
//
// ⚠️ THIS IS A FACTORY AND NOT THREE FILES, because the three differ in three things and agree
// about everything else. What differs: the medium, the words on the ask bar, and how a master is
// shown — a player, or a card saying what it is. What agrees: the feed, the facet, the table, the
// ⓘ band, what ▶ checks before it queues, and the request it builds. Writing that three times
// would be three places for "a workflow with a `ref` slot needs a picture attached" to be right in
// two of them.
//
// ⚠️ AND THE CONTROLS ARE NO LONGER ONE OF THE DIFFERENCES (2026-08-23). Each section used to pass
// a hand-written `knob` — 🎼 had a length and the other two had nothing — while the graphs they
// press declare a tempo, a key, a language and a lyric sheet, none of them reachable. They now
// come from the ARMED WORKFLOW (`engine().settable`, src/inference/knobs.ts), so a section no longer
// knows what its medium can be asked for and switching workflow changes the pane.
//
// ⚠️ AND IT IS NOT 🖼 images (2026-08-17). Images has a style picker, a size, a redraw slider, a
// negative and a clipboard; those are five image facts, and folding them into a shape that also
// serves a mesh would make one file about nothing. The two share what is genuinely shared — the
// tile, the browser, the ⓘ band — through browse.js and asset-detail.js.
//
// ⚠️ A STYLE ROW IN EVERY ONE OF THEM NOW (2026-08-29). It was 🗣 voices' alone, on the argument
// that "a picker offering none and nothing else is a control with no choice in it" — which was
// true, and was a fact about the LIST being empty rather than about the medium. It stayed empty
// because there was no editor: the style page was a child row under 🖼, so a music genre could be
// written to disk, parsed and validated and never once chosen. 🎨 is a band in the right pane now
// (web/lib/styles.js) and every section has a door to its own list, so every section gets the row
// that opens it. An empty list says "📚 has more", which is the truth and the next step.
//
// ⚠️ AND THE VOICE DOES NOT GO IN THE PROMPT. Here the sentence is the SCRIPT; the style rides in a
// param of its own and the words are left alone (src/styles/param.ts).

import { el, href } from '../launch-kit.js?v=129'
import { knobControls } from '../knobs.js?v=129'
import { mediaColumns, mediaFace, mediaGallery } from '../gallery.js?v=129'
import { detailArt, tile } from '../browse.js?v=129'
import { assetDetail } from '../asset-detail.js?v=129'
import { deckPlayer, playButton } from '../deck.js?v=129'
import { firstStep, starWidget } from '../shared.js?v=129'
import { stylePicker } from '../styles.js?v=129'
import { drawMesh } from '../mesh-thumb.js?v=129'

/**
 * THE ARTWORK, from what the SERVER said the browser can do with this master.
 *
 * ⚠️ READ OFF `group.player`, NOT OFF THE MEDIUM. The medium is the app's word for what you asked
 * for; `player` is the index's answer to "can a browser draw this" (src/content/index.ts), and it
 * is the one that has to be right — a `.glb` under an <img> is a broken-image box in the middle of
 * the grid whose whole job is showing you what you made.
 */
function artOf(asset, icon) {
  const player = asset.group?.player ?? 'img'
  // ⚠️ THE CARD PRESSES THE DECK, IT IS NOT A PLAYER (2026-09-04). Every card built its own
  // `<audio controls>`, which is the exact thing the deck exists to prevent — a grid of a hundred
  // songs was a hundred media elements, and Safari runs out of decoder slots — and it also meant
  // the app had two players for one sound: start a track in ☰, switch to ▦, and the card looked
  // stopped while the deck was still sounding. One deck, and a card is another face on it.
  if (player === 'audio') {
    const b = playButton(href(asset.master),
      `play ${asset.group?.title ?? asset.group?.slug ?? 'it'}`)
    b.classList.add('play-big')
    return el('div', { class: 'browse-blank browse-sound' }, b)
  }
  // ⚠️ THE SAME `preload="none"` BARGAIN AS AUDIO, and it matters more here: a feed of clips is
  // megabytes each, and a grid that fetched every one to draw a first frame would stall on the
  // window. NOT `muted`: that attribute exists to buy AUTOPLAY, and nothing here autoplays — the
  // tile waits for a press. It was on this element for a while and its only effect was that every
  // clip a video model had scored played back silent. `playsinline` stays because it costs nothing
  // and keeps a press playing in the tile rather than taking over the screen.
  if (player === 'video') {
    return el('video', {
      class: 'browse-video', controls: '', preload: 'none', playsinline: '',
      src: href(asset.master), ...(asset.preview ? { poster: href(asset.preview) } : {}),
    })
  }
  // ⚠️ A MESH DRAWS ITSELF, ONCE (2026-08-30). `preview` is the still a previous paint already
  // kept beside the master, and when it is there this is an ordinary <img> like every other cell —
  // no GL context, nothing to dispose, no cost in a feed of a thousand. When it is NOT there the
  // blank card goes up immediately and the canvas replaces it when the triangles have been read,
  // so a slow parse is never a hole in the grid. `orbit` is false here: a feed is for scanning, and
  // the angle you dragged one tile to would be a lie about the others.
  if (player === 'mesh') {
    if (asset.preview) return el('img', { src: href(asset.preview), alt: '' })
    const host = el('div', { class: 'browse-blank mesh-host' },
      el('span', { class: 'blank-glyph' }, icon))
    // `visible` — the tile is not in the document yet (this builds the card, browse.js inserts
    // it), and a feed of a thousand meshes must not start a thousand multi-megabyte fetches to
    // paint one screen. The observer fires when the tile scrolls in, which is also the first
    // moment the node is attached at all.
    drawMesh(asset.master, host, { size: 240, keep: true, when: 'visible' })
    return host
  }
  if (player === 'file') {
    return el('div', { class: 'browse-blank' },
      el('span', { class: 'blank-glyph' }, icon),
      el('small', { class: 'muted' }, asset.path.split('/').pop() ?? ''))
  }
  return el('img', { src: href(asset.preview ?? asset.master), alt: '' })
}

/**
 * THE ⓘ HEAD FOR A MESH — the same renderer, turned on.
 *
 * ⚠️ AND IT DOES NOT KEEP THE PICTURE. The feed's still is a three-quarter view of every mesh, so
 * they compare; this one is wherever you last dragged it to, which is the opposite of a thumbnail.
 * One renderer, two jobs, and only one of them writes a file.
 */
/** One ⓘ head box, shared with `detailArt` (web/lib/browse.js → `--detail-art`). */
const DETAIL_ART = 132

function meshHead(cell) {
  const host = el('div', { class: 'detail-mesh' })
  // ⚠️ `now`, AND ON THE NEXT FRAME. The pane you just opened is by definition what you are
  // looking at, so there is nothing to wait for — but the caller has not inserted this node yet,
  // and the renderer needs it attached to read the ground colour and to be worth a GL context.
  // ⚠️ THE SAME BOX AS EVERY OTHER ⓘ HEAD (2026-09-04). It drew at 300px, which made 🧊's band a
  // different shape from every other medium's — a viewer where a picture goes. It still TURNS,
  // which is the whole reason a mesh gets a canvas rather than a still: checking that the thing
  // actually built is a question you answer by rotating it, at any size.
  requestAnimationFrame(() => drawMesh(cell.master, host, { size: DETAIL_ART, orbit: true }))
  return host
}

/**
 * @param id      the route segment and the nav row's id
 * @param icon    nav glyph, and the card for a master no browser draws
 * @param label   nav text
 * @param medium  what ▶ makes here — `music` · `voice` · `model3d`
 * @param noun    plural, for the tally and the empty line
 * @param empty   the line shown before this medium has made anything
 * @param ask     `{ placeholder, hint }` for the shell's bar
 * @param needs   what to say when ▶ is pressed with an empty line and the workflow wants words
 * @param style   `{ label, none }` for this medium's style row — the ONE control here that names
 *                a style rather than setting a value on the graph. 🗣 calls it `voice`, because a
 *                voice IS a style and the app's own word would be the app's vocabulary over the
 *                person's. Everything a workflow declares a hole for comes from `settable` instead.
 * @param layout  which view the shelf opens in — `table` for the media you scan as a LIST rather
 *                than look at (see the columns below).
 */
function mediaSection({
  id, icon, label, medium, noun, empty, ask, needs, what, style = {}, layout = 'grid',
}) {
  return {
    id,
    icon,
    label,
    group: 'media',
    // ⚠️ ONE LINE, FOR THE MAP xoko IS GIVEN (web/lib/xoko-map.js). Not a docstring and not a
    // tooltip: it is what the assistant is told this place is FOR, so it can send somebody here
    // without having been taught the app.
    what,
    // ⚠️ WHAT THIS SECTION MAKES. The shell's 🔌 picker offers only services of this medium, so a
    // brain — or an image engine — can never be armed here as the thing that answers ▶.
    medium,

    create(ctx) {
      const extra = stylePicker(ctx, medium, style)
      // ⚠️ THE ASK-SHAPED KNOBS, FROM THE ARMED WORKFLOW. Rebuilt in `engineChanged` rather than
      // once here: arming `music-sung` over `music-fast` adds a lyric sheet and a language, and a
      // pane built at create-time would still be offering the instrumental one's four fields.
      // ⚠️ NO MEDIUM ARGUMENT ANY MORE (2026-08-31). The knob memory is keyed by WORKFLOW now — a
      // `cfg` set for the careful profile must not follow you onto the quick one — so what these
      // controls belong to is told to `show`, which already runs on every arming.
      const dials = knobControls()
      // Whether this medium makes a SOUND, which is what the list's ▶ and length columns are for.
      // Off the medium rather than off `group.player`, because a column is declared once for the
      // whole shelf and the shelf is one medium.
      //
      // ⚠️ 🔊 IS AUDIO TOO, AND IT WAS LEFT OUT (2026-09-04). This read `music || voice`, written
      // when those were the two audio shelves — and 🔊 sounds arrived afterwards as its own
      // section (2026-08-23) without being added here. So a door slam got the column layout of a
      // picture: a thumbnail slot with no picture to put in it, no length, and NO ▶ AT ALL, on
      // the one shelf whose whole review loop is pressing play down a list of three-second
      // takes. The list is the medium's own answer to "does this play", so it is a list.
      const sound = ['music', 'voice', 'sound'].includes(medium)

      /**
       * RUNS AS — a readout, not a form, and the same one 🖼 images carries.
       *
       * ⚠️ IT EXISTS BECAUSE THESE THREE MEDIA ARE ALL COMFYUI TODAY, and a ComfyUI workflow is a
       * GRAPH: what it will actually do is not derivable from any field in this pane. The one
       * honest thing to show is which workflow answered, on which service, and a door to it.
       */
      const withRows = el('div', { class: 'rw-rows' })
      const runsAs = el('div', { class: 'renders-with' },
        el('div', { class: 'rw-head muted' }, 'runs as'), withRows)

      const options = el('div', { class: 'band-rows' },
        extra.row, dials.node, runsAs)

      function engineChanged() {
        const armed = ctx.engines()
        dials.show(
          armed[0]?.settable ?? [],
          armed[0] ? `${armed[0].id}/${armed[0].workflow ?? 'default'}` : 'none',
          armed[0]?.presets ?? null,
        )
        withRows.replaceChildren(...armed.map((e) => el('a', {
          class: 'rw-row',
          href: '#/inference',
          title: [e.label ?? e.id, e.notes ?? '', '— open it in 🔌'].filter(Boolean).join('\n'),
        },
        el('span', { class: 'rw-ic' }, icon),
        el('span', { class: 'rw-name' }, e.workflow ? `${e.kind} · ${e.workflow}` : e.id),
        el('span', { class: 'spacer' }),
        el('span', { class: 'rw-nums muted' }, e.label ?? e.id))))
        if (!armed.length) {
          withRows.replaceChildren(el('p', { class: 'muted' }, firstStep(ctx, noun)))
        }
      }

      /**
       * ⚠️ THE THREE REFUSALS ARE THE SECTION'S WHOLE JOB BEFORE THE QUEUE. Each of them is also
       * checked on the server against the resolved workflow; saying it here means finding out before
       * a job than after one.
       */
      function buildRequest(said) {
        const picked = ctx.engines()
        if (!picked.length) {
          ctx.flash(firstStep(ctx, noun), true)
          return null
        }
        // Words are the WORKFLOW's requirement, never the medium's: an image-to-3D workflow declares
        // no `prompt` at all and is pressed with an empty line, on purpose.
        const wants = picked[0]?.inputs ?? ['prompt']
        if (wants.includes('prompt') && !said.trim()) { ctx.flash(needs, true); return null }
        const refs = ctx.refs?.() ?? []
        const slots = picked[0]?.slots ?? []
        if (slots.length && refs.length < slots.length) {
          ctx.flash('attach a picture first — drop one on the bar, or ＋', true)
          return null
        }
        return {
          medium,
          text: said.trim(),
          // Absent unless the ✎ name box has something in it — the server reads a name off the ask
          // otherwise, and sending `''` would be a third way to say the same thing.
          ...(dials.title() ? { title: dials.title() } : {}),
          // ⚠️ NULL, NEVER OMITTED — `style` is a key the request parser knows and an absent one
          // reads the same as "none", which is what a section with no picker means.
          style: extra.style(),
          ...(refs.length ? { refs } : {}),
          // Per-service, the same shape every other section sends. `params.model` is absent
          // because the WORKFLOW names its own checkpoint — sending both would be two answers to
          // one question.
          inference: picked.map((e) => ({
            id: e.id,
            ...(e.workflow ? { workflow: e.workflow } : {}),
            params: dials.params(),
          })),
        }
      }

      const gallery = mediaGallery(ctx, {
        medium,
        noun,
        empty,
        layout,
        // ONE FACET, AND IT IS THE ENGINE — the same as 🖼 images, and for the same reason: with
        // one service the service means "everything", and it is the checkpoint you judge.
        facets: [{
          key: 'engine', label: 'engine',
          of: (a) => a.gen?.model ?? '',
          group: (a) => a.inference ?? '',
        }],
        search: (a) => [a.group?.title, a.group?.ask, a.group?.slug, a.gen?.model, ...(a.tags ?? [])].join(' '),
        onPick: ctx.onPick,
        cell: (a) => tile({
          art: artOf(a, icon),
          ...mediaFace(a),
          star: a.ratingKey ? starWidget(a.ratingKey) : null,
          badge: a.siblings > 1
            ? { text: `⧉${a.siblings}`, title: `${a.siblings} engines answered this one ask` }
            : null,
        }),
        // The ☰ table: the shared media row (web/lib/gallery.js), which was assembled out of
        // this one and 🖼's. ⚠️ AND FOR AUDIO THIS IS THE VIEW, NOT THE ALTERNATIVE ONE
        // (2026-08-22). A grid exists to compare LOOKS; a song has none, so ▦ was a wall of
        // identical grey player widgets — the shape of an image imposed on something that is not
        // one. Audio opens here, where the name reads as a title, the length is a number you can
        // sort, and ▶ is the first thing under your thumb. The one player is the deck's
        // (web/lib/deck.js), not a widget per row.
        columns: mediaColumns({ sound, icon }),
      })

      return {
        feed: gallery.root,
        options,
        ask: {
          placeholder: ask.placeholder,
          hint: ask.hint,
          make: async (said, btn) => {
            const request = buildRequest(said)
            if (!request) return false
            const ok = !!(await ctx.generate(request, btn))
            // A name belongs to one song. Cleared only on a press that landed, so a refusal leaves
            // what you typed where you typed it.
            if (ok) dials.clearTitle()
            return ok
          },
          // ✨ HOW THE NEXT PRESS SHOULD COME OUT. The control moves on screen and then the
          // ordinary ▶ runs — see images.js for why it is never a second payload path.
          //
          // ⚠️ A SLUG OR THE WORDS THEMSELVES (2026-08-23). It took a slug and nothing else, which
          // made a style a PREREQUISITE: "read that as a happy kid" on a machine with no happy kid
          // installed was refused, and the ask went nowhere. A style is optional text that shapes a
          // result — so a name that is in the list picks it, and anything else is typed into the
          // channel this medium keeps for a description (`shaping`, src/inference/knobs.ts).
          useStyle: async (words) => {
            if (!words) return null
            if (extra.use) {
              // ⚠️ ONE RELOAD BEFORE MOVING ON. A voice taken thirty milliseconds ago is on disk
              // and not yet in this select — the section's own reload is in flight. Giving up here
              // would ignore a style somebody just watched arrive and retype its name as prose.
              if (!extra.use(words)) return null
              await extra.load?.()
              if (!extra.use(words)) return null
            }
            const channel = dials.shaping()
            if (channel && dials.set(channel, words)) return null
            return `${noun === '3D' ? '3D' : noun} take no ${channel ?? 'style'} — say it in the ask instead`
          },
          // ✨ AND WHAT THE PRESS IS SET TO — `▶ make music [duration 90, bpm 72]: …`. Same rule as
          // the style: the controls move on screen and the ordinary ▶ runs. A knob this workflow has
          // no hole for is refused by name, because a tempo that silently did nothing is worse than
          // one that was turned down.
          useSettings: async (values) => dials.setAll(values),
        },
        refresh: () => { gallery.refresh(); engineChanged(); void extra.load() },
        engineChanged,
        detail: (sel) => assetDetail(ctx, sel, {
          empty: `pick ${noun === '3D' ? 'a model' : `one of the ${noun}`} in the feed`,
          // The ⓘ head is the same picture the tile carries — a player you can scrub, or the
          // card that says what the file is. A thumbnail would be a broken image.
          head: (cell) => {
            const player = cell.group?.player ?? 'img'
            if (player === 'img') return detailArt(href(cell.preview ?? cell.master))
            // ⚠️ NOT THE FEED'S STILL. ⓘ is where you check whether the thing actually built, and
            // that question is answered by turning it — a fixed three-quarter picture is what the
            // tile already showed you.
            if (player === 'mesh') return meshHead(cell)
            // ⚠️ AND THE ONE PLACE THAT CAN SEEK. A row finds the take, ⓘ judges it — so this is
            // the deck with a timeline over it rather than a second player that knows nothing
            // about what is already sounding.
            if (player === 'audio') {
              return deckPlayer(href(cell.master),
                `play ${cell.group?.title ?? cell.group?.slug ?? 'it'}`)
            }
            return artOf(cell, icon)
          },
          // ⚠️ ⤢ IS ONLY OFFERED WHERE IT MEANS SOMETHING. A tab pointed at a `.glb` downloads it
          // again, which this app has already done once; 📁 reveal is the real verb for a mesh.
          open: ['file', 'mesh'].includes(sel?.cell?.group?.player ?? 'img')
            ? null
            : { label: '⤢ open', title: 'open the master on its own' },
        }),
      }
    },
  }
}

// ── the three ─────────────────────────────────────────────────────────────────────────────────
//
// ⚠️ CONFIGURED HERE, NOT IN shell.js. The nav array is a REGISTRY — a list of what the app has —
// and a section that arrived as eight lines of literal would be the one row in it that also holds
// its own implementation. The `ph()` placeholders these replaced were data for the same reason.

/**
 * ⚠️ A VOICE IS A STYLE, AND THE PICKER WAS THE WHOLE FIX (2026-08-22). 🗣 used to take a script and
 * nothing else, which meant every line came out in whatever voice the armed workflow happened to
 * describe — the section built for CHARACTER voices could only ever produce one. Two workflows that
 * differed by four words of `instruct` were the library trying to say the same thing in the only
 * place it had: a workflow is a PATH THROUGH AN ENGINE, and "an old sailor, gravelly" is not a path,
 * it is what you want. It is a style, in the exact sense layer 3 already means.
 *
 * ⚠️ AND IT CARRIES THE SEED. A voice-design model turns a description into a timbre WITH the seed;
 * the same words on a fresh number is a different person. The style pins it (`Style.seed`), which
 * is what makes the sailor one sailor across every line he reads rather than a new stranger each
 * press. That is also why this list starts EMPTY and fills from 📚 — a voice is content, and the
 * app ships none of it.
 *
 * ⚠️ THE CONTROL ITSELF IS SHARED NOW (2026-08-29, `stylePicker`). It was written here and again in
 * 🖼, over one list shape, and the two had drifted into different groupings, different empty
 * options and different storage keys. All that is left of the difference is the two words below.
 */
const VOICE_STYLE = { label: 'voice', none: "the workflow's own" }

export const music = mediaSection({
  id: 'music',
  icon: '🎼',
  label: 'music',
  medium: 'music',
  noun: 'songs',
  what: 'every song made here, and the named looks they are made in',
  empty: 'nothing made yet — say what it should sound like, below',
  ask: {
    placeholder: 'slow lo-fi, rain, a tired piano · brass and a marching drum',
    hint: 'a mood, some instruments, a tempo. the length is on the right.',
  },
  needs: 'say what it should sound like',
  layout: 'table',
})

export const voices = mediaSection({
  id: 'voices',
  icon: '🗣',
  label: 'voices',
  medium: 'voice',
  noun: 'voices',
  what: 'every line read aloud here — this bar takes the script itself, not a description of it',
  empty: 'nothing read yet — type the line you want spoken, below',
  ask: {
    // ⚠️ THE LINE HERE IS THE WORDS THEMSELVES, not a description of them. Every other section's
    // bar takes a description; this one takes the script, and the placeholder has to say so or
    // the first press produces a voice reading "a warm narrator".
    placeholder: 'the words you want spoken, exactly as you want them said',
    hint: 'this is the script, not a description. who says it is the voice on the right.',
  },
  needs: 'type the line you want spoken',
  style: VOICE_STYLE,
  layout: 'table',
})

export const threed = mediaSection({
  id: 'threed',
  icon: '🧊',
  label: '3D',
  medium: 'model3d',
  noun: '3D',
  what: 'every mesh made here — most 3D workflows take a picture rather than a sentence',
  empty: 'nothing made yet — attach a picture and press ▶',
  ask: {
    // ⚠️ THE ONE SECTION WHERE THE BAR IS OPTIONAL. An image-to-3D workflow declares no `prompt`:
    // what you attach IS the ask, and `buildRequest` presses with an empty line without
    // complaining. The line is still worth typing — it becomes the run's name on disk.
    placeholder: 'attach a picture — a line here just names the run',
    hint: 'the picture is the ask. a cut-out on transparency beats a photo.',
  },
  needs: 'attach a picture first',
})

/**
 * ⚠️ SOUND IS NOT MUSIC, AND THIS IS THE SHELF THAT SAYS SO (2026-08-23). They share a container,
 * a player and every line of this file; they disagree about what a list is for. A song is judged
 * as a composition over minutes and you own a few dozen. A door slam is judged in three seconds
 * and you own hundreds, sorted by what they are of. One shelf for both sorts a rain bed against a
 * ballad, and the search box stops meaning anything.
 */
export const sounds = mediaSection({
  id: 'sounds',
  icon: '🔊',
  label: 'sound',
  medium: 'sound',
  noun: 'sound',
  what: 'every effect, bed and ambience made here — the short ones, not the songs',
  empty: 'nothing made yet — describe a sound and press ▶',
  ask: {
    placeholder: 'a heavy wooden door slamming shut in a stone corridor',
    hint: 'what it is OF, plus the room it is in. length is on the right — a door is one second.',
  },
  needs: 'describe the sound you want',
  layout: 'table',
})

export const videos = mediaSection({
  id: 'videos',
  icon: '🎬',
  label: 'video',
  medium: 'video',
  noun: 'video',
  what: 'every clip made here — a few seconds each, and the slowest thing this app renders',
  empty: 'nothing made yet — describe a shot and press ▶',
  ask: {
    // ⚠️ IT IS A SHOT, AND SAYING SO IS THE WHOLE HINT. A video model takes the same sentence a
    // picture model does plus the one thing a picture has none of — what MOVES — and a prompt
    // written for 🖼 produces five seconds of a photograph sitting still.
    placeholder: 'a fishing boat rocking in heavy swell, rain on the lens, camera pushing in',
    hint: 'say what MOVES — the subject, the camera, or both. a still description renders a still.',
  },
  needs: 'describe the shot you want',
})

