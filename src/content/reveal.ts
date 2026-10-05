// REVEAL — show a file in the OS file manager. The first thing in this app that leaves the
// process, so it is worth being explicit about why that is allowed.
//
// The app is not a website: it writes files to the user's disk and the user owns them. "Download"
// is web thinking — the file is already there, and what an app owes is a way to GET TO it. That
// is this.
//
// ⚠️ §15 RULE 1 IS KEPT, NOT BENT. The browser sends a content-root-relative PATH, never a
// command. The command is chosen here from a three-row table, spawned as an ARGV ARRAY with no
// shell, and the path is resolved against the content root first — so the worst a hostile
// request can do is ask the Finder to show a file inside the content folder.

import { spawn } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { dirname } from 'node:path'

import { resolveIn } from '../paths.ts'

/**
 * `argv` for showing `target` in the platform's file manager.
 *
 * A DIRECTORY is opened; a FILE is selected in its parent. Selecting a folder inside its parent
 * would be technically consistent and practically useless — when someone asks to see their
 * library, they want to be looking at what is in it.
 */
function command(target: string, isDir: boolean): readonly string[] | null {
  switch (process.platform) {
    case 'darwin': return isDir ? ['open', target] : ['open', '-R', target]
    // `explorer` wants exactly this shape — `/select,<path>` is one argument, comma and all.
    case 'win32': return isDir ? ['explorer', target] : ['explorer', `/select,${target}`]
    // No Linux desktop has a portable "select this file"; opening the containing folder is the
    // honest approximation, and saying so beats pretending.
    case 'linux': return ['xdg-open', isDir ? target : (dirname(target) || '/')]
    default: return null
  }
}

export class RevealError extends Error {}

/**
 * Show `rel` (relative to `root`) in the file manager. `"."` means the root itself. Resolves and
 * stats first: a path that is not there produces a named error rather than a file manager
 * opening on nothing.
 */
export async function reveal(root: string, rel: string): Promise<void> {
  const file = resolveIn(root, rel)
  let isDir: boolean
  try {
    isDir = (await stat(file)).isDirectory()
  } catch {
    throw new RevealError(rel === '.' ? `${root} is not there` : `there is no file at ${rel}`)
  }
  const argv = command(file, isDir)
  if (!argv) throw new RevealError(`showing a file in the file manager is not wired up for ${process.platform}`)

  // Detached and unwatched: the file manager outlives this request, and waiting on it would tie
  // an HTTP response to a GUI application's lifetime.
  const child = spawn(argv[0] as string, argv.slice(1), { stdio: 'ignore', detached: true })
  child.on('error', (err) => { process.stderr.write(`✗ reveal: ${err.message}\n`) })
  child.unref()
}
