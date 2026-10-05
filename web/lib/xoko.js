// ✨ XOKO — the transcript, and the one thing it can DO besides talk.
//
// ⚠️ IT HAS NO SURFACE OF ITS OWN (2026-08-05). It was a centred modal with its own textarea, its
// own ▶, its own brain readout, and two buttons to open it — seven pieces of UI for an act the app
// already had a place for. It is the ✨ verb on the shell's one ask bar, and this file is only what
// happens above it.
//
// ⚠️ NOT A NAV SECTION (PLAN §4e). The transcript is the conversation; the FEED is the result. A
// section would make xoko a place you go instead of a thing you ask, and everything it produces
// already has a home — a picture joins the gallery, a style joins the style list.
//
// ⚠️ THE BRAIN IS NOT AN ENGINE, AND STOPPED BEING ONE ON 2026-08-30. It was an inference row like
// any other — a medium of its own, armed on a ✨ tab of the same 🔌 menu as every checkpoint, answering
// a synthesised `chat` workflow — and it arrived here as `armed` so the server would be told which.
// There is ONE connection now, made in ✨ xoko, and the server reads it: nothing about the model
// travels with a question, and there is no second place it could be picked.
//
// ⚠️ AND IT NEVER DOES ANYTHING ITSELF (2026-08-12, widened 2026-08-22). What it wants done comes
// back as `acts: [{ verb, medium, text }]` and is performed HERE, in the browser, by exactly the
// code a click runs: `make` goes through the SECTION'S OWN ▶ (same payload builder, same armed
// workflow, same style select, same queue), `take` calls the same ⤓ endpoint the 📚 page calls, `go`
// sets the hash. So xoko writes the sentence and what answers it is whatever you chose; it cannot
// see your checkpoints and cannot pick one. See `src/xoko/grammar.ts` for why these are directive
// lines rather than tool calls, and why there are four of them and not forty.
//
// ⚠️ THE FOURTH VERB NEVER REACHES HERE. `look` is answered by the server mid-answer, so the brain
// can read your library and then say something true about it in the same breath. What arrives on
// this side is a `{ looked }` line saying which shelves it went to — printed in the transcript,
// because a question that takes three hops otherwise looks like a brain rewriting itself.
//
// ⚠️ THE CONVERSATION IS A FILE NOW, AND THIS DRAWS IT (2026-08-21). It used to live only here, in
// module state: a reload erased it, there was exactly one of it, and turn 13 silently deleted turn
// 1. The bound was real, so nothing ever ran away — but it was enforced by AMNESIA.
//
// What did NOT change is the part that matters: no vendor session, ever. `claude --resume` would
// put the transcript somewhere this app cannot read, edit or delete, and Ollama has no equivalent
// at all — so the whole thing still travels with every question, and what the brain knows is still
// exactly what you can see. The file is OURS; the conversation is not the client's.
//
// `chat` is now a VIEW of one session: which one, its turns, and what it costs to carry.

import { el } from './launch-kit.js?v=129'
import { api, MEDIUM_FACE, stream } from './shared.js?v=129'

/** The connection, as a list of at most one — there is exactly one `brain` row. */
export const brains = (ctx) => (ctx.shelf?.() ?? []).filter((s) => s.role === 'brain')

/** ⚠️ ONE BAR, ONE CONVERSATION AT A TIME — but no longer only one conversation. `id` names the
 *  file this is a view of; `chars` is what the server says it costs to carry. A turn is
 *  `{ said, answered }` plus whatever went wrong or got made — the first two are the only ones
 *  that travel, and the only two that are kept. */
const chat = { id: null, title: '', turns: [], chars: 0, collapsed: false, pending: null, list: [] }

/** Which conversation the bar reopens. ⚠️ THE ID ONLY — the transcript is on the server, so a
 *  cleared data root comes back with nothing to point at and the bar opens empty, which is right. */
const SESSION_KEY = 'xokolat:session'

