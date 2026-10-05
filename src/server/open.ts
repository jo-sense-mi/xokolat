// OPEN THE APP IN THE PERSON'S OWN BROWSER — what `npm start` asks for with `--open`.
//
// The page is the app on every OS: there is no window of our own to point at it, so the default
// browser is the window. A fixed argv per platform and the URL as one argument — never a shell
// (§15 rule 1), and the URL is always this server's own loopback address, never a request's.

import { spawn } from 'node:child_process'

function command(url: string): readonly string[] | null {
  switch (process.platform) {
    case 'darwin': return ['open', url]
    // `start` is a cmd builtin and would need a shell; this is the same handler without one.
    case 'win32': return ['rundll32', 'url.dll,FileProtocolHandler', url]
    case 'linux': return ['xdg-open', url]
    default: return null
  }
}

/** Fire and forget: the browser outlives this process, and a failure costs only the convenience —
 *  the address is in the banner either way. */
export function openBrowser(url: string): void {
  const argv = command(url)
  if (!argv) return
  const child = spawn(argv[0] as string, argv.slice(1), { stdio: 'ignore', detached: true })
  child.on('error', (err) => { process.stderr.write(`✗ could not open a browser (${err.message}) — go to ${url}\n`) })
  child.unref()
}

/** The pid of the xokolat answering on `url`, or null when nothing there is one — so a second
 *  `npm start` opens the one already running, and `npm run stop` can find it on any OS.
 *  ⚠️ NOT `ok`: that is false whenever a registry has issues, and a xokolat with a broken row is
 *  still a xokolat. */
export async function xokolatAt(url: string): Promise<number | null> {
  try {
    const res = await fetch(new URL('/api/status', url), { signal: AbortSignal.timeout(2000) })
    const body = await res.json() as { install?: unknown, pid?: unknown }
    return typeof body.install === 'string' && typeof body.pid === 'number' ? body.pid : null
  } catch {
    return null
  }
}
