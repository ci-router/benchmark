#!/usr/bin/env bash
# The compared part: a full release build of ripgrep, offline, from scratch.
set -eu
set -o pipefail

here=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=../../bench/lib.sh
. "$here/../../bench/lib.sh"

dir=$(bench_dir)
# shellcheck disable=SC1091
. "$dir/rust-env.sh"
cd "$dir/ripgrep"
rm -rf target
cargo build --release --locked --offline
./target/release/rg --version