/**
 * WHERE YOU ARE STANDING — and it is LIVE, unlike the `about` that travels to the brain.
 *
 * ⚠️ THEY WERE ONE CAPTURED STRING AND THAT WAS WRONG IN ONE DIRECTION (2026-08-23). `about` was
 * read once, when the question was asked, and then closed over by every repaint — so a
 * conversation opened in 🔌 inference still called itself `✨ xoko · inference` three sections
 * later, including when xoko itself had done the moving with `▶ go:`. What the brain was TOLD is
 * rightly a snapshot: it was asked from there. What the head SHOWS is where you are now.
 */
let here = ''
/** The log on screen, so navigation can repaint its head. Null when no conversation is open —
 *  and it must be nulled on ✕, or `xokoHere` would draw the transcript back into a host the
 *  shell has just emptied. */
let shown = null

/** The shell calls this on every navigation. Cheap: the head is one line and the transcript is a
 *  dozen short nodes, which is the same reason `paint` rebuilds rather than patches. */
export function xokoHere(where) {
  if (where === here) return
  here = where
  if (shown) paint(shown.ctx, shown.host, shown)
}

/** ⚠️ ROUGHLY, AND SAID AS CHARACTERS. There is no tokenizer in the browser either, and printing a
 *  token count we cannot compute would be a precise-looking number that is wrong. */
const kchars = (n) => (n >= 1000 ? `${Math.round(n / 1000)}k chars` : `${n} chars`)

export const xokoBusy = () => !!chat.pending

/**
 * ✕ — start a new conversation. ⚠️ IT NO LONGER ERASES ANYTHING (2026-08-21): the one you were in
 * is a file and it stays, so ✕ is "put this down", not "burn it". Forgetting one for good is 🗑 in
 * the picker, which is a different act and reads like one.
 */
export function xokoForget() {
  shown = null
  chat.id = null
  chat.title = ''
  chat.turns = []
  chat.chars = 0
  chat.pending = null
  try { localStorage.removeItem(SESSION_KEY) } catch { /* private mode */ }
}

/** Adopt what the server just told us about the conversation. One place, so the readout and the
 *  transcript can never disagree about which session they are describing. */
function adopt(head) {
  if (!head) return
  chat.id = head.id
  chat.title = head.title ?? chat.title
  chat.chars = head.chars ?? chat.chars
  try { localStorage.setItem(SESSION_KEY, head.id) } catch { /* private mode */ }
}

/** Reopen what you were in, and read the shelf of what else there is. Called when the bar opens. */
export async function xokoResume() {
  let saved = null
  try { saved = localStorage.getItem(SESSION_KEY) } catch { /* private mode */ }
  try { chat.list = (await api('/api/sessions')).sessions ?? [] } catch { chat.list = [] }
  if (!saved || chat.id === saved) return
  try {
    const r = await api(`/api/sessions?id=${encodeURIComponent(saved)}`)
    chat.id = r.session.id
    chat.title = r.session.title
    chat.turns = r.session.turns.map((t) => ({ ...t, looked: [], did: [] }))
    chat.chars = r.chars
  } catch {
    // The conversation is gone — a cleared data root, or 🗑 in another tab. Start fresh rather
    // than pointing at nothing.
    xokoForget()
  }
}

/** Open one from the picker. */
async function open(id, redraw) {
  const r = await api(`/api/sessions?id=${encodeURIComponent(id)}`)
  chat.id = r.session.id
  chat.title = r.session.title
  chat.turns = r.session.turns.map((t) => ({ ...t, looked: [], did: [] }))
  chat.chars = r.chars
  chat.collapsed = false
  try { localStorage.setItem(SESSION_KEY, id) } catch { /* private mode */ }
  redraw()
}

/** What it said, as paragraphs. Plain text — a brain that returns markdown gets shown its
 *  markdown, because rendering it would mean trusting an answer to be well-formed HTML. */
const paragraphs = (text) => String(text).split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)

/**
 * HOW THE PREVIOUS TURN'S OWN VERB LINES WENT — the one fact about this app that travels back.
 *
 * ⚠️ IT READS THE ROWS ALREADY ON SCREEN, so what the brain is told and what the person can see
 * are the same thing by construction. `did` is per turn and is cleared on a session reload, which
 * is why this is the LAST turn rather than the transcript: after a reload there is nothing to
 * report, and reporting nothing is correct — the answers are in the prose above by then.
 */
