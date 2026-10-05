// THE BRAINS YOU ALREADY PAY FOR — a closed list, compiled in, and the whole of PLAN §15 rule 1.
//
// ⚠️ WHY THIS EXISTS AT ALL. A "log in with Claude" button in this app cannot be built: Pro, Max,
// Advanced and Premium are subscriptions to a vendor's OWN client, they carry no API credential,
// and no OAuth flow lets a third-party app spend one. What they DO carry is a command-line client
// you log into once, in a terminal, that then answers questions on your behalf. So the honest way
// to reach a subscription is to ask the tool that holds it — and the credential never comes near
// this process, which is a better outcome than any key box we could have drawn.
//
// ⚠️ AND THIS FILE IS THE WHITELIST. A registry row says `{ kind: 'cli', brain: 'claude' }` and
// nothing else: the binary, the flags, the order and where the sentence goes are HERE, in code.
// The parser refuses a name that is not on this list, so the worst thing a hand-edited registry, a
// browser post, or a model writing its own service row can say is *which of these*. There is no
// argv field to fill in, and adding one would turn a settings form into a remote shell.
//
// ⚠️ THE SENTENCE RIDES ON STDIN, ALWAYS. Not because argv would be unsafe — nothing here ever
// sees a shell — but because a prompt is unbounded and argv is not, and because it keeps every
// byte a person typed out of the process table.

/**
 * HOW A CLIENT STREAMS, when it can.
 *
 * ⚠️ THE ARGV IS DATA AND THE READER IS CODE, because that is what each of them is. Every client
 * that streams does it as JSONL, and no two agree on the shape of a line — so the flags sit beside
 * the buffered ones and the one function that knows the vendor's envelope sits beside them.
 */
export interface CliStream {
  /** Replaces `ask` when streaming. */
  readonly ask: readonly string[]
  /** The visible text in one parsed line, or null for a line that carries something else —
   *  a token count, a rate-limit notice, the model thinking. */
  readonly delta: (line: unknown) => string | null
}

/**
 * WHETHER YOU ARE SIGNED IN — a second probe, and the reason the shelf could not tell you before.
 *
 * ⚠️ INSTALLED IS NOT SIGNED IN, and for months the card said `ready` on the strength of
 * `--version` alone. A machine that had never once logged in showed exactly the same green dot as
 * this one, because nothing had ever asked. The version argv answers "is the binary there"; only
 * the client knows whose account it is holding.
 *
 * ⚠️ IT MUST BE FREE AND OFFLINE, or it cannot run beside the liveness probe every fifteen
 * seconds. `claude auth status --json` reads local credentials and returns in ~0.2s without
 * spending a token; anything that costs a question does not belong here.
 *
 * ⚠️ NULL IS THE HONEST ANSWER FOR A CLIENT WE HAVE NOT CHECKED, exactly like `stream`. The card
 * then shows two lines instead of three and says the sign-in is unknown, rather than inventing a
 * state from a command nobody has run.
 */
export interface CliAuth {
  /** Argv that reports the sign-in, minus the binary. Must not think and must not bill. */
  readonly args: readonly string[]
  /** What it printed, read into the two facts a card can show. Null when the output made no
   *  sense — a client that changed its mind about the format must not read as signed out. */
  readonly read: (stdout: string) => { readonly in: boolean; readonly plan: string | null } | null
  /** The exact command that fixes a `signed out`. */
  readonly fix: string
}

