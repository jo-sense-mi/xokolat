// THE WORKFLOW — one askable thing, and the thing a person actually picks.
//
// ⚠️ THE WORD IS `workflow`, EVERYWHERE (2026-10-05). It was `recipe` from 2026-08-14, chosen so
// as not to collide with ComfyUI's word for its graph. That collision turned out to be the point: a
// row here IS a graph with every widget settable (`Graph`, below — a downloaded graph is one of
// these), so the two words named one thing, and the one nobody outside this app used was ours.
// `workflow` = one askable row, one press. `composition` = a chain that outlives one press — the
// process-word "workflow" might suggest is that one, and it already has its name. See DECISIONS.md.
//
// ⚠️ THE UNIT IS NOT A CHECKPOINT (2026-08-08). It was, and the model broke on contact with real
// workflows. Two examples settle it, both from content-factory's `palettes/image-workflows.json`,
// which has 23 workflows over about three checkpoints:
//
//   sdxl-style-ref = SDXL **plus an IP-Adapter with target_blocks "Style"**. Plain SDXL cannot do
//     style transfer at all, so "takes a style reference" is not a fact about `sd_xl_base_1.0.ckpt`
//     — it is a fact about the workflow. Declaring it on the checkpoint is a lie about every other
//     workflow that checkpoint appears in.
//   flux-kontext vs flux-kontext-fast = the SAME checkpoint, one with a dev→schnell LoRA to run at
//     4 steps instead of 28. Two rows. Literally inexpressible when the row IS the file.
//
// So: checkpoints keep the facts that really are theirs (`Engine` in ./inference.ts — a locked step
// count, an idiom, a negative branch), and a WORKFLOW names one of them and says what it
// adds on top. What you pick is a workflow.
//
// ⚠️ AND THE NAMES ARE THE FIELD'S. `t2i`, `i2i`, `edit` — not `make`, `vary`, `restyle`. Those were
// invented here, and nobody in this world says "vary". A vocabulary the user already has is worth
// more than one that is internally tidier.

import type { Medium } from './medium.ts'
import type { ParamValue, Params } from './request.ts'

/**
 * WHAT KIND OF ASK THIS IS. Declared per workflow, never derived: `i2i` and `edit` both take a
 * prompt and one picture, and what separates them is what the model DOES with it — Kontext reads
 * the picture as context and follows an instruction, img2img re-noises it and follows a
 * description. No amount of looking at the inputs tells you which.
 *
 * ⚠️ AND IT IS A REGISTRY ROW, NOT A UNION (2026-08-12). It was a closed five: `t2i · i2i · edit ·
 * style · inpaint`. content-factory's real palette — 23 workflows, the thing this app is being built
 * to hold — does not fit in it: `sdxl-face` keeps an IDENTITY and is not `style`, `sdxl-canny`
 * follows a SHAPE and is neither, and a background remover takes no prompt at all. A closed union
 * cannot grow without a release, and a person adding a service is exactly the person who needs a
 * verb this build has never heard of.
 *
 * So the list is `registries/kinds.json` (src/inference/kinds.ts), and this type is the slug. The
 * registry decides ORDER and MEANING; it does not decide legality — an undescribed kind still runs.
 */
export type WorkflowKind = string

/** One row of the kind registry: the word, what it means in one line, and what it makes. */
export interface Kind {
  readonly slug: WorkflowKind
  /** How it reads to a person. The picker's tooltip and the 🔌 page's group heading. */
  readonly face: string
  /**
   * WHAT THIS VERB PRODUCES — the band it sits in when capabilities are listed.
   *
   * ⚠️ DECLARED, NOT DERIVED FROM WHICHEVER SERVICE HAPPENS TO RUN IT (2026-08-13). The medium is
   * knowable that way today, and inferring it is the same mistake as inferring a checkpoint's caps
   * from its filename: it is right until the day a service serves two media, and then it is wrong
   * silently. Same rule as everywhere else here — declared, never guessed.
   *
   * ⚠️ AND A VERB THAT SPANS TWO MEDIA IS TWO KINDS. `t2i` is words→picture; words→song is its own
   * row with its own name, because a new medium brings its own verbs rather than borrowing image
   * ones. That is what keeps this a flat list of nine rather than a matrix.
   *
   * Absent for an undescribed kind, which sorts last in a band of its own.
   */
  readonly medium?: Medium
}

