// ONE JOB AT A TIME — the shape from the first commit, not a limitation to design around later
// (PLAN §4).
//
// There is one GPU and content jobs run minutes, not milliseconds, so builds take a SERIAL
// lane. CPU-only work — exports, cutouts, packaging — takes a separate PARALLEL fast lane,
// because making someone wait behind a render to get a zip is absurd.
//
// Two properties this owes the user:
//   - **A job can be stopped.** A queue with no ✕ is a queue that holds you hostage. Queued:
//     dropped. Running: the task's AbortSignal fires, and the task is responsible for tearing
//     down whatever it started.
//   - **A restart never resumes.** Nothing here is persisted, so a crash loses the queue rather
//     than replaying it; anything that was mid-flight is `interrupted` and its partial run
//     folder stays on disk for the gate to reject. A job that silently re-runs after a crash is
//     how you get two half-packs and no way to tell them apart.

export const LANES = ['serial', 'fast'] as const

export type LaneName = (typeof LANES)[number]

export const JOB_STATES = ['queued', 'running', 'done', 'failed', 'cancelled', 'interrupted'] as const

export type JobState = (typeof JOB_STATES)[number]

export interface JobSpec {
  /** What the ▶ band calls it. */
  readonly label: string
  readonly lane: LaneName
  /** The run this job belongs to — N engines in one press share it. */
  readonly runId: string
  readonly engine: string | null
  readonly run: (ctx: JobContext) => Promise<void>
}

export interface JobContext {
  readonly signal: AbortSignal
  readonly log: (line: string) => void
  /** 0–1, or null when the work cannot say. Silence beats a guess (PLAN §4). */
  readonly progress: (fraction: number | null) => void
  /**
   * WHAT THIS JOB MADE, WHEN WHAT IT MADE IS WORDS.
   *
   * ⚠️ A RENDER NEVER CALLS THIS, and that is the distinction rather than an omission: a render's
   * output is a file, read back off the index by run id, because the disk is the only honest
   * account of what exists. Words have no file — a chain's brief is a field on the run, not an
   * asset (there is no 📝 shelf) — so without this the only way to get them out of a job was to
   * keep the request that started it open, which is the whole bug this exists to end.
   */
  readonly produce: (text: string) => void
}

export interface Job {
  readonly id: string
  readonly label: string
  readonly lane: LaneName
  readonly runId: string
  readonly engine: string | null
  state: JobState
  queuedAt: string
  startedAt: string | null
  finishedAt: string | null
  error: string | null
  progress: number | null
  /** What `produce` was given, or null for the jobs that make a file instead. Read off the queue
   *  by whoever is waiting, which is what makes the waiting reconnectable. */
  result: string | null
  /** The live log tail, which the ▶ band shows. Capped: a chatty job must not become a memory
   *  leak that outlives the render. */
  readonly log: string[]
}

const LOG_LINES = 200

let counter = 0

export class Queue {
  readonly #jobs = new Map<string, Job>()
  readonly #specs = new Map<string, JobSpec>()
  readonly #controllers = new Map<string, AbortController>()
  readonly #pending: Record<LaneName, string[]> = { serial: [], fast: [] }
  readonly #running: Record<LaneName, Set<string>> = { serial: new Set(), fast: new Set() }
  readonly #limits: Record<LaneName, number>
  readonly #listeners: ((job: Job) => void)[] = []

  constructor({ fastLimit = 4 } = {}) {
    this.#limits = { serial: 1, fast: fastLimit }
  }

  add(spec: JobSpec): Job {
    const id = `j${++counter}`
    const job: Job = {
      id, label: spec.label, lane: spec.lane, runId: spec.runId, engine: spec.engine,
      state: 'queued', queuedAt: new Date().toISOString(), startedAt: null, finishedAt: null,
      error: null, progress: null, result: null, log: [],
    }
    this.#jobs.set(id, job)
    this.#specs.set(id, spec)
    this.#pending[spec.lane].push(id)
    queueMicrotask(() => this.#pump(spec.lane))
    return job
  }

  list(): Job[] {
    return [...this.#jobs.values()]
  }

  get(id: string): Job | undefined {
    return this.#jobs.get(id)
  }

  /** Everything still owed for a run — what "is my press done?" actually asks. */
  outstanding(runId: string): number {
    return this.list().filter((j) => j.runId === runId && (j.state === 'queued' || j.state === 'running')).length
  }

  cancel(id: string): boolean {
    const job = this.#jobs.get(id)
    if (!job) return false
    if (job.state === 'queued') {
      const queue = this.#pending[job.lane]
      const at = queue.indexOf(id)
      if (at >= 0) queue.splice(at, 1)
      this.#finish(job, 'cancelled', null)
      return true
    }
    if (job.state === 'running') {
      // The task tears down its own work — for a gRPC render that is cancelling the stream. A
      // spawned process would need its whole GROUP killed, not just the parent (PLAN §4).
      this.#controllers.get(id)?.abort()
      return true
    }
    return false
  }

  /** Told about every job that reaches a terminal state — the index rebuild hangs off this
   *  (the factory's behaviour: a finished job appends its own entries). */
  onFinished(listener: (job: Job) => void): void {
    this.#listeners.push(listener)
  }

  #finish(job: Job, state: JobState, error: string | null): void {
    job.state = state
    job.error = error
    job.finishedAt = new Date().toISOString()
    this.#specs.delete(job.id)
    this.#controllers.delete(job.id)
    for (const listener of this.#listeners) {
      try {
        listener(job)
      } catch (err) {
        process.stderr.write(`✗ job listener: ${(err as Error).message}\n`)
      }
    }
  }

  #pump(lane: LaneName): void {
    while (this.#running[lane].size < this.#limits[lane] && this.#pending[lane].length) {
      const id = this.#pending[lane].shift()
      if (id) void this.#start(id, lane)
    }
  }

  async #start(id: string, lane: LaneName): Promise<void> {
    const job = this.#jobs.get(id)
    const spec = this.#specs.get(id)
    if (!job || !spec) return
    const controller = new AbortController()
    this.#controllers.set(id, controller)
    this.#running[lane].add(id)
    job.state = 'running'
    job.startedAt = new Date().toISOString()

    const log = (line: string): void => {
      job.log.push(`${new Date().toISOString().slice(11, 19)} ${line}`)
      if (job.log.length > LOG_LINES) job.log.splice(0, job.log.length - LOG_LINES)
    }

    try {
      await spec.run({
        signal: controller.signal,
        log,
        progress: (fraction) => { job.progress = fraction },
        produce: (text) => { job.result = text },
      })
      this.#finish(job, 'done', null)
    } catch (err) {
      const message = (err as Error).message
      const cancelled = controller.signal.aborted || message === 'cancelled'
      log(cancelled ? 'cancelled' : `failed: ${message}`)
      this.#finish(job, cancelled ? 'cancelled' : 'failed', cancelled ? null : message)
    } finally {
      this.#running[lane].delete(id)
      this.#pump(lane)
    }
  }
}