/** One command-line client this build knows how to ask a question. */
export interface CliBrain {
  readonly id: string
  readonly label: string
  /** One line for the ＋ service list. */
  readonly what: string
  /** A BARE NAME, resolved on PATH by the spawn. Never a path, never composed. */
  readonly bin: string
  /** The argv for one question, minus the model. The prompt is not in here — see above. */
  readonly ask: readonly string[]
  /** How to watch it think. Null = this client answers in one lump, and ⏹ can only abandon it. */
  readonly stream: CliStream | null
  /** Where the model id goes, if the client takes one. */
  readonly modelFlag: string | null
  /** Where a system framing goes. Null = the framing is prepended to stdin instead. */
  readonly systemFlag: string | null
  /** Argv that proves the binary is there. Cheap, offline, and it must not think. */
  readonly version: readonly string[]
  /** Argv that proves you are SIGNED IN. Null for a client whose command we have not verified. */
  readonly auth: CliAuth | null
  /** What a person does once, in a terminal, before this can answer. Shown when it is installed
   *  and refuses. */
  readonly login: string
  /** ⚠️ WHAT ＋ NAMES THE NEW ROW, and it must be the id the library publishes workflows for — a
   *  workflow is an override on a row that already exists (src/library/take.ts), so a row called
   *  something else is a row nothing can be taken onto. */
  readonly suggest: string
  /** The models it takes. Aliases where the vendor publishes stable ones — a pinned id goes stale
   *  the week the next model ships, and this list is a default the user can edit anyway. */
  readonly models: readonly { readonly file: string; readonly label: string }[]
  readonly notes: string
}