function lastDid() {
  const turn = chat.turns.at(-1)
  return (turn?.did ?? []).map((d) => ({
    verb: d.verb,
    // What was asked for, in the words the line used — a medium, a library id, a section.
    what: [d.target ?? d.text, d.style ? `/${d.style}` : ''].filter(Boolean).join(''),
    ok: d.ok === true,
    note: d.note ?? '',
  }))
}

/**
 * One performed act, in the past tense, with what went wrong when something did.
 *
 * ⚠️ THE VERB'S OWN WORD, not one word for all three. "sent to ▶" is right for a render that is now
 * queued and wrong for an install that has already finished, and a transcript that says the same
 * thing about both is one you stop reading.
 */
const ACT_FACE = {
  make: (a) => `${MEDIUM_FACE[a.medium]?.[0] ?? '▶'} sent to ▶ · ${a.text}`,
  take: (a) => `⤓ installed ${a.text}`,
  go: (a) => `→ opened ${a.text}`,
}

const actLine = (a) => (a.ok === false
  ? `✕ could not ${a.verb} ${a.text}${a.note ? ` — ${a.note}` : ''}`
  : (ACT_FACE[a.verb] ?? ((x) => `▶ ${x.text}`))(a))

/** One exchange. */
function turnNode(turn) {
  const body = el('div', { class: 'ask-reply' })
  if (turn.answered) body.append(...paragraphs(turn.answered).map((p) => el('p', {}, p)))
  if (turn.stopped) body.append(el('p', { class: 'muted' }, '— stopped'))
  if (turn.error) {
    body.append(
      el('p', {}, el('b', {}, 'it could not answer.')),
      // The server's own words: a client that is installed but not signed in says so, and that
      // sentence is the whole difference between a fix and a mystery.
      el('p', { class: 'muted' }, turn.error))
  }
  if (turn.thinking) body.append(el('p', { class: 'muted thinking' }, `${turn.on} is thinking…`))
  // ⚠️ WHAT IT WENT TO READ IS PART OF THE ANSWER. It is printed before the prose, in the order it
  // happened, so a reply that took three hops reads as three hops rather than as a delay.
  for (const shelves of turn.looked ?? []) {
    body.append(el('p', { class: 'ask-looked muted' }, `🔎 read ${shelves.join(', ')}`))
  }
  // ⚠️ WHAT IT DID IS SHOWN AS A LINE, not as the thing itself. A picture lands in the feed like
  // every other press, an installed workflow lands in 🔌 — one place where each kind of work appears,
  // and this stays a transcript.
  for (const a of turn.did ?? []) {
    body.append(el('p', { class: `ask-made${a.ok === false ? ' bad' : ''}` }, actLine(a),
      // ⚠️ THE RECEIPT ON A SUCCESS, MUTED (2026-08-23). A press that worked used to print the
      // prompt and nothing else, so WHICH of the installed workflows answered and what it was set to
      // was visible only by opening 🔌 and the ⚙ pane. It is the same sentence that rides back to
      // xoko (`receipt`, shell.js), which is the point: what the person can see and what the brain
      // is told are one string.
      a.ok === false || !a.note ? null : el('span', { class: 'muted' }, ` — ${a.note}`)))
  }
  if (turn.byline) body.append(el('p', { class: 'muted byline' }, turn.byline))
  // ⚠️ A FOLD IS SHOWN, NOT HIDDEN. It is the words every later turn is built on, so it prints in
  // the transcript like anything else that was said — marked, so nobody mistakes it for their own.
  return el('div', { class: `ask-turn${turn.summary ? ' ask-fold' : ''}` },
    el('p', { class: 'ask-said' }, turn.said), body)
}

/**
 * Draw the whole log from `chat`. Rebuilt rather than patched: a transcript is a dozen short
 * nodes, and the alternative is bookkeeping about which of them is current.
 */
