// 🔎 LOOK — the only verb this process answers itself, and the reason xoko can say anything true
// about a machine it cannot see.
//
// ⚠️ WHY THIS IS NOT JUST PASTED INTO EVERY PROMPT. The MAP (web/lib/xoko-map.js) is small, fixed
// and always sent: what sections exist, what each is for, what is armed. This is the other half —
// your library, your styles, your workflows, everything you have ever made — and it is unbounded.
// Sending it every turn would be expensive on the turns that do not need it, stale on the turns
// that do, and impossible by the time the content root has a few thousand assets in it. So the
// brain ASKS, and this answers, and the loop that joins them is in src/server/app.ts.
//
// ⚠️ EVERY ANSWER IS A DIGEST, SIZED FOR THE FINISHED PRODUCT. Not one of these is a dump: they
// are counts, then the rows that matched, then a line saying how many did not and how to narrow
// it. A library of thirty and a library of three thousand produce the same shaped paragraph, and
// the second one is not the day this stops working.
//
// ⚠️ AND IT IS READ-ONLY, ALL OF IT. Nothing in this file writes, installs, moves or deletes. The
// verbs that change something go back to the browser and are pressed there, in the open
// (src/xoko/grammar.ts).

import { cachedCatalog, serviceFiles } from '../inference/catalog.ts'
import { SERVICE_PRESETS } from '../inference/presets.ts'
import { loadInferenceRegistry } from '../inference/registry.ts'
import { loadKinds, mediaOf } from '../inference/kinds.ts'
import { settableKnobs } from '../inference/knobs.ts'
import { loadCompositions } from '../compositions/registry.ts'
import { candidates, resolveComposition } from '../compositions/resolve.ts'
import { resolveWorkflows } from '../inference/workflows.ts'
import { readLibrary } from '../library/catalog.ts'
import type { Roots } from '../paths.ts'
import { loadStyles } from '../styles/registry.ts'
import { isBind, isMake } from '../types/composition.ts'
import type { Manifest } from '../types/manifest.ts'
import type { Medium } from '../types/medium.ts'
import { MEDIA } from '../types/medium.ts'
import type { Look } from './grammar.ts'
import { LOOKS } from './looks.ts'
import { stalePublished } from './here.ts'

export { LOOKS, LOOKS_WITHOUT_A_WORD, LOOK_TARGETS } from './looks.ts'

/** What a look is answered from. `manifest` is handed in rather than rebuilt: the server already
 *  holds it, and walking the content root to answer a question about it would make the cheap verb
 *  the expensive one. */
export interface Sight {
  readonly roots: Roots
  readonly manifest: Manifest
}

/** How many rows any one answer prints before it starts counting instead. */
const ROWS = 25

const targets = LOOKS.map((l) => l.id).join(', ')

/** Everything the filter is matched against, lowercased once. */
const hay = (...parts: readonly (string | null | undefined)[]) =>
  parts.filter(Boolean).join(' ').toLowerCase()

/** ⚠️ THE MISSES ARE COUNTED, NOT HIDDEN. "6 of 412" is a fact the brain can repeat honestly;
 *  six rows with no denominator reads like the whole list, and it will say so. */
function rows(all: readonly string[], shown: readonly string[], about: string, target: string): string {
  const more = all.length - shown.length
  return [
    ...shown.map((r) => `  ${r}`),
    more > 0
      ? `  …and ${more} more${about ? '' : ` — narrow it with a word: ▶ look: ${target} <word>`}`
      : '',
  ].filter(Boolean).join('\n')
}

export async function look(sight: Sight, asked: Look): Promise<string> {
  const { target, about } = asked
  const found = LOOKS.find((l) => l.id === target)
  // ⚠️ AN UNKNOWN TARGET IS AN ANSWER, NOT AN ERROR. It names the four that work, so the next hop
  // of the same turn asks the right one — which is the whole advantage of a loop over a refusal.
  if (!found) {
    return `I cannot look at ${JSON.stringify(target)}. What I can look at: ${targets}.`
  }
  try {
    switch (found.id) {
      case 'library': return await lookLibrary(sight, about)
      case 'workflows': return await lookWorkflows(sight, about)
      case 'styles': return await lookStyles(sight, about)
      case 'compositions': return await lookCompositions(sight, about)
      case 'made': return lookMade(sight, about)
      case 'workflow': return await lookWorkflow(sight, about)
      case 'node': return await lookNode(sight, about)
    }
  } catch (err) {
    // A library that is not reachable, a registry that will not parse. The brain is told plainly
    // so it can say so, rather than answering as though the shelf were empty.
    return `I could not read ${found.id}: ${(err as Error).message}`
  }
}

