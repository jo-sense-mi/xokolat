// WHAT THIS MACHINE HOLDS, PER MEDIUM — the server's half of the map.
//
// ⚠️ WHY THE MAP HAS TWO HALVES AND THIS IS ONE OF THEM. `web/lib/xoko-map.js` says what is
// ARMED, and it has to be the browser: which workflow answers a medium lives in the person's own
// storage, per capability, and the server has never seen it. What is INSTALLED and what is
// PUBLISHED are the opposite — disk and network, neither of which the browser should be asked to
// tally. So the browser says what would run, this says what there is to run it with, and the two
// are joined in src/server/app.ts.
//
// ⚠️ IT EXISTS BECAUSE A MEDIUM CAN BE MISSING MORE THAN ONE THING (2026-08-22). The map said
// `voice — NOTHING ARMED` and that was the whole story it could tell: nothing about the service
// underneath, nothing about the eight voices sitting on the library waiting to be taken. A brain
// reading it takes a workflow, watches the line flip to ARMED, and calls the job done — which is
// exactly how 🗣 ends up able to speak in precisely one voice again. Three layers have to be
// visible or only the middle one gets installed:
//
//   a SERVICE   the machine — comfyui, draw-things-grpc. Ships with the app, needs no library.
//   a WORKFLOW    the path through it — `voice`, `song`, `mesh`. From 📚.
//   a STYLE     what it comes out as — a look, a voice. From 📚, and for 🗣 it is the point.
//
// ⚠️ FOUR LINES, FOREVER. One per generated medium. Everything unbounded is `▶ look:` — the
// library, the workflows, the styles — and that split is the reason a map of a machine with three
// thousand assets on it is still short enough to send every turn.
//
// ⚠️ AND EACH LINE ANSWERS "CAN I?", NOT "HOW MANY" (2026-08-23). It used to print tallies —
// `voice — 1 workflow and 8 styles installed here · 📚 has 3 workflows still to take` — and a count is
// not a capability: a brain reading it has to work out what the numbers imply, and it worked it out
// wrong in both directions. It promised renders on a medium with a workflow installed and no service
// running, and it reported a dead end on a medium whose only missing piece was one ⤓ away. So each
// line now says READY or NOT YET, and when NOT YET it names THE ONE ACT that changes the answer, as
// an id read off the live index rather than a number to interpret.
//
// ⚠️ AND UNREACHABLE IS `unknown`, NEVER ZERO. This is the bug that cost a whole conversation. When
// the library could not be read, the tally quietly fell back to nothing and every medium printed
// "nothing left on 📚 for it" — a false sentence, handed to xoko every turn, directly under a
// header that said the library was unreachable. It repeated the false half, because the specific
// claim beats the general one. A thing you have not been told is not a thing that is absent.

import { cachedCatalog, serviceFiles } from '../inference/catalog.ts'
import { loadKinds } from '../inference/kinds.ts'
import { resolveWorkflows } from '../inference/workflows.ts'
import { loadInferenceRegistry } from '../inference/registry.ts'
import type { LibraryItem } from '../library/catalog.ts'
import { libraryReach, readLibrary } from '../library/catalog.ts'
import type { Roots } from '../paths.ts'
import type { Medium } from '../types/medium.ts'
import { MEDIA } from '../types/medium.ts'
import { loadStyles } from '../styles/registry.ts'

/** What is installed here that can make each medium, and whether it could actually be run. */
interface Installed {
  readonly workflows: readonly string[]
  /** A workflow is only an answer if its service answered. A row nobody has reached is a machine
   *  that is not there, and promising a render on it is the failure this whole file guards. */
  readonly reachable: boolean
  /**
   * IS ANY OF THEM PRESSABLE FROM A SENTENCE ALONE?
   *
   * ⚠️ THE QUESTION THE MAP WAS NOT ASKING (2026-08-24). A medium with only a picture-in workflow
   * installed — a cutout daemon, or the tracer the retired ✒ vector had — read `READY` and was
   * not: none of xoko's verbs can put a file on the tray, so "make me a chick" came back "attach a
   * picture first". READY has to mean READY FOR THE THING BEING ASKED.
   */
  readonly wordy: boolean
}