/**
 * THE SLOTS A WORKFLOW TAKES. `prompt` is the sentence; the rest are pictures, and each one is a
 * slot in the reference tray. The names are the wire's, not prose: a `Reference.role` IS one of
 * these, so the tray, the request and the adapter all speak one word per slot.
 *
 * ⚠️ `control` IS A FOURTH SLOT AND NOT A KIND OF `ref` (2026-08-12). What feeds a ControlNet is a
 * picture read for its SHAPE — an edge map, a depth map, a pose — and what feeds an IP-Adapter is a
 * picture read for its CONTENT. `sdxl-ref-canny` takes one of each at the same time, so they cannot
 * be the same slot; content-factory's palette has called them `ref` and `control` all along.
 *
 * ⚠️ THE THIRD SLOT WAS CALLED `style` UNTIL 2026-08-16, AND THAT WORD WAS ALREADY TAKEN. A STYLE is
 * WORDS — a technique, a list of descriptors, layer 3 of the classification (`src/types/style.ts`) —
 * and it rides on `request.style`. This slot is a PICTURE, handed to an IP-Adapter pointed at the
 * style blocks. Two meanings of one word, and they met inside the same request object:
 * `{ style: "ink-linework", refs: [{ role: "style" }] }`. Renamed to `look` on the SLOT, because the
 * noun is the one a person says out loud and the slot is the one only this codebase ever names.
 */
export const WORKFLOW_INPUTS = ['prompt', 'ref', 'look', 'control', 'mask'] as const

export type WorkflowInput = (typeof WORKFLOW_INPUTS)[number]

/**
 * A TRAY SLOT: one picture, dropped on the bar by hand. Everything but the sentence, which is also
 * exactly what a `Reference.role` may be and what the resolve/refuse checks read.
 *
 * ⚠️ THERE WAS A SIXTH INPUT CALLED `parts` FOR ONE DAY (2026-08-24) — "all the pictures an
 * earlier step made, in order" — so that a chain could press a workflow that BOUND them. It is gone
 * with the medium it existed to fill. A workflow is one ask answered by one service; "twelve pages
 * into one file" is not an ask, it is what a COMPOSITION does at the end of itself, and it is a
 * step of its own now (`BindStep`, src/types/composition.ts). Every input here is a thing a person
 * can put on the bar, which is what made the collection slot the odd one out in the first place.
 */
export type RefSlot = Exclude<WorkflowInput, 'prompt'>

export const REF_SLOTS: readonly RefSlot[] = WORKFLOW_INPUTS.filter(
  (i): i is RefSlot => i !== 'prompt')

/**
 * ⚠️ THESE THREE LISTS ARE INDEXED, AND THE INDEX IS THE WIRE VALUE. They are ControlNet's own
 * vocabulary as Draw Things orders it (`enums.py` in the gRPC bridge, `config.fbs`), so reordering
 * one silently changes what every workflow means. New words go on the END.
 */
export const CONTROL_INPUT_TYPES = [
  'Unspecified', 'Custom', 'Depth', 'Canny', 'Scribble', 'Pose', 'Normalbae', 'Color', 'Lineart',
  'Softedge', 'Seg', 'Inpaint', 'Ip2p', 'Shuffle', 'Mlsd', 'Tile', 'Blur', 'Lowquality', 'Gray',
] as const

export type ControlInputType = (typeof CONTROL_INPUT_TYPES)[number]

/** How the control argues with the prompt when they disagree. */
export const CONTROL_MODES = ['Balanced', 'Prompt', 'Control'] as const

export type ControlMode = (typeof CONTROL_MODES)[number]

/**
 * InstantStyle: WHICH ATTENTION BLOCKS an IP-Adapter is allowed to speak to. It is the entire
 * difference between "keep this subject" and "take this look" from one adapter file and one
 * picture — `All` writes into every block, `Style` into the one that carries style alone.
 */