async function lookLibrary({ roots }: Sight, about: string): Promise<string> {
  const view = await readLibrary(roots)
  if (view.issue) return `📚 the library (${view.origin ?? 'unset'}) could not be read: ${view.issue}`
  const items = view.items
  const want = about.toLowerCase()
  const hits = want
    ? items.filter((i) => hay(i.id, i.title, i.kind, i.kindFace, i.notes, ...i.media).includes(want))
    : items
  const installed = items.filter((i) => i.app.installed).length
  const head = `📚 the library (${view.origin}) publishes ${items.length}, of which ${installed}`
    + ` ${installed === 1 ? 'is' : 'are'} installed here`
    + (want ? ` · ${hits.length} match ${JSON.stringify(about)}` : '')
  const lines = hits.map((i) => [
    i.id,
    i.type,
    i.media.join('+') || null,
    i.kind,
    i.app.installed ? 'INSTALLED' : (i.app.takeable ? 'takeable' : `cannot take: ${i.app.why}`),
  ].filter(Boolean).join(' · '))
  if (!lines.length) return `${head}\n  nothing matched.`
  return `${head}\n${rows(lines, lines.slice(0, ROWS), about, 'library')}`
}

/**
 * ONE WORKFLOW, WHOLE — the reference for operating something that is not armed.
 *
 * ⚠️ IT IS A SEPARATE LOOK RATHER THAN MORE OF THE MAP (2026-08-23), and the split is the point.
 * The map carries the ARMED workflow's settings for every medium and is sent on every single turn, so
 * everything on it is paid for constantly; a machine with six music workflows installed would put
 * five workflows' worth of enums in front of the brain forever to answer a question nobody asked.
 * Progressive disclosure: the common case rides free on the map, the uncommon one costs a hop.
 *
 * ⚠️ AND THE ENUMS COME OUT IN FULL HERE, where the map trims them. That is the whole reason to
 * come and ask: "keyscale, 34 of them" is a shape, and the 34 are an answer.
 */
