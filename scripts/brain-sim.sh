#!/bin/bash
# HOW TO SEE THE FIRST-RUN STATES YOU ALREADY PASSED THROUGH.
#
# ⚠️ THE PROBLEM THIS SOLVES. The 🔌 card has three states — not installed, signed out, connected —
# and on the machine that WROTE them all three read green, forever. There is no way to test the two
# that matter without either uninstalling Claude Code or logging out of your own subscription, and
# both of those are real damage to fix a display bug.
#
# So: a scratch PATH. `missing` drops the directory the real client lives in; `out` puts a stand-in
# in front of it that answers `--version` and reports a signed-out account. Nothing is installed,
# uninstalled, or logged out — your credentials are never read and never touched, and the moment
# the server exits the machine is exactly as it was.
#
#   scripts/brain-sim.sh missing    # `claude` is not on PATH at all
#   scripts/brain-sim.sh out        # installed, not signed in
#   scripts/brain-sim.sh in         # the real client — same as `npm run dev`
#
# It runs the app in the foreground on the usual port, against the local library, so ⌃C is the way
# back. Connect the Claude Code service once (🔌 ＋) and then restart under each mode: the row is
# yours, in your data root, and the simulation does not touch it.
set -euo pipefail

MODE="${1:-}"
case "$MODE" in
  missing|out|in) ;;
  *) echo "usage: scripts/brain-sim.sh <missing|out|in>" >&2; exit 2 ;;
esac

HERE="$(cd "$(dirname "$0")/.." && pwd)"
SHIM="$(mktemp -d)"
trap 'rm -rf "$SHIM"' EXIT

case "$MODE" in
  in)
    echo "▶ the real client — nothing is simulated"
    ;;
  out)
    # ⚠️ IT ANSWERS ONLY THE TWO PROBES, and refuses everything else loudly. A stand-in that
    # cheerfully answered a real question would let a whole session run against a fake brain and
    # the transcript would look almost right, which is worse than an error.
    cat > "$SHIM/claude" <<'SHIMEOF'
#!/bin/bash
case "$*" in
  "--version") echo "2.1.233 (Claude Code) [brain-sim: signed out]" ;;
  "auth status --json") echo '{"loggedIn":false}' ;;
  *) echo "brain-sim: this is a stand-in for the sign-in probes, not a brain" >&2; exit 1 ;;
esac
SHIMEOF
    chmod +x "$SHIM/claude"
    export PATH="$SHIM:$PATH"
    echo "▶ installed, signed out — a stand-in ahead of the real client on PATH"
    ;;
  missing)
    # The real client and node share /opt/homebrew/bin, so the directory cannot simply be dropped:
    # symlink back everything this app needs to run, and leave `claude` behind.
    mkdir -p "$SHIM/bin"
    for tool in node npm; do
      real="$(command -v "$tool")" && ln -sf "$real" "$SHIM/bin/$tool"
    done
    export PATH="$SHIM/bin:/usr/bin:/bin:/usr/sbin:/sbin"
    if command -v claude >/dev/null 2>&1; then
      echo "✗ claude is still on PATH at $(command -v claude) — the simulation would not be one" >&2
      exit 1
    fi
    echo '▶ not installed — the claude command is not on this PATH'
    ;;
esac

cd "$HERE"
exec node --env-file=.env.dev scripts/serve.ts dev