export const TARGET_BLOCKS = ['All', 'Style', 'Style and Layout'] as const

export type TargetBlocks = (typeof TARGET_BLOCKS)[number]

export const LORA_MODES = ['All', 'Base', 'Refiner'] as const

export type LoraMode = (typeof LORA_MODES)[number]

/**
 * ONE CONTROL a workflow brings — an IP-Adapter or a ControlNet, plus which attached picture feeds it.
 *
 * ⚠️ THIS IS WHAT MAKES A WORKFLOW MORE THAN A CHECKPOINT (2026-08-12), and it is the reason the
 * workflow layer exists at all: `sdxl-ref`, `sdxl-face` and `sdxl-style-ref` are ONE file
 * (`sd_xl_base_1.0`) three times, differing only in which adapter is stacked on it, at what weight,
 * pointed at which blocks. Fifteen of content-factory's twenty-three workflows are this line.
 *
 * ⚠️ AND `from` IS A SLOT, NOT A FILE. The workflow says "the style picture feeds this adapter"; which
 * picture that is, is the person's business at press time.
 */
export interface Control {
  /**
   * The control checkpoint, exactly as the service's catalog names it.
   *
   * ⚠️ ABSENT MEANS THE MODEL'S OWN CHANNEL, WITH NO ADAPTER ON IT (2026-09-04). FLUX.2 klein reads
   * references natively — the picture rides the `shuffle` hint and there is NO ControlNet and no
   * IP-Adapter file to load, because the reference path is part of the checkpoint. That is klein's
   * "moodboard", and it is the reason this field is optional: a control with a file is a stack of
   * something ON a model, and a control without one is the model doing it itself.
   *
   * The wire already separated them — `hints` and `configuration.controls` are different fields of
   * the request — so a fileless control contributes a hint tensor and nothing else.
   */
  readonly file?: string
  /** Which attached picture it reads. Must be one of the workflow's own `inputs`. */
  readonly from: RefSlot
  /** What the picture IS, in the wire's words — `Shuffle` for every IP-Adapter, `Canny`/`Depth`/
   *  `Pose` for a ControlNet. It also decides which hint channel the picture rides. */
  readonly inputType: ControlInputType
  /** How hard it pulls. 1 for a ControlNet, 0.7–0.8 for an IP-Adapter, by long habit. */
  readonly weight?: number
  readonly mode?: ControlMode
  /** When it starts and stops applying, over the denoise. A ControlNet that lets go at 0.8 leaves
   *  the last fifth to the model. */
  readonly start?: number
  readonly end?: number
  /** IP-Adapter only, and only on the families that have the blocks (see TARGET_BLOCKS). */
  readonly targetBlocks?: TargetBlocks
  /** Tile/blur/lowquality controls only — the factor the hint is degraded by before it is read. */
  readonly downSamplingRate?: number
}

/**
 * A LoRA the workflow stacks on its checkpoint.
 *
 * ⚠️ IT IS PART OF THE WORKFLOW, NOT OF THE FILE. `flux-dev-fast` IS `flux_1_dev` plus the dev→schnell
 * 4-step LoRA plus `steps: 4` — the same checkpoint as `flux-dev`, which takes 28. Two workflows, one
 * file, and inexpressible anywhere else.
 */
export interface Lora {
  readonly file: string
  readonly weight?: number
  readonly mode?: LoraMode
}

