#!/usr/bin/env bash
# After a cache restore: sum the bytes on disk of the workload's cache paths and
# write {"restoreBytes": N} to cache.json. This is the restored size, not the
# compressed archive size. Usage: cache-size.sh <workload> [out-file]
set -eu
set -o pipefail

here=$(cd "$(dirname "$0")" && pwd)
workload=${1:?usage: cache-size.sh <workload> [out-file]}
out=${2:-cache.json}

# cache-paths.sh writes to GITHUB_OUTPUT instead of stdout when that is set (every Actions
# step), so clear it here: the paths must come back on stdout. A command substitution, not a
# process substitution, so a failing helper fails this script under set -e instead of giving 0.
paths=$(GITHUB_OUTPUT= bash "$here/cache-paths.sh" "$workload")

total=0
while IFS= read -r path; do
  [ -n "$path" ] || continue
  if [ -e "$path" ]; then
    bytes=$(du -sb "$path" | cut -f1)
    total=$((total + bytes))
  fi
done <<<"$paths"
printf '{"restoreBytes":%s}\n' "$total" >"$out"
cat "$out"
