// ✨ xoko — THE ONE PLACE AN LLM IS CONNECTED, and the first thing a new install shows.
//
// ⚠️ WORDS ARE NOT A MEDIUM AND A BRAIN IS NOT AN ENGINE (2026-08-30). Until today xoko's model was
// a service on the 🔌 shelf with `medium: 'text'`, armed through a ✨ band in the engine menu, and
// answering a `chat` workflow that this app synthesised because writing one down would have said
// nothing. Every layer of that was a way of pretending an agent is a checkpoint. It is not: you do
// not pick a brain per section, per kind or per press, and nothing it writes is an asset you keep.
//
// So there is ONE connection, it is made here, and everything in the app that needs words uses it —
// ✨ the ask bar, and a chain's `text` step (src/server/app.ts `brainFor`). What xoko then does with
// the engines on 🔌 is the whole point of the app: it drives them for you.
//
// ⚠️ CONNECT FIRST, THEN LOOK — and that ordering is deliberate. This page cannot say whether
// Claude Code is installed until there is a row to probe, and building a second probe path just to
// answer that before you press would be a copy of the shelf that could disagree with it. Pressing
// connect writes one row of configuration; the card then says installed · signed in · connected and
// names the terminal line that fixes a signed-out client. Nothing is downloaded, nothing is
// started, and ✕ takes it back.
//
// ⚠️ THE OPTIONS ARE CODE, NOT LIBRARY CONTENT, and this is the one place that rule bends the other
// way. Everything else in this app comes empty and arrives from 📚 — but a command-line brain's
// binary, argv and sign-in probe are compiled in (src/inference/cli/brains.ts, PLAN §15 rule 1)
// precisely so that no downloaded payload can name a command. What the library owns here is the
// editorial: which vendors, what they cost you, and how to get one running.

import { chip, el, select } from '../launch-kit.js?v=129'

const SERVICE = {
  ready: { cls: 'ok', say: 'connected' },
  down: { cls: 'err', say: 'not answering' },
  'not-installed': { cls: 'warn', say: 'not installed' },
  unknown: { cls: '', say: 'unknown' },
}

/**
 * THE THREE FAMILIES — the first question, and the only one everybody can answer.
 *
 * ⚠️ THE FAMILY IS DECLARED ON THE PRESET, NOT INFERRED HERE (src/inference/presets.ts). This page
 * used to read `cli` as "a subscription" and `tls` as "cloud", which put a key you hold for one
 * provider and a key you hold for a hundred models in the same bucket — and left one row called
 * "a cloud model" that was secretly OpenRouter.
 *
 * ⚠️ AND NOBODY'S SETUP IS THE DEFAULT. The first version of this page led with one named product
 * as a loud card and folded the rest into a drawer, with a chip reading "a plan you already pay
 * for" — which assumes what you buy and tells you what you own. Three tiles of the same size, and
 * the question they ask is about YOU: what have you already got?
 */
const FAMILY = {
  subscription: {
    mark: '⌨️',
    name: 'Subscription',
    line: 'a client on this machine you have signed into',
    what: 'Nothing to paste. You install the client, sign in once in a terminal, and xokolat asks '
      + 'it — the credential never comes near this app.',
  },
  local: {
    mark: '🖥️',
    name: 'On this machine',
    line: 'a model running here — no account, no key',
    what: 'Free, private, and as fast as your hardware. Start the server, and whatever you have '
      + 'pulled is what you can pick.',
  },
  cloud: {
    mark: '☁️',
    name: 'Cloud key',
    line: 'an endpoint and a key you already hold',
    what: 'One key, many models. The address is yours to edit before you connect — anything '
      + 'speaking the OpenAI shape works, whether it is listed here or not.',
  },
}
const FAMILIES = Object.keys(FAMILY)

/** The base URL of an `openai` transport, as one editable string — four boxes for one address is
 *  four chances to get it half right. */
const urlOf = (t) => `${t.tls ? 'https' : 'http'}://${t.host}${
  (t.tls && t.port === 443) || (!t.tls && t.port === 80) ? '' : `:${t.port}`}${t.basePath ?? ''}`