export interface Workflow {
  /** Stable per service. It is what a request names, so renaming one breaks a saved choice. */
  readonly slug: string
  /** What the picker shows. Falls back to the checkpoint's label — a `t2i` row does not need to
   *  repeat "FLUX.2 klein 4B" to be readable, because the kind is already a column. */
  readonly label?: string
  readonly kind: WorkflowKind
  /**
   * THE ONE THIS MEDIUM REACHES FOR WHEN NOBODY CHOSE.
   *
   * ⚠️ IT EXISTS BECAUSE A SERVICE IS NOT A MEDIUM ANY MORE (2026-08-24). The default used to be
   * one workflow for a whole service row, filtered to that row's "plain kind" — sound reasoning while
   * a service meant a medium, and wrong the moment one row served seven. ComfyUI is one row and
   * answers every medium in the app, so six of the seven fell through to *install order*: 🔊 armed
   * the ACE-Step music graph over the model actually built for sound, and ✒ armed the one whose
   * input is a picture, which is why asking for a cat in words was answered with "attach a picture
   * first".
   *
   * Declared per KIND, which is the drawer a medium's picker opens. Absent everywhere is fine —
   * the fallback still prefers something a press can actually run (`pickDefaults`).
   */
  readonly default?: boolean
  /** The checkpoint this workflow runs on, exactly as the service's catalog names it. One, not a
   *  list: two checkpoints is two workflows, which is how the factory writes them too. */
  readonly model: string
  /** Which slots it takes. `prompt` is not implied — a background remover takes none. */
  readonly inputs: readonly WorkflowInput[]
  /**
   * WHOSE FAMILY THIS CHECKPOINT COMES FROM — `sdxl`, `flux`, `qwen`, `ace-step`, `qwen3-tts`.
   *
   * ⚠️ IT IS A FACT ABOUT COMBINING, AND NOTHING ELSE (2026-08-29). Inside one press the parts
   * already have to match, and that is what a workflow IS: checkpoint, CLIP, VAE, sampler and every
   * adapter, bound together in one row, which is exactly why the unit you plug is a workflow and
   * never a component. The constraint this names is the one ACROSS presses. A chain draws a founder
   * with FLUX and then hands it to an i2i step; an SDXL IP-Adapter cannot carry a FLUX picture, and
   * a refine from the wrong family comes back as a plausible, wrong image rather than an error.
   * Nothing in the app knew that, so a step's option list was flat.
   *
   * ⚠️ DECLARED, NEVER SNIFFED OFF THE FILENAME. `flux1-schnell-q5p.ckpt` is guessable and
   * `mymerge-v3.safetensors` is not, and a guess that is right nine times is worse than no guess:
   * the tenth is a mismatch the app marked as compatible.
   *
   * ⚠️ AND IT ORDERS, IT NEVER FORBIDS. A step's list still holds every workflow that can answer it —
   * relatives first, strangers marked. Crossing families is sometimes what you want, and finding out
   * costs one press.
   *
   * NOT the word `family` — a COMPOSITION already has one of those and it means something else
   * entirely (mascot, coloring, sticker: what the chain is FOR). Absent is fine and means unknown,
   * which sorts with the strangers rather than with anything.
   */
  readonly lineage?: string
  /**
   * The knobs the WORKFLOW brings, on top of what the checkpoint declares.
   *
   * ⚠️ THIS IS WHERE `strength: 1` LIVES for an in-context editor, and it belongs here rather than
   * on the checkpoint because it is a fact about the workflow: the same Kontext file at strength 0.6
   * is simply a broken img2img. It sits between the checkpoint's params and the request.
   */
  readonly params?: Params
  /**
   * NAMED SETS OF KNOBS THAT ONLY MEAN ANYTHING TOGETHER.
   *
   * ⚠️ SOME KNOBS ARE NOT INDEPENDENT, AND ONE OF THEM RUINS A RENDER (2026-08-31). `ace-step`
   * runs the turbo checkpoint at `steps 8, cfg 1.0`; the sft profile wants `50 / 3.5`. Cross them
   * in EITHER direction and the track distorts — so "a good default cfg" is not a number, it is
   * half of a pair, and a bare `cfg` box is a trap whichever value it starts at.
   *
   * ⚠️ AND IT IS NOT SIX WORKFLOWS, WHICH IS WHAT THIS REPLACES. `music-fast` / `music-detail` /
   * `music-base` / `music-light` were one pipeline published four times because a parameter had
   * been turned into a product (see `HoleSpec`). A preset says the same thing as data: one workflow,
   * one graph, and the combinations known to work over its own holes — including `checkpoint`,
   * which is a hole like any other here.
   *
   * ⚠️ A STARTING POSITION, NEVER A MODE. Applying one writes the values into the controls, in
   * front of the person, and every one of them can then be moved — the same rule the style picker
   * and xoko's `[key value]` bracket already keep. Nothing records which preset was chosen,
   * because what ran is the resolved bag and that is what the master carries.
   *
   * Keys are this workflow's own hole names; the parser refuses one that names a hole the graph does
   * not declare, since a preset that silently sets nothing is worse than no preset.
   */
  readonly presets?: Readonly<Record<string, Params>>
  /**
   * WHICH OF THE MEDIUM'S KNOBS THIS WORKFLOW ACTUALLY READS — graphless services only.
   *
   * ⚠️ A GRAPH SAYS THIS FOR ITSELF AND NOTHING ELSE DID (2026-09-04). `settableKnobs` intersects a
   * ComfyUI workflow's holes with the medium's table, so a workflow is offered exactly what it
   * declares. A workflow with no graph fell through to the WHOLE table — which is how `cutout`, a
   * background remover reached over plain HTTP, came to offer a sampler, a cfg, a clipSkip and a
   * seedMode. Nine boxes, none of them reaching the service, on a workflow whose honest answer is
   * `knobs: []`.
   *
   * Absent means the whole table, which is right for a workflow on a service the table was written
   * for (draw-things reads all nine). Present narrows it, and a name the medium has never heard of
   * is refused where it is written rather than drawn as a box that sets nothing.
   */
  readonly knobs?: readonly string[]
  /** The adapters stacked on the checkpoint. Each names a slot in `inputs` that feeds it. */
  readonly controls?: readonly Control[]
  readonly loras?: readonly Lora[]
  /** For a service that takes a whole graph rather than a set of fields — ComfyUI, today. Absent
   *  for every workflow whose service has an opinion of its own about what a render is. */
  readonly graph?: Graph
  readonly notes?: string
}

