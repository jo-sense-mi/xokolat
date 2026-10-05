// WHERE THE LIBRARY IS — the one thing that differs between "testing against the site I am editing"
// and "using the site that is published".
//
// ⚠️ THIS IS THE WHOLE ENVIRONMENT STORY, AND IT IS DELIBERATELY ONE STRING. There is no dev build
// of this app and no prod one: it is not deployed, it is installed, and the only axis that ever
// differs is which library it fetches from. A second checkout to hold a "dev app" would diverge the
// first time either copy was fixed, and then every test result would be about which copy it ran in.
//
// The rest of an environment is already here: `XOKOLAT_DATA` and `XOKOLAT_CONTENT` (src/paths.ts)
// point the roots anywhere, so a FRESH INSTALL is an empty data root — the real code, a cold start,
// and `rm -rf` to do it again.
//
//   XOKOLAT_DATA=/tmp/xk-dev XOKOLAT_CONTENT=/tmp/xk-dev-work \
//   XOKOLAT_LIBRARY=http://127.0.0.1:8080 XOKOLAT_PORT=18081 npm start
//
// ⚠️ AND THE COMMON CASE IS `npm run dev` (2026-08-18). Typing that line every time is how you end
// up testing against the published site by accident — everything works and the results are about
// the wrong library. `.env.dev` holds the one variable and the script loads it, so the difference
// between developing and using is which script you run. A variable already set still wins, so a
// one-off override is unchanged.
//
// ⚠️ ENV ONLY, AND DELIBERATELY SO. A settings field with a control on 📚 was the obvious next
// step once things could actually be taken, and it is the wrong one: it would put "which library"
// on screen for every real install, none of which needs it — a shipped app reads the line below
// and is right. Pointing somewhere else is a fact about a DEVELOPMENT MACHINE, and that is what an
// env file is.

/** The published library. Every app that was never told otherwise reads from here. */
export const DEFAULT_LIBRARY = 'https://xoko.lat'

/**
 * The library origin, with no trailing slash.
 *
 * ⚠️ REFUSED LOUDLY, NEVER FALLEN BACK FROM. A misspelt origin that quietly reverted to the
 * published site would mean testing against the wrong library and reading the results as if they
 * were about the local one — the exact failure that is hardest to notice, because everything works.
 */
export function resolveLibrary(): string {
  const raw = process.env['XOKOLAT_LIBRARY']
  if (!raw) return DEFAULT_LIBRARY
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error(`XOKOLAT_LIBRARY must be a URL (got ${JSON.stringify(raw)})`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`XOKOLAT_LIBRARY must be http or https (got ${JSON.stringify(raw)})`)
  }
  return url.origin + url.pathname.replace(/\/+$/, '')
}
