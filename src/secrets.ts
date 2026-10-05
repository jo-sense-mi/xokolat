// KEYS — the one kind of data in this app that must never leave the machine it was typed on.
//
// ⚠️ IT IS A SEPARATE FILE FROM EVERY OTHER SETTING, and that is the whole design. The registry is
// readable, copyable, diffable, and meant to be — it is how a service is described and how one gets
// shared. A key is none of those things, so it lives in its own file, owner-read-only, and the
// registry refers to it BY NAME (`transport.auth.secret`). Moving a service to another machine
// carries the description and leaves the credential behind, which is the correct outcome and the
// reason this is not one more field on the row.
//
// ⚠️ AND IT NEVER REACHES THE BROWSER. The API can set one and forget one; there is no endpoint
// that returns one, and the shelf reports a boolean — `set`, or not. A key you can read back out of
// a web page is a key that is one screenshot from being someone else's.
//
// ⚠️ NOT ENCRYPTED, AND SAYING SO. A passphrase the app would have to store somewhere to decrypt on
// its own is theatre; the honest protection on a single-user machine is file permissions and the OS
// keychain, and the keychain needs a signed app. 0600 is what this is worth today, and pretending
// otherwise would be worse than the file.

import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { resolveIn } from './paths.ts'
import type { Roots } from './paths.ts'

/** Where the keys live, relative to the data root. NOT the install root: this is yours, not the
 *  app's, and an update must never be able to overwrite it. */
export const SECRETS_FILE = 'secrets.json'

/** Owner read/write, nobody else. */
const MODE = 0o600

const SLUG = /^[a-z0-9][a-z0-9-]*$/

export class SecretError extends Error {
  readonly status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'SecretError'
    this.status = status
  }
}

interface SecretFile {
  readonly secrets?: Record<string, string>
}

const path = (roots: Roots): string => resolveIn(roots.data, SECRETS_FILE)

async function readAll(roots: Roots): Promise<Record<string, string>> {
  let text: string
  try {
    text = await readFile(path(roots), 'utf-8')
  } catch (err) {
    // No file is the normal case, and the only one: a machine with no cloud service has no keys.
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw new SecretError(`the key store could not be read: ${(err as Error).message}`, 500)
  }
  let parsed: SecretFile
  try {
    parsed = JSON.parse(text) as SecretFile
  } catch (err) {
    throw new SecretError(`the key store is not valid JSON: ${(err as Error).message}`, 500)
  }
  const out: Record<string, string> = {}
  for (const [id, value] of Object.entries(parsed.secrets ?? {})) {
    if (typeof value === 'string' && value) out[id] = value
  }
  return out
}

/** One key, for the adapter that is about to use it. The ONLY reader of a value. */
export async function readSecret(roots: Roots, id: string): Promise<string | null> {
  return (await readAll(roots))[id] ?? null
}

/** WHICH keys exist — names only, and the only thing the browser is ever told. */
export async function secretsSet(roots: Roots): Promise<string[]> {
  return Object.keys(await readAll(roots)).sort()
}

/**
 * Store one, or forget one (`value: null`).
 *
 * ⚠️ THE WHOLE FILE IS REWRITTEN AT 0600 EVERY TIME, including when it already existed: `writeFile`
 * only applies a mode when it CREATES a file, so a store that was somehow world-readable would stay
 * world-readable for its whole life without the explicit chmod.
 */
export async function saveSecret(roots: Roots, id: string, value: string | null): Promise<void> {
  if (!SLUG.test(id)) throw new SecretError(`${JSON.stringify(id)} is not a key name`)
  const all = await readAll(roots)
  if (value === null || value === '') delete all[id]
  else all[id] = value
  const file = path(roots)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify({
    $comment: 'API KEYS. Owner-read-only, never sent to the browser, and referred to BY NAME from '
      + 'registries/inference.json (`transport.auth.secret`). Delete a line to forget a key.',
    secrets: all,
  }, null, 1)}\n`, { encoding: 'utf-8', mode: MODE })
  await chmod(file, MODE)
}
