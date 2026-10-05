// 🧩 RUNNING A CHAIN — the one thing a composition is for, and the reason it is not a workflow.
//
// ⚠️ IT RUNS IN THE BROWSER, LIKE EVERY OTHER PRESS. A chain is a SEQUENCE of the presses this app
// already makes: `ctx.generate` for a picture, `/api/text` for words, and — the step that makes it
// a composition rather than a macro — a stop where YOU choose. Moving the loop into the server
// would mean a second place that decides what a press is, and the one thing it would buy (surviving
// a reload) is not worth a chain you cannot watch or interrupt.
//
// ⚠️ THE LOOP IS THE BROWSER'S; THE WORK NEVER WAS (2026-09-01). Every step here QUEUES something
// and then waits for it — and a text step was the one exception, doing its work inside a single
// `fetch` held open for minutes, which made a flaky connection able to delete a step that had
// nearly finished. Now it queues like the rest and `settleWords` waits on it. Nothing about who
// decides what a press is has changed; a poll simply survives what a socket does not.
//
// ⚠️ THREE WORDS FOR THREE DIFFERENT KINDS OF MANY, and keeping them apart is most of this file:
//
//   repeat: 12   TWELVE PRESSES OF ONE THING. Twelve candidates for one character; you pick one.
//   each: <id>   ONE PRESS PER ITEM of an earlier output. Twelve pages for twelve concepts, all
//                kept. The input naming the same source gets the ITEM; every other input gets the
//                whole thing, as always.
//   list: true   A `text` step whose ONE answer is many — one item per line. The only way a single
//                sentence becomes twelve of anything.
//
// ⚠️ WHAT A STEP LEAVES BEHIND IS EITHER WORDS OR ASSETS, and the difference is load-bearing.
// Both are now carried as `{ kind, items }` rather than as "a string or an array", because the
// moment a text step could answer with a LIST the old test — typeof string — stopped being able to
// tell twelve captions from twelve file paths. Feeding one into the other's slot is caught here, by
// name, rather than sent and refused three layers down.
//
// ⚠️ AND ORDER IS PROMISED. Page three is the third concept. A run's masters used to be read back
// off the manifest in whatever order it listed them, which is fine for twelve interchangeable
// candidates and wrong for anything a chain BINDS — so presses are settled as a map from run to
// masters, and the caller puts them back in the order it fired them.
//
// ⚠️ AND THE LAST STEP MAY BIND, which is the one step here that is not a press at all. It reaches
// no engine, no queue and no medium: it hands what the chain made to `/api/build`, which writes the
// composition's own result into the chain's own run folder (src/builds/bind.ts). That is what makes
// a composition a thing rather than a macro — four steps that draw twelve pages leave twelve
// pictures and a pile; the fifth leaves the book.
//
// ⚠️ EVERY PRESS OF ONE ▶ GOES INTO ONE RUN FOLDER (2026-08-24). The chain asks the server for a
// run before its first step — `/api/chain`, minted there, never named here (§15 rule 2) — and every
// press quotes it back. So a run of a chain is ONE thing: one card in the composition's own feed,
// holding the brief it wrote, the twelve it drew, the one you chose and the book it bound. Nothing
// a chain makes appears on a medium's shelf; you go to 🧸 to look at your mascots.

import { api, loadManifest } from './shared.js?v=129'

/** How often the queue is asked whether this run is done. The shell polls it too; this is a second
 *  reader of the same list, not a second source of truth. */
const POLL_MS = 1200

/** ⚠️ A CEILING ON ONE CHAIN'S PRESSES, counted across every step. Twelve candidates and four cast
 *  members is a composition; a `repeat` typo multiplied by a five-step chain is an afternoon of
 *  rendering nobody asked for, and the parser's per-step ceiling does not see the product. */
const MAX_PRESSES = 120

const words = (items) => ({ kind: 'words', items })
const assets = (items) => ({ kind: 'assets', items })

