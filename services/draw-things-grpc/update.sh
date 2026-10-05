#!/usr/bin/env bash
# The Draw Things gRPC server → latest first-party release.
#
# ⚠️ THIS ONE HAS NO master TO FOLLOW. gRPCServerCLI-macOS is a ~200MB binary published as a
# release asset by drawthingsai/draw-things-community, kept in private/_brew-service-drawthings-grpc/bin/ beside the runner.
# Nothing on this machine versions it: not brew, not git, not topgrade. That is exactly why it sat
# at a July build while everything around it moved — a loose binary drifts silently forever.
#
# ⚠️ AND IT IS NOT THE APP. `brew install --cask draw-things` keeps /Applications up to date and
# topgrade already handles it; this file is the headless server the service actually execs, which
# is a separate download that happens to share a version number.
#
# Never needs sudo. Never downloads a model — it only points at the app's own Models directory.
set -uo pipefail

BIN="${DT_GRPC_BIN:-$(cd "$(dirname "$0")/../.." && pwd)/private/_brew-service-drawthings-grpc/bin/gRPCServerCLI-macOS}"
REPO="drawthingsai/draw-things-community"
ASSET="gRPCServerCLI-macOS"
SERVICE="draw-things-grpc"
PORT=7859
STAMP="$(dirname "$BIN")/.version"

say() { printf 'draw-things-grpc: %s\n' "$*"; }
die() { printf 'draw-things-grpc: %s\n' "$*" >&2; exit 1; }

[ -d "$(dirname "$BIN")" ] || die "no bin dir at $(dirname "$BIN")"

LATEST=$(curl -fsSL --max-time 30 "https://api.github.com/repos/$REPO/releases/latest" \
  | /usr/bin/python3 -c 'import json,sys; print(json.load(sys.stdin).get("tag_name",""))' 2>/dev/null)
[ -n "$LATEST" ] || die "could not read the latest release"

HAVE=$(cat "$STAMP" 2>/dev/null || echo "unknown")
if [ "$HAVE" = "$LATEST" ]; then
  say "already at $LATEST"
  exit 0
fi

say "$HAVE -> $LATEST"
URL="https://github.com/$REPO/releases/download/$LATEST/$ASSET"
TMP="$BIN.new"

curl -fL --no-progress-meter --max-time 900 -o "$TMP" "$URL" || { rm -f "$TMP"; die "download failed"; }
# A truncated download is still a file. Anything under 50MB is not this binary.
[ "$(stat -f %z "$TMP")" -gt 52428800 ] || { rm -f "$TMP"; die "downloaded file is too small to be $ASSET"; }
chmod +x "$TMP"

brew services stop "$SERVICE" >/dev/null 2>&1
# The old binary is kept until the new one has proven it answers.
[ -f "$BIN" ] && mv "$BIN" "$BIN.prev"
mv "$TMP" "$BIN"
xattr -d com.apple.quarantine "$BIN" 2>/dev/null
brew services start "$SERVICE" >/dev/null 2>&1

for _ in $(seq 1 20); do
  if nc -z -G 2 127.0.0.1 "$PORT" >/dev/null 2>&1; then
    printf '%s\n' "$LATEST" > "$STAMP"
    rm -f "$BIN.prev"
    say "up at $LATEST"
    exit 0
  fi
  sleep 3
done

say "did not answer on :$PORT — putting the previous binary back"
brew services stop "$SERVICE" >/dev/null 2>&1
if [ -f "$BIN.prev" ]; then
  mv "$BIN.prev" "$BIN"
  brew services start "$SERVICE" >/dev/null 2>&1
  die "rolled back; $LATEST does not start here"
fi
die "$LATEST does not start and there was no previous binary to restore"