async function lookWorkflow({ roots }: Sight, about: string): Promise<string> {
  const want = about.trim().toLowerCase()
  if (!want) return 'Name one: ▶ look: workflow <slug>. ▶ look: workflows lists what is installed.'
  const [registry, { kinds }, stale] = await Promise.all(
    [loadInferenceRegistry(roots), loadKinds(roots), stalePublished(roots)])
  const mediumOf = new Map(kinds.map((k) => [k.slug, k.medium]))

  for (const row of registry.rows) {
    const resolved = resolveWorkflows(
      row, cachedCatalog(row.id).engines, new Map(), new Set(), serviceFiles(row.id))
    // The slug, or `<service>/<slug>` the way the library spells an id — both are things somebody
    // will have read somewhere, and refusing one of them would be pedantry with a hop attached.
    const w = resolved.find((r) => r.slug.toLowerCase() === want
      || `${row.id}/${r.slug}`.toLowerCase() === want)
    if (!w) continue

    const medium = mediumOf.get(w.kind) ?? null
    const knobs = settableKnobs(medium, w.graph, w.params, w.knobs)
    const out = [
      `🔌 ${w.slug} on ${row.id} — ${w.kind}${medium ? ` (makes ${medium})` : ''} · ${w.model} · ${w.state}`,
      // ⚠️ FIRST, ABOVE THE KNOBS, because on a stale workflow the knob list below is the honest
      // answer to the wrong question: it is what this workflow took on the day it was installed,
      // and the one that replaced it takes something else.
      stale?.has(`${row.id}/${w.slug}`)
        ? '  ⚠ NO LONGER ON 📚 — this is the old shape of a workflow that has been replaced. What is'
          + ' listed below is what THIS copy takes; the current one takes something else.'
          + ' ▶ look: library for the id that replaces it, then ▶ take: it.'
        : '',
      w.notes ? `  ${w.notes}` : '',
      w.missing.length ? `  MISSING: ${w.missing.map((m) => m.file).join(', ')}` : '',
      w.inputs.includes('prompt') ? '' : '  TAKES NO WORDS — press it with an empty line',
      w.slots.length
        ? `  NEEDS ATTACHED: ${w.slots.join(' + ')} — you cannot attach one, so send them to the section`
        : '',
    ].filter(Boolean)

    if (!knobs.length) out.push('  Nothing to set — what it makes is the sentence and nothing else.')
    else {
      out.push(`  SET WITH ▶ make ${medium ?? '<medium>'} [key value, …]:`)
      for (const k of knobs) {
        const takes = k.choices?.length
          // ⚠️ ALL OF THEM, spelled exactly as the model compares them. This is the answer that
          // stops a render failing at prompt validation on "D Minor".
          ? `one of exactly: ${k.choices.join(' | ')}`
          : k.range
            ? `${k.range[0]}–${k.range[1]}${k.unit ? ` ${k.unit}` : ''}`
              + `${k.suggest?.length ? ` (usually ${k.suggest.join(', ')})` : ''}`
            // ⚠️ WHERE IT GOES, NOT JUST WHAT IT IS. A free-text knob may be a lyric sheet, and a
            // lyric sheet in the bracket splits on its own commas — so the answer to "what does
            // this take" has to carry the channel with it (readBlocks, src/xoko/grammar.ts).
            : `free text — write it in a \`\`\`${k.key} fence directly under the ▶ line, not in the bracket`
        // ⚠️ AND WHAT IT WILL RUN AT IF NOBODY SETS IT (2026-08-31). "Leave it out and it keeps the
        // published value" was true and useless without the value: told only the range, a brain
        // asked for something "a bit slower" has no idea what it is slower THAN, and a brain asked
        // for a careful track cannot tell that cfg is already at the turbo profile's 1.0.
        const now = k.published === undefined ? '' : `  [runs at ${JSON.stringify(k.published)}]`
        out.push(`    ${k.key} — ${takes}${now}`)
        out.push(`      ${k.what}`)
        // ⚠️ THE LIST IS A SHORTCUT, NOT AN EDGE. Said here as well as in the map, because this is
        // the answer somebody comes and asks when the map's line was not enough.
        if (k.subordinate) {
          out.push('      ⚠ this list NARROWS what the words already do — for anything not on it,'
            + ' say it in the description instead and leave this unset.')
        }
      }
      if (w.presets && Object.keys(w.presets).length) {
        // ⚠️ SOME KNOBS ONLY MEAN ANYTHING TOGETHER, and a brain handed them one at a time will
        // eventually set `cfg 3.5` on a step-distilled checkpoint and hand back a distorted track.
        out.push('  OR NAME A PRESET — a combination known to work, set as one:')
        for (const [name, values] of Object.entries(w.presets)) {
          out.push(`    ${name} — ${Object.entries(values).map(([k2, v]) => `${k2} ${v}`).join(', ')}`)
        }
      }
      out.push('    workflow — swap which path answers, by slug (▶ look: workflows)')
      out.push('  Leave out anything they did not ask for: an unset one runs at the value above.')
    }
    return out.join('\n')
  }
  return `Nothing installed here is called ${JSON.stringify(about)}. ▶ look: workflows for what is,`
    + ' or ▶ look: library for what could be taken.'
}

/**
 * 🔎 WHAT A ComfyUI NODE REALLY TAKES — `GET /object_info/<class>`, off the running service.
 *
 * ⚠️ THIS IS THE ANTI-GUESSING LOOK, AND THE COST OF NOT HAVING IT IS ON THE RECORD TWICE. `bpm`
 * shipped as 40–200 — a guess at what music sounds like — where the node's real range is 10–300,
 * so a legal 208 would have been refused by the app that invented the limit. And a voice workflow
 * published a `size` enum of `["0.6B","1.7B"]` remembered rather than read. Both are one request.
 *
 * ⚠️ IT IS THE ONE LOOK THAT LEAVES THIS MACHINE, and it stays inside the read-only rule at the top
 * of this file: `/object_info` describes, it does not queue, install or run anything. A service
 * that is not up is an answer — "it is not answering" — and never a throw at the caller.
 *
 * ⚠️ AND IT SEARCHES WHEN IT CANNOT MATCH. A ComfyUI with custom nodes has hundreds of classes and
 * nobody remembers whether the loader is `UNETLoader` or `UnetLoader`; a name that hits nothing
 * comes back as the classes whose names contain it, which is the next hop rather than a dead end.
 */