/**
 * A NODE GRAPH THE SERVICE RUNS, AND THE HOLES THIS APP MAY FILL.
 *
 * ⚠️ THE GRAPH IS CONTENT AND THE HOLES ARE FORMAT (2026-08-17), and that split is the whole idea.
 * ComfyUI has no fixed vocabulary — a song, a voice and a mesh come out of node families that share
 * nothing, and the app cannot know what `TextEncodeAceStepAudio1.5` wants any more than it can know
 * what somebody installs tomorrow. So it does not try. The graph arrives from the library exactly as
 * it was exported, opaque, and the workflow says which nodes take the sentence, the seed and the
 * attached picture. Those three sentences are the entire contract.
 *
 * ⚠️ WHICH IS ALSO THE SECURITY POSITION, and it is not a small one: a downloaded graph names node
 * classes THIS MACHINE'S ComfyUI already has, and a class it does not have is a run that fails. A
 * payload cannot add a transport (src/library/payload.ts) and cannot reach anything but the service
 * whose row it lands under. What it can do is describe a render — which is what a workflow is.
 */
export interface Graph {
  /**
   * ComfyUI's API format (`Save (API format)`), verbatim: node id → `{ class_type, inputs }`.
   *
   * ⚠️ OPAQUE ON PURPOSE. The parser checks that it is an object of objects and that the holes and
   * the output point at nodes that exist; it does NOT check node classes, wire types or whether the
   * thing will run. Those are facts about the ComfyUI on the other end, and a second opinion here
   * would refuse graphs that work and pass graphs that do not.
   */
  readonly nodes: Readonly<Record<string, unknown>>
  /**
   * Which node writes the master — a save node's id.
   *
   * ⚠️ DECLARED, BECAUSE A GRAPH CAN SAVE MORE THAN ONE THING. The factory's voice graph writes a
   * reusable `.qvp` profile AND an audio preview from two different nodes; "the last output" would
   * pick whichever ComfyUI happened to list first. The container is NOT declared alongside it —
   * that comes back on the filename, and `writeMaster` refuses one that disagrees with the medium.
   */
  readonly out: string
  /**
   * WHAT THE APP MAY WRITE INTO THE GRAPH: `<our word>` → `<node id>.<input>`.
   *
   * Our words are `prompt`, one of the workflow's own ref slots (the picture is uploaded first and
   * the returned name is what lands), or any knob key — `seed`, `steps`, `duration`. A knob with no
   * hole is a knob this workflow does not expose, and the graph's own value stands; that is how a
   * published graph keeps working when the app learns a knob it has never heard of.
   *
   * ⚠️ ONE WORD MAY POINT AT SEVERAL NODES, and a real graph forced it: ACE-Step's length is set
   * BOTH on the text encoder and on the empty latent, and a `duration` that reached only one of
   * them would produce two minutes of audio in a thirty-second container. A list, not a second
   * field — the alternative was making the library author write the same number twice and hope.
   */
  readonly holes?: Readonly<Record<string, Hole>>
}

