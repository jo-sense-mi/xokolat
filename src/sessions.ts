// A CONVERSATION, OWNED BY THIS APP — not by the client that answers it.
//
// ⚠️ WHY NOT `claude --resume`. Every command-line client that can resume keeps the transcript in
// its OWN store, in its own shape, and hands you a handle. Take that and three things follow: the
// conversation lives somewhere xokolat cannot read, edit or delete; Ollama has no equivalent, so a
// brain would behave differently depending on which one you armed; and what the model was told
// stops being visible. The whole transcript travels on every question instead. It costs a few kB
// a turn, every brain behaves identically, and you can read exactly what it knows.
//
// ⚠️ AND UNTIL TODAY NOBODY OWNED IT (2026-08-21). It was module state in the browser — a reload
// erased it, there was one of it, and turn 13 silently deleted turn 1. The bound was real (12
// turns, 4000 chars a side) so nothing ever ran away, but it was enforced by AMNESIA: what you
// settled at the start simply stopped existing, with no trace and no way back.
//
// So: a session is a file, and this is the only module that knows its shape.

import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'

import { resolveIn } from './paths.ts'
import type { Roots } from './paths.ts'

export const SESSIONS_DIR = 'sessions'

export interface Turn {
  readonly said: string
  readonly answered: string
  /** ⚠️ TRUE FOR A FOLD, and it is deliberately a TURN rather than a field beside them. A summary
   *  is a thing that was said in this conversation — it prints in the transcript, it travels with
   *  the next question, and you can read the exact words the model was handed. A summary you
   *  cannot see is the hidden state we refused vendor sessions to avoid. */
  readonly summary?: boolean
}

export interface Session {
  readonly id: string
  /** The first question, trimmed — a name nobody had to invent. */
  readonly title: string
  readonly turns: readonly Turn[]
  readonly createdAt: string
  readonly updatedAt: string
}

/** What a list shows: enough to choose between conversations, without reading any of them. */
export interface SessionHead {
  readonly id: string
  readonly title: string
  readonly turns: number
  /** ⚠️ CHARACTERS, AND SAID AS CHARACTERS. There is no tokenizer in this app and ~4 chars a token
   *  is a rule of thumb, not a measurement. Printing a token count we cannot compute would be a
   *  precise-looking number that is wrong; this one is exact and the reader can divide. */
  readonly chars: number
  readonly updatedAt: string
}

/** How much of this conversation travels with the next question. */
export const sessionChars = (turns: readonly Turn[]): number =>
  turns.reduce((n, t) => n + t.said.length + t.answered.length, 0)

const dir = (roots: Roots): string => resolveIn(roots.data, SESSIONS_DIR)
const file = (roots: Roots, id: string): string => resolveIn(dir(roots), `${safeId(id)}.json`)

/**
 * ⚠️ THE ID IS CHECKED BEFORE IT IS A PATH (§15 rule 2). It arrives from a browser, so it is a
 * name a stranger chose: anything but the shape this module writes is refused rather than
 * sanitised, because a sanitised `../../` is still somebody trying.
 */
function safeId(id: string): string {
  if (!/^[a-z0-9-]{6,64}$/i.test(id)) throw new Error(`not a session id: ${JSON.stringify(id)}`)
  return id
}

const head = (s: Session): SessionHead => ({
  id: s.id, title: s.title, turns: s.turns.length,
  chars: sessionChars(s.turns), updatedAt: s.updatedAt,
})

/** Newest first — the one you were in is the one you want. */
export async function listSessions(roots: Roots): Promise<SessionHead[]> {
  let names: string[]
  try {
    names = (await readdir(dir(roots))).filter((n) => n.endsWith('.json'))
  } catch { return [] }
  const out: SessionHead[] = []
  for (const name of names) {
    const s = await readSession(roots, name.slice(0, -'.json'.length)).catch(() => null)
    if (s) out.push(head(s))
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/**
 * One session, or null.
 *
 * ⚠️ A FILE THAT WILL NOT PARSE IS NOT A CRASH. It is one conversation, it is not the user's work,
 * and the app has to keep running — so it reads as absent and the next write replaces it.
 */
export async function readSession(roots: Roots, id: string): Promise<Session | null> {
  let raw: string
  try { raw = await readFile(file(roots, id), 'utf-8') } catch { return null }
  try {
    const o = JSON.parse(raw) as Partial<Session>
    if (typeof o.id !== 'string' || !Array.isArray(o.turns)) return null
    return {
      id: o.id,
      title: typeof o.title === 'string' ? o.title : 'a conversation',
      turns: o.turns.filter((t): t is Turn =>
        !!t && typeof t.said === 'string' && typeof t.answered === 'string'),
      createdAt: typeof o.createdAt === 'string' ? o.createdAt : new Date().toISOString(),
      updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : new Date().toISOString(),
    }
  } catch { return null }
}

export async function writeSession(roots: Roots, s: Session): Promise<SessionHead> {
  const next: Session = { ...s, updatedAt: new Date().toISOString() }
  await mkdir(dir(roots), { recursive: true })
  await writeFile(file(roots, next.id), `${JSON.stringify(next, null, 2)}\n`)
  return head(next)
}

/** A new, empty conversation. Named by its first question later — see `titleFrom`. */
export function newSession(): Session {
  const now = new Date().toISOString()
  return { id: randomUUID(), title: 'a new conversation', turns: [], createdAt: now, updatedAt: now }
}

/** ⚠️ NO CONFIRMATION AND NO UNDO, like every other ✕ in this app (DECISIONS.md, 2026-08-03). */
export async function removeSession(roots: Roots, id: string): Promise<boolean> {
  try { await rm(file(roots, id)); return true } catch { return false }
}

/** The first thing you asked, as a name. Long enough to tell two apart, short enough for a row. */
export const titleFrom = (said: string): string => {
  const one = said.replace(/\s+/g, ' ').trim()
  return one.length > 60 ? `${one.slice(0, 57)}…` : (one || 'a conversation')
}

/**
 * WHAT TO FOLD AND WHAT TO KEEP.
 *
 * ⚠️ THE RECENT TURNS STAY VERBATIM. A summary of what you said thirty seconds ago is a worse
 * version of a thing we still have; the value of folding is entirely in the old half. `keep` is
 * the number of exchanges left untouched at the end.
 *
 * ⚠️ AND AN EXISTING SUMMARY FOLDS INTO THE NEXT ONE rather than accumulating beside it. Otherwise
 * a long session grows a stack of summaries of summaries, each one costing what it saved.
 */
export function foldPoint(
  turns: readonly Turn[], keep: number,
): { older: readonly Turn[]; recent: readonly Turn[] } {
  const at = Math.max(0, turns.length - keep)
  return { older: turns.slice(0, at), recent: turns.slice(at) }
}
