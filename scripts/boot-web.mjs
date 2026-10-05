// Evaluate every front-end module under a stub DOM — the step `node --check` cannot do.
//
// ⚠️ IT EXISTS BECAUSE PARSING IS NOT LOADING (2026-09-04). `node --check` reads a file for syntax
// and stops; it has nothing to say about a module that parses perfectly and then throws the moment
// the browser evaluates it. One did: a top-level listener registered a `const` arrow declared
// further down the file, which is a temporal dead zone, so `deck.js` threw
// `Cannot access 'tell' before initialization` — and every module that imports it went with it.
// The whole app sat on "loading" and every other check in this repo was green.
//
// The stub is deliberately dumb. It is not a browser and cannot render: what it proves is that a
// module can be IMPORTED — no dead zones, no missing exports, no top-level call into nothing.
// That is the failure that takes the entire app down, and it is the one nothing else here catches.

const anything = () => new Proxy(function () {}, {
  get: (_t, k) => (k === 'style' ? new Proxy({}, { get: () => () => {}, set: () => true })
    : k === 'classList' ? { add() {}, remove() {}, toggle() {}, contains() { return false } }
      : k === 'files' ? [] : k === 'isConnected' ? false : k === 'dataset' ? {} : anything()),
  set: () => true,
  apply: () => anything(),
})

globalThis.document = new Proxy({}, {
  get: (_t, k) => (k === 'createElement' ? () => anything() : anything()),
})
globalThis.window = new Proxy({}, { get: () => anything() })
globalThis.Audio = function Audio() { return anything() }
globalThis.Node = { DOCUMENT_POSITION_FOLLOWING: 4 }
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
globalThis.fetch = () => Promise.resolve({ ok: true, json: async () => ({}) })
globalThis.IntersectionObserver = class { observe() {} disconnect() {} }
globalThis.ResizeObserver = class { observe() {} disconnect() {} }
globalThis.location = { hash: '', href: '' }
globalThis.history = { replaceState() {} }
globalThis.customElements = { define() {} }

let bad = 0
for (const file of process.argv.slice(2)) {
  try {
    await import(file)
  } catch (err) {
    bad++
    process.stderr.write(`  ${file}\n    ${err?.constructor?.name}: ${err?.message}\n`)
  }
}
process.exit(bad ? 1 : 0)