async function lookNode({ roots }: Sight, about: string): Promise<string> {
  const [service, ...rest] = about.trim().split(/\s+/)
  const wanted = rest.join(' ').trim()
  if (!service) {
    return 'Name a service and a node class: ▶ look: node <service> <NodeClass>.'
      + ' ▶ look: workflows lists the services installed here.'
  }
  const registry = await loadInferenceRegistry(roots)
  const row = registry.rows.find((r) => r.id === service)
  if (!row) {
    return `There is no service called ${JSON.stringify(service)} here.`
      + ` Installed: ${registry.rows.map((r) => r.id).join(', ') || 'none'}.`
  }
  const t = row.transport
  if (t?.kind !== 'comfy') {
    return `${service} is not a ComfyUI (${t?.kind ?? 'no transport'}), and node classes are`
      + ' ComfyUI\'s vocabulary. Only a comfy service can answer this.'
  }
  const base = `${t.tls ? 'https' : 'http'}://${t.host}:${t.port}${t.basePath ?? ''}`

  // ⚠️ A SHORT TIMEOUT AND A SENTENCE, NEVER A HANG. This runs inside a turn somebody is watching,
  // and a ComfyUI that is not up is an ordinary state of the world rather than a failure of the ask.
  const grab = async (path: string): Promise<Record<string, unknown>> => {
    const answer = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(8_000) })
    if (!answer.ok) throw new Error(`${service} answered ${answer.status} to ${path}`)
    return await answer.json() as Record<string, unknown>
  }

  if (!wanted) return `Name a node class too: ▶ look: node ${service} <NodeClass>.`

  let info: Record<string, unknown>
  try {
    info = await grab(`/object_info/${encodeURIComponent(wanted)}`)
  } catch (err) {
    return `${service} is not answering at ${base}: ${(err as Error).message}.`
      + ' It has to be running for this to be read rather than remembered.'
  }
  const node = info[wanted] as NodeInfo | undefined
  if (!node) {
    // Not there under that spelling. The whole list is one more request and turns a dead end into
    // the answer — custom node packs name things nobody would guess.
    try {
      const all = Object.keys(await grab('/object_info'))
      const near = all.filter((k) => k.toLowerCase().includes(wanted.toLowerCase()))
      return near.length
        ? `${service} has no ${wanted}. Classes with that in the name:\n`
          + near.slice(0, ROWS).map((k) => `  ${k}`).join('\n')
          + (near.length > ROWS ? `\n  …and ${near.length - ROWS} more` : '')
        : `${service} has no node class matching ${JSON.stringify(wanted)} — it lists ${all.length}.`
    } catch { /* the whole list is a nicety; the plain answer below is still true */ }
    return `${service} has no node class called ${JSON.stringify(wanted)}.`
  }

  const out = [
    `🔌 ${wanted} on ${service}${node.category ? ` — ${node.category}` : ''}`,
    node.description ? `  ${node.description}` : '',
    '  WIDGETS — a hole may point at any of these (`"<node id>.<input>"`):',
  ].filter(Boolean)

  // ⚠️ REQUIRED AND OPTIONAL BOTH, and marked. An optional widget is still a widget somebody may
  // want to set; what changes is whether leaving the hole unfilled is safe, which is exactly the
  // question a publisher is asking here.
  for (const which of ['required', 'optional'] as const) {
    for (const [key, spec] of Object.entries(node.input?.[which] ?? {})) {
      const line = widgetLine(key, spec)
      if (line) out.push(`    ${line}${which === 'optional' ? '  (optional)' : ''}`)
    }
  }
  out.push('  Copy the type, the range and the enum EXACTLY — a `choice` is compared string by'
    + ' string, and a range you narrow here refuses values the node would have taken.')
  return out.join('\n')
}

/** As much of ComfyUI's `/object_info` answer as a hole needs. Everything else it returns is about
 *  drawing the node in their own editor, which is none of our business. */
interface NodeInfo {
  readonly category?: string
  readonly description?: string
  readonly input?: Partial<Record<'required' | 'optional', Record<string, unknown>>>
}

/**
 * ONE WIDGET, AS A LINE.
 *
 * ComfyUI writes each input as `[type, options?]` — where `type` is a string (`"INT"`, `"STRING"`,
 * `"MODEL"`) or an ARRAY, which is how it spells an enum: the array IS the list of legal values.
 * A wire input (`MODEL`, `CLIP`, `LATENT`) is a socket another node plugs into and never a value
 * anybody types, so it is left out — a hole pointed at one would write a string where a connection
 * belongs.
 */
