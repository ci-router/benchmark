#!/usr/bin/env bash
# Rust release build of ripgrep: install the pinned toolchain, fetch the exact
# commit and download the locked dependencies. Nothing here is timed as "work".
set -eu
set -o pipefail

here=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=../../bench/lib.sh
. "$here/../../bench/lib.sh"

RUST_TOOLCHAIN="1.99.1"
RIPGREP_REPO="https://github.com/BurntSushi/ripgrep.git"
RIPGREP_TAG="15.2.0"
RIPGREP_COMMIT="e89fff89ac9af12e8d4ce9d5fd07beb408ca730f"

dir=$(bench_dir)
mkdir -p "$dir"

ensure_cmd curl curl
ensure_cmd git git
ensure_cmd cc build-essential
# rustup downloads over https; make sure certificates exist on bare images.
if [ ! -e /etc/ssl/certs/ca-certificates.crt ]; then
  ensure_cmd update-ca-certificates ca-certificates
fi

export RUSTUP_HOME="$dir/rustup"
export CARGO_HOME="$dir/cargo"
curl --proto '=https' --tlsv1.2 -fsSL https://sh.rustup.rs -o "$dir/rustup-init.sh"
sh "$dir/rustup-init.sh" -y --no-modify-path --profile minimal --default-toolchain "$RUST_TOOLCHAIN"

# work.sh sources this file to find the toolchain.
cat >"$dir/rust-env.sh" <<ENVEOF
export RUSTUP_HOME="$dir/rustup"
export CARGO_HOME="$dir/cargo"
export PATH="$dir/cargo/bin:\$PATH"
ENVEOF

src="$dir/ripgrep"
rm -rf "$src"
mkdir -p "$src"
git -C "$src" init -q
git -C "$src" remote add origin "$RIPGREP_REPO"
git -C "$src" fetch -q --depth 1 origin "$RIPGREP_COMMIT"
git -C "$src" checkout -q --detach FETCH_HEAD
head=$(git -C "$src" rev-parse HEAD)
if [ "$head" != "$RIPGREP_COMMIT" ]; then
  echo "ripgrep checkout is $head, expected $RIPGREP_COMMIT (tag $RIPGREP_TAG)" >&2
  exit 1
fi

# shellcheck disable=SC1091
. "$dir/rust-env.sh"
cd "$src"
cargo fetch --locked
echo "setup done: rustc $(rustc --version), ripgrep $RIPGREP_TAG at $head"