async function installedPerMedium(roots: Roots): Promise<Map<Medium, Installed>> {
  const [registry, { kinds }] = await Promise.all([loadInferenceRegistry(roots), loadKinds(roots)])
  const mediumOf = new Map(kinds.map((k) => [k.slug, k.medium]))
  const by = new Map<Medium, { workflows: string[]; reachable: boolean; wordy: boolean }>()
  for (const row of registry.rows) {
    if ((row.role ?? 'generator') !== 'generator') continue
    const catalog = cachedCatalog(row.id)
    for (const w of resolveWorkflows(row, catalog.engines, new Map(), new Set(), serviceFiles(row.id))) {
      // ⚠️ THE KIND SAYS WHAT IT MAKES, and now it is the only thing that does — the row's own
      // medium is gone, because one ComfyUI answers for five and could never name one.
      const makes = mediumOf.get(w.kind) as Medium | undefined
      if (!makes) continue
      const seen = by.get(makes) ?? { workflows: [], reachable: false, wordy: false }
      seen.workflows.push(`${row.id}/${w.slug}`)
      // A workflow that reads the sentence and needs nothing attached is one xoko can actually press.
      if (w.inputs.includes('prompt') && !w.slots.length) seen.wordy = true
      // ⚠️ `missing` IS NOT THE TEST, `error` IS. A workflow with every file present on a service
      // that is switched off is not ready; a workflow whose service was never asked is unknown, and
      // is counted optimistically because absent evidence is not evidence of absence.
      if (!catalog.error) seen.reachable = true
      by.set(makes, seen)
    }
  }
  return by
}

/**
 * WHAT THIS MACHINE HOLDS THAT 📚 NO LONGER PUBLISHES — `null` when 📚 could not be read.
 *
 * ⚠️ `null` IS NOT AN EMPTY SET, and the distinction is the whole point (same rule as `Shelf.
 * unknown`). A library that did not answer has not told us every workflow here is current; marking
 * nothing is the only honest output, and marking everything would condemn a working machine on the
 * strength of a failed fetch.
 *
 * ⚠️ AN IMPLIED WORKFLOW IS NEVER STALE. It is not on 📚 because it was never published — it follows
 * from a model this build already speaks (`resolveWorkflows`), so measuring it against the library
 * would flag every one of them forever.
 */
export async function stalePublished(roots: Roots): Promise<Set<string> | null> {
  const [registry, shelf] = await Promise.all([loadInferenceRegistry(roots), stillToTake(roots)])
  if (shelf.unknown) return null
  const gone = new Set<string>()
  for (const row of registry.rows) {
    for (const w of resolveWorkflows(
      row, cachedCatalog(row.id).engines, new Map(), new Set(), serviceFiles(row.id))) {
      const id = `${row.id}/${w.slug}`
      if (!shelf.published.has(id)) gone.add(id)
    }
  }
  return gone
}

/**
 * The block, ready to be pasted under the browser's map.
 *
 * Every line is one medium and answers the only question worth asking about it: can something be
 * made here, and if not, what is the next thing to do.
 */
export async function holdings(
  roots: Roots, picked: ReadonlyMap<string, string> = new Map(),
): Promise<string> {
  const reach = await libraryReach()
  const [installed, shelf] = await Promise.all([installedPerMedium(roots), stillToTake(roots)])

  const lines: string[] = []
  for (const medium of MEDIA) {
    lines.push(
      `  ${medium} — ${await line(roots, medium, installed.get(medium), shelf, picked.get(medium))}`)
  }

  return [
    reach,
    'PER MEDIUM — can it be made here, and if not, the ONE thing that would change that. A service'
      + ' is the machine, a workflow is the path through it, a style is what it comes out as.'
      + ' ▶ look: workflows · styles · library for the names.',
    ...lines,
    // ⚠️ ONE LINE FOR THE OTHER NOUN (2026-08-24). The map had SEVEN media and nothing about
    // chains, so a brain reading it every turn was never told they existed, let alone that they can
    // be taken — and when somebody asked outright it looked at the library, read a stale sentence
    // there saying the app could not take one, and repeated it. A composition is the noun that
    // makes anything bigger than one press, and it is taken exactly like a workflow.
    `  🧩 compositions — ${chains(shelf)}`,
  ].join('\n')
}

