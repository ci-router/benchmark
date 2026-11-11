#!/usr/bin/env bash
# The compared part: a full release build of rust-analyzer, offline, from scratch.
set -eu
set -o pipefail

here=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=../../bench/lib.sh
. "$here/../../bench/lib.sh"

dir=$(bench_dir)
# shellcheck disable=SC1091
. "$dir/rust-env.sh"
cd "$dir/rust-analyzer"
# Cold builds from scratch. Warm keeps the restored target directory.
if [ "${BENCH_CACHE_MODE:-cold}" != warm ]; then
  rm -rf target
fi
cargo build --release --locked --offline --bin rust-analyzer
./target/release/rust-analyzer --version
