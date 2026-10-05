// The entry point: resolve the roots, apply the user's settings, make sure they are usable,
// listen.

import { mkdir } from 'node:fs/promises'
import { createServer } from 'node:http'

import { Queue } from '../jobs/lane.ts'
import { DEFAULT_HOST, resolveHost, resolveIn, resolvePort, resolveRoots } from '../paths.ts'
import { applySettings, ensureContentRoot, readSettings } from '../settings.ts'
import { createHandler } from './app.ts'
import { openBrowser, wantsOpen, xokolatAt } from './open.ts'

const base = resolveRoots()
const { settings, issues } = await readSettings(base.data)
for (const line of issues) process.stderr.write(`✗ settings: ${line}\n`)
const roots = applySettings(base, settings)
const port = resolvePort()
const host = resolveHost()
// `--open` is `npm start`'s flag: the app has no window but the browser. `npm run restart` (dev)
// leaves it off, so a restart does not open another tab.
const open = wantsOpen(process.argv)
const url = `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`

// App data is created on first run; the install root is never written to (a newer download
// replaces it — PLAN §9).
await mkdir(resolveIn(roots.data, 'registries'), { recursive: true })
await mkdir(resolveIn(roots.data, 'styles'), { recursive: true })

// ⚠️ The library is created EAGERLY, not on first write: there has to be a real folder to point
// at and reveal before anything has been made. A failure here is reported, not fatal — a chosen
// path can stop being valid, and the settings that fix it are inside the app (src/settings.ts).
const contentIssue = await ensureContentRoot(roots.content)
if (contentIssue) process.stderr.write(`✗ library: ${contentIssue}\n`)

// One serial lane for the GPU, one parallel fast lane for CPU work (PLAN §4). A restart never
// resumes: the queue is not persisted, so nothing half-done is replayed — the partial run
// folder stays on disk and the builder's gate rejects it.
const queue = new Queue()

const server = createServer(createHandler({ roots, queue, contentIssue }))

server.on('error', (err: NodeJS.ErrnoException) => {
  // ⚠️ The app's port is STABLE, NOT PROBED (PLAN §9). It is a URL the user bookmarked and
  // added to their phone's home screen, so relocating it silently is worse than refusing to
  // start. Say what to do instead.
  if (err.code === 'EADDRINUSE') {
    // A second `npm start` is somebody wanting the app, and the app is already there.
    if (open) {
      void xokolatAt(url).then((pid) => {
        if (pid !== null) {
          process.stdout.write(`xokolat is already running · ${url}\n`)
          openBrowser(url)
          process.exit(0)
        }
        refuse()
      })
      return
    }
    refuse()
  }
  throw err
})

function refuse(): never {
  process.stderr.write(
    `✗ port ${port} is already in use.\n`
    + '  xokolat does not move to another port on its own — the address is meant to stay\n'
    + '  bookmarkable. Stop whatever is on that port, or start with XOKOLAT_PORT=<n>.\n',
  )
  process.exit(1)
}

/**
 * ⚠️ LOOPBACK BY DEFAULT — `listen(port, cb)` WITH NO HOST BINDS EVERY INTERFACE.
 *
 * That is Node's default, and it was this app's behaviour until 2026-09-05 while the line below
 * printed `http://127.0.0.1` — so the banner said one thing and the socket did another.
 *
 * It stops being nothing the moment this ships. Every API here trusts its caller completely —
 * there is no login, because a local app has no second person to authenticate — so on a café's
 * wifi, an office, a hotel, anybody on the same network could open somebody's xokolat, read
 * their library, press ▶, spend their engine time and change their settings. The absence of auth
 * is correct AND the reason the address has to be the thing that is closed.
 *
 * `'127.0.0.1'` rather than `'localhost'`: the name can resolve to ::1 first, and then a browser
 * asking for 127.0.0.1 finds nothing listening.
 *
 * Closed by DEFAULT, not by force: reaching your own machine from another one you own is a real
 * thing to want, and `XOKOLAT_HOST` is how you say so (src/paths.ts). The banner then prints the
 * address it actually took, because the whole bug above was a banner that did not.
 */
server.listen(port, host, () => {
  process.stdout.write(
    `xokolat · ${url}`
    + `${host === DEFAULT_HOST ? '' : `  ·  reachable on this machine's network (XOKOLAT_HOST=${host})`}\n`
    + `  library  ${roots.content}${contentIssue ? '  ⚠️ ' + contentIssue : ''}\n`
    + `  data     ${roots.data}\n`
    + `  install  ${roots.install}\n`,
  )
  if (open) openBrowser(url)
})