/** 🧩 THE OTHER NOUN, IN ONE SENTENCE — a chain is taken exactly like a workflow. */
function chains(shelf: Shelf): string {
  if (shelf.unknown) return '📚 cannot be read from here, so what it publishes is unknown'
  if (!shelf.compositions.length) {
    return shelf.installed.length
      ? `${shelf.installed.join(', ')} installed here, and 📚 publishes none you have not got`
      : 'none installed, and 📚 publishes none'
  }
  const here = shelf.installed.length ? `${shelf.installed.join(', ')} installed here. ` : ''
  return `${here}📚 still has ${shelf.compositions.join(', ')} — ▶ take: any of them, exactly like a`
    + ' workflow. A chain brings the workflows its steps need with it.'
}

/**
 * ONE MEDIUM, IN ONE SENTENCE.
 *
 * ⚠️ IT NAMES ONE NEXT STEP, NOT ALL OF THEM. Setting a medium up is three layers deep and a line
 * that lists all three is a line that gets read as three separate problems: 🗣 was installed one
 * layer at a time for exactly that reason — a brain took the workflow, watched the line change, and
 * stopped, with eight voices still sitting on the library. The first missing thing is the only
 * thing that can be done next, and the line comes back changed once it is done.
 */
async function line(
  roots: Roots, medium: Medium, have: Installed | undefined,
  shelf: Shelf, picked: string | undefined,
): Promise<string> {
  const list = (await loadStyles(roots, medium as Medium)).styles
  const styles = list.length
  const inForce = picked ? list.find((s) => s.slug === picked) : undefined

  if (!have?.workflows.length) {
    // Nothing here makes it at all. What unblocks it is a workflow, and if the library is readable
    // there is a real id to name rather than an instruction to go looking.
    const pick = shelf.workflows.get(medium)
    if (shelf.unknown) {
      return 'NOT YET — nothing installed makes it, and 📚 cannot be read from here, so whether'
        + ' there is one to take is unknown'
    }
    if (!pick) return 'NOT YET — nothing installed makes it, and 📚 publishes nothing for it either'
    // ⚠️ A DEAD END IS NAMED AS ONE. `stillToTake` deliberately keeps rows that cannot be taken,
    // on the grounds that the refusal is itself the next step — which was only ever true when the
    // refusal named a next step. One kind still cannot: a workflow on a service this app ships no
    // preset for is not a first step, it is a wall, and saying "▶ take: it is the one thing that
    // would" spends a turn to arrive back here.
    if (pick.blocked) {
      return `NOT YET — nothing installed makes it. 📚 has ${pick.id} and it cannot land here:`
        + ` ${pick.blocked}`
    }
    // ⚠️ AND THE SERVICE COMES WITH IT, SAID OUT LOUD. On an empty machine this line named a
    // workflow on a service that did not exist, four times, and four takes were refused with a
    // sentence containing no way to get one. The take installs the shipped preset itself now
    // (`takeWorkflow`) — so the act named here really is the whole act, and what else it does to
    // this machine is disclosed rather than discovered.
    return `NOT YET — nothing installed makes it. ▶ take: ${pick.id} is the one thing that would`
      + (pick.brings ? ` — it brings the ${pick.brings} service with it, which is not here yet` : '')
  }

  // ⚠️ WHAT IS INSTALLED AND NO LONGER PUBLISHED, BEFORE ANYTHING ELSE ABOUT THIS MEDIUM. A stale
  // workflow is not a smaller version of a working one: its holes are whatever they were on the day
  // it was taken, so it refuses knobs the current one has and accepts none of the new ones, and
  // every message about it is precise and wrong. It goes first because it is the explanation for
  // whatever happens next, and it names the replacement so the fix is one line.
  const gone = have.workflows.filter((id) => !shelf.published.has(id))
  const stale = (!shelf.unknown && gone.length)
    ? ` ⚠ ${gone.join(', ')} ${gone.length === 1 ? 'is' : 'are'} installed here and 📚 no longer`
      + ` publishes ${gone.length === 1 ? 'it' : 'them'} — replaced. What is on this machine is the`
      + ' shape it had on the day it was taken, so a knob the current workflow has may be refused by'
      + ' name here, and one it no longer has may be accepted and ignored.'
      + (shelf.workflows.get(medium)
        ? ` ▶ take: ${shelf.workflows.get(medium)!.id} replaces ${gone.length === 1 ? 'it' : 'them'}.`
        : '')
    : ''

  if (!have.reachable) {
    // ⚠️ THE FAILURE THAT READ AS SUCCESS. A workflow on a service that is not answering used to
    // print as installed, and a brain promised a render that came back "could not reach it".
    return `NOT YET — ${have.workflows.join(', ')} installed, but the service is not answering.`
      + ' Nothing here can run until it is up; taking more will not help' + stale
  }

  // ⚠️ NOTHING HERE READS A SENTENCE, WHICH IS NOT THE SAME AS NOTHING HERE (2026-08-24). Every
  // workflow installed for this medium wants a picture attached, and none of xoko's four verbs can
  // put one on the tray — so from a sentence this medium is as unusable as an empty one, and
  // saying READY is how somebody was told "Making that now" and then handed a refusal. The act
  // that changes it is a workflow that takes words; it is named when 📚 has one.
  if (!have.wordy) {
    const pick = shelf.workflows.get(medium)
    const from = ` — ${have.workflows.join(', ')} ${have.workflows.length === 1 ? 'is' : 'are'} here and`
      + ' every one of them needs a picture ATTACHED, which nothing you can do puts on the bar'
    if (pick?.wordy && !pick.blocked) {
      return `NOT FROM WORDS${from}. ▶ take: ${pick.id} makes it from a sentence`
        + (pick.brings ? ` — it brings the ${pick.brings} service with it, which is not here yet` : '')
        + stale
    }
    return `FROM A PICTURE ONLY${from}. Ask the person to drop one on the bar`
      + (shelf.unknown ? ', or ▶ look: library once it can be read' : '') + stale
  }

  const ready = `READY — ${have.workflows.join(', ')}${armedLook(inForce)}`
  // The one thing worth adding once it works: a medium whose sentence is a SCRIPT reads everything
  // in the workflow's own voice until a style is chosen, which is the gap that is worth naming.
  const more = shelf.styles.get(medium)
  if (!styles && more) return `${ready}, and no styles — everything comes out the workflow's own way. ▶ take: ${more}${stale}`
  if (!styles && shelf.unknown) return `${ready}, and no styles — everything comes out the workflow's own way${stale}`
  return `${ready} · ${styles} style${styles === 1 ? '' : 's'} to choose from${stale}`
}

