#!/usr/bin/env bash
# EVERY ENGINE TO LATEST, IN ONE COMMAND — the single line topgrade needs to know about:
#
#   [commands]
#   "xokolat engines" = "~/src/xokolat/scripts/update-services.sh"
#
# ⚠️ ONE LINE, FOREVER. Adding a fourth engine means dropping in a fourth folder, never editing
# topgrade again. That is the whole reason this walks a directory instead of naming its services.
#
# TWO LAYERS, THE SAME MERGE THE REGISTRIES DO. Shipped scripts live beside the app and come back
# with any reinstall; yours live in the data root and cannot be lost by editing the app. Same id
# replaces in place, a new id is appended.
#
#   shipped   <install>/services/<id>/update.sh
#   yours     ~/Library/Application Support/xokolat/services/<id>/update.sh
#
# ⚠️ THE USER LAYER IS HAND-PLACED FILES ONLY. That data root also receives downloads — taken
# workflows, compositions, anything from a library — and these scripts run unattended, weekly, as
# you. If something arriving over the network could write a file here, taking a workflow would be
# remote code execution. The app never writes into services/, and nothing else may either.
#
# Exit code is the worst of the run: 0 only when every engine is up and answering.
set -uo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
SHIPPED="$HERE/services"
MINE="$HOME/Library/Application Support/xokolat/services"

declare -a IDS=()
declare -a SCRIPTS=()
seen() { local i; for i in "${IDS[@]:-}"; do [ "$i" = "$1" ] && return 0; done; return 1; }

# Yours first, so a shipped id you have overridden is skipped when the shipped pass reaches it.
for root in "$MINE" "$SHIPPED"; do
  [ -d "$root" ] || continue
  for dir in "$root"/*/; do
    [ -d "$dir" ] || continue
    id=$(basename "$dir")
    seen "$id" && continue
    [ -x "$dir/update.sh" ] || continue
    IDS+=("$id")
    SCRIPTS+=("$dir/update.sh")
  done
done

if [ "${#IDS[@]}" -eq 0 ]; then
  echo "no engine update scripts found"
  exit 0
fi

worst=0
for n in "${!IDS[@]}"; do
  "${SCRIPTS[$n]}" || worst=1
done
exit "$worst"
