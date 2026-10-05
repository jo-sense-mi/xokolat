# Keeping the engines current

xokolat generates nothing itself — it asks an engine that does, and that engine is a server
somebody has to keep running and keep up to date. These scripts are the second half.

One folder per service, named for its **id in the inference registry**, each holding one
`update.sh`. `scripts/update-services.sh` runs them all, and that is the single line topgrade
(or cron, or you) needs to know about:

```toml
[commands]
"xokolat engines" = "<install root>/scripts/update-services.sh"
```

## ⚠️ THIS FOLDER IS THE INSTALL ROOT, NOT A DEV SCRIPT DIRECTORY

These are **shipped app files**. They travel in the download with everything else; the source tree is
never delivered to anyone. On a dev machine the install root happens to be the git checkout, which
is the only reason this reads like a repo path — and calling it "the source checkout" is what made
this confusing enough to need writing down (2026-09-04).

`update-services.sh` resolves the shipped layer as `$(dirname $0)/../services`, so the same line
works from a checkout today and from inside the copy `npx xokolat` makes. That is why it
is **computed and never hardcoded**, and it is the reason nothing here has to change at packaging.
The one thing that does change is the path in the topgrade line above, which is the user's.

## The contract every update.sh keeps

- **Idempotent, and quiet when nothing changed.** Most runs are no-ops. One line: `already at
  <version>`. A weekly job that prints a wall of text on a no-op teaches you to ignore it.
- **Exit 0 = the service is up and answering.** Exit non-zero = it is not, and say why.
- **Never needs sudo.** `brew services` is a per-user agent, the checkouts are yours, the venv is
  yours. A script that prompts for a password hangs an unattended run forever.
- **The probe asks about what changed, not only whether it is alive.** ⚠️ A liveness question
  cannot see everything an update can break. Some things make an engine FASTER rather than
  DIFFERENT — a patch layer, a kernel, an accelerator — and a broken one answers a liveness probe
  exactly like a working one. `comfyui`'s probe is `GET /object_info`, and the Apple Silicon
  int8/fp8 patch node adds no nodes at all, so that request is byte-identical whether the patching
  works or is completely dead. When an engine gains a capability worth having, the script gains a
  question only a working version can answer.
- **A degraded engine is loud, not rolled back.** Rollback is for an engine that will not start.
  One that starts and answers but lost a capability may have lost it to its own update rather than
  the engine's, so putting the engine back need not fix it. Exit non-zero, say which capability and
  say it in one line.
- **Health probe last, and roll back on failure.** ⚠️ THIS IS THE WHOLE REASON THESE ARE SCRIPTS
  RATHER THAN A `git pull` IN A CONFIG FILE. Tracking `master` means running a tip that nobody has
  released, so the failure mode is real: record the current version first, and if the service does
  not answer after the update, put the old one back and restart it. You get the tip when the tip
  works and last week's when it does not.
- **Code only, never models.** Weights are tens of gigabytes and belong to whoever downloaded them.
  Nothing here fetches a checkpoint.

## Adding one of your own

Same shape, in your own data root so an app reinstall cannot lose it:

```
~/Library/Application Support/xokolat/services/<id>/update.sh
```

Same rule as the registries: the same id replaces the shipped one in place, a new id is appended.

⚠️ AND THAT FOLDER IS WALKED BY HAND-PLACED FILES ONLY. Nothing downloaded — no taken workflow, no
composition, nothing arriving from a library — may ever write into it. A script here runs
unattended, weekly, as you; the moment a download can drop one in, taking a workflow becomes remote
code execution. The app never writes there, and neither should anything else.
