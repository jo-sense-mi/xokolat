#!/usr/bin/env bash
# ComfyUI → latest master, deps reconciled, service back up and answering.
#
# ⚠️ IT TRACKS master, NOT A TAG. That is the ask, and it is the reason everything below the pull
# exists: a tip nobody has released will eventually not start, so the previous commit is recorded
# BEFORE anything moves and put back if the probe fails. Tracking master without a rollback is how
# a weekly unattended job leaves you with a dead engine on a Monday.
#
# Never needs sudo. Never downloads a model.
set -uo pipefail

COMFY="${COMFY_HOME:-$HOME/ComfyUI}"
PY="$COMFY/.venv/bin/python"
SERVICE="comfyui-dev"
PROBE="http://127.0.0.1:8188/object_info"

# ⚠️ qwen3-tts-comfyui declares only `transformers>=4.57.0`, which lets a fresh install pull
# transformers 5.x — whose changed config API breaks Qwen3-TTS loading with
# 'Qwen3TTSTalkerConfig has no attribute pad_token_id'. Re-applied after EVERY dependency install,
# because a new requirements.txt will silently move it and the failure surfaces days later.
PIN="transformers==4.57.6"

say() { printf 'comfyui: %s\n' "$*"; }
die() { printf 'comfyui: %s\n' "$*" >&2; exit 1; }

[ -f "$COMFY/main.py" ] || die "no ComfyUI at $COMFY (set COMFY_HOME)"
[ -x "$PY" ] || die "no venv at $COMFY/.venv — run _brew-service-comfyui/rebuild-venv.sh first"

cd "$COMFY" || die "cannot enter $COMFY"

# ⚠️ REPAIR A CLONE THAT CAN ONLY SEE ONE TAG. `git clone --depth 1 --branch <tag>` leaves
# remote.origin.fetch as `+refs/tags/<tag>:refs/tags/<tag>` — no branches, no remote-tracking
# refs, so `origin/master` does not exist and no fetch will ever create it. That is how this
# checkout sat on v0.22.3 for three months looking like an ordinary repo.
if ! git config --get-all remote.origin.fetch | grep -q 'refs/heads/\*'; then
  git config --replace-all remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*'
fi

# A shallow clone stays shallow: one commit of master is all this needs, and unshallowing would
# pull the whole history of a very large repo to run the same code.
SHALLOW=no; [ -f .git/shallow ] && SHALLOW=yes
if [ "$SHALLOW" = yes ]; then
  git fetch --quiet --depth 1 origin master || die "could not reach origin"
else
  git fetch --quiet origin master || die "could not reach origin"
fi

GOOD=$(git rev-parse HEAD) || die "cannot read HEAD"
TIP=$(git rev-parse origin/master 2>/dev/null) || die "origin/master is missing after a fetch"
ON_BRANCH=$(git symbolic-ref -q --short HEAD || true)

if [ "$GOOD" = "$TIP" ] && [ "$ON_BRANCH" = "master" ]; then
  say "already at ${TIP:0:8}"
  exit 0
fi

say "${GOOD:0:8} -> ${TIP:0:8}"
brew services stop "$SERVICE" >/dev/null 2>&1

# A detached HEAD (a pinned tag) cannot be pulled — get onto the branch first, which is also the
# one-time migration for a checkout that was pinned to a release. On a shallow clone the two
# histories share no ancestor, so a merge can never fast-forward: reset is the only move, and it
# is the right one here because nothing local is ever edited in this checkout.
if [ "$SHALLOW" = yes ]; then
  git checkout --quiet -B master origin/master || die "could not check out master"
  git reset --quiet --hard origin/master || die "could not move to origin/master"
else
  git checkout --quiet master || die "could not check out master"
  git merge --ff-only --quiet origin/master || die "master would not fast-forward — resolve by hand"
fi

