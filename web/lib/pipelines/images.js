// 🖼 images — the Phase 0 section, and the shape every later section copies.
//
// Descended from content-factory/studio/lib/pipelines/imageab.js (task-scoped launches over
// the shared gallery), with its payload builder REWRITTEN: what this produces is
// `src/types/request.ts` `GenerationRequest`, always. No run id, no path, no per-medium
// snake_case — the server mints the run and derives the folder (PLAN §4, §9).

import { api, el, href, field, fieldRow, select } from '../launch-kit.js?v=129'
import { mediaColumns, mediaFace, mediaGallery } from '../gallery.js?v=129'
import { tile } from '../browse.js?v=129'
import { assetDetail } from '../asset-detail.js?v=129'
import { stylePicker } from '../styles.js?v=129'
import { firstStep, starsReady, starWidget } from '../shared.js?v=129'

/** What the slider reads for a checkpoint that declares nothing. ⚠️ Mirrors the knob table's
 *  `strength` fallback (src/inference/knobs.ts) — the value the adapter would send anyway, so the
 *  readout and the render agree even before anyone touches it. */
const DEFAULT_STRENGTH = 0.65

/** A master re-encoded as PNG, because that is the only image type the clipboard reliably
 *  takes. Decoded and re-encoded in the browser — the server is not involved. */
async function asPng(url) {
  const blob = await (await fetch(url)).blob()
  const bitmap = await createImageBitmap(blob)
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  canvas.getContext('2d').drawImage(bitmap, 0, 0)
  return canvas.convertToBlob({ type: 'image/png' })
}

/**
 * HOW A FINISHED PICTURE IS ENCODED — the last thing that happens to a render, and it lives here.
 *
 * ⚠️ IT WAS A SETTINGS SECTION OF ITS OWN UNTIL 2026-08-23 (`🖼 media`), holding one card for one
 * medium under a heading about all of them, waiting for the day music wanted a bitrate. That day
 * is not coming: audio comes out of a graph at whatever its save node was published with, and a
 * mesh is bytes. What the page actually was is a WebP setting, filed under a name so general that
 * xoko read it as a disk-usage report and told somebody so.
 *
 * A setting that names a medium belongs in that medium's section. Global settings keeps what has
 * no medium — where files live, which library, which brain.
 *
 * ⚠️ IT IS NOT A PER-PRESS KNOB, and that is why it sits at the bottom of the band with the
 * readout rather than up with the size. It is remembered, it applies to every render after it, and
 * it is resolved at press time on the server (src/jobs/generate.ts) so a run that is already
 * draining keeps the level it started with.
 */
function writtenAs(ctx) {
  const sel = select([])
  const row = fieldRow('written as', sel)
  row.title = 'how the finished file is encoded. Applies to new work; what is on disk stays as it'
    + ' was written, and each file records which it got.'

  sel.addEventListener('change', async () => {
    try {
      await api('/api/settings', { medium: 'image', quality: sel.value })
      ctx.flash(`new pictures: ${sel.options[sel.selectedIndex]?.textContent ?? sel.value}`)
    } catch (err) {
      ctx.flash(String(err.message || err), true)
      void load()
    }
  })

  async function load() {
    let scale = null
    try {
      const s = await api('/api/settings')
      scale = (s.media ?? []).find((m) => m.medium === 'image')
    } catch { /* the row stays as it is; the press below is what matters */ }
    // ⚠️ A MEDIUM WITH NOTHING TO CHOOSE SHOWS NO ROW. Not a disabled control and not a line
    // saying so — the server owns the list, and an empty one means there is nothing here.
    row.hidden = !scale?.levels?.length
    if (!scale?.levels?.length) return
    sel.replaceChildren(...scale.levels.map((l) => el('option', {
      value: l.id, title: l.note,
    }, `${l.label} — ${l.note.replace(/\.$/, '')}`)))
    sel.value = scale.chosen
  }

  void load()
  return row
}

