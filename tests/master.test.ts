// WRITING A MASTER THAT IS NOT A PICTURE — the half of `writeMaster` that exists so a medium can
// be reached at all.
//
// ⚠️ WHAT THESE TESTS ARE REALLY ABOUT IS THE RECORD, not the bytes. A WebP carries its provenance
// inside it, which is what makes "what made this?" a question with exactly one answer. An mp3 and a
// `.glb` cannot, so the answer moved beside the file — and the thing worth testing is that it moved
// rather than went missing: written on the way out, found on the way back, by the same rule.

import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { readMaster, writeMaster } from '../src/content/master.ts'
import { MASTER_EXT } from '../src/content/run.ts'
import { contentType } from '../src/server/static.ts'
import { resolveIn } from '../src/paths.ts'
import type { Provenance } from '../src/types/provenance.ts'

const record = (over: Partial<Provenance> = {}): Provenance => ({
  modality: 'voice',
  provider: 'comfyui',
  model: 'qwen3-tts',
  workflow: 'narrator',
  prompt: 'a warm, unhurried storybook narrator',
  seed: 7,
  params: {},
  tags: ['voice'],
  refs: [],
  runId: 'a-narrator-260817',
  createdAt: '2026-08-17T00:00:00.000Z',
  durationMs: 1200,
  quality: 'balanced',
  ...over,
} as Provenance)

async function root(): Promise<{ dir: string; done: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), 'xk-master-'))
  return { dir, done: () => rm(dir, { recursive: true, force: true }) }
}

test('⚠️ a master that cannot hold its record gets one beside it, and reads back the same', async () => {
  const { dir, done } = await root()
  try {
    const rel = 'media/voice/a-narrator-260817/comfyui--qwen3-tts.mp3'
    const bytes = Buffer.from('ID3 not really, but the bytes are passed through untouched')
    const written = await writeMaster(dir, rel, { kind: 'bytes', data: bytes, ext: 'mp3' }, record())

    // ⚠️ PASSED THROUGH, BYTE FOR BYTE. The engine chose the container; a second encode here would
    // be a lossy pass over somebody else's decision, and `quality` is a fact about the ASK.
    assert.equal(written.bytes, bytes.length)
    assert.deepEqual(await readFile(resolveIn(dir, rel)), bytes)

    const back = await readMaster(resolveIn(dir, rel))
    assert.equal(back?.provider, 'comfyui')
    assert.equal(back?.modality, 'voice')
    assert.equal(back?.prompt, 'a warm, unhurried storybook narrator')
  } finally {
    await done()
  }
})

test('the sidecar is stem-named, so it sorts beside its master and not among the assets', async () => {
  const { dir, done } = await root()
  try {
    const rel = 'media/model3d/a-thing-260817/comfyui--hunyuan3d.glb'
    await writeMaster(dir, rel, { kind: 'bytes', data: Buffer.from('glTF'), ext: 'glb' },
      record({ modality: 'model3d' }))

    // ⚠️ AND THE NAME IS WHAT KEEPS THE INDEX HONEST: it lists a run by `MASTER_EXT`, so a record
    // called `<stem>.gen.json` is invisible to it. `<file>.json` would be too — this is about a
    // person opening the folder, where the two names sort together.
    const listed = await readdir(join(dir, 'media/model3d/a-thing-260817'))
    assert.deepEqual(listed.sort(), ['comfyui--hunyuan3d.gen.json', 'comfyui--hunyuan3d.glb'])
  } finally {
    await done()
  }
})

test('⚠️ an engine that answered in the wrong container is refused, not filed under the right name', async () => {
  const { dir, done } = await root()
  try {
    // A `.wav` written as `.mp3` plays in most things and is wrong in all of them — the kind of
    // bug that surfaces days later, in an export, as somebody else's problem.
    await assert.rejects(
      () => writeMaster(dir, 'media/voice/r/comfyui--tts.mp3',
        { kind: 'bytes', data: Buffer.from('RIFF'), ext: 'wav' }, record()),
      /answered with wav where a mp3 master goes/,
    )
  } finally {
    await done()
  }
})

test('a stray .json where a sidecar would go is not mistaken for a record', async () => {
  const { dir, done } = await root()
  try {
    const rel = 'media/voice/r/comfyui--tts.mp3'
    await writeMaster(dir, rel, { kind: 'bytes', data: Buffer.from('x'), ext: 'mp3' }, record())
    // The index walks every file on disk, most of which it did not write.
    const { writeFile } = await import('node:fs/promises')
    await writeFile(resolveIn(dir, 'media/voice/r/comfyui--tts.gen.json'), '{"hello":true}')
    assert.equal(await readMaster(resolveIn(dir, rel)), null)
  } finally {
    await done()
  }
})

// ⚠️ A MASTER THE SERVER CANNOT NAME IS A MASTER THE BROWSER GUESSES AT. `.mp4` was missing from
// the table for as long as video existed, so every clip went out as `application/octet-stream` and
// played only because the browser sniffed the container. This test is the coupling made explicit:
// add a medium, or change what its master is called, and the mime table has to hear about it.
test('every master extension has a content type the server can state', () => {
  for (const [medium, ext] of Object.entries(MASTER_EXT)) {
    const said = contentType(`master.${ext}`)
    assert.notEqual(said, 'application/octet-stream', `${medium}'s .${ext} master has no type`)
  }
})