/**
 * WHERE A WORD GOES, AND — WHEN THE GRAPH WANTS TO SAY SO — WHAT IT MAY BE.
 *
 * The short forms are a target and nothing else: `"94.tags"`, or `["94.duration", "98.seconds"]`
 * for a word that fills several nodes. They mean "the app already knows this knob; write it here".
 *
 * ⚠️ THE LONG FORM IS WHAT LETS A WORKFLOW DECLARE ITS OWN PARAMETERS (2026-08-23), and it exists
 * because the short form quietly made the APP the authority on what a graph could be asked for.
 * A knob was offerable only if `src/inference/knobs.ts` had heard of it, so a published workflow
 * exposing a hole this build did not know about had that hole silently dropped — and the way that
 * was "fixed" in practice was worse: the checkpoint, the step count and the guidance were frozen
 * into the graph and the SAME WORKFLOW was published four times, once per set of numbers, as
 * `music-fast` / `music-detail` / `music-base` / `music-light`. Four workflows for one pipeline,
 * three of them unable to sing, because a parameter had been turned into a product.
 *
 * A workflow is a graph: a pipeline of nodes, every widget on it tweakable, shipped with the
 * defaults it was published for. The long form is how the workflow says so, in the library, where
 * the graph already lives — so `checkpoint` on an ACE-Step workflow carries the four ACE-Step
 * weights and no ACE-Step vocabulary appears in this app's source.
 *
 * ⚠️ AND IT IS READ BY EVERYTHING AT ONCE. `settableKnobs` merges what a hole declares over the
 * medium's own table (the graph wins, and a hole the table never heard of is admitted on the
 * strength of its declaration), and that one answer is what the ⚙ pane draws, what `▶ look:
 * workflow` prints, and what xoko is handed to write `▶ make music [keyscale D minor, steps 40]`.
 * A workflow published tomorrow is operable the moment it lands.
 */
export interface HoleSpec {
  /** The node input(s) this word is written into — the short form, kept as its own field. */
  readonly at: string | readonly string[]
  /** Absent = whatever the medium's own table says, and `text` for a word it has never heard of.
   *  `boolean` exists because graphs have toggles and nothing else in this app did. */
  readonly kind?: 'integer' | 'number' | 'choice' | 'text' | 'boolean'
  /** `choice` only — the exact strings the node's enum takes, copied from
   *  `GET /object_info/<NodeClass>` rather than remembered. */
  readonly choices?: readonly string[]
  /** `integer` / `number` only. The NODE's range, not a taste. */
  readonly range?: readonly [number, number]
  /** THE RECOMMENDED VALUE — what this workflow was published to be good at. Absent = the graph's
   *  own literal stands, which is the same thing said a different way and is usually enough. */
  readonly fallback?: ParamValue
  /** The few values worth offering as a menu on a knob whose range is technically wide. */
  readonly suggest?: readonly ParamValue[]
  /** One line: what moving it does. Absent = the medium's table supplies it. */
  readonly what?: string
  /** `text` only: the value is PROSE OR MORE — a lyric sheet, a voice description, a script.
   *  A control draws it as a block with the label above it rather than as a strip beside one. */
  readonly multiline?: true
  /** What the number is counted in — `frames`, `seconds`. See `Knob.unit`. */
  readonly unit?: string
  /** How many of this unit make ONE SECOND. See `Knob.perSecond`. */
  readonly perSecond?: number
  /** Keep it out of the always-sent map line — it still sets, `▶ look: workflow` still prints it.
   *  A display decision about ONE crowded line, never a limit on what may be asked for. */
  readonly advanced?: true
  /**
   * THIS LIST NARROWS WHAT THE WORDS ALREADY DO — it does not bound it.
   *
   * ⚠️ Qwen3-TTS PUBLISHES ELEVEN LANGUAGES AND SPEAKS MORE (2026-08-31). Catalan is not on its
   * list; a description saying *en català* produces Catalan anyway, because the widget selects
   * among what the model does from prose rather than defining it. So nothing may auto-fill a hole
   * like this — a `language` quietly set to `Spanish` would OVERRIDE a description asking for
   * Catalan, which is the app taking away a capability the model has.
   *
   * Set it and the control's empty option reads *from the words*, and the map xoko rides on says
   * the list is not the edge. Declared here because which widgets defer to prose is a fact about
   * the NODE — known to whoever published the graph, and to nobody in this app's source.
   */
  readonly subordinate?: true
}