/**
 * THE LOOK ALREADY IN FORCE, AND ITS ACTUAL WORDS — what ▶ would come out as if nothing else is
 * said. Empty when the picker is on none, which is most media most of the time.
 *
 * ⚠️ THE WORDS, NOT THE SLUG (2026-08-30). A slug alone is a name to relay; the words are the only
 * form a brain can WRITE AGAINST. The press this exists for asked for papercut and got a
 * photograph, and half of why was that xoko had written "water droplets frozen in the air, sunlight
 * glinting off the spray" — a photographic ask, composed with no idea a cut-paper look was armed.
 * Sent this line it can write a subject the style can survive, or say plainly that the two fight.
 *
 * ⚠️ AND IT IS NOT AN INSTRUCTION TO NAME IT. `▶ make <medium>/<style>` OVERRIDES this — the point
 * of the line is the opposite: this is what happens when the slash half is left off, which is what
 * xoko should normally do with a style the person already chose.
 */
function armedLook(style: { slug: string; positive?: string; tags?: readonly string[] } | undefined) {
  if (!style) return ''
  const words = style.positive?.trim() || (style.tags ?? []).join(', ')
  return ` · in the ${style.slug} style already${words ? ` — "${words.slice(0, 240)}"` : ''}`
    + ', so write the ask to suit it and leave the slash half off unless they want another'
}

/**
 * WHAT 📚 WOULD STILL ADD — ONE id per medium per kind, not a count.
 *
 * ⚠️ NOT "WHAT IS PUBLISHED". A shelf line that counts everything says "📚 has 8 styles for it" to
 * somebody who has already taken six of them, and the one number a brain would act on is the one
 * that is wrong. `readLibrary` has already worked out what is installed, row by row.
 *
 * ⚠️ AND `unknown` IS A FIELD, because it is a different answer from an empty map. A library that
 * cannot be read has not told us there is nothing; it has not told us anything.
 */
