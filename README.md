# xokolat

A local content-generation app that hands you a **finished artifact** — a sticker pack, a coloring
book, a mascot, a song — instead of a model or a canvas. It runs on your own machine, talks to the
inference services you already have (ComfyUI, Draw Things, Ollama, a cloud API), and keeps
everything it makes in a folder you can see.

The app ships empty: workflows, styles and compositions arrive from the library at
[xoko.lat](https://xoko.lat).

> Written with AI. The code in this repository was produced in conversation with an AI coding
> agent (Claude), directed and reviewed by its maintainer — the commit history says so line by
> line.

## Run it

Needs **Node 26** ([nodejs.org](https://nodejs.org)) — nothing else; macOS, Windows and Linux alike.

```bash
npx xokolat               # xokolat in this terminal; Ctrl-C stops it
npx xokolat background    # xokolat with the terminal free to close
npx xokolat stop          # stops a background one
npx xokolat@latest        # the newest version — xokolat says when there is one
```

The first start sets xokolat up (a few seconds, online). Your browser opens on
`http://127.0.0.1:18080`; starting again while it is up just opens the browser.

From a checkout of this repository, the same three are `npm start`, `npm run background` and
`npm run stop`.

| | where |
|---|---|
| your work | `~/Documents/xokolat` — changeable in the app's 📁 section |
| app data | `~/Library/Application Support/xokolat` · `%APPDATA%\xokolat` · `~/.local/share/xokolat` |

The server listens on `127.0.0.1` only. `XOKOLAT_HOST=0.0.0.0` opens it to your network — there is
no login, so only do that on a network you trust.

## Develop

```bash
npm ci
npm run dev               # watch mode on :18081, reading .env.dev
npm run restart           # the same without watching — after any server-side change
npm run check             # typecheck, front-end load, tests — before every commit
npm run publish-npm -- --pack   # → out/xokolat-<version>.tgz, exactly what npx would run
```

Dev runs on **18081** with its own folders (`xokolat-dev`, see `.env.dev`), so it never collides
with an installed copy on 18080. TypeScript runs directly on Node — no build step; the front end
is vanilla JavaScript.

Read, in this order: [`CLAUDE.md`](CLAUDE.md) (the rules), [`PLAN.md`](PLAN.md) (what the app is
and why), [`DECISIONS.md`](DECISIONS.md) (what changed after building), [`NEXT.md`](NEXT.md) (what
is not built yet). Contracts live in `src/types/`; where prose and a type disagree, the type wins.

## License

[MIT](LICENSE)