export type Hole = string | readonly string[] | HoleSpec

/**
 * THE ONE WORD A GRAPH MAY NOT NAME A HOLE.
 *
 * ⚠️ WRITTEN DOWN BECAUSE IT COST A RENDER (2026-08-23). `model` is this app's word for THE
 * RESOLVED CHECKPOINT — `mergeParams` writes it into every press's bag unconditionally, it names
 * the file on disk (`cellName`), and it is what the provenance record means by "what made this".
 * A published voice workflow also called a hole `model`, meaning "which Qwen3-TTS size speaks", and
 * the two met inside one `Record<string, ParamValue>`: the app's answer to its own question —
 * `"Qwen3-TTS-1.7B"`, a NAME FOR THE RECORD, not a path, as the library's own notes said — was
 * written into a node widget whose enum is `["0.6B","1.7B"]`, and ComfyUI refused the graph in
 * 0.0s. Nothing was wrong with the graph; the collision was the bug.
 *
 * ⚠️ AND IT IS REFUSED RATHER THAN RENAMED HERE. A workflow pins its own checkpoint in the graph —
 * that is what makes it that workflow, and the library says so out loud about the four ACE-Step
 * rows, which differ only in a `unet_name` baked into a node. So there is nothing legitimate for
 * a `model` hole to do, and quietly ignoring one would leave a control on screen that sets
 * nothing. `prompt` and `seed` are the app's words too and are NOT here: those holes exist
 * precisely so the app can fill them.
 */
export const RESERVED_HOLE = 'model'

/** What is wrong with this graph's holes, or null. Shared so the library's publish check and the
 *  app's press-time check refuse the same thing in the same sentence. */
export const reservedHole = (holes: Readonly<Record<string, unknown>> | undefined): string | null =>
  (holes && RESERVED_HOLE in holes)
    ? `this workflow declares a hole named "${RESERVED_HOLE}", which is the app's own word for the`
      + ' checkpoint that ran — it would be filled with that instead of what you set. Publish it'
      + ' under another name (a Qwen3-TTS size is `size`).'
    : null

/**
 * WHICH OF A PRESET'S KEYS THIS GRAPH HAS NO HOLE FOR — a sentence, or null.
 *
 * ⚠️ SHARED FOR THE SAME REASON `reservedHole` IS, one screen up: the library's publish check and
 * the app's parse-time check must refuse the same thing in the same words. And the failure is
 * silent otherwise — `fill()` skips a value the graph does not declare, which is the rule that
 * lets the knob table grow ahead of the catalog, so a preset naming the wrong key applies
 * cleanly, renders at the published value, and the only clue is that the track is not what was
 * asked for.
 */
export const presetGaps = (
  values: Readonly<Record<string, unknown>>,
  holes: Readonly<Record<string, unknown>> | undefined,
): string | null => {
  const gaps = Object.keys(values).filter((k) => !(k in (holes ?? {})))
  return gaps.length
    ? `this workflow has no ${gaps.join(' or ')} hole — the preset would set nothing, and the render`
      + ' would succeed at the published value'
    : null
}

/** The target(s) of a hole, whichever form it was written in. */
export const holeTargets = (hole: Hole): readonly string[] => {
  const at = typeof hole === 'string' || Array.isArray(hole)
    ? hole as string | readonly string[]
    : (hole as HoleSpec).at
  return typeof at === 'string' ? [at] : at
}