/** …and back. Throws with a sentence a person can act on, because this is a field they typed. */
function parseUrl(text) {
  let u
  try {
    u = new URL(/^https?:\/\//.test(text.trim()) ? text.trim() : `http://${text.trim()}`)
  } catch { throw new Error(`${text} is not an address — try http://127.0.0.1:11434/v1`) }
  const tls = u.protocol === 'https:'
  const path = u.pathname.replace(/\/+$/, '')
  return {
    kind: 'openai',
    host: u.hostname,
    port: Number(u.port) || (tls ? 443 : 80),
    ...(path ? { basePath: path } : {}),
    ...(tls ? { tls: true } : {}),
  }
}

export default {
  id: 'xoko',
  icon: '✨',
  label: 'xoko',
  group: 'settings',
  // ⚠️ ONE LINE, FOR THE MAP xoko IS GIVEN (web/lib/xoko-map.js) — which means xoko can send
  // somebody here to change what xoko itself is thinking with.
  what: 'the model xoko thinks with, and how to connect one',

  create(ctx) {
    const feed = el('div', {})
    let busy = false
    /** The connection URL being typed, so a 15-second poll cannot take it away mid-word. */
    let draftUrl = null

    /** ✨ THE CONNECTION — one row, or none. `role: 'brain'`, and there is exactly one of them:
     *  connecting something else replaces it. */
    const connection = () => ctx.shelf().find((s) => s.role === 'brain') ?? null

    /** What it can be asked for, resolved against what it reports — the same catalogue 🔌 draws. */
    const models = (id) => ctx.services().find((s) => s.id === id)?.engines ?? []

    /**
     * WHAT CAN BE CONNECTED, in one family. Everything else on the preset list makes pictures or
     * meshes and belongs on 🔌.
     *
     * ⚠️ SORTED BY NAME, WHICH IS THE POINT — no vendor gets the top of the list from us. The order
     * is alphabetical and therefore boring, which is what neutral looks like.
     */
    const offers = (family) => (ctx.vocab().presets ?? [])
      .filter((p) => p.role === 'brain' && (!family || p.family === family))
      .sort((a, b) => (a.label ?? a.id).localeCompare(b.label ?? b.id, undefined, { sensitivity: 'base' }))

    async function act(what, run) {
      if (busy) return
      busy = true
      try {
        await run()
        ctx.flash(what)
      } catch (err) {
        ctx.flash(String(err.message || err), true)
      } finally {
        busy = false
        draftUrl = null
        paint()
      }
    }

    const disconnect = (row) => act('disconnected — xoko has nothing to think with',
      () => ctx.removeService(row.id))

    /**
     * WHICH MODEL IT THINKS WITH — stored as the connection's preferred engine.
     *
     * ⚠️ THE WHOLE DECLARED LIST TRAVELS, with the pin moved. Engine rows merge whole, so sending
     * only the chosen one would delete whatever else had been described about the others.
     */
    const think = (row, file) => act(`xoko thinks with ${file}`, () => {
      const declared = models(row.id).filter((e) => e.declared).map((e) => ({ ...e.declared }))
      const rest = declared.filter((e) => e.file !== file).map(({ default: _was, ...keep }) => keep)
      const own = declared.find((e) => e.file === file) ?? { file }
      return ctx.saveService({ id: row.id, engines: [...rest, { ...own, default: true }] })
    })

    const point = (row, text) => act('endpoint moved',
      () => ctx.saveService({ id: row.id, transport: parseUrl(text) }))

    // ── the connected card ────────────────────────────────────────────────────

    /**
     * INSTALLED · SIGNED IN · CONNECTED — the three things that have to be true for a client on
     * this machine, in the order you make them true.
     *
     * ⚠️ IT REPLACES A PARAGRAPH, WHICH IS THE POINT. Nobody reads prose in a settings pane. Three
     * lines and a ✗ say which step you are on, and the failing one carries the exact command that
     * fixes it — `claude auth login`, not "log in somehow". It lived on the 🔌 service card until
     * 2026-08-30 and moved here with the connection it describes.
     *
     * ⚠️ AND `·` IS NOT `✗`. A sign-in this build cannot read is unknown, not signed out; sending
     * somebody to run a login they do not need is the failure this whole shelf avoids one state
     * along. Only the client saying so produces a cross.
     */
    function steps(row) {
      // ⚠️ ONLY FOR A CLIENT ON THIS MACHINE. An endpoint is reachable or it is not; there is no
      // binary to install and nobody to be logged in as, so three lines about it would be two
      // inventions and a fact.
      if (row.transport?.kind !== 'cli') return null
      const installed = row.state !== 'not-installed'
      const signed = row.signIn?.state ?? null
      const mark = (ok) => (ok === true ? '✓' : ok === false ? '✗' : '·')
      const line = (ok, label, fix) => el('p', {
        class: `step ${ok === true ? 'on' : ok === false ? 'bad' : 'idle'}`,
      }, el('span', { class: 'step-ic' }, mark(ok)), el('span', {}, label),
      fix ? el('code', { class: 'step-fix' }, fix) : null)

      const signedOk = signed === 'in' ? true : signed === 'out' ? false : null
      return el('div', { class: 'steps' },
        line(installed, `${row.label ?? row.id} installed`, installed ? null : 'install it'),
        line(installed ? signedOk : null,
          signed === 'in' && row.signIn?.plan ? `logged in · ${row.signIn.plan}` : 'logged in',
          // ⚠️ THE CLIENT'S OWN LINE, off the probe (src/inference/health.ts). It was the literal
          // string `claude auth login` here, which is right for exactly one of the brains this
          // build ships and wrong for every one added after it.
          signedOk === false ? (row.signIn?.fix ?? null) : null),
        line(installed && signedOk === true ? true : (installed && signedOk === false ? false : null),
          'connected'))
    }

    /**
     * THE ONE LINE THAT FIXES IT, as something you can select and paste.
     *
     * ⚠️ IT IS A TERMINAL LINE AND IT STAYS ONE. A button that ran it would be this app spawning a
     * login flow it cannot see the end of, on a credential it deliberately never holds. You run it
     * in your own terminal; the probe runs every fifteen seconds, so the card turns green on its
     * own while that window is still open.
     */
    const fixLine = (row) => (row.signIn?.state === 'out' && row.signIn.fix
      ? el('div', { class: 'path-row' },
        el('span', { class: 'muted path-label' }, 'run this'),
        el('code', { class: 'path-value' }, row.signIn.fix))
      : null)

    function modelPicker(row) {
      const all = models(row.id)
      if (!all.length) return null
      const now = all.find((e) => e.isDefault)?.file ?? null
      // ⚠️ BUTTONS FOR A HANDFUL, A MENU FOR A CATALOG. Three Claudes are a choice you can see;
      // OpenRouter reports hundreds and a row of four hundred buttons is not a picker.
      if (all.length <= 6) {
        return el('div', { class: 'row-actions' }, ...all.map((e) => el('button', {
          class: `btn${e.file === now ? ' primary' : ''}`,
          title: e.notes ?? e.file,
          onclick: () => { if (e.file !== now) void think(row, e.file) },
        }, e.label ?? e.file)))
      }
      const sel = select(all.map((e) => ({ value: e.file, label: e.label ?? e.file })))
      sel.value = now ?? ''
      sel.addEventListener('change', () => { void think(row, sel.value) })
      return sel
    }

    /** For an endpoint that reports nothing, or reports the wrong hundred: name one by hand. */
    function modelByHand(row) {
      if (row.transport?.kind !== 'openai') return null
      const input = el('input', {
        type: 'text', class: 'path-input', placeholder: 'or name a model — anthropic/claude-opus-4',
        spellcheck: 'false', autocapitalize: 'off', autocorrect: 'off',
      })
      const go = el('button', { class: 'btn' }, 'use it')
      go.addEventListener('click', () => {
        const file = input.value.trim()
        if (file) void think(row, file)
      })
      input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') go.click() })
      return el('div', { class: 'path-edit' }, input, el('div', { class: 'row-actions' }, go))
    }

    /** The endpoint, for the transports that have one. A `cli` connection has none — that is the
     *  point of it — so it gets the binary's name instead, which the shelf already composed. */
    function endpointEditor(row) {
      if (row.transport?.kind !== 'openai') return null
      const input = el('input', {
        type: 'text', class: 'path-input', value: draftUrl ?? urlOf(row.transport),
        spellcheck: 'false', autocapitalize: 'off', autocorrect: 'off',
      })
      input.addEventListener('input', () => { draftUrl = input.value })
      const save = el('button', { class: 'btn' }, 'point it here')
      save.addEventListener('click', () => { void point(row, input.value) })
      input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') save.click() })
      return el('div', { class: 'path-edit' },
        el('label', { class: 'muted' }, 'endpoint'),
        input,
        el('div', { class: 'row-actions' }, save))
    }

    /**
     * THE KEY, FOR A CLOUD ENDPOINT — write-only, and there is no read anywhere.
     *
     * ⚠️ NAMING THE KEY IS PART OF SETTING IT. A preset ships no `auth`, because whether a
     * connection wants one is a fact about the endpoint you point it at and not about the shape.
     * So the first key typed here also writes `transport.auth`, and after that the row says which
     * key it wants and whether the store has one — never what it is (src/secrets.ts).
     */
    function keyEditor(row) {
      if (row.transport?.kind !== 'openai' || !row.transport.tls) return null
      const input = el('input', {
        type: 'password', class: 'path-input',
        placeholder: row.secret?.set ? 'a key is set — type a new one to replace it' : 'paste your key',
        spellcheck: 'false', autocapitalize: 'off', autocorrect: 'off',
      })
      const save = el('button', { class: 'btn' }, 'save the key')
      save.addEventListener('click', () => {
        const value = input.value
        if (!value.trim()) return ctx.flash('nothing to save', true)
        void act('key saved — it is in an owner-only file and never comes back out', async () => {
          if (!row.secret) {
            await ctx.saveService({
              id: row.id, transport: { ...row.transport, auth: { secret: row.id } },
            })
          }
          await ctx.setSecret(row.secret?.id ?? row.id, value)
        })
      })
      const forget = row.secret?.set
        ? el('button', {
          class: 'btn',
          onclick: () => void act('key forgotten', () => ctx.setSecret(row.secret.id, null)),
        }, 'forget it')
        : null
      return el('div', { class: 'path-edit' },
        el('label', { class: 'muted' }, 'key'),
        input,
        el('div', { class: 'row-actions' }, save, forget))
    }

    function connectedCard(row) {
      const st = SERVICE[row.state] ?? SERVICE.unknown
      const now = models(row.id).find((e) => e.isDefault)
      return el('section', { class: `svc ${st.cls}` },
        el('div', { class: 'svc-head' },
          el('span', { class: 'svc-name' }, row.label ?? row.id),
          el('span', { class: 'svc-state' }, el('span', { class: 'svc-dot' }), st.say),
          el('span', { class: 'spacer' }),
          row.secret?.set ? chip('key set', 'type') : null,
          el('button', {
            class: 'btn mini', title: 'disconnect — xoko will have nothing to think with',
            onclick: () => void disconnect(row),
          }, '✕ disconnect')),
        el('div', { class: 'svc-meta' },
          row.endpoint ? el('span', { class: 'mono' }, row.endpoint) : null),
        steps(row),
        fixLine(row),
        row.state !== 'ready' && row.help
          ? el('a', {
            class: 'svc-help loud', href: row.help, target: '_blank', rel: 'noopener noreferrer',
          }, 'how to get it running ›')
          : null,
        el('div', { class: 'svc-engines' },
          el('div', { class: 'engine-head' },
            el('b', {}, 'thinks with'),
            now ? chip(now.label ?? now.file, 'type') : chip('nothing to think with', 'type')),
          modelPicker(row),
          modelByHand(row),
          endpointEditor(row),
          keyEditor(row)),
        row.notes ? el('p', { class: 'muted note' }, row.notes) : null)
    }

    // ── connecting one ────────────────────────────────────────────────────────

    /** Which family tile is open, and which row inside it. Both null until you press — nothing on
     *  this page is chosen for you. */
    let family = null
    let chosen = null
    /** What is being typed before the press. Held here so the 15-second shelf poll cannot take a
     *  half-typed address or key away mid-word. */
    let form = { url: '', key: '' }

    const presetAt = (id) => offers().find((p) => p.id === id) ?? null

    function openFamily(id) {
      family = family === id ? null : id
      const first = family ? offers(family)[0] : null
      chosen = first?.id ?? null
      form = { url: first ? urlOf(first.transport) : '', key: '' }
      paint()
    }

    function choose(preset) {
      chosen = preset.id
      // The address follows the row you picked — it is a starting point, and it is still yours to
      // edit before you press.
      form = { url: urlOf(preset.transport), key: form.key }
      paint()
    }

    /**
     * ⚠️ CONNECTING IS ONE ACT AND IT INCLUDES THE FIELDS (2026-08-30). The first version wrote the
     * row the moment you pressed a tile, which is right for a client — there is nothing to fill in,
     * and writing the row is how the app gets something to probe — and wrong for an endpoint: it
     * left you "connected" to `openrouter.ai` with no key, a card claiming a connection that would
     * refuse every question. The address and the key are PART of connecting there.
     *
     * ⚠️ AND CONNECTING REPLACES. There is one brain row; taking a second preset would leave two
     * and the server would silently pick the first.
     */
    const connect = (preset) => act(`connected — xoko thinks with ${preset.label}`, async () => {
      const old = connection()
      if (old && old.id !== preset.suggest) await ctx.removeService(old.id)
      // ⚠️ THE SAME VERB xoko ITSELF USES. `▶ take: claude-code` is this press, and `take` resolves
      // a preset before it even looks for the library — so the first connection on a machine with
      // no network still works (src/library/take.ts).
      await ctx.take(preset.suggest)
      if (preset.transport?.kind === 'cli') return
      const transport = parseUrl(form.url || urlOf(preset.transport))
      const key = form.key.trim()
      await ctx.saveService({
        id: preset.suggest,
        transport: key || preset.family === 'cloud'
          ? { ...transport, auth: { secret: preset.suggest } }
          : transport,
      })
      if (key) await ctx.setSecret(preset.suggest, key)
    })

    const familyTile = (id) => {
      const f = FAMILY[id]
      const on = family === id
      const node = el('button', {
        class: `pick-tile${on ? ' on' : ''}`, type: 'button',
        'aria-pressed': on ? 'true' : 'false',
        title: f.what,
      },
      el('span', { class: 'pick-mark' }, f.mark),
      el('span', { class: 'pick-name' }, f.name),
      el('span', { class: 'pick-line' }, f.line))
      node.addEventListener('click', () => openFamily(id))
      return node
    }

    /** One row inside the open family: which client, or which endpoint. */
    const rowChip = (preset) => {
      const on = chosen === preset.id
      const node = el('button', {
        class: `btn${on ? ' primary' : ''}`, type: 'button', title: preset.what,
      }, preset.label ?? preset.id)
      node.addEventListener('click', () => choose(preset))
      return node
    }

    const field = (label, input) => el('div', { class: 'path-edit' },
      el('label', { class: 'muted' }, label), input)

    function familyPanel() {
      if (!family) return null
      const all = offers(family)
      const preset = presetAt(chosen) ?? all[0] ?? null
      if (!preset) return el('p', { class: 'empty' }, 'nothing of this kind in this build')

      const urlIn = el('input', {
        type: 'text', class: 'path-input', value: form.url,
        placeholder: 'http://127.0.0.1:11434/v1',
        spellcheck: 'false', autocapitalize: 'off', autocorrect: 'off',
      })
      urlIn.addEventListener('input', () => { form.url = urlIn.value })
      const keyIn = el('input', {
        type: 'password', class: 'path-input', value: form.key, placeholder: 'paste your key',
        spellcheck: 'false', autocapitalize: 'off', autocorrect: 'off',
      })
      keyIn.addEventListener('input', () => { form.key = keyIn.value })

      const go = el('button', { class: 'btn primary' }, `connect ${preset.label ?? preset.id}`)
      go.addEventListener('click', () => void connect(preset))

      return el('div', { class: 'pick-chosen' },
        // More than one row in the family is a choice; exactly one is a fact, and a single button
        // you must press before the real button is furniture.
        all.length > 1 ? el('div', { class: 'row-actions' }, ...all.map(rowChip)) : null,
        el('p', {}, preset.what),
        ...(preset.transport?.kind === 'cli'
          ? []
          : [
            field('address', urlIn),
            ...(family === 'cloud' ? [field('key', keyIn)] : []),
          ]),
        el('div', { class: 'row-actions' }, go))
    }

    const picker = (heading) => el('section', { class: 'block' },
      heading ? el('div', { class: 'engine-head' }, el('b', {}, heading)) : null,
      el('div', { class: 'pick-grid' }, ...FAMILIES.map(familyTile)),
      familyPanel())

    function paint() {
      const row = connection()

      feed.replaceChildren(
        row
          ? connectedCard(row)
          : el('section', { class: 'shelf-empty' },
            el('h3', {}, 'xoko is not connected yet'),
            // ⚠️ WHAT THE APP IS, IN TWO SENTENCES, AND THIS IS WHERE IT BELONGS. It is the first
            // screen of a fresh install: somebody who has never seen this app should learn from it
            // that they talk to an agent, and that the agent drives whatever else they install.
            el('p', {}, 'xoko is the one you talk to. Connect it to a model you already have, and '
              + 'then ask it for what you want — it drives the engines on 🔌 to make the picture, '
              + 'the song, the voice or the mesh, and everything it makes lands in your library.')),

        picker(row ? 'connect something else instead' : null),

        el('p', { class: 'muted note' },
          'One connection, and everything in the app that needs words uses it — the ✨ ask bar, and '
          + 'a composition’s writing steps. Connecting another replaces this one; there is no '
          + 'second place a model is picked.'))
    }

    paint()

    return {
      feed,
      refresh: paint,
      detail: () => el('p', { class: 'muted' },
        'Some of these want a key and some do not, and the difference is not a preference. A plan '
        + 'carries no API credential and no login flow lets a third-party app spend one — so where '
        + 'the connection is a client on your machine, xokolat asks that client instead, and the '
        + 'credential never comes near this app. Where it is an endpoint, the key lives in an '
        + 'owner-only file and no page can read it back.'),
    }
  },
}