function widgetLine(key: string, spec: unknown): string | null {
  const [type, opts] = Array.isArray(spec) ? spec : [spec, undefined]
  const o = (opts ?? {}) as Record<string, unknown>
  const dflt = o['default']
  const shows = dflt === undefined ? '' : `, ships at ${JSON.stringify(dflt)}`

  if (Array.isArray(type)) {
    const all = type.map((v) => String(v))
    return `${key} — choice, one of exactly: ${all.join(' | ')}${shows}`
  }
  if (type === 'INT' || type === 'FLOAT') {
    const lo = o['min']
    const hi = o['max']
    const range = lo === undefined || hi === undefined ? 'no stated range' : `${lo}–${hi}`
    return `${key} — ${type === 'INT' ? 'integer' : 'number'}, ${range}${shows}`
  }
  if (type === 'STRING') {
    return `${key} — text${o['multiline'] ? ', multiline (prose or more)' : ''}${shows}`
  }
  if (type === 'BOOLEAN') return `${key} — boolean${shows}`
  // A socket. Named as one rather than dropped in silence: "where does the model go" is a real
  // question and the answer is "nowhere you may write".
  return `${key} — a ${String(type)} connection from another node, not a value you can fill`
}

async function lookWorkflows({ roots }: Sight, about: string): Promise<string> {
  const registry = await loadInferenceRegistry(roots)
  // What each row makes, for the service line below — the kinds are the authority, not the row.
  const { kinds } = await loadKinds(roots)
  // ⚠️ AND WHETHER 📚 STILL HAS EACH ONE (2026-08-23). The registry is a record of what was taken,
  // not of what exists: a workflow the library has since replaced sits here looking identical to a
  // current one, with the holes it had on the day it was taken. The list that answers "what can I
  // arm" has to say which of them are ghosts, or the answer is confidently out of date. The read
  // is cached and shared with the map (src/xoko/here.ts).
  const stale = await stalePublished(roots)
  const want = about.toLowerCase()
  const out: string[] = []
  let total = 0
  for (const row of registry.rows) {
    const cached = cachedCatalog(row.id)
    const resolved = resolveWorkflows(
      row, cached.engines, new Map(), new Set(), serviceFiles(row.id))
    const hits = want
      ? resolved.filter((w) => hay(w.slug, w.label, w.kind, w.model, w.notes).includes(want))
      : resolved
    total += hits.length
    if (!hits.length) continue
    // ⚠️ SEVERAL MEDIA ON ONE ROW IS THE NORMAL CASE. One ComfyUI serves pictures, songs, voices,
    // meshes and shots; the row never claimed one and now it does not have the field to claim it
    // with — this is read off the workflows (`mediaOf`, ../inference/kinds.ts).
    const makes = mediaOf(row, kinds)
    out.push(`  ${row.id}${row.label ? ` (${row.label})` : ''} · ${makes.join(', ') || 'nothing yet'}`)
    // ⚠️ THE LABEL IS ON THIS LINE, AND LEAVING IT OFF COST A RENDER (2026-08-31). 🔊 had two
    // `t2s` workflows and this list said `ambience · t2s · acestep…` beside `stable-audio · t2s ·
    // stable-audio-open…` — two model filenames, and nothing at all about which makes RAIN and
    // which makes a musical bed suggesting it. The one sentence that separates them is the label
    // the library already publishes, and it names the model in every published row — which is why
    // it takes the filename's place rather than sitting beside it. The NOTES stay in `▶ look:
    // workflow <slug>`: they run to a paragraph each, and this is the list you read BEFORE you know
    // which one you want.
    for (const w of hits.slice(0, ROWS)) {
      out.push(`    ${w.slug} · ${w.kind} · ${w.label} · ${w.state}`
        + (w.missing.length ? ` · MISSING ${w.missing.map((m) => m.file).join(', ')}` : '')
        + (w.inputs.includes('prompt') ? '' : ' · takes no words')
        + (stale?.has(`${row.id}/${w.slug}`)
          ? ' · ⚠ NO LONGER ON 📚 — this is the old shape of a workflow that was replaced;'
            + ' re-take it before setting anything on it'
          : ''))
    }
  }
  /**
   * ⚠️ WORDS ARE ALREADY ANSWERED, AND THIS LIST USED TO SAY OTHERWISE (2026-09-01).
   *
   * A brain row carries no workflows — it is a client, not a graph — so the loop above skips it
   * entirely and this answer read as four services, none of which does text, with six not-yet-taken
   * text connections underneath under "can add by name". A brain designing a chain read that
   * correctly and concluded a `text` step could not run: it told the person to take ollama or
   * openrouter before the chain would work, to write the words it was writing as it said so.
   *
   * A chain's `text` step names no engine and no workflow — the parser refuses one, because words are
   * xoko (src/compositions/says.ts). That is invisible from a list of graphs, so it is said here.
   */
  const brain = registry.rows.find((r) => r.role === 'brain')
  const words = brain
    ? `\n  words — answered by ${brain.label ?? brain.id} (${brain.id}), which is what xoko itself`
      + ' thinks with. A chain step that MAKES text names no service and no workflow: it runs on'
      + ' whichever brain is connected, and the parser refuses a step that tries to name one. You'
      + ' do not need to install anything to write words.'
    : '\n  words — NOTHING CONNECTED. A chain step that makes text has nothing to run on until a'
      + ' brain is connected in ✨ xoko.'

  // ⚠️ THE SHIPPED SERVICE LIST IS PART OF THIS ANSWER (2026-08-22), because a workflow is an
  // OVERRIDE ON A SERVICE ROW and an app with no rows can take none of them. Without this, the
  // honest reading of an empty machine is "nothing can be installed", and the one act that gets
  // it out of that state is invisible: these names are takeable, and they do not come off a
  // network (src/library/take.ts).
  const have = new Set(registry.rows.map((r) => r.id))
  const addable = SERVICE_PRESETS
    .filter((p) => !have.has(p.suggest))
    .map((p) => `    ${p.suggest} — ${p.what}`)
  const shipped = addable.length
    ? `\n  services this app can add by name, with no library involved — ▶ take: <name>\n`
      + addable.join('\n')
    : ''

  const head = `🔌 ${total} workflow${total === 1 ? '' : 's'} on ${registry.rows.length} service`
    + `${registry.rows.length === 1 ? '' : 's'}`
    + (want ? ` matching ${JSON.stringify(about)}` : '')
  if (!out.length) {
    return `${head}.\n  Nothing is installed yet. Workflows and styles come from 📚 the library`
      + ` — ▶ look: library — but a workflow sits ON a service, so a service comes first.`
      + `${words}${shipped}`
  }
  // ⚠️ WHICH ONE IS ARMED IS NOT IN HERE. That is a browser fact (it lives in the person's own
  // storage, per capability) and it is already in the map at the top of the question. Answering it
  // twice, from two places, is how the two come to disagree.
  return `${head}:\n${out.join('\n')}${words}${shipped}`
}

