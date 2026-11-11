#!/usr/bin/env bash
# Print the cache paths of a workload, absolute under the bench directory, one
# per line, from workloads/<workload>/cache-paths.txt. With GITHUB_OUTPUT set,
# write them as the multi-line step output `paths`. Usage: cache-paths.sh <workload>
set -eu
set -o pipefail

here=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=lib.sh
. "$here/lib.sh"

workload=${1:?usage: cache-paths.sh <workload>}
case "$workload" in
  *[!a-z0-9-]* | '' | -*) echo "bad workload id" >&2; exit 1 ;;
esac
list="$here/../workloads/$workload/cache-paths.txt"
[ -f "$list" ] || { echo "$workload has no cache-paths.txt" >&2; exit 1; }

dir=$(bench_dir)
paths=""
while IFS= read -r rel || [ -n "$rel" ]; do
  [ -n "$rel" ] || continue
  case "$rel" in
    /* | *..* ) echo "bad cache path in $list" >&2; exit 1 ;;
  esac
  paths="${paths}${dir}/${rel}"$'\n'
done <"$list"

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  { echo "paths<<CACHE_PATHS_EOF"; printf '%s' "$paths"; echo "CACHE_PATHS_EOF"; } >>"$GITHUB_OUTPUT"
else
  printf '%s' "$paths"
fi