export const CLI_BRAINS: readonly CliBrain[] = [
  {
    id: 'claude',
    label: 'Claude Code',
    what: 'To use this connection you need Claude Code installed, and you need to log in to your '
      + 'subscription from a terminal. After that xoko is connected.',
    bin: 'claude',
    // ⚠️ `--disallowedTools` IS NOT DECORATION. Claude Code is an agent with a shell; this asks it
    // for prose. Non-interactive mode has nobody to approve a tool call, so most are refused
    // anyway — this makes the refusal a fact about the request rather than a side effect of there
    // being no terminal attached.
    //
    // ⚠️ AND NOT `--bare`, though it looks tempting: it reads ANTHROPIC_API_KEY only and never the
    // keychain, which is exactly the subscription this row exists to use.
    ask: [
      '-p', '--output-format', 'text',
      '--disallowedTools', 'Bash,Write,Edit,NotebookEdit,WebFetch,WebSearch,Task',
    ],
    // ⚠️ `text` BUFFERS — measured, not assumed: twenty lines all arrived within 20ms of each
    // other at the end. `stream-json` is the only shape that actually streams, and it needs
    // `--verbose` in print mode.
    stream: {
      ask: [
        '-p', '--output-format', 'stream-json', '--include-partial-messages', '--verbose',
        '--disallowedTools', 'Bash,Write,Edit,NotebookEdit,WebFetch,WebSearch,Task',
      ],
      // One envelope deep: `stream_event` → the Anthropic event → the delta. Everything else on
      // that stream is bookkeeping (token estimates, rate-limit notices) and, notably, the model's
      // THINKING — which arrives as `thinking_delta` and is not what it said.
      delta: (line) => {
        const o = line as { type?: string; event?: { type?: string; delta?: { type?: string; text?: string } } }
        if (o?.type !== 'stream_event' || o.event?.type !== 'content_block_delta') return null
        return o.event.delta?.type === 'text_delta' ? o.event.delta.text ?? null : null
      },
    },
    modelFlag: '--model',
    systemFlag: '--system-prompt',
    version: ['--version'],
    // ⚠️ `--json` IS THE DEFAULT AND IS PASSED ANYWAY. A default is a thing that can change; the
    // parser below would then read a human sentence as nonsense and report `unknown`, which is
    // survivable but wrong. Ask for the shape you are about to parse.
    auth: {
      args: ['auth', 'status', '--json'],
      read: (out) => {
        try {
          const o: unknown = JSON.parse(out)
          const r = o as { loggedIn?: unknown; subscriptionType?: unknown }
          if (typeof r?.loggedIn !== 'boolean') return null
          return { in: r.loggedIn, plan: typeof r.subscriptionType === 'string' ? r.subscriptionType : null }
        } catch { return null }
      },
      fix: 'claude auth login',
    },
    login: 'run `claude auth login` in a terminal',
    suggest: 'claude-code',
    models: [
      { file: 'sonnet', label: 'Claude Sonnet' },
      { file: 'opus', label: 'Claude Opus' },
      { file: 'haiku', label: 'Claude Haiku' },
    ],
    notes: 'Every question here is answered on your own Claude plan. Aliases rather than pinned '
      + 'ids: `sonnet` follows the current Sonnet, and a pinned id goes stale the week the next '
      + 'one ships.',
  },
  {
    id: 'codex',
    label: 'ChatGPT (Codex)',
    what: 'To use this connection you need Codex installed, and you need to sign in with your '
      + 'ChatGPT account from a terminal. After that xoko is connected.',
    bin: 'codex',
    // ⚠️ `exec` IS THE NON-INTERACTIVE MODE, and the prompt goes on stdin like every other row
    // here. ⚠️ DECLARED FROM DOCUMENTATION AND NOT EXERCISED — same footing as Gemini below. If it
    // answers nothing, this argv is the first thing to check.
    ask: ['exec'],
    stream: null,
    modelFlag: '-m',
    systemFlag: null,
    version: ['--version'],
    // Not declared: `codex login status` exists, and what it prints has not been read here. Two
    // lines on the card instead of three is the honest outcome.
    auth: null,
    login: 'run `codex login` in a terminal and sign in with your ChatGPT account',
    suggest: 'codex',
    // ⚠️ NONE, ON PURPOSE. Codex takes `-m`, and which ids it accepts moves faster than this file
    // can — a stale list is worse than no list, because it is offered as a choice and then refused
    // by the client. With none declared the client answers as you configured it, and the ✨ card
    // still lets you name one by hand.
    models: [],
    notes: 'Answers on the ChatGPT plan you signed the Codex client into. ⚠️ Its flags are from '
      + 'documentation and have not been exercised on this machine.',
  },
  {
    id: 'gemini',
    label: 'Gemini CLI',
    what: 'To use this connection you need the Gemini CLI installed, and you need to sign in to '
      + 'your Google account from a terminal. After that xoko is connected.',
    bin: 'gemini',
    ask: [],
    // ⚠️ NOT DECLARED, because it has not been checked. It very likely can stream; claiming so
    // without having seen it is the one thing this registry never does. Buffered works, and the
    // fix is one field once somebody runs it.
    stream: null,
    modelFlag: '-m',
    systemFlag: null,
    version: ['--version'],
    // ⚠️ NOT DECLARED, for the same reason `stream` is not: it has not been run. Two lines on the
    // card instead of three is the honest outcome; a guessed argv would report "signed out" for a
    // machine that is signed in.
    auth: null,
    login: 'run `gemini` once in a terminal and sign in',
    suggest: 'gemini',
    models: [
      { file: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      { file: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    ],
    notes: 'Reads the question from stdin when it is not attached to a terminal. ⚠️ Its flags are '
      + 'from its documentation and have not been exercised on this machine — if it answers '
      + 'nothing, its argv is the first thing to check (src/inference/cli/brains.ts).',
  },
  {
    id: 'grok',
    label: 'Grok Build',
    what: 'To use this connection you need Grok Build installed, and you need to sign in with your '
      + 'SuperGrok account from a terminal. After that xoko is connected.',
    bin: 'grok',
    // ⚠️ `-p` IS ITS HEADLESS FLAG — one prompt, structured output, no TUI. ⚠️ DECLARED FROM
    // DOCUMENTATION AND NOT EXERCISED: xAI shipped this client in May 2026, the installer puts
    // `grok` on your PATH, and nobody here has run it. If it answers nothing, this argv is the
    // first thing to check.
    ask: ['-p'],
    stream: null,
    modelFlag: null,
    systemFlag: null,
    version: ['--version'],
    auth: null,
    login: 'run `grok` once in a terminal and sign in',
    suggest: 'grok',
    // None declared, and this client takes no model flag we know of — so it answers as you
    // configured it. See the note on Codex above for why an invented list is worse than none.
    models: [],
    notes: 'Answers on the SuperGrok plan you signed the client into. ⚠️ Its flags are from '
      + 'documentation and have not been exercised on this machine.',
  },
]

export const brainFor = (id: string): CliBrain | undefined =>
  CLI_BRAINS.find((b) => b.id === id)
