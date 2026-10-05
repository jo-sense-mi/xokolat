// shell.js — the single-page workspace shell.
//
// Three panes: left = the nav (the CLASSIFICATION, and nothing but sections), center = the
// section's content FEED with the ✍ ask bar FLOATING over it, right = ⚙ options · ⓘ selection,
// as tabs — with the ▶ queue able to supersede the whole column.
//
// ⚠️ WHERE THE GLOBAL THINGS LIVE, and why neither of them has furniture (2026-08-07):
//
//   ▶ queue → THE BAR BUTTON, AND AN OVERLAY. It has been a dock band, a full-width page, a
//      list inside the nav, and a third dock tab. Every one of those gave a permanent seat to
//      something you look at occasionally. The button in the bar already IS the readout — count,
//      elapsed, colour, and the running job's name in its title — so pressing it puts the list
//      over the right pane, and pressing it again puts back exactly what was there.
//
// That retired the 46px `.shell-rail` (it existed so a collapsed right pane would not hide
// in-flight jobs — the bar button does that now) and, with it, the ▶ page.
//
// ⚠️ AND 🔌 ENGINES IS NO LONGER ONE OF THEM (2026-08-29). It was the second entry in that list:
// a popover on the ask bar, with a TAB PER MEDIUM, holding one app-wide answer per capability.
// Two things were wrong with it and they are the same thing twice. It put a DEFAULT in the place
// you TYPE — so the setting sat next to the sentence rather than next to the ▶ it governs — and
// it made "which engine answers this" a question asked once for the whole app, which a chain
// cannot live with: a composition's third step may want a different i2i from the one the shelf
// uses, and it may need one from the same family as its first step.
//
// So the stack moved into the SECTION'S ⚙ BAND, showing that section's own medium and nothing
// else, which is where a composition has kept its per-step plug since 2026-08-24. One shape,
// two users. The chip under the sentence stays as a READOUT and opens ⚙ — never a second place
// to choose from.
//
// ⚠️ NOTHING IN THIS APP MOVES YOUR PANE FOR YOU. Not a pick, not a finished job, not an emptied
// queue. The tab strip and the two buttons are the only things that change what the right column
// is showing. A panel with something new says so with a dot.
//
// ⚠️ THE ASK BAR FLOATS, so the feed must RESERVE ITS HEIGHT. See `measureAsk` at the bottom of
// this file: a floating composer that merely overlaps would permanently cover the newest row of
// a picture grid, which is the one row you are looking at.
//
// ⚠️ VOCABULARY (DECISIONS.md): **inference** is the service that runs. An **engine** is what it
// can be asked for — a checkpoint, or a capability that is not a checkpoint. ONE settings row
// shows both (2026-08-07): they are two levels of one tree, not two destinations, and the 🧩
// page was already drawing the service header, endpoint and catalog line of the 🔌 one.
//
// Adapted from content-factory/studio/lib/shell.js. The LAYOUT, the band discipline, the
// routing and the mobile panes are its; the endpoints are ours, and every launch payload is
// built to `src/types/request.ts` instead of the factory's per-medium snake_case (PLAN §9 —
// "near-verbatim is FALSE for the launch path").
//
// A section is a REGISTRY ENTRY (lib/pipelines/*.js):
//   { id, icon, label, group?, create(ctx) → { feed, views?, options?, detail?, prompt?,
//     refresh?, engineChanged? } }
// `views` is the sub-page strip over a feed (PLAN §4d) — declared by the section, drawn by the
// shell. ⚠️ NOTHING DECLARES ONE TODAY (2026-08-29): its only user was 🎨 styles, which is a band
// in the right pane now. The routing (`#/section/view`) and the nav child rows are still here.
// A section contributes CONTENT to a band and never a layout. That is what makes sections feel
// like one app, and it is why the tenth one costs a file rather than a design.

import { MEDIUM_FACE, api, el, href, loadManifest, store } from './shared.js?v=129'
import { tabbed, took } from './launch-kit.js?v=129'
import { step as deckStep, togglePlaying } from './deck.js?v=129'
import { xokoAsk, xokoForget, xokoHere, xokoResume } from './xoko.js?v=129'
import { xokoMap } from './xoko-map.js?v=129'

import images from './pipelines/images.js?v=129'
// ⚠️ THREE SECTIONS FROM ONE MODULE, which is unlike every other import here — see made.js. They
// differ in the words on their bar and one knob, and nothing else, so they are configuration of a
// factory rather than three files repeating a gallery.
import { music, sounds, threed, videos, voices } from './pipelines/made.js?v=129'
import { compStylesView, pickedKey, stylesView } from './styles.js?v=129'
import files from './pipelines/files.js?v=129'
import library from './pipelines/library.js?v=129'
import inference from './pipelines/inference.js?v=129'
// ✨ THE CONNECTION, AND IT IS A SETTINGS SECTION RATHER THAN A BAND ON 🔌 (2026-08-30). See
// pipelines/xoko-connect.js: an LLM connects to xoko, once, and words stopped being a medium.
import xokoConnect from './pipelines/xoko-connect.js?v=129'
import { compositionSection, compositionId } from './pipelines/composition.js?v=129'
// ⚠️ THE QUEUE READS THE LIVE CHAINS (2026-08-24). A composition's progress used to be painted down
// the middle of its own section — in the column this app keeps for what you MADE. Where a run has
// got to is a queue question, and there is already a queue.
import { liveChains } from './chain.js?v=129'

// THE MENU. media → compositions → settings, and every row is a place that EXISTS.
//
// ⚠️ NO PLACEHOLDER ROWS, AND THERE IS NO LONGER A MECHANISM FOR ONE (2026-08-31). 💡 ideas,
// 📓 runbooks and 🔍 judge sat here printing "not built yet" under a phase number, and with them
// went the `batches` and `review` groups, `pipelines/placeholder.js`, the `ph()` helper and the
// `.soon` nav style. A row that announces its own absence is a promise with a date on it, and a
// fifth of the menu reading as scaffolding makes the app look unfinished rather than honest.
// The three ideas are good and they are written down in NEXT.md, which is where an unbuilt thing
// belongs. If one gets built it comes back as a section module, like every other row here.
//
// ⚠️ This array IS the nav's BUILT-IN half, and the group headers come from `group` (PLAN §9).
//
// ⚠️ AND IT IS NOT THE WHOLE NAV ANY MORE (2026-08-22). Compositions are rows too, and they are
// not in any array anybody wrote: they come off `/api/compositions`, one per chain you have taken,
// through `compositionSection`. `sections()` below is the two halves joined and is what every
// reader uses — this array is never read directly, because half the menu would be missing.
// ⚠️ ▶ QUEUE IS NOT IN HERE, AND NOT IN THE NAV AT ALL. Every row in this menu is a place you
// go; the queue is a readout and a list, and there is already a readout in the bar. It briefly
// had a nav row and that row was a second copy of the button — two readouts of one fact.
const SECTIONS = [
  images,
  // ⚠️ THE ORDER IS THE SENSES, NOT THE BUILD DATES. Pictures, then the two that are drawn but not
  // photographed, then the three you hear, then the two with a third dimension — time and depth.
  // A menu ordered by when we shipped things is a menu that reads as an archaeology.
  music,
  sounds,
  voices,
  videos,
  threed,

  // ⚠️ NO COMPOSITION ROWS HERE, AND THAT IS THE FIX (2026-08-20). 🧸 characters, 🏺 artifacts,
  // 🏷 sticker packs and 🖍 coloring books sat in this array for months, and they never belonged:
  // each of them is a COMPOSITION — a thing you take from 📚 or make here — and putting them in
  // the menu was compiling content into the app, in the one place left that still did.
  //
  // The `compositions` group is declared in GROUPS below and starts EMPTY. What appears under it
  // is what you own, so a user who takes a sticker pack gets a sticker-pack row and a user who
  // never does never sees one. Same rule as every other kind of thing: the app owns the format,
  // the library owns the content.
  //
  // ⚠️ NO `workbench` GROUP and no 🧬 lines row (PLAN §4d): styles live as a view INSIDE the
  // section that uses them, so there is nothing central to navigate to.
  // ⚠️ ✨ xoko LEADS THE SETTINGS GROUP, and it took the seat 📚 held (2026-08-30). Both are
  // first-run rows and only one of them can be first: the app ships nothing runnable AND nothing
  // to think with, and of those two the brain is the one that can then fetch the other. Connect it
  // and you can ask for the rest in words.
  xokoConnect,
  library,
  inference,
  files,
  // ⚠️ 🖼 media WAS HERE AND IS DELETED (2026-08-23). It held one card, for one medium, under a
  // heading about all of them — a WebP setting filed so generally that xoko read it as a
  // disk-usage report and said so to somebody. A setting that names a medium belongs in that
  // medium's section, and it is in 🖼 images now. What is left in this group has no medium: where
  // files live, which library, which brain.
]

/**
 * THE GROUPS, IN ORDER — declared, not derived.
 *
 * ⚠️ A HEADER USED TO APPEAR WHEN A SECTION'S `group` CHANGED (2026-08-20), which meant a group
 * with no sections in it could not exist at all. That is fine for a menu whose every row ships
 * with the app, and wrong for this one: `compositions` is an EMPTY SHELF on a fresh install, and
 * a group that cannot be empty is a menu that can only ever show what we put there.
 *
 * ⚠️ AN EMPTY SHELF SHOWS A DOOR, NOT A NOTICE. The first version printed "— nothing yet —" in
 * grey, which is the menu narrating its own absence: it tells you what you can already see and
 * gives you nowhere to press. `add` is a real nav row — same height, same hit target, same hover
 * as every other row — that goes where the first one comes from. It is the ＋ language the rest of
 * the app already speaks (＋ add a service, ＋ add a workflow, ＋ add a model).
 */
const GROUPS = [
  // The four things an engine can be asked for. FIXED, and pre-filled on purpose: nobody invents a
  // fifth medium, and every workflow anyone takes answers to one of these. Format, not content.
  { id: 'media' },
  // ⚠️ YOURS, AND EMPTY UNTIL YOU FILL IT. A character, an artifact, a sticker pack, a coloring
  // book — each is one composition, taken or made. The app ships none.
  { id: 'compositions', add: { label: 'add a composition', href: '#/library' } },
  // ⚠️ `pinned` PUTS IT OUTSIDE THE SCROLL (2026-08-31), in the nav's foot — see index.html. It is
  // a property of the GROUP rather than a rule in `buildNav`, for the same reason the order is
  // declared here: which shelf survives a long menu is a decision, and this is where the menu's
  // decisions are written down.
  { id: 'settings', pinned: true },
]

/**
 * ★ THE PLUG: WHICH WORKFLOW ANSWERS A CAPABILITY — `<service>|<slug>` (src/types/workflow.ts).
 *
 * ⚠️ AND THE SERVICE IS NOT A SEPARATE CHOICE ANY MORE (2026-08-12). There was an
 * `xokolat:inference:<medium>` key holding "which service this medium runs on", and every workflow
 * list was filtered by it — so a workflow living on a service you had not armed was INVISIBLE, and
 * you had to know which box a thing runs in before you could say what you wanted to make. The rows
 * are the kinds; each lists every workflow that answers for it across the medium's services; the
 * service is a FACT ABOUT THE ARMED WORKFLOW, read back off it. One less thing to choose, and the
 * state that used to be possible — a service armed whose workflows do not cover the kind you want —
 * cannot happen any more.
 *
 * The stored value carries the service because a slug alone collides: two services may both call
 * their editor `kontext`.
 *
 * The unit is a workflow rather than a checkpoint because plain SDXL takes no style reference while
 * SDXL plus an IP-Adapter does, and they are one file.
 *
 * ⚠️ AND THE KIND IS PART OF THE KEY (2026-08-09). It was one slug per medium for a few hours, and
 * that made choosing a kind DESTROY a choice: with one slot, switching to `edit` and back armed
 * "the first t2i workflow" rather than the SDXL you had picked. The checkpoint you edit with is not
 * the one you make with, and the app has to remember both to let you say so.
 *
 * ONE workflow per kind, still: several checkpoints answering one sentence was a comparison while
 * every checkpoint did the same job, and stops meaning anything once one edits and another cannot.
 *
 * ⚠️ AND THE MEDIUM IS NO LONGER PART OF IT (2026-08-13). A kind DECLARES its medium
 * (registries/kinds.json), and a verb that spans two media is two kinds — so `t2i` IS image and
 * `chat` IS text, and a key of both stored a fact it could always recover from one. That is not
 * merely redundant: `image:chat` was a reachable key for an unreachable state, and the 🔌 page's
 * star has no "current medium" to write under, so it could have written into the wrong bucket.
 * Old two-part keys simply stop resolving; each capability falls back to the registry's pick until
 * it is starred again.
 *
 * ⚠️ AND THE SECTION IS NOT PART OF IT EITHER (2026-08-29), which is the thing I nearly got wrong
 * while moving this into ⚙. "The plug belongs to the place that presses ▶" reads like it wants
 * `plug:<section>:<kind>` — but a KIND DECLARES ITS MEDIUM and a medium has exactly one section,
 * so the section is derivable from the key it would be added to. That is the same argument that
 * removed the medium above, and re-adding it under a different name would fork this from the 🔌
 * page's star for no gain. A COMPOSITION is the one thing that genuinely needs its own answer, and
 * it has one at a finer grain already — `xokolat:plug:<composition>:<step>`, one per STEP, because
 * two steps of one chain can want two different i2i workflows. Same word, same shape, one level down.
 */
const plugKey = (kind) => `xokolat:plug:${kind ?? 'any'}`
/** ⚠️ THE ARMED KIND IS ITS OWN VALUE, not read back off the armed workflow. Deriving it is what
 *  forced one slot per medium — see above. Stored beside the plugs, one per medium. */
const kindKey = (medium) => `xokolat:kind:${medium ?? 'any'}`
/** ⚠️ THE ONE RESERVED SETTING KEY, and it is the server's word (src/xoko/grammar.ts
 *  `WORKFLOW_SETTING`). `[workflow music-detail]` swaps which path answers rather than setting a value
 *  on the one already armed, so it is pulled out before the rest reach the knob controls. Repeated
 *  here rather than imported because the grammar is TypeScript this browser never loads; it is one
 *  word, and the test in tests/brain.test.ts is what holds the two together. */
const WORKFLOW_SETTING = 'workflow'
const MODE_KEY = 'xokolat:ask-mode'
const ROUTE_KEY = 'xokolat:route'
// ⚠️ RENAMED WITH ITS MEANING. It held '1'/'0' for "collapsed"; it holds 'shut'/'tabs' now, and
// never 'queue' — a summons is not a place you come back to.
const RIGHT_KEY = 'xokolat:right-pane'
/** ↔ HOW WIDE, IN PIXELS AND NEVER A PERCENTAGE. A percentage of a window that has since changed
 *  is a different number from the one you set, and it drifts every time you resize the window.
 *  Stored raw and CLAMPED ON EVERY READ instead — see `sizeRight`. */
const WIDTH_KEY = 'xokolat:right-w'
/** ⚠️ THE FLOOR IS THE FORM, NOT A ROUND NUMBER. The ⚙ rows are a 96px label plus a value
 *  (`.shell-opts .f-row > span`), an open workflow list indents 52px under its row, and a step's
 *  engine menu carries family labels. Below this the thing you came to read is the thing that
 *  gets cut. */
const RIGHT_MIN = 280
/** The left nav's fixed column (app.css → `.shell`). Here because the right pane's ceiling is
 *  worked out from what is left after it. */
const NAV_W = 190
const RIGHT_DEFAULT = 360
/* ⚠️ NO `RIGHT_SNAP`, AND NO DRAG-PAST-THE-EDGE CLOSE (2026-08-31). Dragging under 200px used to
 * shut the pane, announced by the grip turning red and the pane dimming underneath. That gesture
 * was the DISCOVERABLE way to close back when the alternative was a ⟩ button in a top bar; the ✕
 * on the tab strip is two centimetres away now, so it had become a second and worse way to do the
 * same thing — fired from the control whose job is sizing, and the one act on that handle you
 * cannot take back by carrying on with the drag. A whole warning apparatus for a hazard that no
 * longer has to exist. `RIGHT_MIN` is the floor and stopping there is all a drag does. */
/** ⚠️ THE CEILING IS THE FEED'S FLOOR, EXPRESSED FROM THE OTHER END. The centre pane is
 *  `minmax(0, 1fr)` and will shrink to nothing without complaining, which is the one way this
 *  control can leave the app unusable. 190px of nav plus this is what the right column may never
 *  eat into — about three columns of a picture grid, which is the narrowest a feed is still a
 *  feed. The 60% term is what holds on a very wide screen, where subtracting a constant would
 *  allow a pane wider than the thing it is describing. */
const FEED_MIN = 330
/** Which install these memories belong to — see the check at the top of boot(), and src/install.ts. */
const INSTALL_KEY = 'xokolat:install'

