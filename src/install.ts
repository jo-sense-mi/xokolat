// THE INSTALL ID — one value, written once, whose only job is to let the BROWSER notice that the
// app it is talking to is not the app it was talking to before.
//
// ⚠️ WHY THE SERVER HAS TO ANSWER THIS AT ALL. Half of what the app remembers is not in app data:
// the armed workflow per kind, the armed kind per medium, the layout and sort of every shelf, the
// route you were on. That lives in the browser's localStorage, where no script can reach it —
// `npm run clear` can delete every file the app ever wrote and the page will still come back
// remembering a workflow that no longer exists. The fix is not for the script to reach the browser;
// it is for the browser to ask one question at boot and answer it itself.
//
// So: this id is created with the data root and never changes while that root exists. The front
// end stores the one it last saw; a mismatch means a different install — cleared, moved, or a
// second data root on a dev machine — and it clears itself.
//
// ⚠️ NOT A USER ID, NOT A DEVICE ID, AND IT LEAVES THE MACHINE NOWHERE. It is a random value
// compared against itself. Nothing is reported anywhere; the app has no telemetry to report it to.

import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

import { resolveIn } from './paths.ts'
import type { Roots } from './paths.ts'

export const INSTALL_FILE = 'install.json'

/**
 * The id of this data root, creating it on first read.
 *
 * ⚠️ A CORRUPT FILE IS A NEW INSTALL, not an error. There is exactly one thing at stake — whether
 * a browser keeps its remembered arming — and the cost of getting it wrong in the "fresh" direction
 * is that the user re-picks a workflow. Refusing to boot over an unreadable 40-byte file would be
 * wildly out of proportion, so anything unreadable is simply replaced.
 */
export async function installId(roots: Roots): Promise<string> {
  const file = resolveIn(roots.data, INSTALL_FILE)
  try {
    const parsed: unknown = JSON.parse(await readFile(file, 'utf-8'))
    const id = (parsed as Record<string, unknown> | null)?.['id']
    if (typeof id === 'string' && id.length > 0) return id
  } catch { /* absent or unreadable — write a new one below */ }

  const id = randomUUID()
  await mkdir(roots.data, { recursive: true })
  await writeFile(file, `${JSON.stringify({ id, since: new Date().toISOString() }, null, 2)}\n`)
  return id
}
