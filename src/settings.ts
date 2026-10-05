// SETTINGS — the small set of things the user gets to decide about the app itself.
//
// ⚠️ SETTINGS IS A GROUP OF SECTIONS, not one page (DECISIONS.md, 2026-08-03): 📁 library ·
// 🖼 media · 🔌 inference · 🧩 engines. This file holds the two that are stored — where the
// library is, and what quality each medium is written at — and they are kept apart on purpose:
// the library section answers *where your work lives*, quality answers *how it is written*.
//
// The shape of the answers matters more than the number of fields:
//
// ⚠️ ONE LIBRARY, NEVER SEVERAL. Lightroom-style "which catalog?" is where a configurable path
// gets genuinely expensive — every feature afterwards grows a "which one?" question. The thing
// to refuse is N roots, not a configurable one (DECISIONS.md).
//
// ⚠️ THE SETTING LIVES IN APP DATA, which is NOT configurable. It cannot live in the folder it
// names, and app data is the one root that is allowed to be boring and fixed.
//
// ⚠️ CHANGING IT NEVER MOVES FILES. New work goes to the new place; the old library stays
// exactly where it is, and the UI says so. An app that moves gigabytes because someone picked a
// folder is an app nobody trusts twice.

import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, relative, resolve, sep } from 'node:path'

import { contentLockedByEnv, defaultContentRoot, resolveIn } from './paths.ts'
import type { Roots } from './paths.ts'
import { MEDIA } from './types/medium.ts'
import type { Medium } from './types/medium.ts'
import { isQualityLevel } from './types/quality.ts'
import { asObject, asString, ctx, issue, noStrayKeys } from './validate.ts'

/** What each medium is written at. Absent = that medium's fallback; see `src/types/quality.ts`,
 *  which is the one place levels are declared. */
export type QualityChoices = Readonly<Partial<Record<Medium, string>>>

export const SETTINGS_FILE = 'settings.json'

export interface Settings {
  /** Absolute. Null = use the default. */
  readonly contentRoot: string | null
  /**
   * Per-medium quality — the 🖼 media section.
   *
   * ⚠️ A MEDIUM setting, not a per-run one. A folder where some masters are exact and some are
   * not, for reasons nobody remembers a month later, is worse than either choice made once.
   */
  readonly quality: QualityChoices
}

export const EMPTY_SETTINGS: Settings = { contentRoot: null, quality: {} }

/** What actually goes in the file: only what DIFFERS from the default. A settings file that
 *  spells out every default is a file that pins them — and this one is meant to be readable by
 *  hand, where three lines of `false` are noise. */
const toFile = (s: Settings): Record<string, unknown> => ({
  ...(s.contentRoot ? { contentRoot: s.contentRoot } : {}),
  ...(Object.keys(s.quality).length ? { quality: s.quality } : {}),
})

/** Read `<data>/settings.json`. A missing file is the normal case on a fresh machine; a broken
 *  one is reported and then ignored, because refusing to start over a settings file is how a
 *  user ends up unable to reach the settings that would fix it. */