function paint(ctx, host, { close }) {
  shown = { ctx, host, close }
  const turns = [...chat.turns, ...(chat.pending ? [chat.pending] : [])]
  const n = chat.turns.length
  // ⚠️ COLLAPSE, NOT FOLD — two different words for two different acts, and they used to share one.
  // This one hides the transcript on screen and changes nothing; ⌥ fold rewrites what the brain is
  // told. Calling both "fold" was fine while only one of them existed.
  const fold = el('button', {
    class: 'btn mini', type: 'button',
    title: chat.collapsed ? 'show the conversation' : 'hide it — nothing is forgotten',
  }, chat.collapsed ? `⌄ ${n} turn${n === 1 ? '' : 's'}` : '⌃')
  fold.addEventListener('click', () => { chat.collapsed = !chat.collapsed; paint(ctx, host, { close }) })

  const redraw = () => paint(ctx, host, { close })

  // ⚠️ WHAT IT COSTS TO CARRY, ON SCREEN. The whole transcript travels with every question, so a
  // long conversation is quietly more expensive per press than a short one — and until this line
  // existed the only lever anybody had was a destructive ✕.
  const cost = chat.chars
    ? el('span', { class: `ask-cost${chat.chars > 30_000 ? ' warm' : ''}`, title:
      'the whole conversation travels with every question, so this is what each one carries' },
    kchars(chat.chars))
    : null

  const foldNow = el('button', {
    class: 'btn mini', type: 'button',
    title: 'fold the older half into a summary — it stays readable, and each question gets cheaper',
  }, '⌥ fold')
  foldNow.disabled = !chat.id || chat.turns.length < 6
  foldNow.addEventListener('click', async () => {
    foldNow.disabled = true
    try {
      const r = await api('/api/session', { id: chat.id, fold: true })
      chat.turns = r.session.turns.map((t) => ({ ...t, looked: [], did: [] }))
      chat.chars = r.chars
    } catch (err) { ctx.flash?.(String(err.message || err), true) }
    redraw()
  })

  const head = el('div', { class: 'ask-log-head' },
    el('b', {}, '✨ xoko'),
    here ? el('span', { class: 'muted' }, `· ${here}`) : null,
    el('span', { class: 'spacer' }),
    cost,
    n >= 6 ? foldNow : null,
    n ? fold : null,
    el('button', {
      class: 'btn mini', title: 'a new conversation — this one is kept, and is in ⌄',
      onclick: close,
    }, '✕'))

  // ⚠️ THE SHELF OF OTHER CONVERSATIONS, only when there is one to go back to. A picker offering a
  // single choice is a control that has never done anything.
  const others = chat.list.filter((x) => x.id !== chat.id)
  const shelf = others.length ? el('div', { class: 'ask-shelf' },
    ...others.slice(0, 6).map((x) => {
      const b = el('button', { class: 'btn mini', type: 'button', title: `${x.turns} turns · ${kchars(x.chars)}` },
        x.title)
      b.addEventListener('click', () => { void open(x.id, redraw) })
      const drop = el('button', { class: 'btn mini danger', type: 'button', title: 'forget it — there is no undo' }, '🗑')
      drop.addEventListener('click', async () => {
        const r = await api('/api/session', { id: x.id, forget: true })
        chat.list = r.sessions ?? []
        redraw()
      })
      return el('span', { class: 'ask-shelf-row' }, b, drop)
    })) : null

  host.replaceChildren(el('div', { class: 'ask-log-inner' },
    head,
    ...(chat.collapsed ? [shelf].filter(Boolean) : turns.map(turnNode))))
  // The newest turn is the one you are waiting for.
  host.scrollTop = host.scrollHeight
}

/** The honest answer when there is nothing to think with — it names the fix, because "xoko is
 *  unavailable" would be true and useless. */
