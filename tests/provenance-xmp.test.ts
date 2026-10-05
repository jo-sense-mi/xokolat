// ⚠️ THE KEYSTONE TEST. The whole provenance design (PLAN §4) rests on `sharp.withXmp()`
// actually round-tripping through a `.webp`, so it is verified in commit 1 rather than
// discovered in commit 3.
//
// It also pins the two things the design claims: the record survives byte-identically, and it
// is read back WITHOUT A PARSER.

import assert from 'node:assert/strict'
import test from 'node:test'

import sharp from 'sharp'

import { fromXmp, parseProvenance, toXmp } from '../src/provenance/xmp.ts'
import type { Provenance } from '../src/types/provenance.ts'

const RECORD: Provenance = {
  modality: 'image',
  provider: 'draw-things-grpc',
  model: 'flux.1-schnell',
  workflow: null,
  style: 'ink-linework',
  // Non-ASCII and XML metacharacters on purpose: a prompt is user text and will contain both.
  prompt: 'un cafè amb "xocolata" & <cròniques> before 9am',
  seed: 1234567,
  params: { steps: 4, width: 1024, height: 1024, guidance: 3.5, hires: false, sampler: 'euler-a' },
  tags: ['catalan culture', 'food', 'winter'],
  // Half the input of an i2i render is the picture it started from, so the record carries it.
  refs: [{ asset: 'media/image/a-photo-20260808-101010/import.webp', role: 'ref' }],
  durationMs: 6432,
  runId: 'coffee-before-9am-20260802-124300',
  createdAt: '2026-08-02T12:43:00.000Z',
  quality: 'webp-q92',
}

const swatch = () => sharp({
  create: { width: 16, height: 16, channels: 4, background: { r: 200, g: 120, b: 60, alpha: 1 } },
})

for (const format of ['webp', 'png'] as const) {
  test(`provenance survives a ${format} round trip`, async () => {
    const buf = await swatch().withXmp(toXmp(RECORD))[format]().toBuffer()
    const meta = await sharp(buf).metadata()
    assert.ok(meta.xmp, `${format} carried no XMP back`)

    const read = fromXmp(meta.xmp)
    assert.deepEqual(read, RECORD)
  })
}

test('metadata is read without decoding the pixels', async () => {
  // What makes a full index rebuild affordable at all (PLAN §9): `sharp` reads metadata
  // without decoding, so this must not need the image data.
  const buf = await swatch().withXmp(toXmp(RECORD)).webp().toBuffer()
  const meta = await sharp(buf).metadata()
  assert.equal(meta.format, 'webp')
  assert.equal(fromXmp(meta.xmp)?.runId, RECORD.runId)
})

test('a file that is not ours reads as no provenance, never as a throw', async () => {
  const plain = await swatch().webp().toBuffer()
  assert.equal(fromXmp((await sharp(plain).metadata()).xmp), null)
  assert.equal(fromXmp('<x:xmpmeta xmlns:x="adobe:ns:meta/">someone else</x:xmpmeta>'), null)
  assert.equal(fromXmp(undefined), null)
  assert.equal(fromXmp('not xmp at all'), null)
})

test('a half-record is refused rather than half-read', () => {
  const { seed, ...missingSeed } = RECORD
  assert.equal(typeof seed, 'number')
  assert.equal(parseProvenance(missingSeed), null)
  assert.equal(parseProvenance({ ...RECORD, modality: 'hologram' }), null)
  assert.equal(parseProvenance({ ...RECORD, params: { nested: { no: true } } }), null)
  // An unknown field means the record was written by a shape we do not know.
  assert.equal(parseProvenance({ ...RECORD, cfg: 7 }), null)
})

test('the two tolerant fields: absent means null, and absent means the default level', () => {
  // Neither existed at first, and refusing the records written before them would blank the
  // provenance of an entire library. `durationMs` has no honest value, so it is null;
  // `quality` does — every master written before the setting existed got what is now called
  // `balanced`, because nothing else was on offer.
  const { durationMs, quality, ...older } = RECORD
  assert.equal(typeof durationMs, 'number')
  assert.equal(quality, 'webp-q92')
  assert.equal(parseProvenance(older)?.durationMs, null)
  assert.equal(parseProvenance(older)?.quality, 'webp-q92')
  // But a field that IS there has to be the right type.
  assert.equal(parseProvenance({ ...RECORD, quality: 4 }), null)
})

test('exports must be able to strip it', async () => {
  // PLAN §4: a LINE pack is a file the user SELLS, and embedding their prompt publishes their
  // method. This pins the mechanism the export gate will use.
  const withRecord = await swatch().withXmp(toXmp(RECORD)).webp().toBuffer()
  const stripped = await sharp(withRecord).webp().toBuffer()
  assert.equal(fromXmp((await sharp(stripped).metadata()).xmp), null)
})

test('a master written before durationMs existed is still a valid record', () => {
  // ⚠️ The whole library predates the field. Refusing these would blank the provenance chip on
  // every image already on disk — absent means null, and null is never drawn as zero.
  const { durationMs: _gone, ...older } = RECORD
  const parsed = parseProvenance(older)
  assert.ok(parsed, 'an older record still parses')
  assert.equal(parsed.durationMs, null)
  assert.equal(parsed.runId, RECORD.runId)
})

test('the style rides in the file, and a master written before it still reads', () => {
  // ⚠️ THE WORDS WERE ALWAYS IN THERE AND THE NAME WAS NOT. `prompt` is composed, so a style's
  // words are embedded in every master it shaped — but "what look is this?" is asked of a picture
  // months later and nothing could answer it. Round-tripped through the carrier, because a field
  // the type declares and XMP drops is a field that only exists in memory.
  const back = fromXmp(toXmp(RECORD))
  assert.equal(back?.style, 'ink-linework')

  // ⚠️ ABSENT IS AN ABSENCE, NOT "no style was used". Every master on disk predates the field;
  // they read as null and the chip simply does not appear, which is the honest thing to draw for
  // a fact nobody wrote down.
  const { style: _gone, ...older } = RECORD
  assert.equal(parseProvenance(older)?.style, null)
  // And null written explicitly means the same thing: a press with no style at all.
  assert.equal(parseProvenance({ ...RECORD, style: null })?.style, null)
  // A field that IS there has to be a string.
  assert.equal(parseProvenance({ ...RECORD, style: 7 }), null)
})
