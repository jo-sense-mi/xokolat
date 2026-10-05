// A SONG PLAYS TO THE END, AND A LIST OF SONGS KNOWS HOW LONG THEY ARE.
//
// Two halves of one bug (2026-08-22). The server answered every request with a 200 and the whole
// body and never said `accept-ranges`, so a browser could not seek and stopped an <audio> element
// at whatever landed in the first buffer — a two-minute song played for twelve seconds. And
// nothing anywhere recorded how long a song actually is, so the only time on its card was
// `durationMs`, which is how long the RENDER took: seven minutes forty, on a two-minute song.

import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { audioSeconds } from '../src/content/audio.ts'
import { rangeOf, serveFile } from '../src/server/static.ts'

test('a range header is read as bytes, and a nonsense one is simply not a range', () => {
  assert.deepEqual(rangeOf('bytes=0-99', 1000), { start: 0, end: 99 })
  // An open end means "to the end of the file", which is what a player sends when it seeks.
  assert.deepEqual(rangeOf('bytes=500-', 1000), { start: 500, end: 999 })
  // ⚠️ A SUFFIX RANGE IS THE LAST N BYTES, not the first N. Getting this backwards serves the
  // wrong half of the file with a 206 on it and nothing downstream can tell.
  assert.deepEqual(rangeOf('bytes=-200', 1000), { start: 800, end: 999 })
  // Past the end of the file, and inside-out: both unsatisfiable.
  assert.equal(rangeOf('bytes=2000-', 1000), false)
  assert.equal(rangeOf('bytes=900-100', 1000), false)
  assert.equal(rangeOf('bytes=-', 1000), false)
  // Not a range we understand is not an error — it is served whole, as the spec asks.
  assert.equal(rangeOf(undefined, 1000), null)
  assert.equal(rangeOf('items=0-9', 1000), null)
})

test('the server hands back the slice that was asked for, and says slices are possible', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xk-range-'))
  try {
    const body = Buffer.from('0123456789abcdefghij')
    await writeFile(join(dir, 'song.mp3'), body)
    const server = createServer((req, res) => {
      void serveFile(res, dir, req.url ?? '/', { req }).then((hit) => {
        if (!hit) { res.writeHead(404); res.end() }
      })
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    try {
      // ⚠️ THE WHOLE-FILE ANSWER CARRIES `accept-ranges` TOO. That header is how a player learns
      // it may seek at all; without it a 200 means "this is all there is", which is exactly the
      // lie that broke playback.
      const whole = await fetch(`${base}/song.mp3`)
      assert.equal(whole.status, 200)
      assert.equal(whole.headers.get('accept-ranges'), 'bytes')
      assert.equal(await whole.text(), '0123456789abcdefghij')

      const part = await fetch(`${base}/song.mp3`, { headers: { range: 'bytes=10-14' } })
      assert.equal(part.status, 206)
      assert.equal(part.headers.get('content-range'), 'bytes 10-14/20')
      assert.equal(part.headers.get('content-length'), '5')
      assert.equal(await part.text(), 'abcde')

      const tail = await fetch(`${base}/song.mp3`, { headers: { range: 'bytes=15-' } })
      assert.equal(tail.status, 206)
      assert.equal(await tail.text(), 'fghij')

      // 416 says the size, which is the one thing that lets a client ask again correctly.
      const past = await fetch(`${base}/song.mp3`, { headers: { range: 'bytes=99-' } })
      assert.equal(past.status, 416)
      assert.equal(past.headers.get('content-range'), 'bytes */20')
    } finally {
      await new Promise<void>((r) => server.close(() => r()))
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

/** One silent MPEG-1 layer III frame header, plus a Xing table claiming `frames` of them. */
function xingMp3(frames: number): Buffer {
  const buf = Buffer.alloc(1024)
  // 0xFF FB 90 00 — MPEG 1, layer III, 128 kbit/s, 44100 Hz, joint stereo.
  buf[0] = 0xff; buf[1] = 0xfb; buf[2] = 0x90; buf[3] = 0x00
  const table = 4 + 32          // past the side information of a MPEG-1 non-mono frame
  buf.write('Xing', table, 'latin1')
  buf.writeUInt32BE(1, table + 4)        // flags: a frame count follows
  buf.writeUInt32BE(frames, table + 8)
  return buf
}

test('a length comes off the file, exact where the file counted its own frames', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xk-audio-'))
  try {
    // 5001 frames × 1152 samples ÷ 44100 Hz = 130.6 s. The real ACE-Step master this was written
    // against carries exactly this shape (and reads 120.0 s, which is what it plays for).
    const song = join(dir, 'song.mp3')
    await writeFile(song, xingMp3(5001))
    assert.equal(await audioSeconds(song), 130.6)

    // Not audio at all, and a file that is not there: null, never a number.
    const junk = join(dir, 'junk.mp3')
    await writeFile(junk, Buffer.from('this is not a song'))
    assert.equal(await audioSeconds(junk), null)
    assert.equal(await audioSeconds(join(dir, 'nope.mp3')), null)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
