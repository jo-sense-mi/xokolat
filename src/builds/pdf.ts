// 📖 A PDF, WRITTEN BY HAND — pages in, one file out, and no dependency for it.
//
// ⚠️ IT LIVES UNDER src/builds/ AND NOT UNDER src/inference/, WHICH IS THE WHOLE POINT
// (2026-08-24). Nothing here renders. There is no model, no port, no seed, no engine — the same
// pages and the same words give the same bytes every time. Binding is what a 🧩 COMPOSITION does
// at the end of itself, so it is filed with compositions rather than with the services that make
// the pictures it binds.
//
// ⚠️ WHY THIS IS NOT A LIBRARY (security rule 3: the dependency tree stays small and locked). A
// picture book is the simplest document there is: one image per page, one caption under it, no
// flowing text, no tables, no typography beyond a base-14 face every reader has built in. The PDF
// that expresses that is a header, a handful of objects, a byte-offset table and `%%EOF` — about a
// hundred lines, all of them here, versus a package that can lay out anything and is a supply chain.
//
// ⚠️ AND IT MAKES ONE SHAPE, DELIBERATELY. A page is a picture with words under it. When a second
// shape is genuinely needed — a spread, a cover, a bleed — it is a second operation with its own
// name, not a page-layout engine growing inside this file.
//
// ⚠️ IMAGES GO IN AS JPEG (`DCTDecode`), which is a PDF-native filter, so the bytes are copied in
// whole rather than re-encoded by us. Alpha is flattened onto white first: a cut-out on
// transparency is exactly what a mascot page is, and PDF's own transparency needs a soft-mask
// object per image for a result nobody printing a book would see.

import { Buffer } from 'node:buffer'

/**
 * THE SHAPES A BOUND PAGE COMES IN, in points.
 *
 * ⚠️ THREE, AND THEY ARE NOT ARBITRARY. Letter and A4 are what a printer and a print-on-demand shop
 * take; square is what a picture book usually is and what reads best held in a hand. A fourth is a
 * row here, not a feature.
 */
export const PAGE_SIZES: Record<string, readonly [number, number]> = {
  letter: [612, 792],
  a4: [595, 842],
  square: [612, 612],
}

/** One page, as this writer thinks of it. */
export interface Page {
  /** JPEG bytes. */
  readonly jpeg: Buffer
  readonly width: number
  readonly height: number
  /** What goes under the picture. Empty is fine — the page is then just the picture. */
  readonly caption: string
}

const MARGIN = 54
const CAPTION_SIZE = 13
const CAPTION_LEAD = 17
/** Helvetica's average advance is close enough to half its size for wrapping a caption; the
 *  alternative is shipping a width table for a face nobody is setting a book in. */
const AVG_CHAR = 0.5

/**
 * ⚠️ WinAnsi, WHICH MEANS BYTES AND NOT UTF-8. A PDF literal string is a byte sequence read through
 * the font's encoding; writing UTF-8 into one puts mojibake on the page rather than failing. Curly
 * quotes and dashes — which is most of what an LLM actually writes — are folded to their ASCII
 * cousins first, and anything still out of range becomes a space rather than a black box.
 */
function winAnsi(text: string): string {
  return text
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[^ -ÿ]/g, ' ')
}

const escape = (text: string): string => winAnsi(text).replace(/([\\()])/g, '\\$1')

/** Greedy wrap on words. A word longer than the line is left long — breaking it would invent a
 *  hyphen the author did not write. */
function wrap(text: string, maxChars: number): string[] {
  const out: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (!line) line = word
    else if (line.length + 1 + word.length <= maxChars) line += ` ${word}`
    else { out.push(line); line = word }
  }
  if (line) out.push(line)
  return out
}