install_deps() {
  "$PY" -m pip install --quiet --disable-pip-version-check -r "$COMFY/requirements.txt" || return 1
  # Custom nodes that are real git repos follow master too; a plain copied folder cannot be
  # updated by anything and is named out loud rather than silently skipped.
  for d in "$COMFY"/custom_nodes/*/; do
    name=$(basename "$d")
    [ "$name" = "__pycache__" ] && continue
    if [ -d "$d/.git" ]; then
      git -C "$d" pull --quiet --ff-only 2>/dev/null || say "  $name: could not fast-forward, left as is"
    else
      say "  $name: not a git checkout — pinned, update it by hand"
    fi
    # onnxruntime-gpu / nvidia / triton have no macOS wheel; the CPU+MPS builds cover Apple silicon.
    [ -f "$d/requirements.txt" ] && grep -viE '^(onnxruntime-gpu|nvidia-|triton|bitsandbytes)' \
      "$d/requirements.txt" | "$PY" -m pip install --quiet --disable-pip-version-check -r /dev/stdin
  done
  "$PY" -m pip install --quiet --disable-pip-version-check "$PIN" || return 1
  "$PY" - <<'PYCHECK' || return 1
import sys, transformers
if not transformers.__version__.startswith('4.57.'):
    sys.exit(f'transformers is {transformers.__version__}, the pin did not hold')
PYCHECK
}

install_deps || { say "dependency install failed"; }

brew services start "$SERVICE" >/dev/null 2>&1

# ⚠️ ALIVE IS NOT THE SAME AS WORKING (2026-09-04, services/README.md).
#
# `/object_info` says the server answers. It cannot say whether the maths is still on the GPU.
# ComfyUI-AppleSilicon-FP8 patches PyTorch at startup and ADDS NO NODES, so that request is
# byte-identical whether the patching works or is completely dead — and what dies with it is not
# an error, it is a CPU fallback: MiniMax H3's int8 DiT crawls, a five-second clip stops finishing,
# and nothing anywhere says why. That is a week of "it got slow" nobody can attribute.
#
# So ask the maths. An int8×int8 matmul on MPS is `NotImplementedError` in stock PyTorch and exact
# on a patched one — a binary answer about the thing we actually want, not a string in a log line
# that is free to change. `PYTORCH_ENABLE_MPS_FALLBACK` is unset for the test on purpose: with it
# set, an unpatched build answers correctly from the CPU and the check passes while the GPU idles.
#
# ⚠️ AND IT DOES NOT ROLL BACK. Rollback is for an engine that will not start. This one started;
# it lost a capability, possibly to the patch node's OWN pull, and putting ComfyUI back need not
# fix that. Loud and non-zero, so topgrade shows a failed step and names what went.
accelerator_check() {
  local dir="$COMFY/custom_nodes/ComfyUI-AppleSilicon-FP8"
  [ -d "$dir" ] || return 0
  env -u PYTORCH_ENABLE_MPS_FALLBACK "$PY" - "$dir" <<'PYCAP'
import importlib.util, pathlib, sys, torch
if not torch.backends.mps.is_available():
    sys.exit(0)
init = pathlib.Path(sys.argv[1]) / '__init__.py'
spec = importlib.util.spec_from_file_location(
    'asfp8_probe', init, submodule_search_locations=[str(init.parent)])
mod = importlib.util.module_from_spec(spec)
sys.modules['asfp8_probe'] = mod
try:
    spec.loader.exec_module(mod)
except Exception as err:
    sys.exit(f'the patch layer would not load: {type(err).__name__}: {err}')
a = torch.randint(-8, 8, (64, 64), dtype=torch.int8, device='mps')
b = torch.randint(-8, 8, (64, 64), dtype=torch.int8, device='mps')
try:
    out = torch._int_mm(a, b)
except Exception as err:
    sys.exit(f'int8 matmul is not on the GPU: {type(err).__name__}: {str(err)[:120]}')
if out.device.type != 'mps':
    sys.exit(f'int8 matmul answered from {out.device.type}, not the GPU')
if not torch.equal(out.cpu(), a.cpu().int() @ b.cpu().int()):
    sys.exit('int8 matmul runs on the GPU but does not match the CPU — wrong answers, not slow ones')
PYCAP
}

for _ in $(seq 1 30); do
  if curl -fs -o /dev/null --max-time 10 "$PROBE"; then
    if bad=$(accelerator_check 2>&1); then
      say "up at ${TIP:0:8}"
      exit 0
    fi
    say "up at ${TIP:0:8}, BUT Apple Silicon acceleration is dead: ${bad##*$'\n'}"
    say "  int8 models are running on the CPU — video will take hours. Not rolled back:"
    say "  check ComfyUI-AppleSilicon-FP8 against this ComfyUI before the next render."
    exit 1
  fi
  sleep 4
done

say "did not answer after the update — rolling back to ${GOOD:0:8}"
brew services stop "$SERVICE" >/dev/null 2>&1
git checkout --quiet --force --detach "$GOOD" || die "ROLLBACK FAILED — repo is on master at ${TIP:0:8}"
install_deps
brew services start "$SERVICE" >/dev/null 2>&1
die "rolled back to ${GOOD:0:8}; master at ${TIP:0:8} does not start here"
