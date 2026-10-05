// PLAN §15 rule 2 — every path is resolved against a root before it is written, least of all
// one an LLM produced. These are the escapes that rule exists for.

import assert from 'node:assert/strict'
import { join } from 'node:path'
import test from 'node:test'

import { PathEscapeError, defaultContentRoot, resolveHost, resolveIn, resolvePort, resolveRoots } from '../src/paths.ts'

const ROOT = '/tmp/xokolat-root'

test('a path inside the root resolves', () => {
  assert.equal(resolveIn(ROOT, 'media/image/coffee-20260802'), join(ROOT, 'media/image/coffee-20260802'))
  assert.equal(resolveIn(ROOT, 'a', 'b', 'c.webp'), join(ROOT, 'a/b/c.webp'))
  assert.equal(resolveIn(ROOT, './x/../y'), join(ROOT, 'y'))
  assert.equal(resolveIn(ROOT), ROOT)
})

test('a path that leaves the root is refused', () => {
  for (const escape of [
    '../secrets',
    '../../.ssh/id_rsa',
    'media/../../outside',
    '/etc/passwd',            // absolute: `resolve` would discard the root entirely
    'a/b/../../../c',
  ]) {
    assert.throws(() => resolveIn(ROOT, escape), PathEscapeError, `should refuse ${escape}`)
  }
})

test('a sibling root that shares a prefix is not inside it', () => {
  // Why the check is `relative()` and not `startsWith()`: "/tmp/xokolat-root-old" starts with
  // "/tmp/xokolat-root".
  assert.throws(() => resolveIn(ROOT, '../xokolat-root-old/x'), PathEscapeError)
})

test('the roots are resolved from env, absolutely', () => {
  const before = { data: process.env['XOKOLAT_DATA'], content: process.env['XOKOLAT_CONTENT'] }
  try {
    process.env['XOKOLAT_DATA'] = '/tmp/xk-data'
    delete process.env['XOKOLAT_CONTENT']
    const roots = resolveRoots()
    assert.equal(roots.data, '/tmp/xk-data')
    // ⚠️ The library does NOT follow app data. It is the user's work, it belongs somewhere
    // visible, and it defaulted under ~/Library once — the symptom was a reveal button opening a
    // folder nobody could have found (DECISIONS.md).
    assert.equal(roots.content, defaultContentRoot())
    assert.ok(!roots.content.includes('Application Support'))
    assert.ok(roots.install.endsWith('xokolat'), `install root looks wrong: ${roots.install}`)

    process.env['XOKOLAT_CONTENT'] = 'relative/path'
    assert.throws(() => resolveRoots(), /absolute/)
  } finally {
    for (const [key, value] of [['XOKOLAT_DATA', before.data], ['XOKOLAT_CONTENT', before.content]] as const) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

test('the app port is stable, and a bad one is refused rather than replaced', () => {
  const before = process.env['XOKOLAT_PORT']
  try {
    delete process.env['XOKOLAT_PORT']
    // Not 8787: content-factory's studio already answers there, and the two run side by side.
    assert.equal(resolvePort(), 18080)
    process.env['XOKOLAT_PORT'] = '9000'
    assert.equal(resolvePort(), 9000)
    for (const bad of ['0', '-1', '70000', 'eight', '80.5']) {
      process.env['XOKOLAT_PORT'] = bad
      assert.throws(() => resolvePort(), /XOKOLAT_PORT/, `should refuse ${bad}`)
    }
  } finally {
    if (before === undefined) delete process.env['XOKOLAT_PORT']
    else process.env['XOKOLAT_PORT'] = before
  }
})

test('the address is loopback unless something says otherwise', () => {
  const before = process.env['XOKOLAT_HOST']
  try {
    // The default is the whole point: every API here trusts its caller, so a run nobody
    // configured must not be reachable from the wifi it happens to be on.
    delete process.env['XOKOLAT_HOST']
    assert.equal(resolveHost(), '127.0.0.1')
    process.env['XOKOLAT_HOST'] = ''
    assert.equal(resolveHost(), '127.0.0.1')
    process.env['XOKOLAT_HOST'] = '  '
    assert.equal(resolveHost(), '127.0.0.1')
    // And opening it is a thing you can actually say — a tailnet address, or every interface.
    process.env['XOKOLAT_HOST'] = '100.101.102.103'
    assert.equal(resolveHost(), '100.101.102.103')
    process.env['XOKOLAT_HOST'] = '0.0.0.0'
    assert.equal(resolveHost(), '0.0.0.0')
  } finally {
    if (before === undefined) delete process.env['XOKOLAT_HOST']
    else process.env['XOKOLAT_HOST'] = before
  }
})