async function lookStyles({ roots }: Sight, about: string): Promise<string> {
  const want = about.toLowerCase()
  const out: string[] = []
  for (const medium of MEDIA) {
    const { styles } = await loadStyles(roots, medium)
    const hits = want
      ? styles.filter((s) => hay(s.slug, s.label, s.notes, s.positive, ...(s.tags ?? [])).includes(want))
      : styles
    out.push(hits.length
      ? `  ${medium} — ${hits.length}: ${hits.slice(0, ROWS).map((s) => s.slug).join(', ')}`
        + (hits.length > ROWS ? `, …and ${hits.length - ROWS} more` : '')
      : `  ${medium} — none`)
  }
  return `🎨 styles${want ? ` matching ${JSON.stringify(about)}` : ''}:\n${out.join('\n')}`
}

/**
 * 🧩 THE CHAINS, AND WHETHER THEY CAN RUN HERE.
 *
 * ⚠️ RESOLVED, NOT LISTED. "You own a-family-from-one-face" is a fact; "step 4 has nothing to
 * render it and ⤓ draw-things-grpc/sdxl-face would fix that" is the answer somebody can act on —
 * and it is the same resolution the 🧩 section draws, off the same function, so xoko cannot say
 * something the page contradicts.
 *
 * ⚠️ AND ONE NAMED CHAIN COMES BACK IN FULL. A list of four gives a line each; asking for one by
 * name gives every step, because "walk me through this" is the question a composition exists for.
 */
