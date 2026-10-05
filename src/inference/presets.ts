// ＋ ADD A SERVICE — the shapes this build can actually speak, offered as a first question.
//
// ⚠️ WHY A PRESET AND NOT A BLANK FORM (2026-08-12). "Add a service" asked for an id, a role, a
// transport word, a host and a port, and every one of those is a decision about plumbing that the
// person has no way to get right: `grpc` vs `http` is not a preference, it is a fact about the
// thing on the other end. Pick WHAT IT IS and the transport, the port and the call shape are
// filled; the only thing left is where it is.
//
// ⚠️ AND THE LIST IS HONEST ABOUT ITS LIMIT. These are the transports with an adapter behind them,
// not a catalogue of things that would be nice. A row for something with no adapter would look
// configured and render nothing, which is the exact failure the shelf's three states exist to
// prevent one level down. The UI's last option says so out loud: a service speaking something else
// needs a new version of xokolat.
//
// ⚠️ COMFYUI WAS THIS COMMENT'S OWN EXAMPLE OF WHAT NOT TO OFFER, until 2026-08-17, when it got an
// adapter. It is here now for the reason every other row is: there is code behind it. Note what
// changed and what did not — the rule was never "no ComfyUI", it was "nothing without an adapter",
// and the list moves when the code does.

import type { InferenceRole, Transport } from '../types/inference.ts'
import { CLI_BRAINS } from './cli/brains.ts'

/**
 * WHICH FAMILY A CONNECTION FOR XOKO BELONGS TO — declared, not worked out from the transport.
 *
 * ⚠️ THE UI USED TO INFER IT AND GOT IT WRONG (2026-08-30). It read `cli` as "a subscription" and
 * `tls` as "cloud", which put a key you hold for one provider and a key you hold for a hundred
 * models in the same bucket — and left "a cloud model" meaning, secretly, OpenRouter. Three
 * families, each answering a different question about what you already have:
 *
 *   subscription   a client on this machine you have signed into. Nothing to paste.
 *   local          a model running here. No account, no key.
 *   cloud          an endpoint and a key. One key, many models.
 *
 * ⚠️ AND THERE IS NO "one provider's own API" FAMILY, deliberately. A direct provider key and a
 * multi-model key are the SAME ROW — same transport, same three fields — differing only in which
 * address is pre-filled. A family of them would make the screen look like it offers four kinds of
 * thing when it offers three, and nothing is lost: the address is editable, so any
 * OpenAI-compatible endpoint is this same tile.
 */
export const BRAIN_FAMILIES = ['subscription', 'local', 'cloud'] as const

export type BrainFamily = (typeof BRAIN_FAMILIES)[number]

export interface ServicePreset {
  readonly id: string
  readonly label: string
  /** One line: what kind of thing this is, for the option's tooltip. */
  readonly what: string
  /**
   * ⚠️ WHAT THE NAME BOX ALREADY SAYS when you pick this (2026-09-06). Nobody adding Draw Things
   * should have to type "Draw Things", and until this existed the form opened with an empty name
   * and a REQUIRED id — a slug, invented by hand, for a folder the person will never open.
   *
   * Not `label`: that is the option's text in the picker, where "Draw Things (gRPC)" earns its
   * parenthesis and "a plain http endpoint" is a category rather than a name. This is what the
   * thing is CALLED once it is yours.
   */
  readonly name: string
  /**
   * The id this preset produces when the name is left alone — the `<engine>` segment of every run
   * folder and the `provider` in a provenance record.
   *
   * ⚠️ IT IS NOT DERIVED FROM `name`, and must not be: `▶ take: draw-things-grpc` resolves through
   * here (src/library/take.ts), so this string is a name the outside world says out loud. Renaming
   * the service renames nothing — a new name only decides the id of a row you have not made yet.
   */
  readonly suggest: string
  /** Set on every `role: 'brain'` preset and on nothing else — it is what ✨ xoko groups by. */
  readonly family?: BrainFamily
  readonly role: InferenceRole
  readonly transport: Transport
  readonly notes?: string
}