export async function boot() {
  const feedHost = document.getElementById('feed')
  const dockHost = document.getElementById('dock')   // the ask bar's home — see paintAsk()
  const optsHost = document.getElementById('opts')
  const navHost = document.getElementById('nav')
  // THE NAV IS THREE HOSTS: what scrolls, what is pinned under it, and the chrome below that.
  // See the note in index.html for why the scroll belongs to the middle one.
  const navScroll = document.getElementById('nav-scroll')
  const navPinned = document.getElementById('nav-pinned')
  const navFoot = document.getElementById('nav-foot')
  const note = document.getElementById('note')
  const crumb = document.getElementById('crumb')
  const queueBtn = document.getElementById('queue-btn')
  const queueN = document.getElementById('queue-n')
  const queueT = document.getElementById('queue-t')
  const scrim = document.getElementById('scrim')
  // ↔ Declared up here rather than beside its drag handlers, because `setRight` — which runs long
  // before those — is what writes its title and its shut/open look now that ⟩ is gone.
  const grip = document.getElementById('right-grip')

  const flash = (msg, isError = false) => {
    note.textContent = msg
    note.style.color = isError ? 'var(--err)' : 'var(--muted)'
    setTimeout(() => { if (note.textContent === msg) note.textContent = '' }, 8000)
  }

  // ⚠️ BEFORE A SINGLE STORED KEY IS READ (2026-08-18). Half of what this app remembers is not in
  // app data: the armed workflow per kind, the armed kind per medium, every shelf's layout and sort,
  // the route you were on. `npm run clear` can delete every file the app ever wrote and none of
  // that goes with it — the page comes back arming a workflow that no longer exists. So the browser
  // asks which install it is talking to and drops the lot when the answer changed. It is also the
  // right behaviour for a second data root on a dev machine: different install, different memories.
  try {
    const { install } = await api('/api/status')
    if (install && store.get(INSTALL_KEY) !== install) {
      localStorage.clear()
      store.set(INSTALL_KEY, install)
    }
  } catch { /* a server that is not answering is reported by the boot fetches below */ }

  // ── state ───────────────────────────────────────────────────────────────────
  let manifest = { media: [], chains: [], generatedAt: '' }
  let shelf = []                 // /api/inference — one row per SERVICE, is it there
  let services = []              // /api/engines — what each service can be asked for
  let media = ['image']          // /api/inference — the generated-media vocabulary, server-owned
  // ✨ WHAT XOKO IS CONNECTED TO — the one `role: 'brain'` row, or null. Not a medium and not an
  // armed workflow: there is one connection, made in ✨ xoko (web/lib/pipelines/xoko-connect.js).
  const xokoOn = () => shelf.find((s) => s.role === 'brain') ?? null
  /** …and which model it thinks with, off the same catalogue 🔌 draws. */
  const xokoModel = (row) =>
    services.find((s) => s.id === row?.id)?.engines?.find((e) => e.isDefault) ?? null
  let vocab = {}                 // …and the words the 🔌 editor's menus are made of
  let instances = {}             // id → { desc, inst }
  // 🧩 THE NAV ROWS YOU OWN — one per composition, rebuilt whenever the folder changes. Empty on a
  // fresh install, and the `compositions` shelf shows its door instead (see GROUPS).
  let compDescs = []
  /** THE WHOLE MENU: what the app ships, plus what you took. Nothing reads `SECTIONS` directly. */
  const sections = () => [...SECTIONS, ...compDescs]
  let active = null
  let picked = null              // whatever the active section last selected
  let currentView = null         // the view showing, if any — it owns the dock while it does
  const expanded = new Set()     // sections whose child rows the user has opened
  let jobs = []
  /** Failures you have already looked at. They leave the nav list on the click that opens them
   *  in ⓘ — a red row that never goes away is a red row nobody reads twice. */
  const seenFailures = new Set()
  /** Which verb ▶ is armed with. See the ask bar, below, for why this is a mode now. */
  let mode = store.get(MODE_KEY, 'make') === 'xoko' ? 'xoko' : 'make'
  /** ⏹ — the abort function of the question in flight, or null. Not stored: a thought does not
   *  survive a reload. */
  let asking = null

  /**
   * The services this section could run on.
   *
   * ⚠️ FILTERED BY THE SECTION'S MEDIUM, not by role alone. A section declares what it makes
   * (`medium` on its module) and the 🔌 picker offers only services that make that — otherwise
   * the writing brain that xoko needs appears in the images section's engine dropdown, and
   * picking it queues a job that cannot succeed. The bug was invisible only because every
   * generator on the shelf was an image one; music would have found it next.
   *
   * A section that declares no medium is not a launcher (settings, the library) and gets the
   * whole shelf — its picker is never the thing anyone presses ▶ with.
   *
   * ⚠️ AND A SERVICE THAT DECLARES NO MEDIUM SERVES ALL OF THEM (2026-08-17). One ComfyUI on one
   * port makes pictures, songs, voices and meshes, so its row claims none — and the strict
   * equality above hid it from every section, which meant the app that had just learned to make
   * music showed an empty picker in 🎼. What such a service can answer for is said by its
   * WORKFLOWS' kinds, and that is where the filtering moved: see `workflowsIn`.
   */
  const generators = () => {
    const want = active?.desc.medium ?? null
    // ⚠️ WHAT IT MAKES IS A LIST, AND IT IS EXACT (2026-09-06). This read `!s.medium || …`, and a
    // ComfyUI declared no medium — so it matched every section, including ones it had no workflow
    // for. `media` is derived from the workflows on the row (src/inference/kinds.ts), so a service
    // is offered where it can actually answer and nowhere else.
    return shelf.filter((s) => s.role === 'generator' && (!want || s.media?.includes(want)))
  }
  /** Which medium's remembered choice applies right now — what ▶ would use from here. A section
   *  that makes nothing (settings, the library) has none, and its readout says so. */
  const forMedium = () => active?.desc.medium ?? null

  // ── the dock: TWO TABS — ⚙ options · ⓘ selection ────────────────────────────
  //
  // ⚠️ TABS, NOT ACCORDIONS. See launch-kit `tabbed()` for why.
  //
  // ⚠️ TWO, NOT THREE. ▶ was briefly a third tab and it was the wrong furniture: ⚙ and ⓘ are
  // about the SECTION you are standing in, and the queue is about the app. A tab is a permanent
  // seat, and the queue is a thing you summon. It supersedes this pane instead — see `setRight`.
  //
  // ⚠️ NOTHING SWITCHES TABS BUT YOU. Picking something used to force ⓘ open; that is the app
  // moving your pane because you looked at a picture, and it takes your ⚙ knobs with it
  // mid-edit. Selection PAINTS ⓘ so it is right when you get there, and marks the tab.
  // Declared here rather than beside its painter: the ⚙ panel is assembled a few lines down, and
  // a node cannot be appended before it exists.
  const runBlock = el('div', { class: 'run-block' })
  // ✕ THE PANE'S CLOSE, at the trailing edge of the strip that is already there — no new band of
  // chrome. It is the ⟩ button's job, given a labelled target: the grip had been carrying it since
  // the top bar went, and one 7px control that both sizes and toggles cost a 3px dead zone to
  // tell a click from a drag, cost the double-click reset outright (its two clicks landed first),
  // and told nobody it was pressable except through a `title`.
  //
  // ⚠️ IT DOES NOT APPEAR OVER THE QUEUE, and that is the whole reason it lives on the tab strip
  // rather than in a header of its own: the queue's own ✕ means "put back what was here", and two
  // ✕ in one corner meaning two things is the bug this avoids. From the queue you dismiss, then
  // close. ⚠️ AND NOT ON THE PHONE either — there the pane is a sheet with a ✕ in `.sheet-head`,
  // two rows above this one.
  const dockClose = el('button', {
    class: 'btn mini dock-close desktop-only', type: 'button',
    title: 'close the options panel', 'aria-label': 'Close the options panel',
  }, '✕')
  dockClose.addEventListener('click', () => setRight('shut'))
  const dock = tabbed({ key: 'xokolat:dock-tab', trailing: dockClose })
  const optsTitle = el('div', { class: 'dock-panel-title muted' })
  const optsBody = el('div', { class: 'band-rows' })
  const optsPanel = dock.add({ id: 'opts', icon: '⚙', label: 'options' })
  // ⚠️ THE RUN BLOCK SITS ABOVE THE SECTION'S OWN OPTIONS, and belongs to the SHELL rather
  // than to the section: what will run is the same question in every medium, and a section
  // that had to draw it would be the fourth place it could drift.
  optsPanel.append(optsTitle, runBlock, optsBody)
  // 🎨 THE STYLES BAND — see web/lib/styles.js for why it is here and not a page in the middle.
  //
  // ⚠️ IT BELONGS TO THE SHELL, NOT TO A SECTION (2026-08-29). It was `stylesView(ctx, 'image')`,
  // constructed inside 🖼 and reachable only as a child row under it — so the music, sound, voice
  // and 3D lists had a parser, an API and a file on disk, and no screen. One band, one view per
  // MEDIUM, made the first time you stand somewhere that uses it and kept after that.
  //
  // ⚠️ AND IT SITS BETWEEN ⚙ AND ⓘ, which is the order of the question: what will run, what it
  // will look like, what you already made.
  const scopeStrip = el('div', { class: 'scope-strip' })
  const stylesHost = el('div', { class: 'styles-host' })
  // ⚠️ COLOURLESS, AND THAT IS THE RULE NOT THE TASTE (2026-08-29): a colour emoji marks a
  // SECTION, a monochrome glyph marks a DOCK BAND — ⚙ and ⓘ beside it already hold it. 🎨 also had
  // to be wrong in a second way: this band shows the music list while you are standing in 🎼, and
  // a paint palette above a list of genres is a picture of the wrong medium.
  const stylesPanel = dock.add({ id: 'styles', icon: '❖', label: 'styles' })
  stylesPanel.append(scopeStrip, stylesHost)
  const detailBody = dock.add({ id: 'detail', icon: 'ⓘ', label: 'selection' })
  optsHost.append(dock.node)

  /** medium → its view. Built lazily; a machine that never opens 🎨 never fetches a style list. */
  const styleViews = new Map()
  /** Which scope the strip is on. Not stored: it follows where you are, and where you are is. */
  let styleScope = null
  /**
   * The ⚙ pickers that want to hear about an edit. See `stylePicker` in web/lib/styles.js.
   *
   * ⚠️ KEYED BY SECTION, NOT ONE FLAT SET. A composition's instance is thrown away and rebuilt
   * whenever the folder changes (see `forget`), so a flat set would grow one dead closure per
   * rebuild, each one still fetching a style list to fill a select nothing can see.
   *
   * ⚠️ AND A SET PER SECTION, NOT ONE FUNCTION. A chain registers several — its own list plus one
   * per medium it makes — so a single slot per section would keep the last and silently drop the
   * rest, which is a picker that stops hearing about edits for no visible reason.
   */
  const styleWatchers = new Map()
  /** Whose `create(ctx)` is running right now — the key `onStyles` files a watcher under. */
  let creating = null

  // ── the right pane: ONE STATE, THREE VALUES ─────────────────────────────────
  //
  //        shut  ←—(↔)—→  tabs  ←—(▶)—→  queue
  //
  // ⚠️ NOT TWO BOOLEANS. `collapsed` × `queueOpen` is four combinations and two of them are
  // nonsense — "the queue is showing in a pane that is not there". One value cannot be
  // inconsistent with itself.
  //
  // Each control means exactly ONE thing, in every state:
  //   ▶ summons the queue, and pressing it again RESTORES what it interrupted — including
  //     `shut`, so the button has no side effect that outlives it.
  //   ✕ on the tab strip always means "give me more feed": tabs → shut, and it is not drawn over
  //     the queue at all, so it never has to know the queue exists.
  //     ⚠️ IT WAS A ⟩ BUTTON IN THE TOP BAR UNTIL 2026-08-31, and the bar is gone. The obvious
  //     move — put it in the nav's foot — is the one thing this control cannot survive: a chevron
  //     is a DIRECTION, and a ⟩ at the far LEFT of the window pointing right would be aimed at
  //     the nav, not at the pane four hundred pixels away. So it went INTO the pane, at the
  //     trailing edge of a strip that was already there.
  //   ↔ THE GRIP sizes, and only sizes. It briefly also toggled, and that is what a close button
  //     bought back: one 7px target cannot tell "size me" from "shut me" without a dead zone, and
  //     the dead zone cost the double-click reset. The one press it still takes is on the RAIL —
  //     the grip is DRAWN WHILE THE PANE IS SHUT (app.css), folded to a 22px rail whose tab is
  //     drawn at the TOP, because a ✕ lives inside the thing it closes and can never be the way
  //     back. A rail has no width to size, so there is nothing there for a press to be confused
  //     with.
  //   ✕ in the queue header is ▶ again, at the place your eye already is.
  //
  // ⚠️ `queue` IS NEVER PERSISTED. It is a summons, not a place — what goes to storage while it
  // is up is the value it interrupted, so the stored flag keeps meaning "is my options panel
  // open", which is the thing you actually set.
  const queueClose = el('button', { class: 'btn mini', title: 'close the queue' }, '✕')
  const queueBody = el('div', { class: 'qp-body' })
  const queuePane = el('div', { class: 'shell-queue', hidden: true },
    el('div', { class: 'qp-head' },
      el('span', { class: 'qp-title' }, '▶ queue'),
      el('span', { class: 'spacer' }),
      queueClose),
    queueBody)
  optsHost.after(queuePane)

  let right = store.get(RIGHT_KEY, 'tabs') === 'shut' ? 'shut' : 'tabs'
  let beforeQueue = right

  /**
   * ↔ HOW WIDE THE PANE IS — one CSS variable, and the only thing the drag writes.
   *
   * ⚠️ THE CEILING IS READ OFF THE WINDOW, NOT STORED. A width that was fine on an external
   * monitor is not fine on the laptop panel, and the failure is total: the feed is
   * `minmax(0, 1fr)` and will shrink to nothing without complaining. So the stored number is
   * validated on every read and again on every window resize, rather than at the moment it was
   * set — which is the only moment it was certainly legal.
   *
   * ⚠️ AND WIDTH IS NOT A FOURTH STATE. `shut · tabs · queue` stays one value: `shut` is the
   * grid's own `0` (app.css → `body.right-collapsed`), and this is what `tabs` and `queue` come
   * back to. Which is also why the width survives being shut — nothing here writes it.
   */
  const rightMax = () => Math.max(RIGHT_MIN,
    Math.min(window.innerWidth * 0.6, window.innerWidth - NAV_W - FEED_MIN))
  const sizeRight = (px) => {
    const want = Math.round(Number(px) || RIGHT_DEFAULT)
    const w = Math.max(RIGHT_MIN, Math.min(want, rightMax()))
    document.documentElement.style.setProperty('--right-w', `${w}px`)
    return w
  }

  function setRight(next) {
    right = next
    document.body.classList.toggle('right-collapsed', next === 'shut')
    optsHost.hidden = next === 'queue'
    queuePane.hidden = next !== 'queue'
    // The grip is the control now (see the note above), so it carries the state: folded to a rail
    // when there is no pane, a resize handle when there is, and it says which in its own title.
    grip.classList.toggle('shut', next === 'shut')
    grip.title = next === 'shut'
      ? 'bring the options panel back'
      : 'drag to resize · double-click to reset'
    grip.setAttribute('aria-expanded', String(next !== 'shut'))
    queueBtn.classList.toggle('on', next === 'queue')
    // The phone's sheet has one header for whatever is inside it.
    document.getElementById('sheet-title').textContent = next === 'queue' ? 'queue' : 'options'
    if (next !== 'queue') store.set(RIGHT_KEY, next)
  }

  // ── 🔌 WHAT WILL RUN — the whole stack, in the SECTION'S OWN ⚙ BAND ────────
  //
  //   ⚙ pane   do   <kind>      what this section is being asked to DO
  //            t2i  <workflow>    …and which workflow answers each capability it has
  //            i2i  <workflow>
  //   ✍ bar    a CHIP that reads it back and opens ⚙. Never a second place to choose.
  //
  // ⚠️ IT WAS A POPOVER ON THE ASK BAR WITH A TAB PER MEDIUM, and the tabs were the tell
  // (2026-08-29). They existed because the answer was APP-WIDE — one workflow per capability for
  // the whole app — so it had to be reachable from anywhere, so it could not live in a section.
  // Twice I collapsed those tabs on the reasoning that the section already says which medium you
  // are in, and twice I put them back with "the section says which medium you are LOOKING AT, it
  // does not say which engine each medium will USE". That was true, and true only because of the
  // app-wide key. Move the answer to where the ▶ is and the argument dissolves: you set 🎼's
  // engine in 🎼, because 🎼 is where you press ▶ for music.
  //
  // ⚠️ AND IT PUT A DEFAULT WHERE YOU TYPE. The bar is the sentence; a setting that governs every
  // press of this section is not part of a sentence, and reading one off a popover anchored to
  // the composer is how "what did that render with?" becomes a question at all.
  //
  // ⚠️ A COMPOSITION KEEPS ITS OWN, ONE PER STEP (web/lib/pipelines/composition.js). That is the
  // case an app-wide answer could never serve: a chain's third step may want a different i2i from
  // the shelf's, and may need one from the same family as its first step. Both bands are the same
  // furniture asking the same question, each at its own grain.
  //
  // The shape is the one every video player uses for exactly this problem: a menu whose rows PRINT
  // THEIR ANSWER shut and open into the choices. Subtitles ▸ language ▸ size.
  //
  // ⚠️ AND WHAT YOU PICK IS A WORKFLOW (src/types/workflow.ts). It was a checkpoint, and that was the
  // wrong unit: plain SDXL takes no style reference, SDXL plus an IP-Adapter does, and they are
  // the same file.

  /** Which row of the stack is unfolded. One at a time, and not stored — an open menu is not a
   *  place you come back to. It was two (`{ pop, pane }`) while there were two surfaces. */
  let openRow = null

  const generatorsIn = (m) => shelf.filter(
    (x) => x.role === 'generator' && x.media?.includes(m))

  /**
   * ★ EVERY WORKFLOW THAT COULD ANSWER IN THIS MEDIUM — across every service that makes it, each row
   * carrying the service that would run it.
   *
   * ⚠️ ACROSS SERVICES, not within one (2026-08-12). A capability provided by two services is TWO
   * WORKFLOWS AND ONE ROW, and that row is the whole of the reuse story: nothing has to be shared for
   * `cutout` from rembg and `cutout` from a graph to sit together, because the KIND does the
   * joining. Workflows themselves are never portable — `sdxl-style-ref` is Draw Things' dialect, and
   * translating dialects is a compiler, not a settings screen.
   */
  const workflowsOn = (svc) => (services.find((x) => x.id === svc.id)?.workflows ?? [])
    // ⚠️ AND WHAT IS MISSING IS NOT ONLY THE CHECKPOINT (2026-08-12). A workflow is its file PLUS
    // its control and LoRA files; `sdxl-style-ref` with no IP-Adapter on the machine would render
    // as though the adapter were not there, which is the worst kind of failure — a picture. The
    // 🔌 page lists it and names what is missing; the picker does not offer it.
    .filter((w) => w.state !== 'declared' && !w.missing?.length)
    .map((w) => ({ ...w, service: svc.id, on: svc.label ?? svc.id, up: svc.state === 'ready' }))

  /**
   * ⚠️ FILTERED BY THE KIND'S MEDIUM, NOT BY THE SERVICE'S (2026-08-17). A ComfyUI row declares no
   * medium because it serves four, so `generatorsIn` lets it into all four lists and this is where
   * the ask is narrowed: `t2m` IS music and `i23d` IS 3D, whoever runs them. Without it, pressing
   * ▶ in 🗣 voices would arm the song workflow and queue a job the server then refuses by name
   * (src/jobs/generate.ts, which checks the same fact).
   *
   * ⚠️ A KIND NOBODY DESCRIBES IS TWO DIFFERENT ANSWERS AND THIS USED TO CONFLATE THEM
   * (2026-08-30). It was `(mediumOfKind(w.kind) ?? m) === m` — an undescribed kind passing for
   * WHATEVER medium was asking. The `??` is there for a real timing gap: `vocab` arrives from the
   * server a moment after the shell paints, and hiding every workflow until it lands would be a
   * picker that is briefly empty for a reason nobody could see. But "not loaded yet" and "not a
   * kind any more" are not the same answer, and the second one is what a RETIREMENT leaves behind.
   * `recraft-t2vec` sat in a registry after ✒ vector was retired, `t2vec` was gone from
   * `kinds.json`, and one dead workflow was therefore offered in all six sections at once — while
   * the map never mentioned it, because src/xoko/here.ts drops exactly this shape instead. Two
   * answers to one question, which is the thing this file keeps refusing everywhere else.
   *
   * So the fallback now costs what it should: it lasts until the vocabulary lands, and after that
   * a kind the app cannot describe is a kind nothing offers.
   */
  const workflowsIn = (m) => generatorsIn(m).flatMap(workflowsOn)
    .filter((w) => {
      const of = mediumOfKind(w.kind)
      // Every kind in the registry declares a medium, so `null` means the row is not there at all.
      return of ? of === m : !(vocab.kinds ?? []).length
    })

  /** The same rows scoped by CAPABILITY instead of by medium — every service, whatever its role.
   *  The 🔌 star is per kind, and an operator's kind (`cutout`) belongs to no section, so the star
   *  cannot be reached through `generatorsIn`, which only ever sees services that make a KEPT
   *  medium. */
  const answersTo = (kind) => shelf.flatMap(workflowsOn).filter((w) => w.kind === kind)

  /** A workflow's identity across the whole medium. The slug alone collides between services. */
  const recKey = (w) => `${w.service}|${w.slug}`

  /** The kinds this medium actually has something for, in the registry's order. */
  const kindsAt = (m) => {
    const have = new Set(workflowsIn(m).map((w) => w.kind))
    return kindOrder([...have]).filter((k) => have.has(k))
  }

  /** What this medium is being asked to DO — resolved against what is offerable, so a remembered
   *  `edit` on a machine whose editing checkpoint is gone falls back instead of emptying the bar. */
  const kindFor = (m) => {
    const can = kindsAt(m)
    const want = store.get(kindKey(m), '')
    if (can.includes(want)) return want
    // ⚠️ NOT `can[0]` ANY MORE, AND THAT WAS INSTALL ORDER WEARING A DECISION'S CLOTHES
    // (2026-08-24). A medium offers kinds that read WORDS and kinds that read only a PICTURE —
    // 🖼 has `cutout` beside `t2i`, and the retired ✒ vector was two of them. The first one taken
    // won, so asking for a cat in words was answered "attach a picture first" by a workflow nobody
    // had chosen. A person who has picked no kind yet is a person about to type a sentence, so the
    // kind that reads sentences is the one to open. The picker still offers every kind, and a
    // choice made there still wins forever.
    return wordsKind(m) ?? can[0] ?? null
  }

  /** The kind that answers a SENTENCE ALONE — one whose workflow reads a prompt and needs no
   *  picture. The kind a medium opens on, and the kind it returns to when the last attachment is
   *  taken off the bar. */
  const wordsKind = (m) => {
    const rows = workflowsIn(m)
    return kindsAt(m).find((k) => rows.some((w) =>
      w.kind === k && (w.inputs ?? ['prompt']).includes('prompt') && !(w.slots ?? []).length)) ?? null
  }

  /**
   * ★ THE ONE WORKFLOW THAT ANSWERS ONE CAPABILITY.
   *
   * ⚠️ RESOLVED AGAINST WHAT IS ACTUALLY THERE. A remembered slug may name a workflow whose
   * checkpoint has been deleted, or a service swapped underneath it; a stale name would be sent and
   * refused. The registry's own default is the fallback and yours overrides it — one concept, two
   * sources, and the person using it wins.
   */
  const pickFrom = (usable, kind) => {
    if (!usable.length) return null
    const want = store.get(plugKey(kind), '')
    return usable.find((w) => recKey(w) === want) ?? usable.find((w) => w.isDefault) ?? usable[0]
  }
  /** …for the dock, which asks within the medium it is showing. */
  const workflowAt = (m, kind) => pickFrom(workflowsIn(m).filter((w) => w.kind === kind), kind)
  /** …and for 🔌, which has a kind and no medium at all. Same key, same fallback order. */
  const armedFor = (kind) => pickFrom(answersTo(kind), kind)
  /** The one the ▶ next to the sentence would use. */
  const workflowFor = (m) => workflowAt(m, kindFor(m))

  /** ⚠️ WHICH SERVICE RUNS THIS — derived from the armed workflow, never chosen. The fallback is
   *  only for a medium with nothing armed at all, so the chip can still name what is installed. */
  const serviceFor = (m) => {
    const gens = generatorsIn(m)
    const armed = workflowFor(m)
    return (armed ? gens.find((x) => x.id === armed.service) : null) ?? gens[0] ?? null
  }

  const setWorkflow = (m, kind, key) => {
    store.set(plugKey(kind), key)
    afterArm(m, kind)
  }
  /**
   * ARM ONE WORKFLOW BY ROW — kind and all, which is what `▶ make music [workflow …]` needs.
   *
   * ⚠️ SETTING THE WORKFLOW WITHOUT SETTING THE KIND IS A NO-OP AND LOOKS LIKE A SUCCESS
   * (2026-08-23). The armed workflow is `workflowAt(m, kindFor(m))` — the kind picks the drawer and
   * the slug picks the row inside it — so writing a slug into a drawer this medium is not looking
   * at leaves the old workflow armed, silently. Naming a workflow of another kind was accepted, said
   * nothing, and rendered the previous one. A picker on screen cannot hit this because the kind
   * tabs and the workflow list move together; a name coming in from a sentence can and did.
   */
  const armWorkflow = (m, w) => {
    store.set(kindKey(m), w.kind)
    store.set(plugKey(w.kind), recKey(w))
    afterArm(m, w.kind)
  }
  /** Which medium a capability belongs to — the kind's own registry row, never the service that
   *  happens to run it. `null` for a kind nobody described, which the star still works for. */
  const mediumOfKind = (k) => (vocab.kinds ?? []).find((x) => x.slug === k)?.medium ?? null
  /** ⚠️ CHOOSING A KIND CHANGES NOTHING BUT THE KIND. It used to arm "the first workflow of it",
   *  which quietly threw away the workflow you had picked for the kind you were leaving. */
  const setKind = (m, kind) => {
    store.set(kindKey(m), kind)
    afterArm(m, kind)
  }
  function afterArm(m, kind) {
    // ⚠️ THE TRAY FOLLOWS THE WORKFLOW. Landing on one that takes nothing means the picture you had
    // attached has no slot to sit in, and leaving it there would render as though it were used.
    if (m === forMedium() && !(workflowAt(m, kind)?.slots ?? []).length) refs.length = 0
    openRow = null
    paintRun()
    if (m === forMedium()) engineChanged()
  }

  /** The picked workflow's row for the medium in hand — where its CAPS and knobs live. */
  const currentService = () => serviceFor(forMedium()) ?? generators()[0] ?? null

  /** The engine moved. The section always hears it; so does the VIEW that is showing, because
   *  a view can be about the engine too — the 🎨 grid IS one model's grid. */
  function engineChanged() {
    for (const owner of [active?.inst, currentView]) {
      try { owner?.engineChanged?.() } catch (err) { console.error(err) }
    }
    // ⚠️ AND THE 🎨 GRID, WHICH IS ONE MODEL'S GRID. Only the one whose medium moved — re-shooting
    // every list because a music workflow changed would be a wall of renders nobody asked for.
    const m = forMedium()
    if (m && styleViews.has(m)) {
      try { styleViews.get(m).engineChanged() } catch (err) { console.error(err) }
    }
  }



  /**
   * The chip under the sentence: WHAT WILL ANSWER THIS — a READOUT, and the door to where it is
   * set.
   *
   * ⚠️ IT STOPPED BEING A PICKER (2026-08-29). It opened the engine stack in a popover; the stack
   * is in ⚙ now, and a chip that opened a second copy of it would be the second place the answer
   * could be given and the first place the two could disagree. Pressing it takes you to the one
   * place — which is a move you asked for, so it is allowed to move your pane (see `onPick` for
   * the rule it is an exception to: nothing switches tabs but you).
   *
   * ⚠️ AND xoko's OWN CHIP GOES TO ✨ xoko, not to ⚙ and no longer to 🔌 (2026-08-30). The rule
   * did not change — the chip points at wherever the thing it is naming is actually chosen, which
   * is the only thing that keeps it from lying — the place did.
   *
   * ⚠️ IT READS `kind · workflow` THOUGH THE KIND IS SET IN ⚙ TOO, because a chip saying only
   * "FLUX.2 klein 4B" does not tell you whether ▶ is about to make a picture or change the one you
   * attached — and that is the chip's whole job.
   */
  function paintEngineChips() {
    engineRow.replaceChildren()

    // ✨ THE CONNECTION, NOT AN ARMED WORKFLOW (2026-08-30). In xoko mode this chip used to name a
    // `chat` workflow on a service with a medium, because that is what a brain was. There is
    // one connection now, it names a model rather than a workflow, and the door goes to ✨ xoko.
    if (mode === 'xoko') {
      const row = xokoOn()
      const model = xokoModel(row)
      const chip = el('button', {
        class: `eng-chip on${row && row.state !== 'ready' ? ' down' : ''}`, type: 'button',
        title: row
          ? `${model ? model.label ?? model.file : 'nothing to think with'} on ${row.label ?? row.id}`
            + `${row.state === 'ready' ? '' : ` — ${row.state}`}\nchange it in ✨ xoko`
          : 'xoko is not connected to anything yet — press to connect one',
      },
      el('span', { class: 'ec-ic' }, '✨'),
      el('span', { class: 'ec-name' }, row ? (model?.label ?? model?.file ?? row.label ?? row.id) : 'not connected'),
      el('span', { class: 'ec-caret' }, '⌃'))
      chip.addEventListener('click', (ev) => {
        ev.stopPropagation()
        location.hash = '#/xoko'
      })
      engineRow.append(chip)
      paintGo()
      return
    }

    const m = forMedium()
    const face = MEDIUM_FACE[m] ?? ['·', m]
    const svc = serviceFor(m)
    const rec = workflowFor(m)
    if (!m) return
    const chip = el('button', {
      class: `eng-chip on${svc && svc.state !== 'ready' ? ' down' : ''}`, type: 'button',
      title: svc
        ? `${rec ? `${rec.kind} · ${rec.label}` : 'nothing to run'} on ${svc.label ?? svc.id}`
          + `${svc.state === 'ready' ? '' : ` — ${svc.state}`}`
          + '\nchange it in ⚙ options'
        : `nothing installed makes ${face[1]} yet`,
    },
    el('span', { class: 'ec-ic' }, face[0]),
    ...(rec ? [el('span', { class: 'ec-kind' }, rec.kind)] : []),
    el('span', { class: 'ec-name' }, rec?.label ?? (svc ? 'nothing to run' : 'none')),
    el('span', { class: 'ec-caret' }, '⌃'))
    chip.addEventListener('click', (ev) => {
      ev.stopPropagation()
      setRight('tabs')
      dock.show('opts')
    })
    engineRow.append(chip)
    paintGo()
  }

  /**
   * The engine catalogue, for every service at once.
   *
   * The server asks a service the FIRST time this is called and caches the answer, so this is
   * slow once (a cold Draw Things scan is ~40s) and instant after. `refresh: true` forces a
   * re-read — the ↻ button, and the honest answer to "I just downloaded a checkpoint".
   */
  async function loadEngines({ refresh = false } = {}) {
    // `true` re-asks everything; a service id re-asks that one — which is what a card's ↻ means.
    const ask = refresh === true ? '?refresh=1' : (refresh ? `?refresh=${encodeURIComponent(refresh)}` : '')
    try {
      const r = await api(`/api/engines${ask}`)
      services = r.services ?? []
      for (const line of r.issues ?? []) flash(line, true)
    } catch (err) {
      services = []
      flash(`could not read the engine catalogue: ${err.message}`, true)
    }
    paintRun()
    engineChanged()
  }

  /**
   * How a KIND reads, in one line.
   *
   * ⚠️ THE NAMES ARE THE FIELD'S, NOT OURS (2026-08-08). This was `make · vary · restyle · edit ·
   * extend` — a vocabulary invented here, on the reasoning that acronyms flatten two facts into one
   * string. True, and beside the point: everyone who will ever configure this app already says
   * t2i and i2i, and a word they have to learn is a word that costs them.
   *
   * ⚠️ AND THE TABLE IS THE SERVER'S NOW (2026-08-12 — `registries/kinds.json`). There were two
   * copies of it in web/, and they disagreed about what `i2i` is. A kind nobody described has no
   * gloss, which is the honest answer and not a reason to invent one here.
   */
  const kindFace = (k) => (vocab.kinds ?? []).find((x) => x.slug === k)?.face ?? ''
  /** Every kind the registry names, in its order, then anything a workflow used that it does not. */
  const kindOrder = (used) => {
    const known = (vocab.kinds ?? []).map((k) => k.slug)
    return [...known, ...[...new Set(used)].filter((k) => !known.includes(k)).sort()]
  }

  /**
   * ONE ROW OF EITHER MENU: a label, the answer it holds, and the choices under it.
   *
   * ⚠️ THE ROW IS THE READOUT. Shut, it already says what will happen — which is what makes a
   * menu readable at a glance instead of dropdowns you have to open to find out what is in them.
   * Open is for CHANGING it, and one row is open at a time. It took a `scope` while the same rows
   * were drawn into two surfaces — the ⚙ pane and the bar's popover — so that unfolding one did
   * not unfold the other. There is one surface now.
   */
  function pkRow(id, label, value, options, onPick, armed = false) {
    const open = openRow === id
    const at = options.find((o) => o.value === value)
    const head = el('button', {
      class: `pk-row${open ? ' open' : ''}${options.length > 1 ? '' : ' lone'}${armed ? ' armed' : ''}`
        + (at?.off ? ' off' : ''),
      type: 'button',
      title: at?.why ?? '',
    },
    el('span', { class: 'pk-label' }, label),
    el('span', { class: 'pk-val' }, at?.label ?? '—'),
    // WHERE IT RUNS, in the row's own line. Quiet, because it is a fact you check rather than
    // choose — the choosing is the workflow.
    ...(at?.sub ? [el('span', { class: 'pk-sub' }, at.sub)] : []),
    el('span', { class: 'pk-caret' }, open ? '▾' : '▸'))
    head.addEventListener('click', () => { openRow = open ? null : id; paintRun() })
    if (!open) return [head]
    return [head, el('div', { class: 'pk-list' }, ...options.map((o) => {
      const item = el('button', {
        class: `pk-item${o.value === value ? ' on' : ''}${o.off ? ' off' : ''}`,
        type: 'button', title: o.why ?? '',
      }, el('span', { class: 'pk-tick' }, o.value === value ? '✓' : ''), el('span', {}, o.label),
      ...(o.sub ? [el('span', { class: 'pk-sub' }, o.sub)] : []))
      item.addEventListener('click', () => { openRow = null; onPick(o.value) })
      return item
    }))]
  }

  /** The stack and everything that follows it. Redrawn on every shelf poll — there is nothing to
   *  type in it, so a repaint costs nothing but the open row, which it keeps. */
  function paintRun() {
    const m = forMedium()
    runBlock.replaceChildren(...(m ? runRows(m) : []))
    runBlock.style.display = m && !currentView && runBlock.children.length ? '' : 'none'
    paintEngineChips()
    paintTray()
  }

  /**
   * THE ⚙ BAND'S STACK: WHAT THIS SECTION IS ASKED TO DO, AND WHAT ANSWERS EACH CAPABILITY.
   *
   * ⚠️ A ROW PER KIND, not one row filtered by the armed one (2026-08-09). A single filtered row
   * silently changes what it is about — it reads "Kontext edit" while `edit` is armed and means
   * something else the moment `do` says `t2i` — so it is a readout that is wrong whenever you are
   * not looking at the row that governs it. A row per kind is a table of assignments, true always,
   * and it is what lets you keep SDXL for `t2i` while `edit` goes to Kontext.
   *
   * ⚠️ AND NO `on <service>` ROW (2026-08-12). It was the first row and it filtered every row
   * under it. Each option names its own service underneath, so a workflow is never hidden by a
   * choice made about a different one — and the table stays the same height whether you run one
   * service or four, because it is indexed by capability rather than by box.
   *
   * ⚠️ THIS BAND ONLY EVER SHOWS ONE MEDIUM: the one the section makes (2026-08-29). The medium
   * tabs it had as a popover were the app-wide key wearing furniture — see the block at the top.
   */
  function runRows(m) {
    if (!generatorsIn(m).length) {
      return [el('p', { class: 'pk-none muted' },
        'nothing installed makes this yet — add a service in 🔌 settings')]
    }
    const all = workflowsIn(m)
    const kinds = kindsAt(m)
    const armed = kindFor(m)
    const out = [el('div', { class: 'run-head muted' }, 'what will run')]

    // ⚠️ NO `do` ROW WHEN THERE IS NO CHOICE. One kind means the section does one thing, and a
    // menu with a single entry is furniture. This is also the row xoko eventually removes for
    // everyone: it will know the capabilities and the plugged engines and pick the kind itself.
    //
    // ⚠️ AND IT IS PILLS, NOT A DRAWER (2026-09-04). It was a `pkRow` like the workflow rows under
    // it, and it should never have been: shut, that row named the armed kind and hid every other
    // one behind a caret, so "what else can this section be asked for?" cost a click to ask and
    // the answer folded away again the moment you answered it. The workflow rows earn the fold —
    // one service can offer thirty. A capability list cannot: it is what this medium DOES, three
    // entries at the outside, one word each. All of them on screen, one press to switch.
    if (kinds.length > 1) {
      out.push(el('div', { class: 'pk-pills' },
        el('span', { class: 'pk-label' }, 'do'),
        el('div', { class: 'pk-pill-row' }, ...kinds.map((k) => {
          const on = k === armed
          const b = el('button', {
            class: `pk-pill${on ? ' on' : ''}`, type: 'button',
            'aria-pressed': on ? 'true' : 'false',
            // The gloss is the kind's own, from registries/kinds.json — an undescribed kind gets
            // its slug back rather than an invented sentence.
            title: kindFace(k) || k,
          }, k)
          b.addEventListener('click', () => setKind(m, k))
          return b
        }))))
    }

    if (!all.length) {
      const asked = generatorsIn(m).map((x) => services.find((y) => y.id === x.id)?.catalog)
      out.push(el('p', { class: 'pk-none muted' },
        asked.every((c) => c?.error) ? 'nothing here can be asked what it has' : 'asking what it has…'))
    } else {
      for (const kind of kinds) {
        // The one `do` names is marked, because this table says what EVERY kind would use and the
        // chip says what this sentence will — and those must not look like the same claim.
        out.push(...pkRow(`rec:${kind}`, kind, recKey(workflowAt(m, kind) ?? {}),
          all.filter((w) => w.kind === kind).map((w) => ({
            value: recKey(w),
            label: w.label,
            // Which service would run it. Shown per option rather than once at the top: that is
            // the fact the `on` row used to state, and it belongs to the workflow.
            sub: w.on,
            off: !w.up,
            why: [w.notes, kindFace(kind), `on ${w.on}${w.up ? '' : ' — which is not up'}`]
              .filter(Boolean).join('\n'),
          })),
          (v) => setWorkflow(m, kind, v), kind === armed))
      }
    }

    const svc = serviceFor(m)
    if (svc && svc.state !== 'ready') {
      out.push(el('p', { class: 'pk-none err-note' }, svc.detail ?? `this service is ${svc.state}`))
    }
    // ⚠️ ONE DOOR OUT, and it is the only place a checkpoint's own numbers can be changed. What
    // runs is chosen here; what it runs AT belongs to the workflow and is edited once, in 🔌.
    out.push(el('p', { class: 'run-foot' },
      el('a', { class: 'btn mini', href: '#/inference', title: 'services, checkpoints and their numbers' },
        '🔌 settings ▸')))
    return out
  }

  /** Take the whole shelf an endpoint answered with. Both writers below answer with all of it, so
   *  neither the ＋ form nor ⤓ ever merges a change into what is already on screen. */
  function tookShelf(r) {
    shelf = r.services ?? shelf
    media = r.media ?? media
    vocab = r.vocab ?? vocab
    // 🧩 ⚠️ AND THE CHAINS, WHENEVER THE ANSWER CARRIES THEM. A composition take writes one; a
    // plain WORKFLOW take can make one that was already here runnable. Both are changes to a shelf
    // the page may not be looking at, and the server sends the whole list rather than a signal to
    // go and ask — one answer, one redraw, nothing to remember.
    if (r.compositions) adoptCompositions(r)
    for (const line of r.issues ?? []) flash(line, true)
    paintRun()
  }

  /**
   * 🧩 THE COMPOSITIONS YOU OWN, AS NAV ROWS.
   *
   * ⚠️ THE INSTANCES ARE DROPPED, ALL OF THEM. A section instance holds the record it was built
   * from — the chain AND what the app resolved each step to — so keeping one after a take would
   * mean a page still saying "unbound" about a step whose workflow just arrived. They are cheap: a
   * heading, a list of steps and two buttons.
   */
  function adoptCompositions(r) {
    compDescs = (r.compositions ?? []).map(compositionSection)
    for (const id of Object.keys(instances)) {
      if (id.startsWith('comp-')) delete instances[id]
    }
    for (const line of r.issues ?? []) flash(line, true)
    // Where you are standing may have just been rebuilt, or deleted. `show` resolves the id
    // against the new list and falls back to 🖼 when it is gone.
    if (active?.desc.group === 'compositions') show(active.desc.id)
    else buildNav()
  }

  async function refreshCompositions() {
    try {
      adoptCompositions(await api('/api/compositions'))
    } catch (err) {
      flash(`compositions could not be read: ${err.message}`, true)
    }
  }

  /** Write one row of the registry's user layer, then take the shelf it answers with. */
  async function postService(body) {
    const r = await api('/api/inference', body)
    tookShelf(r)
    await loadEngines()
    return r
  }

  /**
   * ⤓ INSTALL ONE THING FROM THE LIBRARY — a catalog id, or a link to one on it.
   *
   * The catalogue is re-read afterwards for the same reason a save re-reads it: a workflow that has
   * just arrived names a checkpoint nobody has asked this service about yet.
   */
  async function postTake(what) {
    const r = await api('/api/take', { what })
    tookShelf(r)
    await loadEngines()
    return r
  }

  let lastShelfStates                          // undefined until the first read — see below
  async function refreshInference() {
    try {
      const r = await api('/api/inference')
      shelf = r.services ?? []
      // The MEDIA VOCABULARY is the server's, and it arrives with the shelf. A UI-side list is
      // how a fifth medium ends up half-known.
      media = r.media ?? media
      vocab = r.vocab ?? vocab
      for (const line of r.issues ?? []) flash(line, true)
    } catch (err) {
      shelf = []
      flash(`inference registry unreadable: ${err.message}`, true)
    }
    paintRun()
    // A service that just came up has a catalogue we could not read a moment ago. Re-reading on
    // the TRANSITION (not on every poll) is what turns "start the service" into a working picker
    // without a page reload. Not on the FIRST read — boot loads the catalogue itself, and firing
    // here too would ask twice before the page has drawn.
    const now = shelf.map((s) => `${s.id}:${s.state}`).join(',')
    const changed = lastShelfStates !== undefined && now !== lastShelfStates
    lastShelfStates = now
    if (changed) void loadEngines()
    try { active?.inst.refresh?.() } catch (err) { console.error(err) }
  }

  // ── ✍ THE ASK BAR — the app's one input, on every page ──────────────────────
  //
  // Two rows. The top one is the sentence. The bottom one is everything that decides what happens
  // to it: which verb is armed, and what will answer it.
  //
  //   coffee before 9am · cats being dramatic…
  //   [✨ xoko|▶ make]   🖼 sdxl-turbo ⌃   🎼 🗣 🧊 ✨           ▶ ×3
  //
  // ⚠️ IT IS A MODE AGAIN (2026-08-07), and the note that used to be here argued against one:
  // "typing 'make me a risograph style' while set to ▶ renders a picture of the words." That
  // failure is real, and it is why the switch is not a hidden setting — it sits against the send
  // button, it is the loudest thing on the row after the text, and the placeholder, the chip and
  // the button all change with it. Three signals for one state. What the two-button version cost
  // was a decision at every single send, on a bar where the answer is the same fifty times in a
  // row; ⌘↵ still sends the other verb, so the escape hatch survived the mode.
  //
  // ⚠️ ▶ IS DRAWN ONLY WHERE THIS PLACE MAKES SOMETHING. 🔌, 📚 and the settings sections render
  // nothing from a sentence, so there the switch collapses to ✨ alone. Same rule as the ⚙ tab
  // hiding when a section has no options: a verb that does not apply is not drawn. That rule is
  // what lets this bar live on EVERY page.
  const askLine = el('textarea', { class: 'ask-line', rows: '1', spellcheck: 'false' })
  const askSide = el('div', { class: 'ask-side' })
  const askGo = el('button', { class: 'btn primary ask-go' }, '▶')
  const askLog = el('div', { class: 'ask-log' })
  const askHint = el('span', { class: 'ask-hint muted' })
  const engineRow = el('div', { class: 'ask-engines' })
  const swXoko = el('button', { class: 'ask-sw', type: 'button' }, '✨ xoko')
  const swMake = el('button', { class: 'ask-sw', type: 'button' }, '▶ make')
  const modeSw = el('div', { class: 'ask-mode' }, swXoko, swMake)
  const refTray = el('div', { class: 'ask-refs' })
  const askBar = el('div', { class: 'ask-bar' },
    askLog, refTray,
    // ⚠️ NO ICON BESIDE THE TEXT (2026-08-12). There was a ✍ badge in the margin; a text field at
    // the bottom of the screen with a caret in it does not need to be labelled as one, and the
    // phone layout had already been hiding it since the day it was written.
    el('div', { class: 'ask-row' }, el('div', { class: 'ask-main' }, askLine, askHint)),
    el('div', { class: 'ask-foot' },
      modeSw, engineRow, el('span', { class: 'spacer' }), askSide, askGo))

  // ── 📎 THE REFERENCE TRAY — what you BRING with the sentence ─────────────────
  //
  // ⚠️ A REFERENCE POINTS AT AN ASSET, AND AN UPLOAD IS JUST AN IMPORTED ASSET
  // (src/types/request.ts). That is why there is one tray and not two features: ＋ imports a file
  // into the library and then references it, so "upload this photo" and "use that render" end in
  // exactly the same place, and the picture you uploaded is in the gallery afterwards like
  // everything else.
  //
  // ⚠️ THE ROLE COMES FROM THE TASK, never from a second control. What `subject` means as opposed
  // to `edit` is what you are asking for, and that is already the first row of the run panel —
  // asking twice is asking the same question in two voices that can disagree.
  //
  // ⚠️ ATTACHING SWITCHES THE TASK when `make` is armed. This is the one place the app changes a
  // setting for you, and it is the difference between a picture that is used and a picture that is
  // silently ignored: attaching something while "words alone" is armed can only have meant one
  // thing.
  const refs = []
  const refFile = el('input', {
    type: 'file', accept: 'image/*', multiple: 'multiple', class: 'ask-file', hidden: 'hidden',
  })
  refTray.append(refFile)

  /** The slots the ARMED WORKFLOW takes — `ref` · `style` · `control` · `mask`. Empty for a t2i
   *  one, which is most of them, and that is what decides whether there is a tray at all. */
  const refSlots = () => workflowFor(forMedium())?.slots ?? []
  /** What an attached picture MEANS: the first slot the workflow declares that is still empty, or
   *  its last one, so a second drop on a one-slot workflow replaces rather than piles up. */
  const nextSlot = () => {
    const slots = refSlots()
    return slots.find((s) => !refs.some((r) => r.role === s)) ?? slots[0] ?? null
  }
  /** The first KIND whose armed workflow takes something, for the switch below. A kind rather than a
   *  workflow: which workflow answers for it is already remembered, and is not this code's to pick. */
  const attachableKind = (m) => kindsAt(m).find((k) => (workflowAt(m, k)?.slots ?? []).length) ?? null

  function addRef(asset) {
    if (!asset || refs.some((r) => r.asset === asset)) return
    const m = forMedium()
    // ⚠️ ATTACHING SWITCHES THE KIND when the armed one takes nothing. This is the one place the
    // app changes a setting for you, and it is the difference between a picture that is used and
    // one that is silently ignored: dropping a photo on a t2i workflow can only have meant the other
    // thing. It moves to the first kind that takes something — usually i2i, arming whichever workflow
    // you last chose for it — and the ⚙ row is right there if you meant `edit`.
    if (!refSlots().length) {
      const kind = attachableKind(m)
      if (!kind) { flash('nothing here takes a picture — see ⚙', true); return }
      setKind(m, kind)
    }
    const role = nextSlot()
    if (!role) return
    // One picture per slot: a second drop on a one-slot workflow replaces what was there.
    const at = refs.findIndex((r) => r.role === role)
    if (at >= 0) refs.splice(at, 1)
    refs.push({ asset, role })
    paintTray()
    engineChanged()
  }

  /**
   * ⚠️ AND TAKING THE LAST ONE OFF SWITCHES BACK. Attaching a picture arms the kind that can use
   * it (`addRef`); removing it did not undo that, so the bar sat on `i2i` with nothing attached —
   * a press that could only fail, after a change the app had made for you and then would not make
   * back. The rule is one rule read in both directions: what is on the bar decides what ▶ does.
   *
   * It only steps back to the kind that answers WORDS ALONE, and only when nothing is left. A
   * kind you chose yourself is not overridden while a picture is still on the bar.
   */
  function dropRef(asset) {
    const at = refs.findIndex((r) => r.asset === asset)
    if (at >= 0) refs.splice(at, 1)
    const m = forMedium()
    if (!refs.length && refSlots().length) {
      const words = wordsKind(m)
      if (words) setKind(m, words)
    }
    paintTray()
    engineChanged()
  }

  /** ⚠️ ONE FILE PER REQUEST, AND NO MULTIPART. The body IS the file and the name rides in a
   *  header; the server opens the bytes to decide what it is rather than believing either
   *  (src/content/import.ts). A form encoding exists to carry several fields, and this carries
   *  one file. */
  async function importFiles(files) {
    for (const file of files) {
      try {
        const res = await fetch('/api/import', {
          method: 'POST',
          headers: { 'X-Filename': encodeURIComponent(file.name), 'X-Medium': forMedium() ?? 'image' },
          body: file,
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
        addRef(data.asset)
      } catch (err) {
        flash(`could not import ${file.name}: ${err.message}`, true)
      }
    }
    // The imports are library assets now, so the feed and the ▸ library picker must know.
    await refreshManifest()
    paintTray()
  }
  refFile.addEventListener('change', () => {
    const files = [...refFile.files]
    refFile.value = ''
    void importFiles(files)
  })

  /** ⚠️ DROP ANYWHERE ON THE BAR, not on a 40px target. The tray may not even be drawn yet when
   *  you drag a photo in — that is the moment it should appear, not a state you have to arrange
   *  first. */
  for (const type of ['dragover', 'dragenter']) {
    askBar.addEventListener(type, (ev) => {
      if (!ev.dataTransfer?.types?.includes('Files')) return
      ev.preventDefault()
      askBar.classList.add('dropping')
    })
  }
  askBar.addEventListener('dragleave', (ev) => {
    if (ev.target === askBar) askBar.classList.remove('dropping')
  })
  askBar.addEventListener('drop', (ev) => {
    const files = [...(ev.dataTransfer?.files ?? [])]
    if (!files.length) return
    ev.preventDefault()
    askBar.classList.remove('dropping')
    void importFiles(files)
  })

  /**
   * ▸ PICK ONE YOU ALREADY HAVE — the library, as a grid, over the bar.
   *
   * ⚠️ IT READS THE INDEX, not a second list. What can be referenced is exactly what the gallery
   * shows, including the things you imported a moment ago, and there is no separate "uploads"
   * shelf to keep in step.
   */
  const refPick = el('div', { class: 'popover ref-pick', hidden: true })
  document.body.append(refPick)
  refPick.addEventListener('click', (ev) => ev.stopPropagation())

  /** Hang a popover ABOVE its anchor, clamped to the window. Above, because every anchor in this
   *  app is on the ask bar, which floats at the bottom — dropping down would open into the fold. */
  function placePop(pop, anchor, width) {
    const r = anchor.getBoundingClientRect()
    pop.style.bottom = `${Math.round(Math.max(8, window.innerHeight - r.top + 8))}px`
    pop.style.top = 'auto'
    pop.style.left = `${Math.round(Math.max(8, Math.min(r.left, window.innerWidth - width)))}px`
  }

  // ⚠️ ONE CLICK-AWAY FOR EVERY POPOVER. Each one stops its own clicks, and each opener stops the
  // click that opened it, so this closes exactly what you clicked off. Without it a picker is shut
  // only by choosing from it, which makes "I just wanted to look" a decision.
  document.addEventListener('click', () => {
    setRefPick(false)
  })

  function openLibrary(anchor) {
    const want = forMedium() ?? 'image'
    const cells = manifest.media
      .filter((g) => g.medium === want)
      .flatMap((g) => g.cells.map((c) => ({ ...c, ask: g.ask ?? g.slug })))
      .slice(0, 60)
    refPick.replaceChildren(
      el('div', { class: 'pop-head muted' }, `pick a ${want} from what you have made`),
      cells.length
        ? el('div', { class: 'ref-grid' }, ...cells.map((c) => {
          const b = el('button', { class: 'ref-cell', type: 'button', title: c.ask }, el('img', {
            src: href(c.preview ?? c.master), alt: '',
          }))
          b.addEventListener('click', () => { addRef(c.path); setRefPick(false) })
          return b
        }))
        : el('p', { class: 'pk-none muted' }, 'nothing made yet'))
    placePop(refPick, anchor, 360)
    setRefPick(true)
  }
  const setRefPick = (on) => { refPick.hidden = !on }

  /**
   * The tray: drawn when the ARMED WORKFLOW takes something, or when something is attached.
   *
   * ⚠️ NOT ALWAYS PRESENT. Most presses are words alone, and a permanently reserved strip under
   * every sentence is furniture for the exception. (Dropping a file works whether it is drawn or
   * not — see the drop handler: that is the moment it should appear, not a state you first have
   * to arrange.)
   */
  function paintTray() {
    const slots = refSlots()
    const wanted = armedMode() === 'make' && (slots.length > 0 || refs.length > 0)
    refTray.style.display = wanted ? '' : 'none'
    if (!wanted) return
    const empty = slots.filter((slot) => !refs.some((r) => r.role === slot))
    const add = el('button', { class: 'ref-add', type: 'button', title: 'import a file' }, '＋')
    add.addEventListener('click', () => refFile.click())
    const pick = el('button', { class: 'ref-add', type: 'button', title: 'pick one you have already made' }, '▸')
    pick.addEventListener('click', (ev) => { ev.stopPropagation(); openLibrary(pick) })
    refTray.replaceChildren(refFile, ...refs.map((r) => {
      const cell = el('span', { class: 'ref-chip', title: `${r.role} · ${r.asset}` },
        el('img', { src: href(r.asset), alt: '' }))
      // ⚠️ THE SLOT IS NAMED ONLY WHEN THERE IS MORE THAN ONE. A workflow that takes a single `ref`
      // needs no label — the chip IS the answer — and a badge on every chip would be a word
      // repeated under every picture.
      if (slots.length > 1) cell.append(el('span', { class: 'ref-slot' }, r.role))
      const x = el('button', { class: 'ref-x', type: 'button', title: 'take it off' }, '✕')
      x.addEventListener('click', () => dropRef(r.asset))
      cell.append(x)
      return cell
    }), ...(empty.length ? [add, pick] : []),
    el('span', { class: 'ref-what muted' },
      empty.length
        ? `drop a picture here${slots.length > 1 ? ` — ${empty.join(', ')} still empty` : ''}`
        : kindFace(workflowFor(forMedium())?.kind)))
  }

  /** Who ▶ belongs to: the VIEW if one is showing, else the section. A view that makes nothing
   *  simply declares no `ask`, and the verb disappears. */
  const askOwner = () => (currentView ?? active?.inst ?? null)
  /** Where you are, in words — what xoko is pre-framed with, and the same string the crumb uses. */
  const askAbout = () =>
    (currentView ? `${active?.desc.label ?? ''} · ${currentView.label}` : (active?.desc.label ?? ''))
  /**
   * ⚠️ WHY ▶ IS NOT THE PERSON'S ON EVERY CHAIN (2026-09-04, `Composition.press`). ▶ is one press
   * from your own sentence — say it, an engine answers, you look at what came back. A chain whose
   * result is a DOCUMENT is not that: a composition to install, a book, a set of SVGs. Those the
   * author hands to xoko, and the button greys rather than disappearing, because the section does
   * still run — xoko's `▶ make <slug>:` calls the very same function this button does.
   *
   * ⚠️ ONE SENTENCE FOR ALL OF THEM. A reason written per composition would be a second place the
   * library says what a chain is for, and it would say it worse than the notes on its card.
   */
  const GREY_WHY = 'xoko runs this one — press ✨ and say what you want'
  /** Whether ▶ belongs to the PERSON here. `greyed` is a chain that runs, just not from this button. */
  const pressable = () => !!askOwner()?.ask?.make && !askOwner()?.ask?.greyed
  /** The verb actually armed — never `make` where nothing is made from a sentence. */
  const armedMode = () => (pressable() ? mode : 'xoko')

  function setMode(next) {
    if (mode === next) return
    mode = next
    store.set(MODE_KEY, next)
    // The chip follows the verb, and so does the panel — pressing ✨ arms the brain, which is a
    // different medium and therefore a different tab.
    paintAsk()
    paintRun()
  }
  swXoko.addEventListener('click', () => setMode('xoko'))
  swMake.addEventListener('click', () => setMode('make'))

  /** The send button, and what pressing it does. One press is one render — the ×N it used to
   *  carry went with multi-select. */
  function paintGo() {
    const armed = armedMode()
    const rec = workflowFor(forMedium())
    askGo.replaceChildren(asking ? '⏹' : armed === 'make' ? '▶' : '✨')
    askGo.classList.toggle('stopping', !!asking)
    // ⚠️ A SECTION WITH NO MEDIUM STILL HAS A ▶. A composition runs a CHAIN, and what answers each
    // of its steps is per-step — so there is no one workflow to name here, and naming none would read
    // as "nothing to run" on the one section where ▶ does the most.
    const chain = !forMedium() && askOwner()?.ask?.make
    askGo.title = asking
      ? 'stop — what has arrived so far is kept'
      : armed === 'make'
        ? `${chain ? 'run this chain — every step reads your sentence' : (rec ? `${rec.kind} on ${rec.label}` : 'nothing to run')} (⌘↵ asks xoko)`
        : 'ask xoko — it can read this app, take from 📚, move you, and press ▶ with what you armed'
  }

  function paintAsk() {
    const spec = askOwner()?.ask ?? null
    const armed = armedMode()
    modeSw.classList.toggle('solo', !spec?.make)
    swMake.style.display = spec?.make ? '' : 'none'
    swMake.disabled = !!spec?.greyed
    swMake.title = spec?.greyed ? GREY_WHY : ''
    swXoko.classList.toggle('on', armed === 'xoko')
    swMake.classList.toggle('on', armed === 'make')
    // ⚠️ A WORKFLOW THAT TAKES NO SENTENCE SAYS SO IN THE BAR. Offering "coffee before 9am" to a
    // cutout invites words that will be thrown away, and an empty bar with no explanation reads as
    // a bar that is broken.
    const wordless = armed === 'make'
      && !(workflowFor(forMedium())?.inputs ?? ['prompt']).includes('prompt')
    askLine.placeholder = armed === 'make'
      ? (wordless ? 'no words needed — attach a picture and press ▶' : (spec?.placeholder ?? 'say what you want to make…'))
      : `ask xoko about ${askAbout() || 'this'}, or anything else in here…`
    askHint.textContent = armed === 'make' ? (spec?.hint ?? '') : ''
    askHint.style.display = askHint.textContent ? '' : 'none'
    askSide.replaceChildren(...(spec?.side ?? []))
    askSide.style.display = (spec?.side ?? []).length ? '' : 'none'
    // ⚠️ THE TRANSCRIPT HEAD FOLLOWS YOU (2026-08-23). It used to hold the string it was opened
    // with, so a conversation started in 🔌 still read `✨ xoko · inference` after you — or xoko,
    // with `▶ go:` — had moved three sections on. Here rather than in `show`, because a VIEW is
    // also a place you stand and only this runs for both.
    xokoHere(askAbout())
    paintEngineChips()
    paintTray()
  }

  /**
   * ▶ WITH WHAT XOKO ASKED FOR — and the reason it can use "any selected generation option from
   * any section".
   *
   * ⚠️ IT PRESSES THE SECTION'S OWN ▶ whenever the medium matches where you are standing. Not a
   * copy of it: the actual `make` the ▶ button calls, so the style select, the knobs on the right,
   * the reference tray and the armed workflow are all exactly what they would have been if you had
   * typed the sentence yourself. A second payload builder here would be a second set of answers to
   * every one of those questions.
   *
   * ⚠️ AND IT GOES THERE FIRST (2026-08-22). It used to press the section's ▶ only when the medium
   * already matched, and take a bare minimum press otherwise — no style, no knobs, nothing. That is
   * how "make me a two minute song" got a 120-second graph default instead of the 94 seconds the
   * length select was sitting on: xoko was standing in 🔌 at the time, so the section that owns the
   * knob was never asked. Now it navigates the way `make` on a composition already did — the press
   * happens in front of you, in the section that owns the controls, and the recommended defaults
   * are whatever those controls say. A medium with no section of its own still falls through to
   * the minimum press below.
   */
  /**
   * ⚠️ IT RETURNS THE REASON, NOT JUST FALSE (2026-08-22). The caller used to invent the note —
   * every failed press came back as "nothing installed makes model3d", which was a confident lie
   * whenever the truth was "that workflow wants a picture and the tray is empty". A refusal that
   * names the wrong cause is worse than a refusal.
   *
   * ⚠️ AND THE NOTE IS WRITTEN FOR THE PERSON FIRST. It lands in the transcript as "✕ could not
   * make … — <note>", and since 2026-08-23 it also rides into the NEXT question, so a sentence that
   * only somebody standing here could parse is a sentence the brain will also read.
   */
  /**
   * WHAT ACTUALLY GOT PRESSED, in one line — the workflow that answered and what it was set to.
   *
   * ⚠️ A LONG VALUE IS COUNTED, NOT QUOTED. A lyric sheet is the reason the text channel exists
   * and echoing it back would put it through the transcript twice and into the next question a
   * third time; how many lines landed is the fact worth confirming.
   */
  const receipt = (rec, dials) => {
    const set = Object.entries(dials).map(([k, v]) => {
      const str = String(v ?? '')
      const lines = str.split('\n').length
      return lines > 1 ? `${k} (${lines} lines)` : `${k} ${str.length > 40 ? `${str.slice(0, 40)}…` : str}`
    })
    return `queued on ${rec.service}/${rec.slug}${set.length ? ` [${set.join(', ')}]` : ''}`
  }

  const makeFor = async (medium, text, style = null, settings = {}) => {
    if (medium !== forMedium()) {
      const desc = sections().find((s) => s.medium === medium)
      if (desc) show(desc.id)
    }
    // ⚠️ THE WORKFLOW IS ARMED BEFORE ANYTHING ELSE IS DECIDED, because everything after this line
    // depends on which one it is: which slots must be filled, which knobs exist, which service
    // answers. `[workflow music-detail]` is a setting like the others to whoever wrote the line, and
    // the one that has to be applied first.
    const wanted = settings[WORKFLOW_SETTING]
    if (wanted) {
      // ⚠️ EITHER SPELLING, BECAUSE BOTH ARE ON SCREEN (2026-08-23). The map and `look: workflows`
      // print `comfyui/ace-step` — the id the library uses and the id ▶ take: wants — while the
      // workflow's own slug is `ace-step`. Accepting only the bare half meant the name xoko had just
      // been shown was the one name it could not use here. `look: workflow` already took both.
      const want = wanted.trim().toLowerCase()
      const found = workflowsIn(medium).find((w) => w.slug.toLowerCase() === want
        || `${w.service}/${w.slug}`.toLowerCase() === want)
      if (!found) {
        const have = workflowsIn(medium).map((w) => `${w.service}/${w.slug}`).join(', ')
        return { ok: false, note: `no workflow called "${wanted}" for ${medium} — installed: ${have || 'none'}` }
      }
      armWorkflow(medium, found)
    }
    let rec = workflowFor(medium)
    if (!rec) return { ok: false, note: `nothing installed makes ${medium}` }
    // ⚠️ THE ASK DECIDES, NOT WHAT WAS ARMED LAST TIME (2026-08-24). A medium can offer a kind
    // whose only input is a picture beside one that reads words — `cutout` and `t2i` on 🖼. Arm the
    // picture one once, ever, and every later "make me a chick" was answered "attach a picture
    // first" by a workflow nobody had chosen for this ask: `kindFor` returns a remembered kind
    // unconditionally, so the wordy-kind preference below it only ever ran on a machine nobody had
    // touched. A sentence with nothing on the tray is somebody asking for a new one — so if this
    // medium has a sibling that reads words, that is what runs.
    //
    // ⚠️ AND IT ARMS IT, VISIBLY. The controls MOVE, on screen, which is the rule every other thing
    // xoko drives keeps: what runs is the press you are watching. It also repairs the remembered
    // kind, so the next press needs none of this.
    if ((rec.slots ?? []).length && refs.length < rec.slots.length) {
      const wordy = workflowsIn(medium).find((w) =>
        (w.inputs ?? ['prompt']).includes('prompt') && !(w.slots ?? []).length)
      // Nothing here reads words — an image-to-3D medium really does need the picture, and the
      // honest answer is where to go and what to drop.
      if (!wordy) return { ok: false, note: 'attach a picture first — drop one on the bar, or ＋' }
      armWorkflow(medium, wordy)
      flash(`${rec.slug} needs a picture — pressed ${wordy.slug}, which takes words`)
      rec = workflowFor(medium)
    }
    const spec = askOwner()?.ask
    if (medium === forMedium() && spec?.make) {
      // ⚠️ THE STYLE IS SET ON THE CONTROL, IN FRONT OF THEM, BEFORE THE PRESS — never slipped
      // into a payload. `useStyle` moves the section's own picker and refuses a name it does not
      // have, so what runs is the press they are watching and what failed says why.
      // ⚠️ AWAITED, BECAUSE A STYLE MAY HAVE ARRIVED A MOMENT AGO. "take the sailor, then read
      // this in it" is two acts in one turn: the take lands, `show` starts the section's reload,
      // and a synchronous check here would run against the list as it was before the fetch came
      // back and refuse a voice that is sitting on disk. `useStyle` reloads and re-checks.
      //
      // ⚠️ `null` IS SUCCESS AND `??` ATE IT (2026-08-23). Both of these hooks answer with a
      // SENTENCE when they refuse and `null` when they applied — and `x ?? fallback` fires on null
      // as readily as on undefined, so every press that actually set something reported the
      // fallback and was thrown away. The whole of "xoko can drive the controls" was dead behind
      // two `??`. The presence of the hook and the answer it gave are two different questions and
      // are now asked separately.
      const no = style
        ? (spec.useStyle
          ? await spec.useStyle(style)
          : `${medium} has no styles to choose from`)
        : null
      if (no) { flash(no, true); return { ok: false, note: no } }
      // ⚠️ THE SAME RULE THE STYLE KEEPS: the controls MOVE, on screen, and then the section's
      // ordinary ▶ runs. A setting slipped into a payload would be a press nobody could see and
      // nobody could correct — and a knob this workflow does not have is refused BY NAME rather than
      // dropped, because a tempo that silently did nothing is the failure this whole phase is about.
      const dials = { ...settings }
      delete dials[WORKFLOW_SETTING]
      const wrong = Object.keys(dials).length
        ? (spec.useSettings
          ? await spec.useSettings(dials)
          : `${medium} has nothing to set`)
        : null
      if (wrong) { flash(wrong, true); return { ok: false, note: wrong } }
      const ok = !!(await spec.make(text, null))
      // ⚠️ A SUCCESS IS A RECEIPT, NOT A TICK (2026-08-23). `✓ make music — done` is true and says
      // nothing a brain can check itself against: which of the installed workflows answered, and
      // whether the length it asked for is the length that was set. Both are knowable here and
      // neither was travelling back, so xoko described the press it INTENDED and was right by
      // luck. The note rides into the next turn (readDid, src/server/app.ts).
      return { ok, note: ok ? receipt(rec, dials) : 'see the message above' }
    }
    // ⚠️ THE MINIMUM PRESS CANNOT HONOUR A STYLE and must not pretend to: there is no section here
    // to move a control on, and a style sent invisibly is the thing the branch above exists to
    // avoid. In practice this is unreachable for a medium with a section — every one of them has
    // one — and it is the honest answer for a medium that does not.
    if (style) return { ok: false, note: `there is nowhere to choose a ${medium} style from here` }
    const ok = !!(await ctx.generate({
      medium, text, style: null, inference: [{ id: rec.service, workflow: rec.slug }],
    }))
    return { ok, note: ok ? '' : 'see the message above' }
  }

  /**
   * ✨ WHAT XOKO ASKED FOR, PERFORMED — and the reason it can operate any section of the app.
   *
   * ⚠️ EVERY ONE OF THESE IS THE CODE A CLICK RUNS. `make` is the section's own ▶ (see `makeFor`);
   * `take` is `ctx.take`, which is the same call the ⤓ button on the 📚 page makes; `go` is the
   * hash, which is what a nav row is. Not a copy of any of them — the actual function — so there
   * is no second opinion anywhere about what one of xoko's presses means, and nothing it does can
   * reach a path a person could not.
   *
   * ⚠️ AND IT RETURNS A SENTENCE WHEN IT REFUSES. "could not take" is a dead end; "the library
   * publishes nothing called stickers-v2" is the server's own words, in the transcript, next to
   * the line that asked for it.
   */
  const actFor = async (a) => {
    if (a.verb === 'make') {
      // ⚠️ A MEDIUM AND A COMPOSITION ARE THE SAME SENTENCE TO xoko, and they diverge here — which
      // is right: it named WHAT should answer, and which of the two that is is a fact about this
      // machine's folder, not about the ask.
      if (!a.medium) {
        const want = String(a.target ?? '').replace(/^comp-/, '')
        const desc = compDescs.find((d) => d.id === compositionId(want))
        if (!desc) return { ok: false, note: `there is no ${want} here` }
        // ⚠️ IT GOES TO THE SECTION AND PRESSES ITS ▶. Running a chain from somewhere else would
        // mean a second runner and a run you cannot watch — the section IS the readout, so xoko
        // puts you in front of it.
        show(desc.id)
        const ok = await (askOwner()?.ask?.make?.(a.text) ?? false)
        return { ok, note: ok ? '' : 'that chain would not start — see the message above' }
      }
      return makeFor(a.medium, a.text, a.style ?? null, a.settings ?? {})
    }
    if (a.verb === 'go') {
      // A brain writes `#/images`, `images/styles` and `images` for the same place. The id is the
      // first segment of whichever it wrote.
      const id = String(a.text).trim().replace(/^#?\/?/, '').split(/[\s/]+/)[0]
      if (!sections().some((x) => x.id === id)) return { ok: false, note: `there is no ${id} here` }
      if (location.hash === `#/${id}`) show(id)
      else location.hash = `#/${id}`
      return { ok: true, note: '' }
    }
    if (a.verb === 'take') {
      try {
        const r = await ctx.take(String(a.text).trim())
        const took = r.took
        flash(took ? `⤓ ${took.label} → ${took.service ?? took.medium}` : 'installed')
        // ⚠️ A TAKE IS A RECEIPT TOO (2026-08-23), for the same reason a press is: a workflow whose
        // service was missing brings the shipped one with it, and a brain told only "done" would
        // go on to write the ▶ take: <service> line the map no longer needs. What the app now
        // connects to is the one fact about this act worth carrying into the next turn.
        return {
          ok: true,
          note: [
            took?.service ? `on ${took.service}` : '',
            took?.added?.length ? `added the ${took.added.join(', ')} service` : '',
          ].filter(Boolean).join(' · '),
        }
      } catch (err) {
        return { ok: false, note: String(err.message || err) }
      }
    }
    return { ok: false, note: 'this app has no such verb' }
  }

  /** 🗺 WHAT THE APP CURRENTLY HOLDS, for the brain. Generated from the two lists the nav is drawn
   *  from and from the armed workflows — never written out, so it cannot fall out of step with the
   *  menu (web/lib/xoko-map.js). */
  const mapForXoko = () =>
    xokoMap({ groups: GROUPS, sections: sections(), media, armedFor: workflowFor })

  /**
   * WHAT LOOK IS IN FORCE, PER MEDIUM — the ⚙ picker's own choice, read from the same key it
   * writes (`pickedKey`, web/lib/styles.js).
   *
   * ⚠️ IT TRAVELS BECAUSE xoko WRITES THE SENTENCE (2026-08-30). A papercut press came back a
   * photograph, and the half of that nobody had looked at was the ask itself: xoko wrote "water
   * droplets frozen in the air, sunlight glinting off the spray" — a description of a PHOTOGRAPH —
   * with papercut sitting armed in the picker and no way to know it. A style shapes what comes out
   * of the engine; it cannot un-ask for a specular highlight. So what is in force has to be visible
   * at the moment the words are written, not only after they are sent.
   *
   * ⚠️ SLUGS ONLY, AND THE SERVER RESOLVES THEM. The words are the style file's and the server
   * already loads it for every medium's map line (src/xoko/here.ts) — sending them from here would
   * be a second copy of a style, composed in the wrong place and stale the moment one is edited.
   */
  const pickedStyles = () => Object.fromEntries(
    media.map((m) => {
      let slug = ''
      try { slug = localStorage.getItem(pickedKey(m)) ?? '' } catch { slug = '' }
      return [m, slug]
    }).filter(([, slug]) => slug))

  async function send(kind) {
    // ⏹ — a second press while it is thinking STOPS it. Same button, because "send" and "stop"
    // are the same slot in every app that has both, and a separate one would be a button that is
    // disabled almost all of the time.
    if (asking) { asking(); return }
    const said = askLine.value.trim()
    // ⚠️ THE SENTENCE IS REQUIRED BY THE WORKFLOW, NOT BY THE BAR (2026-08-12). Most workflows take a
    // `prompt` and an empty press is a mistake worth catching here; a cutout takes a picture and no
    // words, and refusing that press would make the whole family of operators unreachable. xoko
    // always needs words — there is nothing else to go on.
    const wordless = kind === 'make' && !(workflowFor(forMedium())?.inputs ?? ['prompt']).includes('prompt')
    if (!said && !wordless) { flash('say something first'); askLine.focus(); return }
    if (kind === 'make') {
      const spec = askOwner()?.ask
      if (!spec?.make) return
      // ⌘↵ can still name the verb the switch will not arm. Same answer, said out loud.
      if (spec.greyed) { flash(GREY_WHY); return }
      // Cleared only on acceptance: a refused sentence you have to retype is a refusal that
      // costs twice.
      if (await spec.make(said, askGo)) askLine.value = ''
      return
    }
    // ✨ — xoko. The transcript is the bar itself, grown.
    //
    // ⚠️ NOTHING ABOUT THE BRAIN TRAVELS ANY MORE (2026-08-30). It used to send `{service, workflow}`
    // — the ✨ tab's own choice in the engine menu — because the brain was armed like a checkpoint
    // and the server had to be told which. There is ONE connection now and the server reads it
    // (src/server/app.ts `brainFor`), so a page cannot pick a different model for one question.
    askBar.classList.add('talking')
    // ⚠️ CLEARED ON THE WAY IN, unlike ▶. A question that is already in the transcript above does
    // not also need to be sitting in the box you type the next one into — the opposite of a
    // refused render, where the sentence is all you have left.
    askLine.value = ''
    // ⚠️ REOPEN BEFORE ASKING, not on page load. A conversation is read back the first time you
    // actually talk — a reload that never touches ✨ costs nothing, and the shelf of other
    // conversations is fetched in the same call.
    await xokoResume()
    await xokoAsk(ctx, {
      said,
      about: askAbout(),
      map: mapForXoko(),
      picked: pickedStyles(),
      host: askLog,
      close: closeLog,
      busy: (abort) => { asking = abort; paintGo() },
      act: actFor,
    })
  }

  /** ✕ — a NEW conversation. ⚠️ IT NO LONGER DESTROYS THE OLD ONE (2026-08-21): that one is a file
   *  and it is still there, in the ⌄ shelf. What closes is this view of it. */
  function closeLog() {
    xokoForget()
    askLog.replaceChildren()
    askBar.classList.remove('talking')
  }

  dockHost.replaceChildren(askBar)

  askGo.addEventListener('click', () => { void send(armedMode()) })
  askLine.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' || ev.shiftKey) return
    ev.preventDefault()
    // ↵ sends the armed verb; ⌘/⌃↵ sends the OTHER one without touching the switch — the one-off
    // that does not become the setting, which is what a mode most needs beside it.
    const armed = armedMode()
    const other = armed === 'make' ? 'xoko' : (pressable() ? 'make' : 'xoko')
    void send(ev.metaKey || ev.ctrlKey ? other : armed)
  })

  // ── the section context ─────────────────────────────────────────────────────
  const ctx = {
    manifest: () => manifest,
    /** /api/inference — one row per service, and whether it is there. */
    shelf: () => shelf,
    /** /api/engines — what each service can be asked for. Both are the 🔌 section's data: it
     *  draws one tree, and these are its two levels. */
    services: () => services,
    /** A service's declared caps, for drawing an engine's delta against it. */
    capsOf: (id) => shelf.find((s) => s.id === id)?.caps ?? null,
    /** The kinds of output this build makes, and the words the 🔌 editor's menus are made of —
     *  roles, transports, prompt idioms, reference roles, the minimum caps. All the SERVER's: a
     *  browser-side copy of any of them is how a form ends up offering a field the writer
     *  refuses, and how a seventh transport ships half-known. */
    media: () => media,
    vocab: () => vocab,
    /**
     * ★ THE FAVOURITE, PER CAPABILITY — read `<service>|<slug>`, or write one.
     *
     * ⚠️ THE SAME PREFERENCE THE ASK BAR READS, not a second one (see `plugKey`). It was only
     * settable from the dock's picker, which shows one medium's kinds one at a time; 🔌 is where
     * every candidate for a capability is on screen together, which is where the choice is
     * actually made. Two surfaces, one key, and they cannot disagree.
     *
     * `null` clears it — back to the registry's fallback, which is what an unstarred capability
     * uses anyway. So there is no third state to store and nothing to migrate.
     */
    starOf: (kind) => { const w = armedFor(kind); return w ? recKey(w) : null },
    star: (kind, key) => {
      store.set(plugKey(kind), key ?? '')
      afterArm(mediumOfKind(kind) ?? forMedium(), kind)
    },
    /**
     * ADD A SERVICE, CHANGE ONE, OR DROP YOUR ROW — one call, because they are one act on one
     * file: what my layer says about this id. The answer is the whole shelf.
     *
     * The catalogue is re-read afterwards: a service that just appeared has engines nobody has
     * asked about, and one whose endpoint moved has a catalogue that was about the old one.
     */
    saveService: (row) => postService(row),
    removeService: (id) => postService({ id, remove: true }),
    /**
     * ⤓ TAKE ONE THING FROM THE LIBRARY — a catalog id (`draw-things-grpc/klein-t2i`) or a link
     * to one on the library this app is pointed at. Answers with the whole shelf and `took`,
     * which says what landed and what it still needs.
     */
    take: (what) => postTake(what),
    /**
     * SET ONE API KEY, or `null` to forget it.
     *
     * ⚠️ WRITE-ONLY, AND THERE IS NO READ ANYWHERE (src/secrets.ts). The answer is the shelf, whose
     * row now says whether a key is set — which is the only fact about a stored key this app will
     * tell a browser, and the reason no page has to be careful with one.
     */
    setSecret: async (id, value) => {
      const r = await api('/api/secret', { id, value })
      shelf = r.services ?? shelf
      paintRun()
      return r
    },
    /** Re-ask ONE service what it has, or all of them. The 🔌 card's ↻ button; nothing else
     *  forces this, because a cold catalog scan is ~40s and belongs to a press. */
    rescan: (id = null) => loadEngines({ refresh: id ?? true }),
    /**
     * Retune one checkpoint: `{ knob: value }`, or `null` per knob to put the shipped number
     * back. The answer IS the whole catalogue, so nothing here merges a patch into what it was
     * already showing — the browser holds no second opinion about what an engine runs at.
     */
    tune: async (service, file, params) => {
      const r = await api('/api/engines', { service, file, params })
      services = r.services ?? services
      paintRun()
      engineChanged()
      return r
    },
    /** Re-read the index. For a section that CHANGED what is on disk — deleting an asset — and
     *  not for a section that merely wants to redraw; that is `refresh()`. `rebuild` re-opens
     *  every master on disk — the 📁 files page's button, and nothing else. */
    reloadManifest: (opts) => refreshManifest(opts),
    /** 🧩 Re-read the chains — for a section that changed the folder (🗑 forget). */
    reloadCompositions: () => refreshCompositions(),
    /**
     * ⚠️ TAKE A SHELF SOMETHING ELSE WAS ANSWERED WITH — for a section that INSTALLED something by
     * a path other than ⤓ (2026-09-01). There is exactly one: a chain's `registry` bind, which
     * writes a workflow into a service row or a composition into its own section, and whose answer
     * therefore carries the same whole shelf a take's does. Not a second way of adopting one — the
     * same `tookShelf`, reached from the one other place that can change what this app holds.
     */
    adoptShelf: (r) => { tookShelf(r); void loadEngines() },
    /** What the index currently knows, for the page that owns it (📁 files). */
    manifestInfo: () => ({ groups: manifest.media.length, at: manifest.generatedAt }),
    /** Stop one job. The queue's only action — the shell owns the poll, so it owns the verb. */
    cancelJob: async (id) => {
      await api(`/api/queue/${encodeURIComponent(id)}/cancel`, {})
      await pollQueue()
    },
    /**
     * WHAT WILL RUN — the armed workflow, flattened with its service.
     *
     * ⚠️ ONE, NOT A LIST (2026-08-08). It was `engines()`, plural, because a press could be
     * answered by several checkpoints; that stopped meaning anything once they do different jobs.
     * The shape stays an object with `model` and `caps` so the 🎨 grid and the ⚙ readout did not
     * have to be rewritten around a rename.
     *
     * ⚠️ `caps` here are EFFECTIVE (service ← checkpoint) and `params` are too (checkpoint ←
     * workflow): what a press will actually run at, without anyone typing a number.
     */
    engine: () => {
      const s = currentService()
      if (!s) return null
      const w = workflowFor(forMedium())
      return w
        ? { ...s, workflow: w.slug, kind: w.kind, model: w.model, caps: w.caps, params: w.params,
            // `inputs` as well as `slots`: the pictures it takes AND whether it takes a sentence.
            // A workflow with no `prompt` is pressed with an empty bar, and the builder has to know.
            slots: w.slots, inputs: w.inputs, notes: w.notes,
            // ⚠️ WHAT THIS WORKFLOW CAN BE ASKED FOR — the medium's knob table narrowed to the holes
            // it declares, computed once on the server (src/inference/knobs.ts `settableKnobs`).
            // A section draws its ⚙ controls straight off this, so switching workflow changes the
            // controls rather than leaving one that sets a hole the new graph has not got.
            settable: w.settable ?? [],
            // The named knob sets this workflow brings (`Workflow.presets`) — combinations that only
            // mean anything together, so `cfg` is never a lone number in a box.
            presets: w.presets ?? null }
        : { ...s, workflow: null, kind: null, model: null, caps: s.caps, params: {}, slots: [],
            inputs: ['prompt'], settable: [], presets: null }
    },
    /**
     * THE SAME, FOR A MEDIUM THAT IS NOT THE ONE YOU ARE STANDING IN.
     *
     * ⚠️ 🎨 NEEDED IT (2026-08-29). The band shows the image list while you are inside a chain, and
     * every swatch is shot on ONE model — so it has to be able to ask "what would answer an image
     * press", not "what would answer a press from here". Same resolution, different question.
     */
    engineFor: (medium) => {
      const svc = serviceFor(medium) ?? null
      const w = workflowFor(medium)
      if (!svc && !w) return null
      return w
        ? { ...(svc ?? {}), workflow: w.slug, kind: w.kind, model: w.model, caps: w.caps }
        : { ...(svc ?? {}), workflow: null, kind: null, model: null, caps: svc?.caps }
    },
    /** The same, as a list of one — for the payload builders, which take several selections and
     *  should not grow a second code path for the singular case. */
    engines: () => {
      const e = ctx.engine()
      return e ? [e] : []
    },
    /** ⚠️ WHAT KIND OF ASK THIS IS — `t2i` · `i2i` · `edit` (src/types/workflow.ts). A section
     *  reads it to know which of its controls mean anything. */
    task: () => workflowFor(forMedium())?.kind ?? null,
    /**
     * WHAT IS ATTACHED TO THE SENTENCE — `{ asset, role }`, exactly the request's `refs`.
     *
     * ⚠️ THE ROLE IS THE WORKFLOW'S SLOT, filtered against what it currently declares. A workflow you
     * switched away from may have left a picture in a slot the new one does not have, and sending
     * that would be refused — correctly, but for a reason nobody could see.
     */
    refs: () => {
      const slots = refSlots()
      return refs.filter((r) => slots.includes(r.role)).map((r) => ({ asset: r.asset, role: r.role }))
    },
    /** Put words in the ask line and hand it the caret. For "do that again with a change" —
     *  the sentence is the app's one input, so reusing one is filling it, not a second field. */
    askFill: (text) => {
      askLine.value = text ?? ''
      askLine.focus()
      askLine.setSelectionRange(askLine.value.length, askLine.value.length)
    },
    picked: () => picked,
    flash,
    /** One press → one run. The payload is `src/types/request.ts` and nothing else. */
    generate: async (request, btn) => {
      if (btn) btn.disabled = true
      try {
        const r = await api('/api/generate', request)
        flash(`queued ${r.jobs.length} job(s) → ${r.runId}`)
        void pollQueue()
        return r
      } catch (err) {
        flash(String(err.message || err), true)
        return null
      } finally {
        if (btn) btn.disabled = false
      }
    },
    /**
     * ⚠️ A PICK PAINTS ⓘ AND NEVER SWITCHES TO IT (2026-08-07). This used to call
     * `dock.show('detail')`, defended in a comment as "one of the only two moves the dock makes
     * by itself, and only for a reason". The reason does not survive contact: you are half way
     * through setting steps, you click a picture to compare it against the last one, and your
     * knobs are gone — because you looked at something. The pane is yours; the tab strip is the
     * only thing that moves it. What a pick gets instead is a dot on the ⓘ tab.
     */
    onPick: (cell, group) => {
      picked = cell ? { cell, group } : null
      paintDetail()
      if (cell) dock.mark('detail')
    },
    /** The same, for a section whose feed is not the media gallery. One selection channel, so
     *  the ⓘ band never has to know which kind of section is active. */
    select: (what) => {
      picked = what
      paintDetail()
      if (what) dock.mark('detail')
    },
    /** Redraw the ⚙ and ⓘ bands for whatever owns them now. A view calls this when its own
     *  state changes — opening the editor changes what ⓘ should be showing. */
    repaintDock: () => { paintOptions(); paintStyles(); paintDetail() },
    /**
     * ⚙ — bring the options band up, on whatever owns it.
     *
     * ⚠️ THE SAME RULE AS `openStyles`, AND IT IS A NARROW ONE. Nothing in this app moves your
     * pane for you; a button you pressed may, because that press IS the request. This exists for
     * the one shape where it would otherwise be broken: a control whose entire result appears in
     * the dock and nowhere else — ＋ connect a service opens a form that lives only there, so
     * with the pane shut it looked like a button that does nothing.
     */
    openOptions: () => { setRight('tabs'); dock.show('opts') },
    /**
     * ⓘ — bring the selection band up, on whatever owns it.
     *
     * ⚠️ THE PAIR TO `onPick`, NOT A REVERSAL OF IT. A pick still never moves your pane: you
     * click a picture to compare it against the last one, and losing your knobs because you
     * LOOKED at something is the bug that rule exists for. What this serves is the other press —
     * the ⓘ on a card (web/lib/browse.js), which does not mean "select this", it means "show me
     * what this is". The panel is the answer to that press, so opening it is not the app deciding
     * anything.
     */
    openDetail: () => { setRight('tabs'); dock.show('detail') },
    /**
     * 🎨 — open the band on one medium's list. The door under every ⚙ style row.
     *
     * ⚠️ IT IS A DOOR YOU PRESSED, which is the only reason it may move the pane. Nothing in this
     * app switches your tab on its own; this is you asking to be taken somewhere.
     */
    openStyles: (scope, slug = null) => {
      if (scope && styleScopes().includes(scope)) styleScope = scope
      setRight('tabs')
      paintStyles()
      dock.show('styles')
      // ⚠️ ON the one you named, when you named one — a chain style's `uses` chip is "show me what
      // that actually is", and landing on the grid without it selected answers a different
      // question.
      if (slug) styleViews.get(styleScope)?.pick?.(slug)
    },
    /** A ⚙ picker asking to hear when a list changes. */
    onStyles: (fn) => {
      if (!creating) return
      if (!styleWatchers.has(creating)) styleWatchers.set(creating, new Set())
      styleWatchers.get(creating).add(fn)
    },
    /** 🎨 saying one did — a medium, or `comp:<slug>` for a chain's own list. */
    stylesChanged: (scope) => {
      for (const set of styleWatchers.values()) {
        for (const fn of set) {
          try { fn(scope) } catch (err) { console.error(err) }
        }
      }
    },
  }

  /**
   * ⚠️ THE DOCK FOLLOWS WHERE YOU ARE. A view owns the ⚙ and ⓘ bands while it is showing — the
   * section's launch knobs are for making things and mean nothing on a sub-page. A view that
   * declares neither falls back to its section, so a view with nothing to say costs nothing
   * (DECISIONS.md, 2026-08-04).
   */
  const dockOwner = () => currentView ?? active?.inst ?? null

  function paintDetail() {
    // ⚠️ ⓘ IS ABOUT WHAT YOU PICKED IN THE FEED, and nothing else. A job briefly lived here and
    // it was a stretch — a job and a picture then competed for one pane, and "the thing you
    // selected" stopped meaning one thing. Job detail unfolds in the ▶ tab, where the job is.
    //
    // ⚠️ AND A SECTION THAT DECLARES NO `detail` GETS NO TAB (2026-08-07) — the same rule as ⚙
    // below, pointed the other way. ⓘ earns its seat where the feed is a wall of pictures and
    // there is nowhere else to read one; in the settings sections the feed row IS the detail, so
    // the band was a second copy of the row you had just clicked.
    const owner = dockOwner()
    dock.setHidden('detail', !owner?.detail)
    if (!owner?.detail) return
    detailBody.replaceChildren(owner.detail(picked) ?? el('p', { class: 'empty' }, 'pick something in the feed'))
  }

  /**
   * WHICH STYLE LISTS ARE REACHABLE FROM WHERE YOU ARE STANDING.
   *
   * ⚠️ DERIVED, NEVER AUTHORED. A media section has exactly one; a chain has one per medium its
   * steps make, read off the chain itself — so a composition that grows a music step grows an
   * entry here, and nothing in the library declares a list that could be wrong.
   *
   * ⚠️ AND A SECTION THAT MAKES NOTHING HAS NONE. 🔌, 📚 and the settings sections are not places
   * you press ▶ from, so the band is not drawn there at all.
   */
  const styleScopes = () => {
    const d = active?.desc
    if (!d) return []
    if (d.medium) return [d.medium]
    const mine = (d.styleMedia ?? []).filter((m) => media.includes(m))
    // ⚠️ THE CHAIN'S OWN LIST COMES FIRST, and it is where the strip opens. It is the one that
    // sets the others: a book style names a picture style and a music style at once, and going
    // straight to 🖼's grid inside a book is skipping the question you came to answer.
    return d.styleScope ? [d.styleScope, ...mine] : mine
  }

  /** The face on a scope chip: its medium, or the chain's own glyph and word. */
  const scopeFace = (scope) =>
    (scope.startsWith('comp:') ? `${active?.desc.icon ?? '🧩'} ${active?.desc.label ?? 'chain'}` : scope)

  /** The view for one scope, made on demand and kept. */
  function styleViewFor(scope) {
    let view = styleViews.get(scope)
    if (!view) {
      view = scope.startsWith('comp:')
        ? compStylesView(ctx, scope.slice(5), (active?.desc.styleMedia ?? []))
        : stylesView(ctx, scope)
      styleViews.set(scope, view)
      void view.refresh()
    }
    return view
  }

  /**
   * The 🎨 band, repainted for whatever owns it now.
   *
   * ⚠️ ONE SCOPE IS NOT A CHOICE, so the strip is not drawn — the same rule `tabbed()` keeps for a
   * lone tab. 🖼 shows the grid and nothing above it; a chain that draws and scores shows two
   * chips, and pressing one is a filter, not a page.
   */
  function paintStyles() {
    const scopes = styleScopes()
    // ⚠️ A CHAIN MAY DECLARE THAT IT TAKES NONE, and then the band SAYS SO rather than going away
    // (`Composition.styles === false`). Hiding it would make the pane a different shape depending
    // on which chain you are standing in, and leave "can I style this?" unanswered — while an
    // empty list with a ＋ answers it wrongly, which is what it did until 2026-09-04.
    const styleless = !!active?.desc.styleless
    dock.setHidden('styles', !scopes.length && !styleless)
    if (!scopes.length) {
      scopeStrip.replaceChildren()
      stylesHost.replaceChildren(
        ...(styleless ? [el('p', { class: 'empty' }, 'no styles here')] : []))
      return
    }
    if (!scopes.includes(styleScope)) styleScope = scopes[0]

    scopeStrip.replaceChildren(...(scopes.length > 1
      ? scopes.map((m) => {
        const b = el('button', {
          class: `chip pick${m === styleScope ? ' on' : ''}`, type: 'button',
          title: m.startsWith('comp:')
            ? 'this chain\'s own styles — what it says to the writing, and which one each step runs in'
            : `the ${m} styles this chain's steps would run in`,
        }, scopeFace(m))
        b.addEventListener('click', () => { styleScope = m; paintStyles() })
        return b
      })
      : []))

    const view = styleViewFor(styleScope)
    if (stylesHost.firstChild !== view.node) stylesHost.replaceChildren(view.node)
  }

  /**
   * The ⚙ band, repainted for whatever owns it now.
   *
   * ⚠️ A BAND WITH NOTHING TO SAY IS NOT DRAWN. The four bands are a fixed ORDER, not a fixed
   * presence: the styles page has nothing to set, and filling ⚙ with a paragraph explaining the
   * page is how prose ends up in a UI that should carry a word and a number (DECISIONS.md).
   */
  function paintOptions() {
    const owner = dockOwner()
    // ⚠️ THE TAB IS EARNED BY EITHER HALF. A section with no options of its own still has a run
    // block if it makes something, and hiding ⚙ would put the one choice that decides what ▶ does
    // behind a tab that is not there.
    const has = !!owner?.options || (!!forMedium() && !currentView)
    // ⚠️ A TAB WITH NOTHING TO SAY IS NOT DRAWN. Filling ⚙ with a paragraph explaining a page is
    // how prose ends up in a pane that should carry a word and a number. `tabbed()` moves you off
    // a tab it hides.
    dock.setHidden('opts', !has)
    if (!has) return
    // The panel is TITLED FROM THE NAV ENTRY — a section never invents a heading (PLAN §4). The
    // tab label stays fixed, because a tab you are aiming at should not rename itself.
    optsTitle.textContent =
      currentView ? `${active?.desc.label ?? ''} · ${currentView.label}` : (active?.desc.label ?? '')
    // A VIEW owns the pane while it shows, and a sub-page is not a place you launch from.
    runBlock.style.display = forMedium() && !currentView ? '' : 'none'
    optsBody.replaceChildren(...(owner?.options ? [owner.options] : []))
  }

  // ── ▶ THE QUEUE: ONE BUTTON, ONE OVERLAY ────────────────────────────────────
  //
  // ⚠️ IT HAS NO SEAT ANYWHERE (2026-08-07). It has been, in order: a dock band, a full-width
  // page, an expanding list in the nav, a third dock tab. Each of those gave permanent furniture
  // to something you look at occasionally, and the nav row that survived the last round was the
  // plainest tell — it was a second copy of the bar button, which already carries the count, the
  // elapsed time, and turns red on a failure. Two readouts of one fact.
  //
  // So: the BAR BUTTON is the readout, and pressing it puts the list over the right pane. What
  // is lost is the running job's NAME, and that is fine — that something is running is
  // glanceable, WHICH thing is a question you answer by opening it. It is in the title.
  //
  // ⚠️ JOB DETAIL IS HERE, NOT IN ⓘ. Calling a job "the thing you selected" was a stretch that
  // let a job and a picture compete for one pane; ⓘ is about what you picked in the FEED, and a
  // job's log unfolds where the job is.
  const hhmm = (sec) => {
    const n = Math.max(0, Math.round(sec))
    if (n < 90) return `${n}s`
    const h = Math.floor(n / 3600)
    const m = Math.round((n % 3600) / 60)
    return h ? `${h}h${String(m).padStart(2, '0')}m` : `${m}m`
  }
  const elapsed = (j) => (j.startedAt
    ? took(new Date(j.finishedAt ?? Date.now()) - new Date(j.startedAt))
    : '')
  const GLYPH = { queued: '⏳', running: '▶', done: '✓', failed: '✗', cancelled: '⊘', interrupted: '⚠' }

  /** Which logs are unfolded, by job id — a repaint every 2s must not close a log you opened to
   *  read. The set is the state; the `<details>` are drawn from it. */
  const openLogs = new Set()

  /**
   * ▶ — summon the queue, or put back what it interrupted.
   *
   * Opening it IS acknowledging the failures in it, which is what clears the ✗. Nothing else
   * ever clears that mark, and nothing ever closes this by itself — not a finished job, not an
   * emptied queue. The pane changes when you say so, same rule as the tabs.
   */
  function toggleQueue() {
    if (right === 'queue') { setRight(beforeQueue); closePanes(); return }
    beforeQueue = right
    setRight('queue')
    for (const j of jobs) if (j.state === 'failed') seenFailures.add(j.id)
    if (window.matchMedia('(max-width: 860px)').matches) openPane('opts')
    paintQueue()
  }
  queueClose.addEventListener('click', toggleQueue)

  function jobRow(j) {
    const live = j.state === 'running' || j.state === 'queued'
    const stop = el('button', { class: 'btn mini' }, j.state === 'running' ? 'stop' : 'cancel')
    stop.addEventListener('click', async (ev) => {
      ev.stopPropagation()
      stop.disabled = true
      try { await ctx.cancelJob(j.id) } catch (err) { flash(String(err.message || err), true) }
    })
    const head = el('div', { class: 'q-head' },
      el('span', { class: `q-glyph ${j.state}` }, GLYPH[j.state] ?? '?'),
      el('span', { class: 'q-label', title: j.label }, j.label),
      el('span', { class: 'q-took' }, elapsed(j)),
      live ? stop : null)
    // ⚠️ ONLY WHEN THE WORK CAN SAY (PLAN §4). `progress` is null unless something is really
    // counting steps — ComfyUI's socket, today — and a bar that appears anyway, crawling on a
    // timer, is a lie about a render that may be stuck. A running job with no number keeps the
    // elapsed clock and nothing else, which is what it had before and is honest.
    const bar = j.state === 'running' && typeof j.progress === 'number'
      ? el('div', { class: 'q-bar', title: `${Math.round(j.progress * 100)}%` },
        el('i', { style: `width:${Math.round(j.progress * 100)}%` }))
      : null
    // ⚠️ THE ERROR IS NEVER FOLDED. A failure you have to click to read is a failure you find
    // out about twice.
    const err = j.error ? el('p', { class: 'muted err-note q-err' }, j.error) : null
    const log = (j.log ?? []).join('\n')
    if (!log) return el('div', { class: `q-row ${j.state}` }, head, bar, err)
    const d = el('details', { class: 'q-log' },
      el('summary', {}, `log · ${(j.log ?? []).length} lines`),
      el('pre', { class: 'job-tail' }, log))
    d.open = openLogs.has(j.id)
    d.addEventListener('toggle', () => { if (d.open) openLogs.add(j.id); else openLogs.delete(j.id) })
    return el('div', { class: `q-row ${j.state}` }, head, bar, err, d)
  }

  /**
   * 🧩 ONE RUNNING CHAIN — the composition, and where it has got to, step by step.
   *
   * ⚠️ IT IS ABOVE THE JOBS AND IT IS NOT ONE OF THEM. A chain is not queued: it is a sequence of
   * presses this browser makes, and the presses ARE the jobs below. So it reads as what it is — the
   * thing those jobs are for — and the steps under it are the only place the sequence exists.
   */
  function chainRow(c) {
    const FACE = {
      waiting: ['·', ''], running: ['◍', 'busy'], you: ['✋', 'warn'],
      done: ['✓', 'ok'], failed: ['✕', 'bad'],
    }
    const stop = el('button', { class: 'btn mini' }, '⏹')
    stop.title = 'stop this chain — anything already queued still renders'
    stop.addEventListener('click', () => { c.stop(); flash('stopped between steps') })
    const done = c.steps.filter((s) => s.state === 'done').length
    return el('div', { class: `q-row chain ${c.state === 'failed' ? 'failed' : 'running'}` },
      el('div', { class: 'q-head' },
        el('span', { class: 'q-glyph running' }, c.icon ?? '🧩'),
        el('span', { class: 'q-label', title: c.said }, c.label ?? c.slug),
        el('span', { class: 'q-took' }, `${done}/${c.steps.length}`),
        c.state === 'running' || c.state === 'choosing' ? stop : null),
      el('div', { class: 'steps' }, ...c.steps.map((s) => {
        const [face, cls] = FACE[s.state] ?? ['·', '']
        return el('div', { class: `step-row${s.state === 'running' ? ' live' : ''}` },
          el('span', { class: `step-n ${cls}` }, face),
          el('span', { class: 'step-id' }, s.id),
          el('span', { class: 'step-what muted' }, s.note || s.state))
      })))
  }

  function paintQueue() {
    // 🧩 A CHAIN COUNTS AS LIVE EVEN WITH NOTHING QUEUED, which is the state this fixes: a chain
    // stopped on a `pick` has no jobs at all — it is waiting for YOU — and a readout that called
    // that "nothing running" was the app going quiet at the one moment it needed you.
    const chains = [...liveChains]
    const pending = jobs.filter((j) => j.state === 'running' || j.state === 'queued')
    const run = jobs.find((j) => j.state === 'running') ?? null
    const unseen = jobs.filter((j) => j.state === 'failed' && !seenFailures.has(j.id)).length
    const secs = run?.startedAt ? (Date.now() - new Date(run.startedAt)) / 1000 : 0

    // ⚠️ THE ONE READOUT IN THE APP. Count, elapsed, and the running job's name in the title.
    queueN.textContent = pending.length ? String(pending.length) : ''
    // ⚠️ THE PERCENTAGE WINS OVER THE CLOCK IN THE ONE READOUT, when there is one. "3m12s" answers
    // "how long has this been going"; "41%" answers "is it going to finish", which is the question
    // somebody watching a ten-minute song render is actually asking. The clock is still in the row.
    const pct = typeof run?.progress === 'number' ? Math.round(run.progress * 100) : null
    queueT.textContent = pct !== null ? `${pct}%` : (secs ? hhmm(secs) : '')
    queueBtn.classList.toggle('live', pending.length > 0 || chains.length > 0)
    queueBtn.classList.toggle('failed', pending.length === 0 && !chains.length && unseen > 0)
    queueBtn.title = pending.length
      ? `${run ? `running: ${run.label}${pct !== null ? ` — ${pct}%` : ''}` : `${pending.length} waiting`}`
      : chains.length
        ? chains.map((c) => `${c.label ?? c.slug}: ${c.state}`).join(' · ')
        : (unseen ? `${unseen} failed — open the queue` : 'nothing running')

    // Painted whether or not the overlay is up: it is a stable node the poll writes into, so
    // opening it is instant rather than up to 8s behind.
    const done = jobs.length - pending.length
    queueBody.replaceChildren(
      ...chains.map(chainRow),
      el('div', { class: 'q-tally muted' },
        pending.length
          ? `${pending.filter((j) => j.state === 'running').length} running · ${pending.filter((j) => j.state === 'queued').length} waiting`
          : 'nothing running',
        done ? ` · ${done} finished this session` : ''),
      ...(jobs.length
        // Newest first: the thing you came to look at is the thing that just happened.
        ? [...jobs].reverse().map(jobRow)
        : [el('p', { class: 'empty' }, 'no jobs yet — press ▶')]))
  }

  let lastStates = ''
  async function pollQueue() {
    try {
      const r = await api('/api/queue')
      jobs = r.jobs ?? []
    } catch { return }
    paintQueue()
    const states = jobs.map((j) => `${j.id}:${j.state}`).join(',')
    if (states !== lastStates) {
      const settled = jobs.some((j) => ['done', 'failed', 'cancelled'].includes(j.state))
      lastStates = states
      // ⚠️ A FAILURE NO LONGER HIJACKS THE SCREEN. The band used to force itself open; a page
      // cannot do that without navigating you somewhere you did not ask to go. The bar button
      // and the nav badge both turn red instead, which is the same information without the
      // ambush.
      if (settled) await refreshManifest()
    }
  }

  async function refreshManifest({ rebuild = false } = {}) {
    try {
      manifest = await loadManifest({ rebuild })
    } catch (err) {
      manifest = { media: [], chains: [], generatedAt: '' }
      flash(`the index could not be read: ${err.message}`, true)
    }
    try { active?.inst.refresh?.() } catch (err) { console.error(err) }
  }

  // ── nav + routing ───────────────────────────────────────────────────────────
  // GROUPS is the order of the menu; SECTIONS is what is in each one. Two lists rather than one,
  // because a shelf has to be able to be empty (see GROUPS).
  function buildNav() {
    const here = currentView ? `${active.desc.id}/${currentView.id}` : (active?.desc.id ?? '')
    // ⚠️ NOTHING BUT SECTIONS IN EITHER HOST. The nav is the CLASSIFICATION and every row in it
    // is a place you go. ▶ and the flash line sit BELOW both of these, in `#chrome`, which is
    // markup rather than a row for exactly that reason: neither is a place.
    navScroll.replaceChildren()
    navPinned.replaceChildren()
    for (const g of GROUPS) {
      const host = g.pinned ? navPinned : navScroll
      host.append(el('div', { class: 'nav-group' }, g.id))
      const rows = sections().filter((x) => x.group === g.id)
      if (!rows.length) {
        if (g.add) {
          host.append(el('a', {
            class: 'nav-item nav-add', href: g.add.href,
            title: 'nothing on this shelf yet — the library is where the first one comes from',
          }, el('span', { class: 'nav-ic' }, '＋'), el('span', {}, g.add.label)))
        }
        continue
      }
      for (const s of rows) {
        // ⚠️ A section's VIEWS are child rows in the nav (PLAN §4d), and they are COLLAPSED by
        // default — a place you visit occasionally should not be permanently in the menu. The
        // twisty is on the parent row and its state is remembered per section; navigating INTO a
        // view expands it, because being somewhere invisible is worse than an extra row.
        const views = active?.desc.id === s.id ? (active.inst.views ?? []) : []
        const open = views.length > 0 && (expanded.has(s.id) || here.startsWith(`${s.id}/`))

        // ⚠️ `data-family` IS ON THE ROW FOR ONE VALUE — `capabilities`, the chain that makes
        // chains (app.css). A section that has no family (every built-in one) writes nothing, so
        // the attribute is absent rather than empty and the selector cannot half-match.
        const row = el('a', {
          class: 'nav-item', href: `#/${s.id}`, 'data-id': s.id,
          ...(s.family ? { 'data-family': s.family } : {}),
        }, el('span', { class: 'nav-ic' }, s.icon), el('span', {}, s.label))
        if (views.length) {
          const twisty = el('button', {
            class: `nav-twisty${open ? ' on' : ''}`, type: 'button',
            title: open ? 'hide' : `show ${views.length} more`,
          }, open ? '▾' : '▸')
          twisty.addEventListener('click', (ev) => {
            // The row is a link; the twisty is not. Without this, expanding also navigates.
            ev.preventDefault()
            ev.stopPropagation()
            if (expanded.has(s.id)) expanded.delete(s.id)
            else expanded.add(s.id)
            buildNav()
          })
          row.append(twisty)
        }
        host.append(row)
        if (open) {
          for (const v of views) {
            host.append(el('a', {
              class: 'nav-item nav-sub', href: `#/${s.id}/${v.id}`, 'data-id': `${s.id}/${v.id}`,
            }, el('span', {}, v.label)))
          }
        }
      }
    }
    for (const a of navHost.querySelectorAll('.nav-item')) {
      a.classList.toggle('on', a.dataset.id === here)
    }
  }

  /** Which view of the active section is showing — null is its feed. */
  function mountView(inst, viewId) {
    const view = viewId ? (inst.views ?? []).find((v) => v.id === viewId) : null
    currentView = view ?? null
    feedHost.replaceChildren(view ? view.node : inst.feed)
    if (view) { try { view.refresh?.() } catch (err) { console.error(err) } }
    return view
  }

  function show(id, viewId = null) {
    // ⚠️ FALLS BACK TO THE FIRST BUILT-IN, which is what makes 🗑 on the composition you are
    // standing in safe: the row goes, the route no longer resolves, and you land in 🖼 rather than
    // on a blank pane addressed by a name that no longer exists.
    const desc = sections().find((s) => s.id === id) ?? SECTIONS[0]
    if (!desc) return
    if (!instances[desc.id]) {
      // ⚠️ WHOSE `create` THIS IS, so anything the section registers during it is filed under a key
      // that can be replaced rather than accumulated. See `styleWatchers`.
      creating = desc.id
      try {
        instances[desc.id] = { desc, inst: desc.create(ctx) }
      } finally {
        creating = null
      }
    }
    active = instances[desc.id]
    // The 🔌 readout names THIS section's medium, so it is repainted on arrival and not only on
    // the next poll.
    paintRun()
    store.set(ROUTE_KEY, viewId ? `${desc.id}/${viewId}` : desc.id)
    picked = null
    const view = mountView(active.inst, viewId)
    // Rebuilt AFTER the view is known: the active section's child rows are part of the nav, and
    // which one is `on` depends on where we just landed.
    buildNav()
    crumb.textContent = view ? `${desc.icon} ${desc.label} · ${view.label}` : `${desc.icon} ${desc.label}`
    // ⚠️ ARRIVING SOMEWHERE THAT MAKES NOTHING ARMS ✨ FOR REAL (2026-08-23). `armedMode` already
    // forced xoko on those sections, but only on screen — the stored verb stayed `make`, so
    // walking out of 🔌 into 🎼 flipped the switch back under you, mid-conversation, and the next
    // ↵ would have rendered a picture of a question. The bar said ✨ was armed; leaving a section
    // is not a reason to disarm it. It is one click back, and the switch is the loudest thing on
    // the row, so the other direction is cheap and visible.
    if (!pressable()) setMode('xoko')
    // ⚠️ THE BAR IS ALWAYS THERE. It used to be the section's, and therefore absent on a view —
    // which is exactly why the old 🎨 page had to grow a ✨ button of its own.
    paintAsk()
    paintOptions()
    paintStyles()
    paintDetail()
    if (!view) { try { active.inst.refresh?.() } catch (err) { console.error(err) } }
    closePanes()
  }

  const route = () => {
    const m = location.hash.match(/^#\/([\w-]+)(?:\/([\w-]+))?/)
    const saved = store.get(ROUTE_KEY, 'images').split('/')
    show(m?.[1] ?? saved[0] ?? 'images', m?.[1] ? (m[2] ?? null) : (saved[1] ?? null))
  }
  window.addEventListener('hashchange', route)

  // ── mobile panes, header toggles ────────────────────────────────────────────
  // Below app.css's 860px breakpoint the two side panes are overlays instead of grid columns.
  // At most ONE is open at a time, the scrim closes them, and navigating closes them — so
  // picking a section on a phone puts you straight in that feed. On desktop these classes are
  // inert: the media query is what positions the panes.
  const PANE_CLASS = { nav: 'nav-open', opts: 'opts-open' }
  const paneOpen = (which) => document.body.classList.contains(PANE_CLASS[which])
  function openPane(which) {
    for (const [name, cls] of Object.entries(PANE_CLASS)) {
      document.body.classList.toggle(cls, name === which)
    }
  }
  function closePanes() { openPane(null) }
  document.getElementById('nav-toggle').addEventListener('click', () => openPane(paneOpen('nav') ? null : 'nav'))
  document.getElementById('opts-toggle').addEventListener('click', () => openPane(paneOpen('opts') ? null : 'opts'))
  document.getElementById('sheet-close').addEventListener('click', closePanes)
  scrim.addEventListener('click', closePanes)
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePanes() })

  /**
   * ⌨ THE DECK, FROM THE KEYBOARD — space plays and pauses, ↑ and ↓ walk the list.
   *
   * ⚠️ IT NEVER TAKES A KEY IT DID NOT USE. Each of these returns false when the deck is holding
   * nothing or there is nowhere to step, and then the press falls through — so space still scrolls
   * a page of pictures and the arrows still scroll a list, on every shelf that has no sound on it.
   * Anything typed into is left alone entirely: this is for the hand that is not on the sentence.
   */
  document.addEventListener('keydown', (ev) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return
    if (ev.target?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return
    const acted = ev.key === ' ' ? togglePlaying()
      : ev.key === 'ArrowDown' ? deckStep(1)
        : ev.key === 'ArrowUp' ? deckStep(-1)
          : false
    if (acted) ev.preventDefault()
  })

  const toggleBody = (cls, btn, key, dflt) => {
    const on = store.get(key, dflt) === '1'
    const set = (v) => {
      document.body.classList.toggle(cls, v)
      btn.classList.toggle('primary', v)
      store.set(key, v ? '1' : '0')
    }
    btn.addEventListener('click', () => set(!document.body.classList.contains(cls)))
    set(on)
  }
  toggleBody('filters-open', document.getElementById('filters-toggle'), 'xokolat:filters-open', '0')

  // ⚠️ THE CHROME BLOCK MOVES, IT IS NOT DUPLICATED (2026-08-31). ▶ and the flash line live at the
  // foot of the nav, which on a phone is inside a drawer — and a queue readout you have to open a
  // drawer to read is not a readout. So below 860px the block relocates into the bar, ahead of 🔎,
  // where `display: contents` (app.css) lets its two children lay out as the bar's own flex items.
  // One node, one id, one place at a time: a second copy would be two readouts of one fact.
  const bar = document.querySelector('header.bar')
  const chrome = document.getElementById('chrome')
  const filtersBtn = document.getElementById('filters-toggle')
  const narrow = window.matchMedia('(max-width: 860px)')
  const placeChrome = () => {
    if (narrow.matches) bar.insertBefore(chrome, filtersBtn)
    else navFoot.append(chrome)
  }
  narrow.addEventListener('change', placeChrome)
  placeChrome()

  // ▶ is the app's one queue readout, and it puts the list over the right pane. Pressing it again
  // restores exactly what it interrupted.
  queueBtn.addEventListener('click', toggleQueue)

  // ── ↔ DRAGGING THE PANE WIDER ───────────────────────────────────────────────
  //
  // ⚠️ POINTER EVENTS AND `setPointerCapture`, not mousemove on the document. Capture is what
  // makes the drag survive the pointer crossing the feed, leaving the window, or ending up over
  // something with its own handlers — without it, a fast drag reaches the edge and the grip is
  // left stuck to the cursor.
  //
  // ⚠️ NOTHING IS REPAINTED WHILE IT MOVES. It writes one CSS variable on an animation frame; the
  // grid reflows and every panel inside is `flex: 1`, so calling `paintRun` or `paintOptions` here
  // would be redrawing menus that did not change, sixty times a second.
  sizeRight(store.get(WIDTH_KEY, RIGHT_DEFAULT))

  /** The live drag: where it was grabbed, how wide the pane was then, and where it is now.
   *  ⚠️ `w` IS CARRIED RATHER THAN RE-READ FROM THE END EVENT. `pointercancel` can arrive with
   *  coordinates that mean nothing — a clientX of 0 would read as "drag it to the full width" and
   *  store that. What the drag last actually showed is the only honest answer to what it meant. */
  let dragging = null

  grip.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return
    ev.preventDefault()
    grip.setPointerCapture(ev.pointerId)
    // ⚠️ A SHUT PANE HAS NO WIDTH TO DRAG. The rail is 10px of folded pane, not a column edge, so
    // a press on it can only mean one thing — and letting the resize maths run against a `from`
    // of 10 would have every move jump the pane to its minimum under a pointer that has not
    // travelled that far.
    if (right === 'shut') {
      dragging = { id: ev.pointerId, click: true }
      return
    }
    // ⚠️ THE GRAB OFFSET IS KEPT, so the pane does not jump on the first move. The grip is 7px
    // wide and the boundary is one edge of it; without this, grabbing the far side snaps the
    // width by however far in you happened to click.
    dragging = {
      id: ev.pointerId, frame: 0,
      x: ev.clientX, from: grip.parentElement.getBoundingClientRect().width,
      w: grip.parentElement.getBoundingClientRect().width,
    }
    grip.classList.add('dragging')
    document.body.classList.add('resizing')
  })

  grip.addEventListener('pointermove', (ev) => {
    if (!dragging || dragging.click || ev.pointerId !== dragging.id) return
    // One write per frame. A pointer reports faster than the screen draws, and the extra writes
    // are style recalculations nobody sees.
    if (dragging.frame) return
    const x = ev.clientX
    dragging.frame = requestAnimationFrame(() => {
      if (!dragging) return
      dragging.frame = 0
      // The floor is a floor: `sizeRight` clamps, the pane stops, and that is the whole of it.
      dragging.w = sizeRight(dragging.from + (dragging.x - x))
    })
  })

  const endDrag = (ev) => {
    if (!dragging || ev.pointerId !== dragging.id) return
    if (dragging.frame) cancelAnimationFrame(dragging.frame)
    const { w, click } = dragging
    dragging = null
    grip.classList.remove('dragging')
    document.body.classList.remove('resizing')
    // ⚠️ THE RAIL'S PRESS OPENS, AND THAT IS THE ONLY THING A PRESS ON THIS CONTROL MEANS. Closing
    // is the ✕ on the tab strip; the grip does not carry both, because on the same 7px target
    // "size me" and "shut me" cannot be told apart without a dead zone — see `dockClose`. A rail
    // has no width to size, so opening is unambiguous and stays here: a ✕ lives inside the thing
    // it closes and could never be the way back.
    if (click) {
      setRight('tabs')
      return
    }
    store.set(WIDTH_KEY, String(w))
  }
  grip.addEventListener('pointerup', endDrag)
  grip.addEventListener('pointercancel', endDrag)

  // ⚠️ ARROWS AND A RESET. A drag handle that only answers to a mouse is a control some people
  // cannot reach at all — hence `role="separator"` and a tab stop in index.html. ⌥ takes it in
  // one-pixel steps for the person who wants an exact column.
  grip.addEventListener('keydown', (ev) => {
    // ⚠️ THE KEYBOARD KEEPS THE TOGGLE IN BOTH DIRECTIONS, which the pointer does not. There is no
    // drag to be confused with a keypress, so nothing has to be given up here — and a keyboard
    // user on the rail would otherwise have to Tab into a pane that is not on screen to find ✕.
    if (ev.key === 'Enter' || ev.key === ' ') {
      setRight(right === 'shut' ? 'tabs' : 'shut')
      ev.preventDefault()
      return
    }
    if (right === 'shut') return
    const step = ev.altKey ? 1 : 16
    const now = grip.parentElement.getBoundingClientRect().width
    if (ev.key === 'ArrowLeft') store.set(WIDTH_KEY, String(sizeRight(now + step)))
    else if (ev.key === 'ArrowRight') store.set(WIDTH_KEY, String(sizeRight(now - step)))
    else return
    ev.preventDefault()
  })
  // The way back from an over-drag, at the place your hand already is. ⚠️ IT WAS DELETED FOR HALF
  // A DAY, when the grip also toggled: a double-click's two clicks land first, so it shut the pane
  // and reopened it before `dblclick` could fire. The ✕ took the toggle away and this came back —
  // which is the argument for the ✕ in one line.
  grip.addEventListener('dblclick', () => { store.set(WIDTH_KEY, String(sizeRight(RIGHT_DEFAULT))) })

  // ⚠️ RE-CLAMPED ON RESIZE, AND THE STORED NUMBER IS LEFT ALONE. Undock a laptop and a 700px pane
  // would sit over a 900px window with no feed left; but shrinking the window must not overwrite
  // the width you chose, or plugging the monitor back in gives you the laptop's pane.
  window.addEventListener('resize', () => { sizeRight(store.get(WIDTH_KEY, RIGHT_DEFAULT)) })

  // ── go ──────────────────────────────────────────────────────────────────────
  setRight(right)
  buildNav()
  paintQueue()
  measureAsk()
  await refreshInference()
  await loadEngines()
  await refreshCompositions()
  await refreshManifest()
  // ✨ THE FRONT DOOR ON A FRESH INSTALL (2026-08-30). An app with nothing connected opens on the
  // one screen that can get it out of that state — not on an empty picture feed whose ask bar
  // answers every sentence with "xoko has no model to think with".
  //
  // ⚠️ IT WRITES THE REMEMBERED ROUTE RATHER THAN THE HASH, so it is not this app moving you: it
  // is the same fallback `route()` already uses when you have never been anywhere. A hash you
  // typed still wins, and the moment something is connected your own last route comes back.
  if (!location.hash && !shelf.some((s) => s.role === 'brain')) {
    store.set(ROUTE_KEY, 'xoko')
  }
  route()
  // Two rates, one reason: while something is in flight the queue IS the screen; idle, it is a
  // heartbeat. Self-scheduling rather than a fixed interval, so a slow answer never stacks up
  // behind itself. Polling is honest here — the alternative is a socket for one user on
  // localhost.
  const tick = async () => {
    await pollQueue()
    const live = jobs.some((j) => j.state === 'running' || j.state === 'queued')
    setTimeout(() => { void tick() }, live ? 2000 : 8000)
  }
  void tick()
  setInterval(() => { void refreshInference() }, 15000)

  /**
   * ⚠️ THE FLOATING BAR'S HEIGHT, RESERVED AT THE BOTTOM OF THE FEED.
   *
   * The composer floats over the feed the way every writing surface does — no rule across the
   * pane, content passing under a raised card. That works there because the content is a thread:
   * overlap is temporary and you can always scroll the last message clear. Here the content is a
   * GRID OF PICTURES YOU ARE JUDGING, and the bottom row is where the newest render lands — so a
   * bar that merely overlaps permanently eats the one row you are looking at.
   *
   * MEASURED, never a magic number: the bar is one line, two lines, or a transcript, and a
   * hardcoded 120px would be wrong in two of those three.
   */
  function measureAsk() {
    const set = () => {
      document.documentElement.style.setProperty('--ask-h', `${Math.ceil(dockHost.offsetHeight)}px`)
    }
    set()
    if (typeof ResizeObserver === 'function') new ResizeObserver(set).observe(dockHost)
    // Fonts land after first paint and change the line height under the caret.
    document.fonts?.ready?.then(set)
  }
}
