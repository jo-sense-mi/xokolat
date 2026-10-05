// HOW LONG A SONG IS — read out of the file, because nothing else in this app knows.
//
// ⚠️ IT IS NOT `durationMs`, AND CONFUSING THE TWO IS THE WHOLE REASON THIS EXISTS. Provenance
// records `durationMs`: how long the RENDER took. A two-minute song whose record says 460654 took
// seven minutes forty to make, and a list of songs that showed that number where a length goes
// would be lying in the one column anybody scans. One is about the machine, the other is about the
// music.
//
// ⚠️ AND IT IS READ HERE RATHER THAN IN THE BROWSER. An <audio> element reports `duration` — after
// it has fetched enough of the file to find out. A feed built for thousands of masters loads none
// of them (`preload="none"`), so asking the browser would mean either fetching every song to draw
// a list or having no lengths at all. The index opens each master exactly once anyway, which is
// where a fact about a file belongs.
//
// ⚠️ MP3 ONLY, because `MASTER_EXT` says music and voice are mp3 and nothing else here is audio.
// A container this cannot read returns null and the list simply has no length for it — a missing
// number, never a wrong one.

import { open } from 'node:fs/promises'

/** Enough to hold an ID3v2 header, a frame header, and the Xing/VBRI table behind it. */
const HEAD = 4096

/** MPEG version → layer → bitrate, in kbit/s. Index 0 is "free" and 15 is invalid; both read as 0
 *  and fall through to "cannot tell". */
const BITRATES: Readonly<Record<string, readonly number[]>> = {
  // MPEG 1, layer III
  '1-3': [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0],
  '1-2': [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384, 0],
  '1-1': [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, 0],
  // MPEG 2 / 2.5, layers II and III share a table
  '2-3': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
  '2-2': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
  '2-1': [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256, 0],
}

const RATES: Readonly<Record<number, readonly number[]>> = {
  1: [44100, 48000, 32000],     // MPEG 1
  2: [22050, 24000, 16000],     // MPEG 2
  0: [11025, 12000, 8000],      // MPEG 2.5
}

interface Frame {
  readonly at: number
  readonly version: 1 | 2 | 0
  readonly layer: 1 | 2 | 3
  readonly bitrate: number      // bit/s, 0 when the header says "free"
  readonly rate: number         // Hz
  readonly samples: number      // per frame
  readonly mono: boolean
}

/** The first real frame at or after `from`. A sync word can occur inside ID3 art, so the fields
 *  are validated rather than trusted — an impossible bitrate or sample rate is not a frame. */
function frameAt(buf: Buffer, from: number): Frame | null {
  for (let i = from; i + 4 <= buf.length; i++) {
    if (buf[i] !== 0xff || (buf[i + 1]! & 0xe0) !== 0xe0) continue
    const b1 = buf[i + 1]!
    const b2 = buf[i + 2]!
    const b3 = buf[i + 3]!
    const versionBits = (b1 >> 3) & 0b11
    const layerBits = (b1 >> 1) & 0b11
    if (versionBits === 1 || layerBits === 0) continue     // reserved
    const version = versionBits === 3 ? 1 : versionBits === 2 ? 2 : 0
    const layer = (4 - layerBits) as 1 | 2 | 3
    const rateIdx = (b2 >> 2) & 0b11
    if (rateIdx === 3) continue
    const rate = RATES[version]![rateIdx]!
    const table = BITRATES[`${version === 1 ? 1 : 2}-${layer}`]
    const bitrate = (table?.[(b2 >> 4) & 0b1111] ?? 0) * 1000
    // Layer I is 384 samples a frame; layer II is 1152; layer III is 1152 on MPEG 1 and 576 on
    // the half-rate versions — which is exactly the factor that makes a 22 kHz voice file report
    // double its length if you assume 1152 everywhere.
    const samples = layer === 1 ? 384 : layer === 3 && version !== 1 ? 576 : 1152
    return { at: i, version, layer, bitrate, rate, samples, mono: ((b3 >> 6) & 0b11) === 3 }
  }
  return null
}

/** Where a Xing/Info table sits behind the frame header: past the side information, whose size is
 *  fixed by version and channel mode. */
const sideInfo = (f: Frame): number => (f.version === 1 ? (f.mono ? 17 : 32) : (f.mono ? 9 : 17))

/**
 * The length of an mp3 in seconds, or null if the file will not say.
 *
 * A VBR file carries a Xing/Info (or VBRI) table with the frame COUNT, which is exact. A CBR file
 * carries nothing, and size ÷ bitrate is exact enough — the error is one frame, 26 ms.
 */
export async function audioSeconds(file: string): Promise<number | null> {
  let handle
  try {
    handle = await open(file, 'r')
  } catch {
    return null
  }
  try {
    const { size } = await handle.stat()
    const buf = Buffer.alloc(Math.min(HEAD, size))
    await handle.read(buf, 0, buf.length, 0)

    // An ID3v2 tag sits in front of the audio and its length is a syncsafe integer — seven bits
    // per byte, so a plain read is 1/8 short and lands mid-tag.
    let start = 0
    if (buf.length > 10 && buf.toString('latin1', 0, 3) === 'ID3') {
      start = 10 + ((buf[6]! << 21) | (buf[7]! << 14) | (buf[8]! << 7) | buf[9]!)
    }
    const frame = frameAt(buf, Math.min(start, Math.max(0, buf.length - 4)))
    if (!frame) return null

    const table = frame.at + 4 + sideInfo(frame)
    const tag = buf.length >= table + 8 ? buf.toString('latin1', table, table + 4) : ''
    if (tag === 'Xing' || tag === 'Info') {
      const flags = buf.readUInt32BE(table + 4)
      // Bit 0 says a frame count follows. Without it the table is only a seek index and says
      // nothing about length.
      if (flags & 1 && buf.length >= table + 12) {
        const frames = buf.readUInt32BE(table + 8)
        if (frames > 0) return round(frames * frame.samples / frame.rate)
      }
    }
    // VBRI is Fraunhofer's version of the same idea and sits at a fixed offset instead.
    const vbri = frame.at + 4 + 32
    if (buf.length >= vbri + 20 && buf.toString('latin1', vbri, vbri + 4) === 'VBRI') {
      const frames = buf.readUInt32BE(vbri + 14)
      if (frames > 0) return round(frames * frame.samples / frame.rate)
    }
    if (!frame.bitrate) return null
    return round((size - frame.at) * 8 / frame.bitrate)
  } catch {
    return null
  } finally {
    await handle.close()
  }
}

/** Tenths. A song is not timed to the millisecond and a list of them reads better without it. */
const round = (secs: number): number => Math.round(secs * 10) / 10