/** The content stream for one page: place the picture, then set the caption under it. */
function contentOf(page: Page, lines: readonly string[], [PAGE_W, PAGE_H]: readonly [number, number]): string {
  const usable = PAGE_W - MARGIN * 2
  const textHeight = lines.length * CAPTION_LEAD
  // The picture takes what the caption does not, and keeps its aspect ratio inside that box.
  const boxH = PAGE_H - MARGIN * 2 - (textHeight ? textHeight + CAPTION_LEAD : 0)
  const scale = Math.min(usable / page.width, boxH / page.height)
  const w = page.width * scale
  const h = page.height * scale
  const x = (PAGE_W - w) / 2
  // ⚠️ THE PICTURE AND ITS CAPTION ARE ONE BLOCK, CENTRED. Hanging the picture off the top margin
  // is right only when it happens to fill the box; a 4:3 page on square paper then sits high with
  // a third of the sheet empty under the words. Centring the pair reads as a page in every
  // combination of aspect ratio and paper this can be handed.
  const block = h + (textHeight ? CAPTION_LEAD + textHeight : 0)
  const y = (PAGE_H - block) / 2 + block - h
  const draw = `q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im0 Do Q`
  if (!lines.length) return draw
  const first = y - CAPTION_LEAD - CAPTION_SIZE * 0.2
  const set = lines.map((l, i) => (i ? 'T* ' : '') + `(${escape(l)}) Tj`).join('\n')
  return `${draw}\nBT /F1 ${CAPTION_SIZE} Tf ${CAPTION_LEAD} TL `
    + `${MARGIN} ${first.toFixed(2)} Td\n${set}\nET`
}

/**
 * The whole file.
 *
 * ⚠️ THE XREF TABLE IS BYTE OFFSETS INTO WHAT WAS ALREADY WRITTEN, so objects are appended to a
 * buffer list and measured as they go. Getting this wrong produces a file that opens in one reader
 * and not another, which is the failure mode worth being careful about — not the layout.
 */
export function writePdf(pages: readonly Page[], size = 'letter'): Buffer {
  if (!pages.length) throw new Error('there is nothing to bind — no pages were handed to this')
  const box = PAGE_SIZES[size]
  if (!box) {
    throw new Error(`${JSON.stringify(size)} is not a page size — ${Object.keys(PAGE_SIZES).join(', ')}`)
  }
  const [PAGE_W, PAGE_H] = box

  const chunks: Buffer[] = []
  const offsets: number[] = []
  let at = 0
  const put = (text: string | Buffer): void => {
    const buf = Buffer.isBuffer(text) ? text : Buffer.from(text, 'latin1')
    chunks.push(buf)
    at += buf.length
  }
  /** Open object N, remembering where it started. */
  const obj = (n: number, body: string): void => {
    offsets[n] = at
    put(`${n} 0 obj\n${body}\nendobj\n`)
  }
  const stream = (n: number, dict: string, data: Buffer): void => {
    offsets[n] = at
    put(`${n} 0 obj\n<< ${dict} /Length ${data.length} >>\nstream\n`)
    put(data)
    put('\nendstream\nendobj\n')
  }

  // 1 catalog · 2 pages · 3 font, then three objects per page.
  const pageObj = (i: number): number => 4 + i * 3
  const total = 3 + pages.length * 3

  put('%PDF-1.4\n')
  // A comment of high bytes is what tells a transfer program this file is binary.
  put(Buffer.from([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]))

  obj(1, '<< /Type /Catalog /Pages 2 0 R >>')
  obj(2, `<< /Type /Pages /Count ${pages.length} /Kids [`
    + `${pages.map((_, i) => `${pageObj(i)} 0 R`).join(' ')}] >>`)
  obj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')

  const maxChars = Math.floor((PAGE_W - MARGIN * 2) / (CAPTION_SIZE * AVG_CHAR))
  for (const [i, page] of pages.entries()) {
    const n = pageObj(i)
    const lines = page.caption.trim() ? wrap(page.caption.trim(), maxChars) : []
    obj(n, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] `
      + `/Resources << /XObject << /Im0 ${n + 2} 0 R >> /Font << /F1 3 0 R >> >> `
      + `/Contents ${n + 1} 0 R >>`)
    stream(n + 1, '', Buffer.from(contentOf(page, lines, box), 'latin1'))
    stream(n + 2, `/Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} `
      + '/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode', page.jpeg)
  }

  const xref = at
  const rows = ['0000000000 65535 f ']
  for (let n = 1; n <= total; n += 1) {
    rows.push(`${String(offsets[n] ?? 0).padStart(10, '0')} 00000 n `)
  }
  put(`xref\n0 ${total + 1}\n${rows.join('\n')}\n`)
  put(`trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)

  return Buffer.concat(chunks)
}
