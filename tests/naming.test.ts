// WHAT A RUN IS CALLED — the field beside the folder, and why it is not the folder.
//
// The run FOLDER is minted server-side from slugified ASCII (§15 rule 2), and it is the asset's
// identity: it is in every master's provenance, in the ratings keys, and in whatever is open in
// the Finder. A NAME is a different fact about the same object — one nobody has to be careful
// with, which is what makes it editable and what makes it safe for xoko to write.

import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  RUN_FILE, mintRunId, renameRun, runRel, titleFrom, writeRun, writeRunRecord,
} from '../src/content/run.ts'
import type { Roots } from '../src/paths.ts'
import { resolveIn } from '../src/paths.ts'

async function library(): Promise<Roots> {
  const base = await mkdtemp(join(tmpdir(), 'xk-name-'))
  const roots = { content: join(base, 'lib'), data: join(base, 'data'), install: join(base, 'app') }
  await mkdir(roots.content, { recursive: true })
  return roots
}

test('⚠️ a name is not a slug, and the difference is the whole point', () => {
  const ask = 'a happy young kid, bright and giggly, full of energy reading a line'
  // What the list used to show, because the list showed the path.
  assert.match(mintRunId(ask), /^a-happy-young-kid-bright-and-giggly-full-of-\d{8}-\d{6}$/)
  // What it shows now: the person's own capitals and punctuation, stopping at the subject.
  assert.equal(titleFrom(ask), 'a happy young kid')
})

test('a name is read off the ask in whichever way the ask offers one', () => {
  // A written sentence has already said which part is the subject.
  assert.equal(titleFrom('Neon rain over the harbour. Slow, patient, almost still.'),
    'Neon rain over the harbour')
  // ⚠️ A SHORT FIRST CLAUSE IS NOT A NAME. Cutting at the comma here would title every track in
  // the library after its genre, which is the opposite of telling them apart.
  // ⚠️ AND IT IS NOT CUT AT ANY LENGTH (2026-09-04). It used to come back as `synthwave, 120bpm,
  // arpeggiated bass, wide…` — an ellipsis written into the stored name, which no pane can ever
  // reflow: the dots sat at the same place whatever width they were drawn in. A name is not a
  // length, it is where the ask stops being the subject; trimming belongs where the drawing
  // happens, against the width it actually has.
  assert.equal(titleFrom('synthwave, 120bpm, arpeggiated bass, wide reverb pads, nostalgic'),
    'synthwave, 120bpm, arpeggiated bass, wide reverb pads, nostalgic')
  // However long the ask is, nothing here writes a `…` — CSS decides where it stops being drawn.
  const long = 'a very long clause that keeps going '.repeat(6).trim()
  assert.equal(titleFrom(long), long)
  assert.equal(titleFrom('Short one'), 'Short one')
  // A wordless press — an image-to-3D workflow takes no sentence at all.
  assert.equal(titleFrom(''), 'untitled')
})

test('✎ renaming rewrites one field and moves nothing', async () => {
  const roots = await library()
  const runId = mintRunId('a happy young kid, bright and giggly')
  const rel = runRel('voice', runId)
  await mkdir(resolveIn(roots.content, rel), { recursive: true })
  await writeRun(roots, {
    runId,
    medium: 'voice',
    text: 'a happy young kid, bright and giggly',
    title: 'a happy young kid',
    style: null,
    inference: ['comfyui'],
    createdAt: new Date().toISOString(),
  })

  const named = await renameRun(roots, rel, 'Skyline Lights')
  assert.equal(named.title, 'Skyline Lights')
  // ⚠️ THE FOLDER DID NOT MOVE, and that is the reason a name is a field. Renaming the folder
  // would orphan the run id in every master's provenance and every rating key, to change a word.
  assert.equal(named.runId, runId)
  const onDisk = JSON.parse(
    await readFile(resolveIn(resolveIn(roots.content, rel), RUN_FILE), 'utf-8')) as { title: string }
  assert.equal(onDisk.title, 'Skyline Lights')

  // Blank is the way back — it re-reads the ask rather than leaving an empty name in the list.
  assert.equal((await renameRun(roots, rel, '   ')).title, 'a happy young kid')
  await assert.rejects(renameRun(roots, runRel('music', 'nope-20260101-000000'), 'x'), /no run at/)
})

/**
 * ⚠️ 🗣's TEXT IS NOT ITS SUBJECT (2026-08-23). Every other medium's ask describes the thing being
 * made, so a name read off it names the thing. A voice's ask is the SCRIPT — the words to be
 * spoken — and the speaker is described in a channel of their own. Named off the text, the voices
 * list answered "what will it say", which is the one question a play button already answers, and
 * an old Catalan man appeared in it as "Bon dia, com estàs?".
 */
test('a voice is named after WHO speaks, not after what they were handed to read', async () => {
  const roots = await library()
  const runId = mintRunId('Bon dia, com estàs? Fa molts anys que visc en aquest poble.')
  await writeRunRecord(roots, {
    medium: 'voice',
    text: 'Bon dia, com estàs? Fa molts anys que visc en aquest poble.',
    inference: [{
      id: 'comfyui',
      workflow: 'qwen3-tts',
      params: { voice: 'an old Catalan man, gravelly and slow, warm', language: 'Auto' },
    }],
  } as never, runId)

  const rel = runRel('voice', runId)
  const written = JSON.parse(
    await readFile(resolveIn(resolveIn(roots.content, rel), RUN_FILE), 'utf-8'),
  ) as { title: string; subject: string; text: string }
  assert.equal(written.title, 'an old Catalan man')
  assert.equal(written.subject, 'an old Catalan man, gravelly and slow, warm')
  // The script is still whole on the record — it is the ask, and ⓘ shows it under the name.
  assert.match(written.text, /^Bon dia/)

  // ✎ → blank goes back to the name it was BORN with, not to the script.
  const back = await renameRun(roots, rel, 'Avi Jordi')
  assert.equal(back.title, 'Avi Jordi')
  assert.equal((await renameRun(roots, rel, '   ')).title, 'an old Catalan man')
})

/** 🖼 and 🎼 keep naming themselves off the ask, because for them the ask IS the description.
 *  Only a medium whose table declares a shaping knob has a subject at all. */
test('a song is still named after the ask — only a shaping knob makes a subject', async () => {
  const roots = await library()
  const runId = mintRunId('upbeat synth-pop, bright and driving')
  await writeRunRecord(roots, {
    medium: 'music',
    text: 'upbeat synth-pop, bright and driving',
    inference: [{ id: 'comfyui', workflow: 'ace-step', params: { bpm: 118 } }],
  } as never, runId)
  const written = JSON.parse(
    await readFile(resolveIn(resolveIn(roots.content, runRel('music', runId)), RUN_FILE), 'utf-8'),
  ) as { title: string; subject: string | null }
  assert.equal(written.title, 'upbeat synth-pop')
  assert.equal(written.subject, null)
})