/** One id, and what taking it would ALSO install — see `ItemState.brings`. */
interface Pick {
  readonly id: string
  readonly brings: string | null
  /** No service and no preset behind it: naming this act would be naming a dead end. */
  readonly blocked: string | null
  /** Its only input is the sentence. */
  readonly wordy: boolean
}

interface Shelf {
  readonly workflows: Map<string, Pick>
  readonly styles: Map<string, string>
  /** 🧩 chains 📚 publishes that are not on this machine — ids, not a count. */
  readonly compositions: readonly string[]
  /** 🧩 chains that are. */
  readonly installed: readonly string[]
  /**
   * EVERY WORKFLOW ID 📚 PUBLISHES, taken or not — which is the only way to notice one that is
   * installed here and is NOT on it any more.
   *
   * ⚠️ THIS IS THE BUG THAT COST THE SECOND CONVERSATION (2026-08-23). A take writes a workflow into
   * this machine's registry and nothing ever revisits it, so when the library replaced six narrow
   * music workflows with one that exposes twenty widgets, the machine went on holding `music-sung`
   * and `music-light` — slugs that no longer exist anywhere — and every line of the map, every
   * `look: workflows`, and the ⚙ pane all agreed they were fine. The failure surfaced as a refusal
   * naming five knobs, which is a true sentence about a dead workflow and a completely misleading
   * one about this app. What is gone has to be VISIBLE, or the next act is aimed at a ghost.
   */
  readonly published: Set<string>
  readonly unknown: boolean
}

async function stillToTake(roots: Roots): Promise<Shelf> {
  const workflows = new Map<string, Pick>()
  const styles = new Map<string, string>()
  const published = new Set<string>()
  const compositions: string[] = []
  const installed: string[] = []
  let items: readonly LibraryItem[] = []
  try {
    const view = await readLibrary(roots)
    // ⚠️ IT DOES NOT THROW, AND THAT IS WHY THE FIRST FIX HERE DID NOT WORK (2026-08-23). An
    // unreachable library comes back as a normal answer carrying `issue` and an empty list, so a
    // bare try/catch caught nothing and the empty list read as "the shelf is empty" — the exact
    // false sentence this function exists to stop printing. The same test `libraryReach` uses: an
    // issue WITH nothing to show is silence; an issue with rows is a stale read worth using.
    if (view.issue && view.items.length === 0) {
      return { workflows, styles, compositions, installed, published, unknown: true }
    }
    items = view.items
  } catch {
    return { workflows, styles, compositions, installed, published, unknown: true }
  }
  for (const item of items) {
    if (item.type === 'workflow') published.add(item.id)
    // ⚠️ NOT-YET-TAKEABLE STILL COUNTS. On an EMPTY machine every ComfyUI workflow reads `cannot
    // take: no service called "comfyui"` — filtering those out would say the library had nothing
    // for music when it had the only workflow that makes a song. A row that needs a service first is
    // the strongest possible reason to mention it: the take refuses BY NAME and names the service,
    // which is the next step rather than a dead end.
    if (item.type === 'composition') {
      (item.app.installed ? installed : compositions).push(item.id)
      continue
    }
    if (item.app.installed) continue
    // First wins, and the library publishes newest-first — so the id named is the one whose card
    // sits at the top of the page they would be sent to.
    if (item.type === 'workflow') {
      const wordy = item.inputs.includes('prompt') && item.inputs.every((i) => i === 'prompt')
      for (const m of item.media) {
        // ⚠️ A WORKFLOW A SENTENCE CAN PRESS BEATS ONE NEWER (2026-08-24). This was "first wins,
        // and the library publishes newest-first", which named the newest workflow for a medium even
        // when its only input was a picture. xoko took it, exactly as told, and the medium was no
        // more usable than before: none of its verbs can put a file on the tray. The map's
        // job is to name THE ONE ACT THAT CHANGES THE ANSWER, and an act that leaves the answer
        // where it was is worse than no suggestion, because it is spent.
        const had = workflows.get(m)
        if (had && (!wordy || had.wordy)) continue
        workflows.set(m, {
          id: item.id,
          brings: item.app.brings,
          blocked: item.app.takeable ? null : item.app.why,
          wordy,
        })
      }
      continue
    }
    for (const m of item.media) if (!styles.has(m)) styles.set(m, item.id)
  }
  return { workflows, styles, compositions, installed, published, unknown: false }
}
