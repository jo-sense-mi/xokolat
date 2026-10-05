// THE THREE ROOTS, resolved once — and nothing else in the app may compute a path (PLAN §9).
// The factory's un-shippable property is a hardcoded `~/content-factory`; this is the module
// that makes sure xokolat never grows one.
//
// It is also where §15 rule 2 lives: EVERY path is resolved against a root before it is
// written — least of all one an LLM produced. A model that names a file is a model that can
// name `../../`.

import { homedir, platform } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface Roots {
  /** APP DATA — state the app manages and the user never opens: style overrides, the
   *  inference registry, verdicts, the index cache, provisioned binaries and models. Writable,
   *  survives an app update, and NOT user-configurable (the setting that moves `content` has to
   *  live somewhere that cannot move). */
  readonly data: string
  /**
   * THE USER'S LIBRARY — generated bundles and media runs.
   *
   * ⚠️ NOT under app data. This is the user's work, not the app's state, and the two belong in
   * different places: `~/Library` is hidden in Finder, is not where anyone looks, and is not
   * what people expect their backups to cover. It defaulted there once and the symptom was a
   * reveal button opening a folder nobody could have found (DECISIONS.md).
   *
   * User-configurable: `<data>/settings.json` overrides the default, `XOKOLAT_CONTENT` overrides
   * both. ONE library, never several — see src/settings.ts.
   */
  readonly content: string
  /** The repo (dev) or the unzipped `xokolat-<v>/` folder (shipped): shipped styles, `web/`, code.
   *  ⚠️ TREAT AS READ-ONLY. A newer download replaces the whole folder, and it may sit somewhere
   *  its user cannot write, so anything that writes here works on the dev machine and is lost or
   *  refused for every user. */
  readonly install: string
}

/** `~/Library/Application Support/xokolat` on macOS, `%APPDATA%\xokolat` on Windows,
 *  `$XDG_DATA_HOME/xokolat` (or `~/.local/share/xokolat`) elsewhere. */
function defaultDataRoot(): string {
  if (platform() === 'darwin') return join(homedir(), 'Library', 'Application Support', 'xokolat')
  if (platform() === 'win32') {
    const roaming = process.env['APPDATA']
    return roaming && isAbsolute(roaming) ? join(roaming, 'xokolat') : join(homedir(), 'AppData', 'Roaming', 'xokolat')
  }
  const xdg = process.env['XDG_DATA_HOME']
  return xdg && isAbsolute(xdg) ? join(xdg, 'xokolat') : join(homedir(), '.local', 'share', 'xokolat')
}

/**
 * `~/Documents/xokolat` — visible, conventional, and where a document-producing app puts the
 * documents it produces.
 *
 * Not `~/Pictures`, even though images come first: this app also makes songs, voice, 3D and
 * PDFs, and one bundle split across ~/Pictures, ~/Music and ~/Movies stops being a bundle. One
 * root keeps a pack whole.
 */
export function defaultContentRoot(): string {
  return join(homedir(), 'Documents', 'xokolat')
}

/** True when `XOKOLAT_CONTENT` is set — the dev override, which WINS over the user's setting and
 *  therefore has to be visible in the UI rather than silently ignoring what they picked. */
export function contentLockedByEnv(): boolean {
  return Boolean(process.env['XOKOLAT_CONTENT'])
}

/** This file is `<install>/src/paths.ts`, so the install root is two levels up. The one place
 *  allowed to know that. */
function installRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..')
}

/** Env overrides (`XOKOLAT_DATA`, `XOKOLAT_CONTENT`) let a dev machine point the roots
 *  anywhere; they must be absolute, because a relative one would silently mean "wherever the
 *  process happened to start". A leading `~/` is the home folder — `.env.dev` is committed, and
 *  a home path spelled out would put one person's username in everybody's checkout. */
function fromEnv(name: string): string | null {
  const raw = process.env[name]
  if (!raw) return null
  const v = raw.startsWith('~/') ? join(homedir(), raw.slice(2)) : raw
  if (!isAbsolute(v)) throw new Error(`${name} must be an absolute path (got ${JSON.stringify(v)})`)
  return resolve(v)
}

/** The roots BEFORE the user's settings are read — defaults and env only. `src/settings.ts`
 *  applies `settings.json` on top, which is why this stays synchronous and side-effect free. */
export function resolveRoots(): Roots {
  return {
    data: fromEnv('XOKOLAT_DATA') ?? defaultDataRoot(),
    content: fromEnv('XOKOLAT_CONTENT') ?? defaultContentRoot(),
    install: installRoot(),
  }
}

/** Thrown when a candidate path would leave its root. Named, because "silently wrote
 *  somewhere else" is the failure this exists to prevent. */
export class PathEscapeError extends Error {
  readonly root: string
  readonly candidate: string

  constructor(root: string, candidate: string) {
    super(`path escapes its root: ${JSON.stringify(candidate)} is not under ${JSON.stringify(root)}`)
    this.name = 'PathEscapeError'
    this.root = root
    this.candidate = candidate
  }
}

/**
 * Resolve `segments` under `root` and VERIFY the result is still under it. The only sanctioned
 * way to turn untrusted words — a request field, a manifest path, an LLM's answer, a URL — into
 * a path this app will read or write.
 *
 * Prefix-checked with `relative()` rather than `startsWith()`: `/data-old` starts with `/data`.
 */
export function resolveIn(root: string, ...segments: string[]): string {
  const base = resolve(root)
  const candidate = resolve(base, ...segments)
  if (candidate !== base) {
    const rel = relative(base, candidate)
    if (!rel || rel === '..' || rel.startsWith(`..${sep()}`) || isAbsolute(rel)) {
      throw new PathEscapeError(base, candidate)
    }
  }
  return candidate
}

function sep(): string {
  return platform() === 'win32' ? '\\' : '/'
}

/** The app's own port is STABLE, NOT PROBED — the deliberate opposite of an engine port
 *  (PLAN §9, §13.5). An engine port is an implementation detail nobody types; this one is a
 *  URL the user has bookmarked and added to their phone's home screen, so if it is taken the
 *  server fails with a clear message rather than quietly moving.
 *
 *  18080 rather than 8787: the factory's studio already answers on 8787 on this machine, and
 *  the two are meant to run side by side. It is also above 1024 (no privileges) and clear of
 *  the crowded 8000–9000 band where every dev server lands by default. */
export const DEFAULT_PORT = 18080

export function resolvePort(): number {
  const raw = process.env['XOKOLAT_PORT']
  if (!raw) return DEFAULT_PORT
  const port = Number(raw)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`XOKOLAT_PORT must be an integer 1–65535 (got ${JSON.stringify(raw)})`)
  }
  return port
}

/** The address the app listens on. Loopback by default — every API here trusts its caller
 *  completely (a local app has no second person to authenticate), so on a shared network the
 *  address is the thing that has to be closed.
 *
 *  `XOKOLAT_HOST` opens it on purpose, and the one real reason to is reaching your own machine
 *  from another one you own: a tailnet, a phone on the same desk. `0.0.0.0` takes every
 *  interface; a single address (the tailnet's `100.x.y.z`) takes only that one, which is the
 *  narrower and better answer when you know it. `npm run dev` sets it — see `.env.dev`; a
 *  packaged install never does. */
export const DEFAULT_HOST = '127.0.0.1'

export function resolveHost(): string {
  return process.env['XOKOLAT_HOST']?.trim() || DEFAULT_HOST
}
