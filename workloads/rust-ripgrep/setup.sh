#!/usr/bin/env bash
# Rust release build of ripgrep: install the pinned toolchain, fetch the exact
# commit and download the locked dependencies. Nothing here is timed as "work".
set -eu
set -o pipefail

here=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=../../bench/lib.sh
. "$here/../../bench/lib.sh"

RUST_TOOLCHAIN="1.99.1"
RUSTUP_VERSION="1.29.3"
RUSTUP_SHA256_X64="b1c8cb14e30889e7e2999e6b69e62d9e9b9ffc0f4df8180564d306d9680e6c55"
RUSTUP_SHA256_ARM64="9f608c142e0e38a78957d0661ba1dfaf0b6fb37184cfaa4b9a0aa57af6184282"
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
case "$(uname -m)" in
  x86_64)
    rustup_arch="x86_64"
    rustup_sha="$RUSTUP_SHA256_X64"
    ;;
  aarch64 | arm64)
    rustup_arch="aarch64"
    rustup_sha="$RUSTUP_SHA256_ARM64"
    ;;
  *)
    echo "unsupported architecture: $(uname -m)" >&2
    exit 1
    ;;
esac
curl --proto '=https' --tlsv1.2 -fsSL \
  "https://static.rust-lang.org/rustup/archive/${RUSTUP_VERSION}/${rustup_arch}-unknown-linux-gnu/rustup-init" \
  -o "$dir/rustup-init"
echo "${rustup_sha}  $dir/rustup-init" | sha256sum -c - >/dev/null
chmod +x "$dir/rustup-init"
"$dir/rustup-init" -y --no-modify-path --profile minimal --default-toolchain "$RUST_TOOLCHAIN"

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