function nothingToThinkWith(ctx, host, { close }) {
  const available = brains(ctx)
  host.replaceChildren(el('div', { class: 'ask-log-inner' },
    el('div', { class: 'ask-log-head' },
      el('b', {}, '✨ xoko'),
      here ? el('span', { class: 'muted' }, `· ${here}`) : null,
      el('span', { class: 'spacer' }),
      el('button', { class: 'btn mini', title: 'close', onclick: close }, '✕')),
    el('div', { class: 'ask-reply' },
      el('p', {}, el('b', {}, 'xoko has no model to think with.')),
      el('p', { class: 'muted' }, available.length
        ? 'It is connected, but not answering — ✨ xoko says which of installed, signed in and '
          + 'connected is the one that is false.'
        : 'Connect one in ✨ xoko. Whatever you already have will do: a client on this machine you '
          + 'have signed into, a model running here, or an endpoint you hold a key for.'),
      el('p', { class: 'row-actions' },
        el('a', { class: 'btn', href: '#/xoko', onclick: close }, '✨ connect xoko')))))
}

/**
 * Ask, and grow the transcript by one turn.
 *
 * @param said   your sentence
 * @param about  where you were standing WHEN YOU ASKED — what the brain is pre-framed with, and a
 *               snapshot on purpose. The `· where` in the head is the live one (`xokoHere`).
 * @param map    what this app currently holds, generated from the nav and the armed workflows
 *               (web/lib/xoko-map.js). The small, fixed half of what it can see; the unbounded
 *               half it asks for a piece at a time with `▶ look:`.
 * @param picked `{medium: slug}` — the style the ⚙ picker has in force, per medium. Slugs only;
 *               the server turns them into words on the map's own per-medium line.
 * @param host   the `.ask-log` element; this owns everything inside it
 * @param close  ✕ — forget the conversation and collapse the bar
 * @param busy   called with an abort function while it is thinking, and null when it stops
 * @param act    `({ verb, medium, text }) => Promise<{ ok, note }>` — performs one of xoko's three
 *               acting verbs, by running exactly the code the equivalent click runs
 */