/** ⚠️ A LIST IS LINES. It is what a person types into the ask bar when they mean several things,
 *  and it is what a brain told "one per line" answers with — so one rule reads both. Numbering and
 *  bullets are stripped because every small model adds them however firmly it was asked not to. */
const asLines = (text) => String(text ?? '')
  .split('\n')
  .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim())
  .filter(Boolean)

/** What an earlier step left, or a refusal that names the step. */
function outputOf(out, from, step) {
  const had = out[from]
  if (!had) throw new Error(`${step.id} reads ${from}, which has not run`)
  return had
}

/** What a step's `prompt` gets: your sentence, an earlier step's words, or nothing.
 *  `item` is the one item of this round, when the step has an `each`. */
function promptFor(step, said, out, item) {
  const from = step.inputs?.prompt
  if (from === undefined) return ''
  if (item !== null && from === step.each) return String(item)
  if (from === 'ask') return said
  const had = outputOf(out, from, step)
  // ⚠️ NAMED, NOT COERCED. `prompt: <an image step>` would otherwise send a file path to a
  // checkpoint, which renders something and is therefore worse than failing.
  if (had.kind !== 'words') throw new Error(`${step.id} reads its prompt from ${from}, which made ${had.kind}, not words`)
  return had.items.join('\n')
}

/** What a step's asset inputs get. One picture per slot. */
function refsFor(step, out, item) {
  const refs = []
  for (const [role, from] of Object.entries(step.inputs ?? {})) {
    if (role === 'prompt') continue
    if (item !== null && from === step.each) {
      if (typeof item !== 'string') throw new Error(`${step.id} wants a picture in ${role}`)
      refs.push({ asset: item, role })
      continue
    }
    const had = outputOf(out, from, step)
    if (had.kind !== 'assets') throw new Error(`${step.id} wants a picture in ${role}, and ${from} made words`)
    if (!had.items.length) throw new Error(`${step.id} wants a picture in ${role}, and ${from} produced none`)
    // ⚠️ THE FIRST, AND IT IS ALWAYS THE RIGHT ONE. A slot takes one picture; the step that fills
    // it is a `pick`, which produces exactly one. A step that made twelve feeding a slot directly
    // is a composition that forgot to ask you something, and taking the first is the only answer
    // that is not a coin toss.
    refs.push({ asset: had.items[0], role })
  }
  return refs
}

/**
 * Wait for ONE job that makes words, and hand back what it wrote.
 *
 * ⚠️ A POLL, AND THAT IS THE WHOLE POINT (2026-09-01). A text step used to be a single `fetch` held
 * open for the entire step — up to four spawned processes and several minutes — so the CONNECTION
 * was the run: a browser on another machine blinked and the step's work went with it, leaving a run
 * folder holding nothing but the sentence that started it. The work is a job now (`/api/text`),
 * exactly like every step that renders, and this reads the answer off the queue the same way
 * `settle` reads a render off the index. A poll can lose a beat; a socket cannot.
 *
 * ⚠️ AND ⏹ REACHES IT NOW. Stopping used to mean abandoning the fetch and hoping; a job has an id.
 */
async function settleWords(id, signal) {
  for (;;) {
    if (signal.aborted) {
      // ⚠️ SAID OUT LOUD TO THE QUEUE. Nothing else is listening for the abort any more — the
      // socket that used to carry it is closed the moment the job is queued.
      await api(`/api/queue/${encodeURIComponent(id)}/cancel`, {}).catch(() => {})
      throw new Error('stopped')
    }
    const { jobs = [] } = await api('/api/queue')
    const mine = jobs.find((j) => j.id === id)
    if (!mine) throw new Error('the queue lost that step')
    if (mine.state === 'queued' || mine.state === 'running') {
      await new Promise((go) => setTimeout(go, POLL_MS))
      continue
    }
    if (mine.state !== 'done') throw new Error(mine.error || `that step was ${mine.state}`)
    return String(mine.result ?? '')
  }
}