/** The declared shape of a hole, or null for a bare target. */
export const holeSpec = (hole: Hole): HoleSpec | null =>
  (typeof hole === 'string' || Array.isArray(hole)) ? null : hole as HoleSpec

/**
 * THE LITERAL SITTING AT A HOLE'S OWN ADDRESS — what runs when the app sends nothing.
 *
 * ⚠️ THE FIRST TARGET AND NO OTHER, on a word that fills several. ACE-Step states its length twice
 * (`94.duration` and `98.seconds`) and they are the same number by construction; reading one is
 * reading the value, and reconciling two that disagree would be inventing an answer to a question
 * a broken graph is asking.
 *
 * ⚠️ A WIRE IS NOT A VALUE. `["109", 0]` means "whatever node 109 produced" — an array where the
 * widget would be — and `undefined` is also what comes back for an input the node does not carry
 * at all, which is a real and different state: ComfyUI fills those from the NODE's own defaults.
 *
 * Lives here rather than in `knobs.ts` because three callers need it now — the knob table, the
 * app's parse-time check and the library's publish check — and one of them is a `.mjs` script.
 */
export const holeLiteral = (
  nodes: Readonly<Record<string, unknown>> | undefined,
  hole: Hole,
): ParamValue | undefined => {
  const where = holeTargets(hole)[0]
  if (!where) return undefined
  const dot = where.indexOf('.')
  const node = nodes?.[where.slice(0, dot)] as { inputs?: Record<string, unknown> } | undefined
  const value = node?.inputs?.[where.slice(dot + 1)]
  return (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    ? value
    : undefined
}

/**
 * WHERE A DECLARED `fallback` DISAGREES WITH THE VALUE THAT WOULD ACTUALLY RUN — a sentence, or null.
 *
 * ⚠️ THIS IS THE TWO-MINUTE RAIN BUG, AND IT COST A SIX-MINUTE RENDER (2026-08-31). `ambience` was
 * forked from the ACE-Step song graph and kept its 120-second literal in the nodes, while its
 * `duration` hole declared `fallback: 10`. Nothing sends a fallback: `fill()` writes only what is
 * in the bag, so an unset knob runs at the LITERAL. The app printed `[runs at 10]` in the ⚙ box and
 * in `▶ look: workflow`, xoko read that, left the knob alone exactly as the map tells it to, and two
 * minutes of looping music came back. Every party was honest and the workflow was wrong.
 *
 * A `fallback` is the publisher saying "this is the value this workflow was published to be good
 * at". On a graph there is exactly one place to say that — the node — so a second, different answer
 * beside it is not a recommendation, it is a workflow advertising a number it does not run at. It is
 * refused at the door in both directions: here for the library, before it can be published, and in
 * `parseGraph` for anything already out there arriving at this app.
 *
 * ⚠️ AND A `fallback` ON AN INPUT THE NODE DOES NOT CARRY IS FINE, which is why this is a
 * disagreement check and not a ban. Qwen3-TTS declares seven optional widgets its saved graph
 * simply omits; ComfyUI fills those from the node's own defaults, and the declared value is the
 * only way the app can say what those are.
 */
export const fallbackLies = (
  nodes: Readonly<Record<string, unknown>> | undefined,
  holes: Readonly<Record<string, unknown>> | undefined,
): string | null => {
  const wrong: string[] = []
  for (const [key, hole] of Object.entries(holes ?? {})) {
    const spec = holeSpec(hole as Hole)
    if (!spec || spec.fallback === undefined) continue
    const at = holeLiteral(nodes, hole as Hole)
    if (at === undefined || at === spec.fallback) continue
    wrong.push(`${key} says it runs at ${JSON.stringify(spec.fallback)} and its node holds`
      + ` ${JSON.stringify(at)}`)
  }
  return wrong.length
    ? `${wrong.join('; ')} — nothing sends a fallback, so the node's value is what runs.`
      + ' Put the recommended value in the node, or drop the fallback.'
    : null
}
