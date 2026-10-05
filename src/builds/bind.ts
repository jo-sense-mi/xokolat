// 🧩 WHAT A COMPOSITION LEAVES BEHIND THAT IS NOT A MEDIUM — the bound file, written by this app.
//
// ⚠️ A BUILD IS NOT A MEDIUM (2026-08-24). For one day a bound book was `book`: a medium in the
// closed list beside image and music, a `bind` kind, a `builtin` service, a `parts` workflow input.
// Four inventions to file one PDF — and the first of them put a PRODUCT NAME in a list of
// MATERIALS. A medium is a unit of creation, something a person asks for by name: "make me an
// image", "make me a song". Nobody asks for a document. They ask for a book, a comic, a zine, a
// portfolio — every one of which is an ASSEMBLY of images and words, which is to say a composition.
//
// ⚠️ AND IT LANDS IN THE CHAIN'S OWN RUN FOLDER, beside the pictures that became its pages
// (src/compositions/chain.ts). It had a tree of its own — `builds/<slug>/<run>/` — for exactly as
// long as the chain's pictures lived on the media shelves: two homes because the run had none. The
// run has one now, so the book and the pages it was made of are in it together.
//
// ⚠️ THE RUN IS NEVER NAMED BY THE BROWSER (§15 rule 2). It hands back the run the server minted
// when the chain started, and paths to assets it already made; every one of them is resolved
// against the content root before it is opened.

import { Buffer } from 'node:buffer'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

import sharp from 'sharp'

import { chainRel } from '../content/run.ts'
import { patchChainRun, readChainRun } from '../compositions/chain.ts'
import { resolveIn } from '../paths.ts'
import type { Roots } from '../paths.ts'
import { BINDS, PAGES } from '../types/composition.ts'
import type { Bind, BindStep } from '../types/composition.ts'
import { writePdf } from './pdf.ts'
import type { Page } from './pdf.ts'

/** What each container writes. The list is the whitelist. */
const EXT: Record<Bind, string> = { pdf: 'pdf', svg: 'svg' }

export interface BuildRequest {
  readonly composition: string
  /** The chain RUN this belongs to — minted when ▶ was pressed (src/compositions/chain.ts). */
  readonly run: string
  /** Which step of the chain bound it. */
  readonly step: string
  readonly binds: Bind
  readonly page?: string
  /**
   * WHAT IS BOUND — and it is not the same kind of string in both containers.
   *
   * `pdf` — content-root-relative asset paths, in the order they become pages. Every one is
   *         resolved against the content root before it is opened (§15 rule 2).
   * `svg` — the MARKUP ITSELF, one document per entry. Nothing is read off disk, so nothing here
   *         is a path and nothing is resolved: these are the words a `text` step wrote.
   */
  readonly parts: readonly string[]
  /** One line per page. Short is fine; missing is fine — that page is just the picture. */
  readonly captions?: readonly string[]
}

export interface BuildResult {
  readonly runId: string
  /** Content-root-relative run folder. */
  readonly path: string
  /** Content-root-relative master. */
  readonly master: string
}

export class BuildError extends Error {
  readonly status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'BuildError'
    this.status = status
  }
}

/** ⚠️ FLATTENED ONTO WHITE, because a cut-out is exactly what a page often is and a PDF page has no
 *  background of its own — an unflattened alpha prints as whatever the reader guesses. JPEG because
 *  `DCTDecode` is a PDF-native filter: the bytes are copied in whole rather than re-encoded by us. */
async function toPage(bytes: Buffer, caption: string): Promise<Page> {
  const { data, info } = await sharp(bytes, { failOn: 'error' })
    .rotate()
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 88, chromaSubsampling: '4:4:4' })
    .toBuffer({ resolveWithObject: true })
  return { jpeg: data, width: info.width, height: info.height, caption }
}

/**
 * THE DOCUMENT OUT OF WHAT A BRAIN WROTE.
 *
 * ⚠️ IT TRIMS, IT DOES NOT REPAIR. A brain asked for markup and nothing else will now and then
 * wrap it in a fence or open with a sentence — so the first `<svg` and the last `</svg>` are the
 * document and everything outside them is commentary. What is between them is written exactly as
 * it arrived: an SVG this app "fixed" would be a drawing nobody can account for.
 */