/** Wait for a set of jobs, then read what each RUN wrote, as a map. */
async function settle(runs, signal) {
  const wanted = new Set(runs.flatMap((r) => r.jobs))
  for (;;) {
    if (signal.aborted) throw new Error('stopped')
    const { jobs = [] } = await api('/api/queue')
    const mine = jobs.filter((j) => wanted.has(j.id))
    // A job the queue has already forgotten counts as settled: the alternative is waiting forever
    // for a list that has moved on.
    const busy = mine.filter((j) => j.state === 'queued' || j.state === 'running')
    if (!busy.length) {
      const failed = mine.filter((j) => j.state === 'failed')
      if (failed.length === mine.length && mine.length) {
        throw new Error(failed[0].error || 'every press failed')
      }
      break
    }
    await new Promise((go) => setTimeout(go, POLL_MS))
  }
  // ⚠️ READ OFF THE INDEX, NOT OFF THE JOB. A job says it finished; the manifest says what is on
  // the disk, which is the only thing a later step can attach. A crashed job that left a folder
  // behind is simply not in here (src/content/index.ts).
  const manifest = await loadManifest()
  const byRun = new Map()
  // ⚠️ OFF THE CHAIN'S OWN RUN, not off the media shelves (2026-08-24). A cell carries the press
  // folder it landed in, which is the run id `/api/generate` answered with — so a step reads back
  // exactly what it fired, and nothing a chain makes has to be looked for among a thousand
  // pictures somebody drew by hand.
  for (const group of manifest.chains ?? []) {
    for (const cell of group.cells) {
      if (!byRun.has(cell.run)) byRun.set(cell.run, [])
      byRun.get(cell.run).push(cell.master)
    }
  }
  // ⚠️ IN THE ORDER THEY WERE FIRED, which the manifest does not know and cannot be asked. This is
  // what makes page three the third concept.
  return runs.flatMap((r) => byRun.get(r.runId) ?? [])
}

/**
 * Run one composition.
 *
 * @param ctx    the section context — `generate` and `flash` are the only things used
 * @param comp   the RESOLVED composition (`/api/compositions`), so every step already knows what
 *               would answer it
 * @param said   your sentence: what every `ask` input reads
 * @param onChange  called after every state change; the section redraws from `run`
 * @param plugs  `{ [stepId]: '<service>/<slug>' }` — what YOU chose in ⚙ for a step, overriding
 *               what the resolver would have run. A step with no entry runs what it resolved to.
 * @param styles `{ says(), forMedium(m) }` — the chain style in ⚙, already resolved: the words it
 *               hands every `text` step, and the media style each making step runs in. See
 *               web/lib/pipelines/composition.js → `chainStyles`.
 * @returns the live run — `run.state`, `run.steps`, and the two verbs `choose` and `stop`
 */
/**
 * ▶ THE CHAINS RUNNING RIGHT NOW — read by the QUEUE, which is where progress belongs.
 *
 * ⚠️ A CHAIN'S PROGRESS IS NOT FEED CONTENT (2026-08-24). The step list used to be painted down the
 * middle of the composition's section, which is the one place in this app reserved for what you
 * MADE. Where a run has got to is a queue question, and there is already a queue — so the queue
 * shows the chain and its steps, and the middle shows the runs.
 *
 * A Set rather than a store: a live chain is not state anybody reloads into, it is a thing that is
 * happening, and when it stops it is simply not here any more.
 */
export const liveChains = new Set()

/**
 * ▶ AGAIN, FROM WHERE IT STOPPED — `resume`.
 *
 * ⚠️ A CHAIN IS DRIVEN FROM THE BROWSER, which is why this exists (2026-09-04). The loop below
 * lives on this page: a reload, a restart or a closed tab kills it, and every step after the one
 * it was on is simply never attempted. The finished steps are on disk the whole time — so the run
 * was never lost, only the loop was, and starting over meant paying again for a survey that had
 * already been written.
 *
 * `{ run, done }` — the run folder to keep writing into, and what its finished steps produced,
 * keyed by step id in the same `{kind, items}` shape the loop uses. Steps with an entry are
 * skipped; the first one without is where it picks up.
 */
