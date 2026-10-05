// WHERE THE LIBRARY MAY LIVE. These encode the rules a user's folder choice has to survive —
// the ones that are not obvious from the code, and the two that are security decisions.

import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { defaultContentRoot, resolveRoots } from '../src/paths.ts'
import { isQualityLevel, qualityFor, scaleFor } from '../src/types/quality.ts'
import {
  EMPTY_SETTINGS, applySettings, checkContentRoot, ensureContentRoot, normalize, readSettings,
  writeSettings,
} from '../src/settings.ts'

const roots = { data: '/tmp/xk-data', content: '/tmp/xk-lib', install: '/opt/xokolat' }

test('the home directory and the filesystem root are refused', () => {
  // ⚠️ SECURITY, not taste: everything under the library is served over /content/…, and this app
  // is reachable over a tailnet. Pointing it at ~ would publish the whole home directory.
  assert.match(checkContentRoot(roots, homedir()) ?? '', /served by the app/)
  assert.match(checkContentRoot(roots, '/') ?? '', /served by the app/)
})

test('not inside the app itself — an update replaces that folder', () => {
  assert.match(checkContentRoot(roots, '/opt/xokolat/content') ?? '', /inside the app/)
  assert.match(checkContentRoot(roots, '/opt/xokolat') ?? '', /inside the app/)
})

test('not the app data folder, which is the one root that cannot move', () => {
  assert.match(checkContentRoot(roots, '/tmp/xk-data') ?? '', /data folder/)
  // UNDER it is merely unusual, not forbidden: the rules here are about what would BREAK — a
  // published home directory, a folder an update deletes — and "I would not put it there" is
  // not one of those. A permissive rule needs no justification beyond that.
  assert.equal(checkContentRoot(roots, '/tmp/xk-data/content'), null)
})

test('a relative path is refused rather than resolved against the working directory', () => {
  assert.match(checkContentRoot(roots, 'pictures/xokolat') ?? '', /full path/)
  assert.match(checkContentRoot(roots, '  ') ?? '', /required/)
})

test('an ordinary folder is fine', () => {
  assert.equal(checkContentRoot(roots, join(homedir(), 'Documents', 'xokolat')), null)
  assert.equal(checkContentRoot(roots, '/Volumes/Big Disk/xokolat'), null)
})

test('the setting is read back, and a missing file is the normal case', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xk-settings-'))
  try {
    const fresh = await readSettings(dir)
    assert.deepEqual(fresh.settings, EMPTY_SETTINGS)
    assert.deepEqual(fresh.issues, [])

    await writeSettings(dir, { contentRoot: '/Volumes/Big Disk/xokolat', quality: { image: 'lossless' } })
    const read = await readSettings(dir)
    assert.equal(read.settings.contentRoot, '/Volumes/Big Disk/xokolat')
    assert.equal(read.settings.quality.image, 'lossless')
    assert.deepEqual(read.issues, [])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('a broken settings file is reported and then ignored, never fatal', async () => {
  // Refusing to start over a settings file is how a user ends up unable to reach the settings
  // that would fix it.
  const dir = await mkdtemp(join(tmpdir(), 'xk-settings-'))
  try {
    await writeFile(join(dir, 'settings.json'), '{ not json')
    const { settings, issues } = await readSettings(dir)
    assert.deepEqual(settings, EMPTY_SETTINGS)
    assert.equal(issues.length, 1)
    assert.match(issues[0] ?? '', /not valid JSON/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('env beats the setting, and the default is what is left', () => {
  const before = process.env['XOKOLAT_CONTENT']
  try {
    delete process.env['XOKOLAT_CONTENT']
    assert.equal(applySettings(roots, { ...EMPTY_SETTINGS, contentRoot: '/picked' }).content, '/picked')
    assert.equal(applySettings(roots, EMPTY_SETTINGS).content, roots.content)

    process.env['XOKOLAT_CONTENT'] = '/from-env'
    const base = resolveRoots()
    // The dev override wins — and the UI is told it is locked rather than silently dropping
    // what the user picked.
    assert.equal(applySettings(base, { ...EMPTY_SETTINGS, contentRoot: '/picked' }).content, '/from-env')
  } finally {
    if (before === undefined) delete process.env['XOKOLAT_CONTENT']
    else process.env['XOKOLAT_CONTENT'] = before
  }
})

test('the library is created eagerly, so there is something to reveal before anything is made', async () => {
  const dir = join(await mkdtemp(join(tmpdir(), 'xk-lib-')), 'nested', 'xokolat')
  try {
    assert.equal(await ensureContentRoot(dir), null)
    // And a path that cannot exist says so in a sentence, rather than throwing at startup.
    assert.match(await ensureContentRoot('/dev/null/nope') ?? '', /not usable|cannot be created/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('the settings file is JSON we can read back by hand, holding only what differs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xk-settings-'))
  try {
    // ⚠️ Defaults are NOT written. A file that spells out every default is a file that pins
    // them, and this one is meant to be readable — three lines of `false` are noise.
    await writeSettings(dir, { contentRoot: '/x', quality: {} })
    assert.deepEqual(
      JSON.parse(await readFile(join(dir, 'settings.json'), 'utf-8')) as unknown,
      { contentRoot: '/x' },
    )
    await writeSettings(dir, { contentRoot: null, quality: { image: 'lossless' } })
    assert.deepEqual(
      JSON.parse(await readFile(join(dir, 'settings.json'), 'utf-8')) as unknown,
      { quality: { image: 'lossless' } },
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('choosing the default is stored as no choice at all', () => {
  // Otherwise the app reports "custom" for a path it picked itself — and pins the old default if
  // that default ever moves.
  assert.equal(normalize({ ...EMPTY_SETTINGS, contentRoot: defaultContentRoot() }).contentRoot, null)
  assert.equal(normalize({ ...EMPTY_SETTINGS, contentRoot: '/elsewhere' }).contentRoot, '/elsewhere')
  // ...and normalizing the path leaves the OTHER settings alone.
  assert.deepEqual(
    normalize({ contentRoot: defaultContentRoot(), quality: { image: 'lossless' } }).quality,
    { image: 'lossless' },
  )
})

test('an unknown setting is reported, and a bad quality is never clamped to something near it', async () => {
  // ⚠️ A level from a future version must SAY SO. Silently rendering at a quality nobody asked
  // for is the failure mode a settings file is least able to explain.
  const dir = await mkdtemp(join(tmpdir(), 'xk-settings-'))
  try {
    await writeFile(join(dir, 'settings.json'),
      '{ "quality": { "image": "ultra", "hologram": "exact" }, "colour": "blue" }')
    const { settings, issues } = await readSettings(dir)
    assert.deepEqual(settings.quality, {})
    assert.equal(issues.length, 3, issues.join('; '))
    assert.ok(issues.some((i) => i.includes('ultra')), issues.join('; '))
    assert.ok(issues.some((i) => i.includes('hologram')), issues.join('; '))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('a medium with no scale declared has nothing to choose', () => {
  // The extension mechanism: music gets a quality setting the day src/types/quality.ts grows a
  // row for it, and not one line sooner — in the API or in the UI.
  assert.equal(isQualityLevel('image', 'lossless'), true)
  assert.equal(isQualityLevel('image', 'ultra'), false)
  assert.equal(isQualityLevel('music', 'lossless'), false)
  assert.equal(scaleFor('music'), null)
  // An unset choice resolves to the medium's fallback rather than to nothing.
  assert.equal(qualityFor({}, 'image'), 'webp-q92')
  assert.equal(qualityFor({ image: 'lossless' }, 'image'), 'lossless')
})