function svgFrom(text: string): string {
  const from = text.indexOf('<svg')
  const to = text.lastIndexOf('</svg>')
  if (from < 0 || to < from) {
    throw new BuildError('what that step wrote is not an SVG document — there is no <svg> in it')
  }
  return `${text.slice(from, to + '</svg>'.length).trim()}\n`
}

/**
 * BIND ONE CHAIN'S OUTPUT.
 *
 * ⚠️ ONE CAPTION PER PAGE, BY POSITION, and it is deliberately the dumbest thing that could work:
 * page *i* takes line *i*. A chain that produced its captions with the same `each` that produced
 * its pages therefore lines up by construction. Extra lines are ignored; missing ones leave a page
 * with just the picture, which is a real page and not an error.
 *
 * ⚠️ ONE FILE OUT, IN BOTH CONTAINERS, because a bind is THE RUN'S RESULT and a run has one. A
 * `pdf` gets there by assembling many parts into it; an `svg` is already one document, so a step
 * that wrote several is refused BY NAME rather than quietly filed as its first. That refusal is the
 * honest shape of a real gap: when a chain wants to file a SET of drawings, what it needs is a run
 * that can hold several results, not a bind that picks one and loses the rest.
 */
export async function bind(roots: Roots, req: BuildRequest): Promise<BuildResult> {
  if (!(BINDS as readonly string[]).includes(req.binds)) {
    throw new BuildError(`${JSON.stringify(req.binds)} is not something this app binds — ${BINDS.join(', ')}`)
  }
  if (!req.parts.length) {
    throw new BuildError('there is nothing to bind — the chain handed this step nothing')
  }
  // ⚠️ THE RUN HAS TO ALREADY EXIST. It is the folder the chain's own presses have been writing
  // into since ▶; a bind that minted its own would put the result somewhere the steps are not.
  const record = await readChainRun(roots, req.composition, req.run)
  if (!record) throw new BuildError(`there is no run ${req.run} of ${req.composition}`, 404)

  const dir = resolveIn(roots.content, chainRel(req.composition, req.run))
  await mkdir(dir, { recursive: true })

  // ⚠️ NAMED AFTER THE COMPOSITION, not after a service. There is no service — that is the point of
  // this file — and the composition is the only name this file has any business carrying.
  const name = `${req.composition}.${EXT[req.binds]}`

  if (req.binds === 'svg') {
    if (req.parts.length > 1) {
      throw new BuildError(
        `${req.step} was handed ${req.parts.length} documents and an svg binds one — `
        + 'take the `list` or the `each` off the step it reads')
    }
    await writeFile(resolveIn(dir, name), svgFrom(req.parts[0]!))
  } else {
    const page = req.page ?? 'letter'
    if (!(PAGES as readonly string[]).includes(page)) {
      throw new BuildError(`${JSON.stringify(page)} is not a page size — ${PAGES.join(', ')}`)
    }
    const captions = req.captions ?? []
    const pages: Page[] = []
    for (const [i, rel] of req.parts.entries()) {
      // ⚠️ RESOLVED AGAINST THE CONTENT ROOT, EVERY ONE. These paths came off the browser's
      // manifest, which is to say off the wire (§15 rule 2).
      const bytes = await readFile(resolveIn(roots.content, rel))
      pages.push(await toPage(bytes, (captions[i] ?? '').trim()))
    }
    await writeFile(resolveIn(dir, name), writePdf(pages, page))
  }

  await patchChainRun(roots, req.composition, req.run, {
    bound: { file: name, step: req.step, parts: req.parts.length },
  })

  const at = chainRel(req.composition, req.run)
  return { runId: req.run, path: at, master: `${at}/${name}` }
}

/** What a bind step asks for, read off the step itself — so the server never takes the container or
 *  the paper from the browser. Only the assets and the words travel. `page` is the `pdf` container's
 *  and an `svg` carrying one is ignored rather than refused: paper is not a property of markup. */
export const bindShape = (step: BindStep): Pick<BuildRequest, 'binds' | 'page'> => ({
  binds: step.binds,
  ...(step.page ? { page: step.page } : {}),
})