async function lookCompositions({ roots }: Sight, about: string): Promise<string> {
  const [registry, kinds, loaded] = await Promise.all([
    loadInferenceRegistry(roots), loadKinds(roots), loadCompositions(roots),
  ])
  const pool = candidates(
    registry.rows,
    (id) => cachedCatalog(id).engines,
    serviceFiles,
    (kind) => (kinds.kinds.find((k) => k.slug === kind)?.medium ?? null) as Medium | null,
  )
  const all = loaded.compositions.map((one) => resolveComposition(one, pool))
  const want = about.toLowerCase()
  const hits = want
    ? all.filter((one) => hay(one.slug, one.label, one.family, one.notes).includes(want))
    : all
  if (!all.length) {
    return '🧩 no compositions here yet. They come from 📚 the library — ▶ look: library'
      + ' — and taking one brings its workflows with it.'
  }
  const head = `🧩 ${all.length} composition${all.length === 1 ? '' : 's'}`
    + (want ? ` · ${hits.length} match ${JSON.stringify(about)}` : '')
  if (!hits.length) return `${head}.\n  nothing matched.`

  // One hit is a reading; several is a shelf.
  if (hits.length === 1) {
    const one = hits[0]!
    const lines = one.bindings.map((b, i) => {
      const step = b.step
      const how = isMake(step)
        ? `makes ${step.repeat && step.repeat > 1 ? `${step.repeat} × ` : ''}${step.makes}`
          + ` from ${Object.entries(step.inputs).map(([k, v]) => `${k}=${v}`).join(', ') || 'nothing'}`
        // ⚠️ THE LAST LINE IS WHAT THE CHAIN IS FOR. A composition that ends in a bind produces a
        // file rather than a trail, and a reading that stopped at "makes 12 images" would describe
        // the pages and never mention the book.
        : isBind(step)
          ? `BINDS ${step.parts}${step.captions ? ` + ${step.captions}` : ''} into one ${step.binds}`
          : `THEY CHOOSE one of ${step.pick}${step.asks ? ` — "${step.asks}"` : ''}`
      // ⚠️ A `text` STEP HAS NO WORKFLOW AND IS NOT MISSING ONE. Words are xoko — the brain already
      // armed in 🔌 — so the honest reading is who writes it, not `NOTHING: null`.
      const by = !isMake(step)
        ? ''
        : b.binding === 'xoko'
          ? ' → xoko writes it'
          : ` → ${b.workflow ? `${b.workflow} (${b.binding})` : `NOTHING: ${b.why}`}`
      return `  ${i + 1}. ${step.id} · ${how}${by}`
    })
    return [
      `🧩 ${one.label ?? one.slug}${one.family ? ` · ${one.family}` : ''} · ${one.ready ? 'READY' : 'not ready'}`,
      one.notes ? `  ${one.notes.replace(/\*\*/g, '')}` : '',
      ...lines,
      one.needs.length ? `  still needs: ${one.needs.join(', ')}` : '',
    ].filter(Boolean).join('\n')
  }

  const lines = hits.map((one) => `${one.slug} · ${one.family ?? 'composition'} · `
    + `${one.steps.length} steps · ${one.ready ? 'ready' : `needs ${one.needs.join(', ') || 'a workflow'}`}`)
  return `${head}:\n${rows(lines, lines.slice(0, ROWS), about, 'compositions')}`
}

function lookMade({ manifest }: Sight, about: string): string {
  const want = about.toLowerCase()
  const all = manifest.media
  const hits = want ? all.filter((g) => hay(g.slug, g.ask, g.medium).includes(want)) : all
  const per = new Map<string, number>()
  for (const g of all) per.set(g.medium, (per.get(g.medium) ?? 0) + g.cells.length)
  const tally = [...per].map(([m, n]) => `${m} ${n}`).join(' · ') || 'nothing yet'
  const head = `🖼 ${all.length} run${all.length === 1 ? '' : 's'} here (${tally})`
    + (want ? ` · ${hits.length} match ${JSON.stringify(about)}` : '')
  if (!hits.length) return `${head}.`
  // Newest first is the manifest's own order — the one order a library of one-off assets has.
  const lines = hits.map((g) => `${g.medium} · ${g.slug} · ${g.cells.length} file`
    + `${g.cells.length === 1 ? '' : 's'}${g.ask ? ` · "${g.ask.slice(0, 120)}"` : ''}`)
  return `${head}:\n${rows(lines, lines.slice(0, ROWS), about, 'made')}`
}
