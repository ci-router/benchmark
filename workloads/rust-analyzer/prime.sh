#!/usr/bin/env bash
# Warm mode only, after setup.sh in the priming job: build once so the target
# directory is in the cache that the measured jobs restore. Not timed or scored.
set -eu
set -o pipefail

here=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=../../bench/lib.sh
. "$here/../../bench/lib.sh"

dir=$(bench_dir)
# shellcheck disable=SC1091
. "$dir/rust-env.sh"
cd "$dir/rust-analyzer"
cargo build --release --locked --bin rust-analyzer