export async function xokoAsk(ctx, {
  said = '', about = '', map = '', picked = {}, host, close = () => {},
  busy = () => {}, act = null,
} = {}) {
  // ⚠️ ONE, AND THE SHELF IS ONLY READ FOR ITS NAME. Which model answers is the server's
  // (src/server/app.ts `brainFor`); this is the byline over the reply and the check that there is
  // something to ask at all.
  const live = brains(ctx).filter((s) => s.state === 'ready')
  if (!live.length) return nothingToThinkWith(ctx, host, { close })

  const on = live[0]
  chat.collapsed = false
  // ⚠️ THE ID IS MINTED BEFORE THE ASK, so the very first question of a conversation is kept like
  // every other one. Minting it after would mean turn 1 exists only on screen.
  if (!chat.id) {
    try {
      const r = await api('/api/session', {})
      chat.id = r.session.id
      chat.title = r.session.title
      try { localStorage.setItem(SESSION_KEY, chat.id) } catch { /* private mode */ }
    } catch { /* no session: the ask still works, it is simply not kept */ }
  }
  chat.pending = { said, thinking: true, on: on.label ?? on.id, looked: [], did: [] }
  paint(ctx, host, { close })

  // ⏹ — the fetch is aborted, the socket closes, and the server kills whatever it started. There
  // is no cancel endpoint because there is nothing to cancel by name.
  const stop = new AbortController()
  busy(() => stop.abort())

  let done = null
  let failed = null
  try {
    // ⚠️ REPAINTED PER DELTA, and the log is a dozen short nodes — cheap enough that the
    // alternative (patching one text node and remembering which) would be bookkeeping for nothing.
    await stream('/api/xoko', {
      text: said,
      about,
      // ⚠️ ON STDIN WITH THE QUESTION, never in the framing. Who xoko IS is composed server-side
      // and rides in a command-line brain's argv; this is text the server was handed, and it is
      // capped there (MAP_CHARS) rather than trusted to be small.
      map,
      // ⚠️ WHAT THE WORDS ARE BEING WRITTEN FOR. Slugs, resolved server-side onto the medium's own
      // map line — see `pickedStyles` in web/lib/shell.js for why a brain that cannot see the
      // armed look writes an ask that fights it.
      picked,
      // ⚠️ THE SERVER READS THE TRANSCRIPT OFF THE SESSION, so this id is the whole payload —
      // `turns` is still sent for the one-off case and is ignored whenever a session is named.
      // Two sources of truth for one conversation is one too many, and the file is the one that
      // survives a reload.
      ...(chat.id ? { session: chat.id } : {}),
      // ⚠️ ONLY THE WORDS TRAVEL. What got made is a fact about this app, not about the
      // conversation, and re-reading it to the brain would teach it to talk about the queue.
      turns: chat.turns.filter((t) => t.answered).map((t) => ({ said: t.said, answered: t.answered })),
      // ⚠️ …EXCEPT HOW THE LAST TURN'S OWN LINES WENT, AND THIS IS THE LOOP CLOSING (2026-08-23).
      // Not the queue and not what got made — just whether each ▶ it wrote landed, and the sentence
      // when it did not. It was never told any of it, and a brain holding four verbs and no
      // feedback does the only thing it can: it narrates the outcome it expected and reasons from
      // that next turn. The worst answer this app has produced was fluent, specific and entirely
      // invented — "neither workflow found a home; the library builds them for a service that answers
      // to a different internal name here" — describing six installs, three of which were never
      // attempted, with a mechanism that does not exist.
      //
      // ⚠️ THE LAST TURN ONLY. Two turns ago is history the transcript already carries in prose,
      // and a growing ledger of every press would be the queue in the conversation — which is the
      // thing the line above is right about.
      did: lastDid(),
    }, (msg) => {
      if (msg.delta) {
        chat.pending.thinking = false
        chat.pending.answered = (chat.pending.answered ?? '') + msg.delta
        paint(ctx, host, { close })
      } else if (msg.looked) {
        // ⚠️ THE HALF-ANSWER IS DROPPED, AND THAT IS CORRECT. What streamed before a look was the
        // brain saying "let me check" plus the ▶ line itself; the real answer is the next hop, and
        // leaving the preamble on screen would make one reply look like two.
        chat.pending.looked.push(msg.looked)
        chat.pending.answered = ''
        chat.pending.thinking = true
        paint(ctx, host, { close })
      } else if (msg.done) done = msg.done
      else if (msg.error) failed = msg.error
    }, { signal: stop.signal })
  } catch (err) {
    // ⚠️ ABORT IS NOT A FAILURE ANY MORE. Whatever arrived before ⏹ is a real, if unfinished,
    // answer — it stays, and it stays in the history too, because a truncated answer is an honest
    // thing to have said.
    if (err.name === 'AbortError') chat.pending.stopped = true
    else failed = String(err.message || err)
  }

  const turn = { ...chat.pending, thinking: false }
  chat.pending = null
  if (failed) { turn.error = failed; turn.answered = '' }
  if (done) {
    // The final text is the answer with its ▶ lines taken out — so a directive is visible while
    // it is being written and becomes a row once it means something.
    turn.answered = done.text
    turn.byline = `— ${done.model} on ${done.label ?? done.service}`
    adopt(done.session)
    // ⚠️ AN AUTOMATIC FOLD IS ANNOUNCED. It changed what the brain knows, silently, in the middle
    // of a conversation — the one thing this app promised never to do without saying so.
    if (done.folded) {
      try {
        const r = await api(`/api/sessions?id=${encodeURIComponent(chat.id)}`)
        chat.turns = r.session.turns.slice(0, -1).map((t) => ({ ...t, looked: [], did: [] }))
        chat.chars = r.chars
      } catch { /* the readout is stale; the answer below is not */ }
      ctx.flash?.('the older half was folded into a summary — it is at the top of the log')
    }
  }
  chat.turns.push(turn)
  paint(ctx, host, { close })
  busy(null)

  // …and then do what it asked for. Serially, in the order it wrote them: each is one press, and
  // the queue decides what runs when. ⚠️ NOTHING IS DONE FROM A STOPPED TURN — a directive that was
  // still being written is not a decision.
  for (const a of (turn.stopped ? [] : done?.acts ?? [])) {
    const r = act ? await act(a) : { ok: false, note: 'nothing here can do that' }
    turn.did.push({ ...a, ...r })
    paint(ctx, host, { close })
  }
}