export const SERVICE_PRESETS: readonly ServicePreset[] = [
  {
    id: 'draw-things',
    name: 'Draw Things',
    label: 'Draw Things (gRPC)',
    what: 'the Draw Things gRPC server — checkpoints, LoRAs, a catalog it can be asked for',
    suggest: 'draw-things-grpc',
    role: 'generator',
    transport: { kind: 'grpc', host: '127.0.0.1', port: 7859 },
  },
  {
    id: 'http-picture',
    // ⚠️ THE ONLY PRESET WITH NO NAME, and the only one that should have none (2026-09-06). Every
    // other row names a product, so the box can say it for you. This one names a SHAPE — anything
    // that takes a picture and answers with one — so there is nothing true to pre-fill, and the
    // box shows its placeholder instead. It used to say `rembg`, which is one example of the shape
    // wearing the clothes of the answer.
    name: '',
    label: 'a plain http endpoint',
    what: 'anything that takes a picture and answers with one — a cutout daemon, a small tool you '
      + 'wrote. Four fields describe the call; nothing about the tool is in this app.',
    suggest: 'rembg',
    role: 'generator',
    // The defaults are rembg's own shape, because it is the archetype and a form you have to
    // invent from nothing is a form nobody finishes. Every field is editable.
    transport: {
      kind: 'http',
      host: '127.0.0.1',
      port: 7000,
      call: { method: 'POST', path: '/api/remove', send: 'form', field: 'file', receive: 'image' },
    },
  },
  {
    id: 'ollama',
    name: 'Ollama',
    label: 'Ollama',
    what: 'A model running on this machine — no key, no account, nothing to sign into. `ollama '
      + 'serve` starts it and whatever you have pulled is what you can pick. LM Studio (:1234) and '
      + 'llama.cpp\'s server speak the same shape: same row, different address.',
    suggest: 'ollama',
    family: 'local',
    role: 'brain',
    // ⚠️ NO `engines` HERE, deliberately: this one CAN be asked what it has (`GET /v1/models`), and
    // a typed-in list would be a second opinion about the models you have actually pulled.
    transport: { kind: 'openai', host: '127.0.0.1', port: 11434, basePath: '/v1' },
    notes: 'Speaks the OpenAI shape, so LM Studio (:1234) and llama.cpp\'s server are the same row '
      + 'with a different port.',
  },
  {
    id: 'comfyui',
    name: 'ComfyUI',
    label: 'ComfyUI',
    what: 'a ComfyUI on this machine or another one — a workflow there is a node graph, and it makes '
      + 'whatever you have models for: pictures, songs, voices, meshes',
    suggest: 'comfyui',
    role: 'generator',
    transport: { kind: 'comfy', host: '127.0.0.1', port: 8188 },
    notes: 'One ComfyUI serves pictures, songs, voices and meshes — what a workflow makes is said '
      + 'by its kind, never by this row.',
  },
  // ⚠️ THE CLOUD ROWS — an endpoint and a key, over the OpenAI shape. It was ONE row called "a
  // cloud model" whose address was quietly OpenRouter's, which is a mystery box: you pressed a
  // generic word and got a specific company. Named rows instead, one per service, each with its own
  // key slot — so a key you saved for one is still there when you come back to it.
  //
  // ⚠️ AND THE ADDRESS IS EDITABLE BEFORE YOU CONNECT. These two are pre-filled starting points,
  // not the limit: anything speaking `POST /chat/completions` is this row with a different host,
  // which is why there is no separate family for a direct provider key.
  {
    id: 'openrouter',
    name: 'OpenRouter',
    label: 'OpenRouter',
    what: 'One key in front of most of the frontier models — Claude, Gemini, GPT, Grok, Llama. You '
      + 'choose which model answers; the key lives in an owner-only file and never comes back out.',
    suggest: 'openrouter',
    family: 'cloud',
    role: 'brain',
    transport: { kind: 'openai', host: 'openrouter.ai', port: 443, basePath: '/api/v1', tls: true },
    notes: 'Nothing here is version-pinned: you choose the model, this row only says what shape the '
      + 'conversation has.',
  },
  {
    id: 'groq',
    name: 'Groq',
    label: 'Groq',
    what: 'Open models served very fast, on somebody else\'s hardware. One key, and the model list '
      + 'comes from the endpoint itself.',
    suggest: 'groq',
    family: 'cloud',
    role: 'brain',
    transport: { kind: 'openai', host: 'api.groq.com', port: 443, basePath: '/openai/v1', tls: true },
    notes: 'Any other OpenAI-compatible endpoint is this same row with a different address — the '
      + 'field is yours to edit before you connect.',
  },
  // ⚠️ ONE PRESET PER BRAIN THIS BUILD SHIPS, generated from the whitelist rather than repeated
  // here — the two lists could not disagree even if someone tried, and adding a brain is one entry
  // in one file. The row that comes out is TWO FIELDS: which brain, and that is all. Its models
  // come from the same file at read time (`declaredEngines`), so nothing about a vendor's lineup
  // is ever copied into your registry to go stale.
  ...CLI_BRAINS.map((brain): ServicePreset => ({
    id: `cli-${brain.id}`,
    label: brain.label,
    // A client's label IS its name — "Claude Code" is what it is called, not a category.
    name: brain.label,
    what: brain.what,
    suggest: brain.suggest,
    family: 'subscription',
    role: 'brain',
    transport: { kind: 'cli', brain: brain.id },
    notes: brain.notes,
  })),
]