export default {
  id: 'images',
  icon: '🖼',
  label: 'images',
  group: 'media',
  // ⚠️ ONE LINE, FOR THE MAP xoko IS GIVEN (web/lib/xoko-map.js). Not a docstring and
  // not a tooltip: it is what the assistant is told this place is FOR, so it can send
  // somebody here without having been taught the app.
  what: 'every picture made here, newest first, and the named looks they are made in',
  // ⚠️ WHAT THIS SECTION MAKES. The shell's 🔌 picker offers only services of this medium
  // (web/lib/shell.js → generators), so the writing brain xoko talks to can never be selected
  // here as something to render a picture with.
  medium: 'image',

  create(ctx) {
    // ── the ⚙ band: THIS ASK, and a readout of what will answer it ────────────
    //
    // ⚠️ EVERY KNOB HERE IS ASK-SHAPED (2026-08-07). Two kinds of knob were mixed in this panel
    // and the mixture is what broke a render:
    //
    //   ask-shaped     size · seed · style · negative     belongs to THIS SENTENCE
    //   model-shaped   steps · cfg · sampler · shift      belongs to THAT CHECKPOINT
    //
    // The model-shaped ones are gone from here. They were seeded from whichever engine happened
    // to be first and then SENT for all of them, so SDXL — which declares 16 steps at cfg 5 —
    // rendered at klein's 4 at cfg 1 and came back unfinished. Omitting them is not a loss of
    // control: `mergeParams` on the server layers the model's own declared params underneath the
    // request, so picking SDXL means 16 without anyone typing 16. Changing them for good is a
    // property of the engine and is edited once, in 🔌, not on every press.
    //
    // The payoff is that this panel is the SAME PANEL whether one engine is armed or four. There
    // is no multi mode, nothing greys out, and nothing has to be re-read after ticking a box.
    const size = select([512, 768, 1024, 1280, 1536].map((v) => ({ value: String(v), label: `${v}²` })))
    size.value = '1024'
    const seed = el('input', { type: 'text', placeholder: 'random', size: '10' })
    const negative = el('input', { type: 'text', placeholder: 'what to avoid' })
    const negRow = field('negative', negative)
    const negNote = el('p', { class: 'muted band-note' })

    /**
     * HOW MUCH OF THE PICTURE YOU BROUGHT IS REDRAWN — 0.05 keeps almost all of it, 1 keeps none.
     *
     * ⚠️ DRAWN FOR `i2i` AND NOTHING ELSE. For an in-context editor it is not a preference: the
     * `kontext` workflow declares 1 because the model reads the picture as context rather than as
     * noise to denoise part-way, and a slider offering to lower it would be offering to break the
     * render. The workflow owns the number; this only exposes it where it is genuinely a choice.
     */
    const strength = el('input', {
      type: 'range', min: '0.05', max: '1', step: '0.05', value: String(DEFAULT_STRENGTH),
      class: 'f-range',
    })
    /** Which WORKFLOW the slider was last seeded for — see `engineChanged`. */
    let seededFor = null
    const strengthOut = el('span', { class: 'f-out muted' })
    const strengthRow = fieldRow('redraw',
      el('div', { class: 'f-slider' }, strength, strengthOut))
    const showStrength = () => { strengthOut.textContent = `${Math.round(strength.value * 100)}%` }
    strength.addEventListener('input', showStrength)
    showStrength()

    // ⚠️ ONE CONTROL, SHARED (web/lib/styles.js → `stylePicker`). This was forty lines of
    // grouped-select building here and a different forty in 🗣, over the same list shape, with a
    // 🎨 door that was a link to a page that no longer exists. ⚙ picks; 🎨 manages.
    const styles = stylePicker(ctx, 'image')

    /**
     * RENDERS WITH — a readout, not a form.
     *
     * ⚠️ THE NUMBERS YOU CANNOT EDIT ARE NUMBERS YOU CAN NOW SEE. The panel used to show one
     * steps field for however many engines were armed; three rows saying `4 · cfg 1`, `4 · cfg 1`
     * and `16 · cfg 5` are the same screen space telling the truth. Grey, unpressable, and one
     * door out: 🔌, where an engine's own numbers live and where changing one changes it once
     * rather than every press.
     */
    const withRows = el('div', { class: 'rw-rows' })
    const withHead = el('div', { class: 'rw-head muted' })
    const rendersWith = el('div', { class: 'renders-with' },
      withHead, withRows,
      el('p', { class: 'rw-foot' },
        el('span', { class: 'muted' }, 'its own numbers'),
        el('span', { class: 'spacer' }),
        el('a', {
          class: 'btn mini', href: '#/inference',
          title: 'see and change what each engine runs at — once, not per press',
        }, 'edit 🔌 ▸')))

    const styleRow = styles.row
    const options = el('div', { class: 'band-rows' },
      styleRow,
      fieldRow('size', size), strengthRow, field('seed', seed), negRow, negNote,
      writtenAs(ctx),
      rendersWith)

    void styles.load()
    // The ★ order needs the stars, which arrive separately from the list.
    void starsReady.then(() => { void styles.load() })

    /** What this workflow will actually run at, in the fewest characters that are still true. Read
     *  from the RESOLVED params (checkpoint ← workflow) — the same object `mergeParams` layers under
     *  the request, so this readout and the render can never disagree. */
    function numbersOf(e) {
      const p = e.params ?? {}
      const steps = e.caps?.stepsLocked ?? p.steps
      return [steps != null ? `${steps} steps` : null, p.cfg != null ? `cfg ${p.cfg}` : null]
        .filter(Boolean).join(' · ')
    }

    /**
     * The armed engines changed. One function, and it does two things that used to fight:
     *
     * 1. SIZE OFFERS THE INTERSECTION. With klein (512–1536) and SDXL (768–1536) both armed, 512
     *    is not offered — because an engine that tops out below what you asked for used to render
     *    at its own top and tell you afterwards in a flash. A size no armed engine has to be
     *    talked out of is a size nothing has to be said about.
     * 2. THE READOUT IS REBUILT. `caps` here are EFFECTIVE (engine ← model), which is the whole
     *    reason a row can say `4 steps` while its neighbour says `16`.
     *
     * ⚠️ NOTHING IS SEEDED INTO A FIELD ANY MORE. Fields used to be filled from the model's params
     * when the model changed, which meant a displayed value was indistinguishable from a chosen
     * one by the time it reached the wire. That distinction is the bug; removing the fields
     * removes it.
     */
    function engineChanged() {
      const armed = ctx.engines()
      // ⚠️ THE PROMPT IS NOT UNIVERSAL. An operation — remove a background, upscale — takes a
      // file and gives one back, with no sentence and no style to compose into it. So the two
      // prompt-shaped controls belong to the TASK, not to the medium.
      // ⚠️ A STYLE IS COMPOSED INTO A DESCRIPTION, and an `edit` prompt is not a description —
      // it is an instruction about a picture. Appending "flat vector, bold outlines" to "put her
      // on a battlement" asks for something nobody meant.
      const kind = ctx.task?.()
      styleRow.style.display = kind === 'edit' ? 'none' : ''
      // The one knob that belongs to the REFERENCE, and only where it is a choice: see above.
      strengthRow.style.display = kind === 'i2i' && (ctx.refs?.() ?? []).length ? '' : 'none'
      /**
       * ⚠️ THE SLIDER FOLLOWS THE CHECKPOINT, and this is the one place a value is seeded from an
       * engine again — the practice that caused the 4-steps-on-SDXL bug. It is safe here for the
       * reason that bug is impossible now: ONE engine is armed, so the number shown and the engine
       * it is sent to cannot disagree. And it is NECESSARY, because for an in-context editor
       * `strength` is not a preference: Kontext declares 1 and anything less renders mush.
       */
      // ⚠️ ON A CHANGE OF WORKFLOW, NEVER ON EVERY REPAINT. This runs whenever a reference is
      // attached too, and re-seeding there would snap the slider back under the hand that had just
      // moved it.
      if (armed[0]?.workflow !== seededFor) {
        seededFor = armed[0]?.workflow ?? null
        strength.value = String(armed[0]?.params?.strength ?? DEFAULT_STRENGTH)
        showStrength()
      }

      let lo = 0
      let hi = Number.POSITIVE_INFINITY
      for (const e of armed) {
        const [a, b] = e.caps?.resolution ?? [0, Number.POSITIVE_INFINITY]
        lo = Math.max(lo, a)
        hi = Math.min(hi, b)
      }
      for (const opt of size.options) {
        opt.disabled = Number(opt.value) < lo || Number(opt.value) > hi
      }
      // A disabled option can still be the SELECTED one — that is how a size nothing armed can
      // do would be sent anyway.
      if (size.selectedOptions[0]?.disabled) {
        size.value = String([...size.options].find((o) => !o.disabled)?.value ?? size.value)
      }

      // ⚠️ THE NEGATIVE IS ASK-SHAPED, THE CHANNEL IS NOT. It stays while ANY armed engine can
      // read one, and says how many will — dropping the box because one of three is a FLUX would
      // take away a knob that two of them do have.
      const reads = armed.filter((e) => e.caps?.negatives !== false)
      negRow.style.display = reads.length ? '' : 'none'
      negNote.textContent = reads.length && reads.length < armed.length
        ? `${reads.length} of ${armed.length} read a negative — the rest have no such channel`
        : ''
      negNote.style.display = negNote.textContent ? '' : 'none'

      withHead.textContent = 'runs as'
      withRows.replaceChildren(...armed.map((e) => {
        const name = e.kind ? `${e.kind} · ${e.model?.replace(/\.[^.]+$/, '') ?? e.id}` : e.id
        const caps = e.caps ?? {}
        // ⚠️ EACH ROW IS THE DOOR TO ITS OWN ENGINE. You read a checkpoint's numbers here and
        // change them in 🔌, so the shortest path between the two is the row itself — it lands
        // on that card, unfolded and selected, rather than on a page you then have to search.
        return el('a', {
          class: 'rw-row',
          href: e.model ? `#/inference?engine=${encodeURIComponent(`${e.id}/${e.model}`)}` : '#/inference',
          title: [
            `on ${e.label ?? e.id}`,
            caps.idiom === 'tags' ? 'reads comma-separated tags' : 'reads a sentence',
            caps.negatives === false ? 'no negative prompt' : 'takes a negative prompt',
            caps.resolution ? `${caps.resolution[0]}–${caps.resolution[1]}px` : '',
            e.notes ?? '',
            '— open it in 🔌',
          ].filter(Boolean).join('\n'),
        },
        el('span', { class: 'rw-ic' }, '🖼'),
        el('span', { class: 'rw-name' }, name),
        el('span', { class: 'spacer' }),
        el('span', { class: 'rw-nums muted' }, numbersOf(e) || 'the service\'s own'))
      }))
    }

    // ── what ▶ MEANS here ─────────────────────────────────────────────────────
    // ⚠️ THE BAR IS THE SHELL'S (web/lib/shell.js). A section used to build its own textarea and
    // its own ▶, which meant the one act every section performs — say what you want — had a
    // per-section implementation, and existed only on a feed. What a section owes is the MEANING
    // of ▶ and nothing about where it sits.

    /**
     * ONE ENGINE'S KNOBS — ASK-SHAPED ONLY.
     *
     * ⚠️ WHAT IS NOT HERE IS THE POINT (2026-08-07). No `steps`, no `cfg`: those are the
     * checkpoint's, and the server layers the model's own declared params under the request
     * (src/inference/params.ts → mergeParams), so omitting them is how klein gets 4 and SDXL gets
     * 16 in the same press. Sending them meant sending ONE engine's numbers — whichever was
     * first, because that is what the panel had been seeded from — to all of them, and SDXL came
     * back unfinished at 4 steps and cfg 1.
     *
     * Still per-engine rather than one shared bag, because the two ask-shaped knobs that CAN be
     * refused differ per engine: a negative goes only where there is a channel to put it in, and
     * the size is the one this engine can do. The server REJECTS a violation instead of clamping
     * it — deliberately — so what an engine cannot honour is not sent.
     */
    function paramsFor(e) {
      const caps = e.caps ?? {}
      const want = Number(size.value)
      const [lo, hi] = caps.resolution ?? [want, want]
      return {
        // The dropdown only offers what every armed engine can do (see engineChanged), so this
        // clamp is a belt on braces rather than the silent substitution it used to be.
        width: Math.min(Math.max(want, lo), hi),
        height: Math.min(Math.max(want, lo), hi),
        ...(ctx.task?.() === 'i2i' && (ctx.refs?.() ?? []).length
          ? { strength: Number(strength.value) }
          : {}),
        ...(seed.value.trim() ? { seed: Number(seed.value.trim()) } : {}),
        ...(negative.value.trim() && caps.negatives !== false ? { negative: negative.value.trim() } : {}),
      }
    }

    /**
     * ✨ WORDS XOKO ASKED FOR THAT NOBODY SAVED AS A STYLE — carried into the next press's sentence.
     *
     * ⚠️ A STYLE IS OPTIONAL TEXT, NOT A PREREQUISITE OBJECT (2026-08-30). `▶ make image/futuristic
     * style: castellers…` was REFUSED — "there is no image style called futuristic style here, 📚 is
     * where they come from" — and the whole ask went nowhere. That is a picture xoko can obviously
     * draw, turned down over a filing question: the words describe how it should look, which is all
     * a style ever is. 🎵 🗣 🧊 already did the right thing (made.js, 2026-08-23), routing unmatched
     * words into the channel their medium keeps for a description. A picture's channel IS the
     * sentence — `composePrompt` composes a style's words into the prompt for exactly these engines
     * (src/jobs/generate.ts) — so unmatched words go where a style's would have gone.
     *
     * ⚠️ AND IT LASTS ONE PRESS. A saved style is a choice you can see in the select and undo by
     * changing it; this is a phrase in one sentence, and leaving it armed would shape a later press
     * from a control that shows nothing.
     */
    let shaping = null

    /** ⚠️ THE PAYLOAD BUILDER. This is the whole of §4's request shape and nothing else. */
    function buildRequest(said) {
      // ⚠️ `engines()`, NOT `engine()`. One press may be answered by several checkpoints — that
      // is what the chip's `+N` means — and each arrives as its own selection with its own knobs.
      // One engine is the same code path with a list of one.
      const picked = ctx.engines()
      // ⚠️ NOT "no engine to render with", which describes the app's state and not the person's
      // next move. A fresh install has no service either, and the two need different sentences.
      if (!picked.length) { ctx.flash(firstStep(ctx, 'pictures'), true); return null }
      // ⚠️ WORDS ARE THE WORKFLOW'S REQUIREMENT (2026-08-12). Almost every workflow takes a `prompt`
      // and an empty press is a mistake; a cutout takes a picture and nothing else, and demanding
      // a sentence for it would make every operator unreachable. The server checks the same thing
      // against the resolved workflow and refuses by name.
      const wants = picked[0]?.inputs ?? ['prompt']
      if (wants.includes('prompt') && !said.trim()) {
        ctx.flash('say what you want to make', true)
        return null
      }
      // ⚠️ A WORKFLOW'S SLOTS ARE A PROMISE ABOUT THE INPUT. Pressing ▶ on an i2i or edit workflow
      // with an empty tray would render from words alone and look exactly like a reference that
      // had been ignored, which is the failure the tray exists to end. The server refuses it too;
      // saying so here means finding out before the queue rather than after.
      const refs = ctx.refs?.() ?? []
      const slots = picked[0]?.slots ?? []
      if (slots.length && refs.length < slots.length) {
        ctx.flash('attach a picture first — drop one on the bar, or ＋', true)
        return null
      }
      return {
        medium: 'image',
        // Trailing, like a style's own words: leading with the technique makes the technique the
        // subject (see `composePrompt`'s note on anchoring).
        text: [said.trim(), shaping].filter(Boolean).join(', '),
        style: styles.style(),
        ...(refs.length ? { refs } : {}),
        // ⚠️ NO `count`. One press is one picture per engine; ▶ again is the variation button,
        // since the seed is drawn fresh each time. The parser refuses this key by name now.
        //
        // Per-service params, because caps differ per engine — one shared bag would be a lie
        // the moment a second service is picked. The KEY is `inference` (the service), and
        // `params.model` names the engine: tests/request-shape.test.ts holds this to the parser.
        // ⚠️ THE WORKFLOW IS WHAT IS NAMED, and it names its own checkpoint — so `params.model` is
        // gone from here. Sending both would be two answers to one question.
        inference: picked.map((e) => ({
          id: e.id, ...(e.workflow ? { workflow: e.workflow } : {}), params: paramsFor(e),
        })),
      }
    }

    const ask = {
      placeholder: 'coffee before 9am · cats being dramatic · catalan food',
      hint: 'one sentence. everything on the right already has a default.',
      // ⚠️ ONE ENGINE (2026-08-08). Several checkpoints answering one sentence was a comparison
      // while every checkpoint did the same job. Once they do different ones — this edits, this
      // only makes from words — most of a mixed selection cannot answer the ask, so the picker
      // asks for the TASK first and offers one engine that can do it (shell.js → taskFor).
      /** ▶. Returns true when it was accepted, so the bar knows whether to clear the line. */
      make: async (said, btn) => {
        const request = buildRequest(said)
        // Whatever it was asked to look like belonged to THIS press — see `shaping`.
        shaping = null
        return request ? !!(await ctx.generate(request, btn)) : false
      },
      /**
       * ✨ NAME THE STYLE FOR THE NEXT PRESS — the control moves, then ▶ is pressed normally.
       *
       * ⚠️ IT SETS THE PICKER RATHER THAN SLIPPING A FIELD INTO THE PAYLOAD, and that is the whole
       * design. A second path into `buildRequest` would be a second answer to "what does ▶ send",
       * and the person would have watched a render happen with a style their screen said was not
       * chosen. This way the select visibly moves to `ink linework`, the ordinary press follows,
       * and undoing it is changing the select back.
       *
       * Returns null when it took, or the sentence to say when it did not.
       */
      useStyle: async (slug) => {
        if (!slug) return null
        // ⚠️ ONE RELOAD BEFORE GIVING UP ON THE PICKER. A style taken in the same turn is on disk
        // and not yet in this select — treating it as loose words would ignore a technique
        // somebody just watched arrive and retype its name as prose.
        if (!styles.use(slug)) { shaping = null; return null }
        await styles.load()
        if (!styles.use(slug)) { shaping = null; return null }
        // ⚠️ NOT A REFUSAL. Nobody saved these words, which makes them words — see `shaping`. Said
        // out loud rather than silently, because the select will not move and the difference
        // between "picked your style" and "typed it into the sentence" is worth one line.
        shaping = slug
        ctx.flash(`no image style called "${slug}" — shaping this press with those words`)
        return null
      },
    }

    // ── the feed: the SHARED gallery, over the one index ───────────────────────
    const gallery = mediaGallery(ctx, {
      medium: 'image',
      noun: 'images',
      empty: 'nothing rendered yet — say what you want to make, below',
      // ⚠️ Every facet and the search take ONE ASSET now: the feed is flat, and an asset carries
      // its run (`a.group`) rather than being wrapped in it (web/lib/gallery.js).
      // ⚠️ ONE FACET, AND IT IS THE ENGINE. There were three. `service` was a refinement pair
      // with `engine` — pick one service and the other service's checkpoint and you got a
      // guaranteed-empty feed — and it is not what anyone filters by: with one service it means
      // "everything", and with three it is still the CHECKPOINT you judge. So it became the
      // group heading, which is all it ever was. `tag` read `tags[0]` only, so an asset tagged
      // `chick, cake, egg` was findable under one third of itself; tags are in the search
      // haystack, which handles all of them.
      facets: [{
        key: 'engine', label: 'engine',
        of: (a) => a.gen?.model ?? '',
        group: (a) => a.inference ?? '',
      }],
      search: (a) => [a.group?.ask, a.group?.slug, a.gen?.model, ...(a.tags ?? [])].join(' '),
      onPick: ctx.onPick,
      // ⚠️ NO LINK AROUND THE ARTWORK. It made clicking an image open a tab and never select it —
      // the ⓘ band was reachable only by hitting the 8px of padding around the picture. A click
      // selects; opening is an action in ⓘ, and a double-click is the shortcut for it.
      cell: (a) => tile({
        art: el('img', {
          src: href(a.preview ?? a.master), alt: '', loading: 'lazy',
          ondblclick: () => window.open(href(a.master), '_blank'),
        }),
        // No `aspect` — a render keeps its own ratio. Cropping a 9:16 to a square in the one
        // place you are judging the composition would be judging something else.
        // What tells this card apart from the ones beside it — a name, or an engine when it is
        // one of several answering the same ask (web/lib/gallery.js).
        ...mediaFace(a),
        star: a.ratingKey ? starWidget(a.ratingKey) : null,
        // "⧉N" — this asset was one of N engines answering one ask. It rides ON the asset; the
        // framed group block it replaced turned a feed of a thousand renders into a thousand bands.
        badge: a.siblings > 1
          ? { text: `⧉${a.siblings}`, title: `${a.siblings} engines answered this one ask` }
          : null,
      }),
      // The ☰ table: the shared media row (web/lib/gallery.js). It used to be declared here,
      // with the raw prompt as its first column.
      columns: mediaColumns({ icon: '🖼' }),
    })

    return {
      feed: gallery.root,
      // ⚠️ NO 🎨 CHILD ROW ANY MORE (2026-08-29). The style list was a page under this section,
      // which made it 🖼's — so the music, sound, voice and 3D lists had no screen at all. It is
      // the shell's 🎨 band now (web/lib/shell.js), reachable from every section that makes
      // something, and the row above is the door.
      options,
      ask,
      refresh: () => { gallery.refresh(); engineChanged() },
      engineChanged,

      // ── the ⓘ band: what you just picked ────────────────────────────────────
      // ⚠️ THE BAND ITSELF IS SHARED (web/lib/asset-detail.js, 2026-08-17). It lived here in full
      // and was about to be copied into 🎼 · 🗣 · 🧊, which would have been four copies of "what
      // made this and where does it live". What stays here is what is genuinely about PIXELS: ⧉,
      // and clearing the seed after ↻.
      detail: (sel) => assetDetail(ctx, sel, {
        empty: 'pick an image in the feed',
        actions: (cell) => [
          el('button', {
            class: 'btn', title: 'copy the picture itself, to paste anywhere',
            onclick: async (ev) => {
              const btn = ev.currentTarget
              btn.disabled = true
              try {
                // ⚠️ The clipboard takes PNG, not WebP, and Safari requires the ClipboardItem
                // to be constructed inside the gesture — so the PROMISE is handed over and
                // resolved later, rather than awaiting the conversion first.
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': asPng(href(cell.master)) })])
                ctx.flash('copied')
              } catch (err) {
                ctx.flash(`could not copy that: ${err.message}`, true)
              } finally {
                btn.disabled = false
              }
            },
          }, '⧉ copy'),
        ],
        // ↻ reuses the ask and NOT the seed — "again" means another one, not the same one.
        onAgain: () => { seed.value = '' },
      }),
    }
  },
}
