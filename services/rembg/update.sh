#!/usr/bin/env bash
# rembg → latest, through uv, which is what installed it.
#
# ⚠️ NO GIT AND NO DOWNLOAD HERE. rembg is a uv-managed CLI app (`uv tool install rembg`), so the
# whole update is `uv tool upgrade` and the only job left is restarting the daemon and proving it
# came back.
#
# ⚠️ AND :7000 IS SHARED ON macOS. AirPlay Receiver listens on *:7000, so while our 127.0.0.1
# listener is down every request lands on AirPlay, which answers 403. A TCP connect is therefore
# NOT a health check here — the probe asks for /openapi.json, which only the real server serves.
#
# Never needs sudo. Never downloads a model (BiRefNet is fetched lazily on the first cutout).
set -uo pipefail

SERVICE="rembg-daemon"
PROBE="http://127.0.0.1:7000/openapi.json"

say() { printf 'rembg: %s\n' "$*"; }
die() { printf 'rembg: %s\n' "$*" >&2; exit 1; }

command -v uv >/dev/null 2>&1 || die "uv is not installed — rembg is a uv tool"

BEFORE=$(uv tool list 2>/dev/null | awk '/^rembg /{print $2}')
[ -n "$BEFORE" ] || die "rembg is not a uv tool here — install it with: uv tool install rembg"

OUT=$(uv tool upgrade rembg 2>&1)
AFTER=$(uv tool list 2>/dev/null | awk '/^rembg /{print $2}')

if [ "$BEFORE" = "$AFTER" ]; then
  say "already at $BEFORE"
  exit 0
fi

say "$BEFORE -> $AFTER"
brew services restart "$SERVICE" >/dev/null 2>&1

for _ in $(seq 1 20); do
  if curl -fs -o /dev/null --max-time 5 "$PROBE"; then
    say "up at $AFTER"
    exit 0
  fi
  sleep 3
done

say "did not answer on :7000 — rolling back to $BEFORE"
uv tool install --force "rembg==$BEFORE" >/dev/null 2>&1 || die "ROLLBACK FAILED — rembg is at $AFTER and not answering"
brew services restart "$SERVICE" >/dev/null 2>&1
die "rolled back to $BEFORE; $AFTER does not start here"