export function startChain(
  ctx, comp, said, onChange = () => {}, plugs = {}, knobs = {}, styles = null, resume = null,
) {
  const stop = new AbortController()
  let resolvePick = null

  const run = {
    slug: comp.slug,
    label: comp.label ?? comp.slug,
    icon: comp.icon ?? '🧩',
    said,
    /** The server-minted run folder every press of this chain writes into. Null until step one. */
    run: null,
    state: 'running',
    error: null,
    at: 0,
    // One row per step, mirroring `comp.bindings` — the section draws these beside the chain it
    // already shows, so a running chain is the same list with state on it.
    steps: comp.bindings.map((b) => ({
      id: b.step.id, state: 'waiting', made: [], text: '', note: '',
    })),
    /** The candidates a `pick` is offering, while it is offering them. */
    choosing: null,
    /** What the chain BOUND, once it has — `{ runId, path, master }` from `/api/build`. Null for a
     *  chain that ends in a press, which walks away with media and nothing of its own. */
    made: null,
    /** ⚠️ ONE PATH, AND THE RUN CONTINUES. Nothing is stored anywhere but this run — choosing again
     *  is starting again, which is what ▶ is for. */
    choose: (asset) => { resolvePick?.(asset); resolvePick = null },
    stop: () => stop.abort(),
  }

  const tick = (i, patch) => {
    Object.assign(run.steps[i], patch)
    onChange(run)
  }

  /** What this step is run at: the values the composition was published with, under whatever you
   *  set for it in ⚙. Empty is the normal case and sends nothing. */
  const paramsFor = (step) => ({ ...(step.params ?? {}), ...(knobs?.[step.id] ?? {}) })

  /** The items a step with `each` runs over. */
  function itemsFor(step, said_, out) {
    if (step.each === 'ask') {
      const lines = asLines(said_)
      if (!lines.length) throw new Error(`${step.id} runs once per line of what you typed — type one per line`)
      return lines
    }
    const had = outputOf(out, step.each, step)
    if (!had.items.length) throw new Error(`${step.id} runs once per thing ${step.each} made, and it made none`)
    return had.items
  }

  /**
   * WHICH WORKFLOW ANSWERS STEP `i` — what you plugged in, or what the resolver worked out.
   *
   * ⚠️ YOURS WINS, AND IT IS CHECKED AGAINST WHAT IS THERE. A plug is remembered per composition
   * and per step and outlives the workflow it names — a checkpoint you deleted, a service you
   * renamed — so a stale one falls back to the resolved binding instead of sending a slug nothing
   * answers to.
   */
  const engineFor = (i) => {
    const b = comp.bindings[i]
    const want = plugs?.[b.step.id]
    return (want && (b.options ?? []).some((o) => o.workflow === want) ? want : b.workflow) ?? null
  }

  const go = async () => {
    const out = { ...(resume?.done ?? {}) }
    let presses = 0

    if (resume?.run) {
      // ⚠️ THE SAME FOLDER, which is the whole point: a resumed run is the SAME run, not a second
      // one that happens to look like it. Everything it already made stays where it is.
      run.run = resume.run
      // Yesterday's reason is cleared before today's attempt, so a run never shows both.
      await api('/api/chain', { composition: comp.slug, run: run.run, failed: null }).catch(() => {})
    } else {
      // ⚠️ THE RUN IS ASKED FOR, NEVER NAMED (§15 rule 2). One folder for this whole press of ▶ —
      // every step writes into it, the bind writes into it, and it is the one card this run becomes.
      const started = await api('/api/chain', { composition: comp.slug, text: said })
      run.run = started.run
    }
    onChange(run)

    /** One round of a making step — the whole of a step with no `each`, one item of one with. */
    const press = async (step, i, item, prompt) => {
      const [service, workflow] = engineFor(i).split('/')
      const n = Math.max(1, step.repeat ?? 1)
      presses += n
      if (presses > MAX_PRESSES) {
        throw new Error(`this chain wants more than ${MAX_PRESSES} presses — that is a typo, not a composition`)
      }
      const refs = refsFor(step, out, item)
      // ⚠️ FIRED TOGETHER, WAITED FOR TOGETHER. Twelve serial round trips would take twelve times
      // as long for no reason: the queue is what decides how many run at once, and it already does.
      const runs = []
      const params = paramsFor(step)
      for (let k = 0; k < n; k += 1) {
        const started = await ctx.generate({
          // ⚠️ THE STYLE COMES FROM THE CHAIN, NOT FROM THE SHELF (2026-08-29). It was `null`, which
          // meant every chain rendered styleless while the section two rows up had a picker — so a
          // book and a mascot came out in whatever the checkpoint does by default and there was
          // nowhere to say otherwise. Resolved in ⚙: the chain style names one per medium, and a
          // per-medium override beats it. The medium's OWN armed style is deliberately not
          // consulted — what you picked in 🖼 is for pressing ▶ in 🖼.
          medium: step.makes, text: prompt, style: styles?.forMedium?.(step.makes) ?? null,
          inference: [{ id: service, workflow }],
          ...(refs.length ? { refs } : {}),
          ...(Object.keys(params).length ? { params } : {}),
          // ⚠️ THIS IS WHERE IT GOES, not a note about where it came from. The three words route
          // the run into `compositions/<slug>/<run>/<step>/` — a section keeps what it makes, and a
          // mascot is not something you go to 🖼 to find.
          composition: { slug: comp.slug, run: run.run, step: step.id },
        })
        if (!started) throw new Error(`${step.id} was refused — see the message above`)
        runs.push(started)
      }
      return runs
    }

    for (const [i, b] of comp.bindings.entries()) {
      if (stop.signal.aborted) throw new Error('stopped')
      run.at = i
      const step = b.step
      // ⚠️ ALREADY DONE, SO NOT DONE AGAIN. A resumed run walks the whole chain — the order and the
      // bindings are the same list — and steps whose output is already in `out` are stepped over
      // rather than re-pressed. That is what makes resuming free rather than half a re-run.
      if (out[step.id]) {
        const had = out[step.id]
        tick(i, {
          state: 'done',
          note: 'already done',
          ...(had.kind === 'assets' ? { made: had.items } : { text: had.items.join('\n') }),
        })
        continue
      }
      tick(i, { state: 'running' })

      // ── you choose ───────────────────────────────────────────────────────────
      if (step.pick) {
        const from = outputOf(out, step.pick, step)
        if (from.kind !== 'assets' || !from.items.length) {
          throw new Error(`${step.pick} produced nothing to choose from`)
        }
        run.choosing = { step: step.id, asks: step.asks ?? 'Which one?', from: from.items }
        run.state = 'choosing'
        tick(i, { state: 'you', note: step.asks ?? 'pick one' })
        const chosen = await new Promise((done, fail) => {
          resolvePick = done
          stop.signal.addEventListener('abort', () => fail(new Error('stopped')), { once: true })
        })
        run.choosing = null
        run.state = 'running'
        out[step.id] = assets([chosen])
        // ⚠️ KEPT ON THE RUN, so resuming does not stop and ask you the same question again about
        // twelve pictures you already chose between.
        await api('/api/chain', {
          composition: comp.slug, run: run.run, step: step.id, picked: chosen,
        }).catch(() => {})
        tick(i, { state: 'done', made: [chosen], note: '' })
        continue
      }

      // ── it binds ─────────────────────────────────────────────────────────────
      //
      // ⚠️ NO WORKFLOW, NO QUEUE, NO MEDIUM. The chain's own result, written by the app itself. The
      // server reads the container and the paper off the composition on disk — all that travels
      // from here is which chain, which step, and what it made.
      //
      // ⚠️ WHAT `parts` HOLDS IS THE CONTAINER'S BUSINESS (2026-08-29). `pdf` assembles ASSETS into
      // one file; `svg` files the MARKUP a `text` step wrote, one document each. So the check is
      // per container rather than one rule pretending both are pages — and it is still a check,
      // because feeding twelve captions into a page slot is exactly the mistake this catches.
      if (step.binds) {
        const written = step.binds === 'svg'
        const parts = outputOf(out, step.parts, step)
        const want = written ? 'words' : 'assets'
        if (parts.kind !== want) {
          throw new Error(written
            ? `${step.id} binds ${step.parts}, which made pictures, not words`
            : `${step.id} binds ${step.parts}, which made words, not pictures`)
        }
        if (!parts.items.length) throw new Error(`${step.id} has nothing to bind — ${step.parts} produced none`)
        const captions = !written && step.captions ? outputOf(out, step.captions, step) : null
        if (captions && captions.kind !== 'words') {
          throw new Error(`${step.id} reads its captions from ${step.captions}, which made pictures, not words`)
        }
        const noun = written
          ? `${parts.items.length} ${parts.items.length === 1 ? 'file' : 'files'}`
          : `${parts.items.length} pages`
        tick(i, { note: `${written ? 'writing' : 'binding'} ${noun}` })
        const made = await api('/api/build', {
          composition: comp.slug,
          run: run.run,
          step: step.id,
          parts: parts.items,
          ...(captions ? { captions: captions.items } : {}),
        })
        out[step.id] = assets([made.master])
        run.made = made
        // ⚠️ THE SHELL'S INDEX, NOT THIS FILE'S. `settle` fetches the manifest to read back what a
        // press wrote; the section draws its results off the shell's copy, and a build that nothing
        // refreshed would be a file on disk the page cannot see until the next reload.
        await ctx.reloadManifest?.()
        tick(i, { state: 'done', made: [made.master], note: `${noun} ${written ? 'written' : 'bound'}` })
        continue
      }

      // ── it writes ────────────────────────────────────────────────────────────
      //
      // ⚠️ WORDS ARE XOKO, AND THIS SENDS NO ENGINE (2026-08-24). A composition names one for
      // every other medium and never for this one: the server resolves the same brain ✨ is using
      // (`brainFor`, src/server/app.ts). A chain that could name its own brain is a chain that can
      // install one, and one did — `ollama/prompt-smith`, pulled in by a mascot, to write a
      // sentence xoko was standing right there to write.
      if (step.makes === 'text') {
        const items = step.each ? itemsFor(step, said, out) : [null]
        // ⚠️ THE CHAIN STYLE REACHES XOKO, AND THIS IS THE PART NO MEDIA STYLE COULD DO. "Wry
        // second person, captions under eight words" is not about pixels — it shapes the WORDS, so
        // it lands under what the step already asks for rather than in a prompt.
        // ⚠️ NOT ONTO A VERBATIM STEP. A style's words are appended to the step's own instruction,
        // which for a step ending "answer with the JSON and nothing around it" means arguing with
        // it from the line below. See MakeStep.verbatim.
        const frame = [step.says, step.verbatim ? null : styles?.says?.()].filter(Boolean).join('\n\n')
        const said_ = frame ? { says: frame } : {}
        const answers = []
        for (const [k, item] of items.entries()) {
          if (stop.signal.aborted) throw new Error('stopped')
          // ⚠️ THIS RETURNS AN ID, NOT AN ANSWER. `/api/text` queues the work and comes straight
          // back; what it wrote is read off the queue below. See `settleWords`.
          const r = await api('/api/text', {
            prompt: promptFor(step, said, out, item), ...said_,
            // ⚠️ WHAT THIS STEP MAY GO AND READ FIRST (`MakeStep.sees`). Passed straight through
            // from the composition on disk: the server decides what each target answers, and a
            // step that declares none is exactly the single-shot every text step used to be.
            ...(step.sees?.length ? { sees: step.sees } : {}),
          })
          tick(i, { note: items.length > 1 ? `writing ${k + 1} of ${items.length}` : 'writing' })
          const wrote = await settleWords(r.job, stop.signal)
          // ⚠️ A LIST STEP SPLITS ITS ONE ANSWER; an `each` step already has one answer per item.
          // Both come out of here as a list of words, which is the only shape downstream reads.
          if (step.list) answers.push(...asLines(wrote))
          else answers.push(wrote.trim())
        }
        out[step.id] = words(answers)
        // ⚠️ KEPT ON THE RUN, AND IT IS NOT AN ASSET. There is no 📝 shelf and there will not be
        // one — but the brief a chain wrote is most of the story of the picture beside it, so it is
        // a field on the run, the way lyrics are a field on the song.
        await api('/api/chain', {
          composition: comp.slug, run: run.run, step: step.id, text: answers.join('\n'),
          // ⚠️ AND THE ANSWERS THEMSELVES, so a resumed run reads back the list this step really
          // produced rather than one rebuilt by splitting on newlines. See `ChainWrote.items`.
          ...(answers.length > 1 ? { items: answers } : {}),
        })
        tick(i, {
          state: 'done',
          text: answers.join('\n'),
          note: answers.length > 1 ? `${answers.length} written` : '',
        })
        continue
      }

      // ── it renders ───────────────────────────────────────────────────────────
      //
      // ⚠️ REFUSED HERE, NOT HALF WAY THROUGH. Only a step that reaches an engine can be unbound,
      // which is why this guard sits below the text branch and not above it.
      // ⚠️ EVERY ITEM IS QUEUED BEFORE ANY IS WAITED FOR, which is the same rule `repeat` has
      // always had one level down. Settling between items would render twelve pages one at a time
      // on a machine that can run four, for no gain — the queue decides concurrency, and it
      // already does. Order is kept because `runs` is in item order and `settle` reads it that way.
      if (!engineFor(i)) throw new Error(`${step.id}: ${b.why ?? 'nothing here answers this step'}`)
      const items = step.each ? itemsFor(step, said, out) : [null]
      const runs = []
      for (const [k, item] of items.entries()) {
        if (stop.signal.aborted) throw new Error('stopped')
        tick(i, {
          note: items.length > 1
            ? `${k + 1} of ${items.length} queued`
            : (step.repeat > 1 ? `${step.repeat} presses queued` : 'queued'),
        })
        runs.push(...await press(step, i, item, promptFor(step, said, out, item)))
      }
      tick(i, { note: `${runs.length} press${runs.length === 1 ? '' : 'es'} queued` })
      const made = await settle(runs, stop.signal)
      if (!made.length) throw new Error(`${step.id} produced nothing`)
      out[step.id] = assets(made)
      // ⚠️ THE FEED FILLS UP AS IT GOES. What a chain makes lands in this section, and a section
      // that only shows it when the last step finishes is a screen that sits empty through the four
      // minutes you are watching. The shell holds the index; this is the same reload a delete does.
      await ctx.reloadManifest?.()
      tick(i, { state: 'done', made, note: `${made.length} made` })
    }
  }

  liveChains.add(run)

  void go().then(
    () => { run.state = 'done'; liveChains.delete(run); onChange(run) },
    (err) => {
      liveChains.delete(run)
      const why = String(err.message || err)
      run.state = why === 'stopped' ? 'stopped' : 'failed'
      run.error = why === 'stopped' ? null : why
      if (run.steps[run.at]) run.steps[run.at].state = why === 'stopped' ? 'waiting' : 'failed'
      if (run.error) ctx.flash(run.error, true)
      /**
       * ⚠️ AND ON THE RUN, NOT ONLY IN A FLASH (2026-09-04). A flash is gone in seconds and this
       * loop dies with the page — so a run that stopped left three steps done, two never attempted,
       * and nothing at all to say which of those two states each was in. "Why did it stop" was
       * unanswerable an hour later. Stopping by hand is not a failure and records nothing.
       */
      if (run.run && run.error) {
        void api('/api/chain', {
          composition: comp.slug,
          run: run.run,
          failed: { step: run.steps[run.at]?.id ?? comp.bindings[run.at]?.step?.id ?? '?', why: run.error },
        }).then(() => ctx.reloadManifest?.()).catch(() => {})
      }
      onChange(run)
    },
  )

  return run
}