export async function readSettings(dataRoot: string): Promise<{
  settings: Settings; issues: string[]
}> {
  const file = resolveIn(dataRoot, SETTINGS_FILE)
  let text: string
  try {
    text = await readFile(file, 'utf-8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { settings: EMPTY_SETTINGS, issues: [] }
    return { settings: EMPTY_SETTINGS, issues: [`${file}: ${(err as Error).message}`] }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    return { settings: EMPTY_SETTINGS, issues: [`${file}: not valid JSON — ${(err as Error).message}`] }
  }
  const c = ctx(file)
  const o = asObject(c, parsed, '')
  if (!o) return { settings: EMPTY_SETTINGS, issues: c.issues }
  noStrayKeys(c, o, '', ['contentRoot', 'quality'] satisfies readonly (keyof Settings)[])
  const contentRoot = o['contentRoot'] === undefined || o['contentRoot'] === null
    ? null
    : asString(c, o['contentRoot'], 'contentRoot') ?? null
  // Absent is the normal case, not an error: the file only holds what differs from the default.
  const quality = o['quality'] === undefined || o['quality'] === null
    ? {}
    : parseQuality(c, o['quality'])
  return { settings: { contentRoot, quality }, issues: c.issues }
}

/** A level this app does not declare is REPORTED and dropped, never clamped to something near it
 *  — the same discipline as `caps`. A settings file naming a level from a future version should
 *  say so rather than silently render at a quality nobody asked for. */
function parseQuality(c: ReturnType<typeof ctx>, v: unknown): QualityChoices {
  const o = asObject(c, v, 'quality')
  if (!o) return {}
  const out: Partial<Record<Medium, string>> = {}
  for (const [key, value] of Object.entries(o)) {
    if (!(MEDIA as readonly string[]).includes(key)) {
      issue(c, `quality.${key}`, 'not a medium this app generates')
      continue
    }
    const medium = key as Medium
    const level = asString(c, value, `quality.${key}`)
    if (level === undefined) continue
    if (!isQualityLevel(medium, level)) {
      issue(c, `quality.${key}`, `${JSON.stringify(level)} is not a quality ${medium} offers`)
      continue
    }
    out[medium] = level
  }
  return out
}

/** Storing the default AS a value would make the app report "custom" for a path it chose itself
 *  — and would silently pin the old default if it ever changes. A choice equal to the default is
 *  stored as no choice at all. */
export function normalize(settings: Settings): Settings {
  if (settings.contentRoot && resolve(settings.contentRoot) === resolve(defaultContentRoot())) {
    return { ...settings, contentRoot: null }
  }
  return settings
}

export async function writeSettings(dataRoot: string, settings: Settings): Promise<void> {
  await mkdir(dataRoot, { recursive: true })
  const payload = toFile(normalize(settings))
  await writeFile(resolveIn(dataRoot, SETTINGS_FILE), `${JSON.stringify(payload, null, 2)}\n`)
}

/** Env beats the setting beats the default. Env wins because it is the dev override and a dev
 *  who set it wants it honoured; the UI shows that it is locked rather than pretending. */
export function applySettings(base: Roots, settings: Settings): Roots {
  if (contentLockedByEnv() || !settings.contentRoot) return base
  return { ...base, content: settings.contentRoot }
}

const isInside = (parent: string, child: string): boolean => {
  const rel = relative(resolve(parent), resolve(child))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/**
 * Is this somewhere a library may live? Returns a human sentence, or null when it is fine.
 *
 * ⚠️ The home directory and the filesystem root are REFUSED. Everything under the content root
 * is served over `/content/…`, and this app is reachable over a tailnet — pointing it at `~`
 * would publish the whole home directory to anything that can reach the port.
 */
export function checkContentRoot(base: Roots, candidate: string): string | null {
  if (!candidate.trim()) return 'a folder is required'
  if (!isAbsolute(candidate)) return 'that has to be a full path, starting from /'
  const dir = resolve(candidate)
  if (dir === resolve(sep) || dir === resolve(homedir())) {
    return 'not that one — everything under this folder is served by the app, so it has to be a folder you made for it'
  }
  if (dir === resolve(base.data)) {
    return 'that is the app\'s own data folder — pick a folder for your work instead'
  }
  if (isInside(base.install, dir)) {
    return 'not inside the app itself — an update replaces that folder, and a packaged app cannot write to it'
  }
  return null
}

/**
 * Make sure the library folder is there and writable. Returns a human sentence, or null.
 *
 * ⚠️ CALLED AT EVERY STARTUP, and its failure is NOT fatal. A chosen path can stop being valid —
 * an unmounted drive, a renamed folder, an offline share — and an app that refuses to start is
 * an app the user cannot reach the settings of. It starts, says exactly what is wrong, and the
 * 📁 section is where they fix it.
 */
export async function ensureContentRoot(dir: string): Promise<string | null> {
  try {
    await mkdir(dir, { recursive: true })
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'EACCES' || code === 'EPERM') return `no permission to use ${dir}`
    if (code === 'ENOENT') return `${dir} cannot be created — is the drive it is on connected?`
    return `${dir} is not usable: ${(err as Error).message}`
  }
  try {
    await access(dir, constants.W_OK)
  } catch {
    return `${dir} exists but cannot be written to`
  }
  return null
}
