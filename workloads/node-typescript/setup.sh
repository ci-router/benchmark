#!/usr/bin/env bash
# Node build and tests of the TypeScript compiler repository: install a pinned
# Node, fetch the exact commit and install the locked dependencies.
set -eu
set -o pipefail

here=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=../../bench/lib.sh
. "$here/../../bench/lib.sh"

NODE_VERSION="22.23.4"
NODE_SHA256_X64="b8492284c76a54baf58d61668dd0e41ee0fc98adabf9503d30f05d08f55b4406"
NODE_SHA256_ARM64="f7a1e486dbc8b286847815b477d4fb5e9fb963ed4489c3e1588853d685f589f9"
TS_REPO="https://github.com/microsoft/TypeScript.git"
TS_TAG="v7.0.2"
TS_COMMIT="1e4744d68260a7cb91b62b12edc3f6a2187faaf1"

dir=$(bench_dir)
mkdir -p -- "$dir"
dir=$(cd -P -- "$dir" >/dev/null && pwd -P)
lock="$dir/.node-typescript-setup.lock"
if ! mkdir -m 700 -- "$lock"; then
  echo "cannot claim BENCH_DIR: setup may be in progress; use a fresh BENCH_DIR" >&2
  exit 1
fi
stage=
cleanup() {
  if [[ -n "$stage" ]] && ! rm -rf -- "$stage"; then
    echo "could not remove Node staging directory" >&2
  fi
  if ! rmdir -- "$lock"; then
    echo "could not release Node setup claim" >&2
  fi
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

for path in node typescript node-env.sh; do
  if [[ -e "$dir/$path" || -L "$dir/$path" ]]; then
    echo "$path already exists; use a fresh BENCH_DIR" >&2
    exit 1
  fi
done

publish_new() {
  mv -nT -- "$1" "$2"
  if [[ -e "$1" ]]; then
    echo "setup destination already exists; use a fresh BENCH_DIR" >&2
    return 1
  fi
}

ensure_cmd curl curl
ensure_cmd git git
if [ ! -e /etc/ssl/certs/ca-certificates.crt ]; then
  ensure_cmd update-ca-certificates ca-certificates
fi

case "$(uname -m)" in
  x86_64)
    node_arch="x64"
    node_sha="$NODE_SHA256_X64"
    ;;
  aarch64 | arm64)
    node_arch="arm64"
    node_sha="$NODE_SHA256_ARM64"
    ;;
  *)
    echo "unsupported architecture: $(uname -m)" >&2
    exit 1
    ;;
esac

tarball="node-v${NODE_VERSION}-linux-${node_arch}.tar.gz"
stage=$(mktemp -d "$dir/.node-stage.XXXXXXXX")
(
  cd -- "$stage"
  curl --proto '=https' --tlsv1.2 -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/${tarball}" -o "$tarball"
  printf '%s  %s\n' "$node_sha" "$tarball" | sha256sum -c - >/dev/null
  mkdir node
  tar -xzf "$tarball" -C node --strip-components=1
  rm -- "$tarball"
)

bin="$stage/node/bin"
for tool in node npm npx; do
  if [[ ! -f "$bin/$tool" || ! -x "$bin/$tool" ]]; then
    echo "Node archive is missing executable $tool" >&2
    exit 1
  fi
done
node_version=$("$bin/node" --version)
if [[ "$node_version" != "v$NODE_VERSION" ]]; then
  echo "Node archive does not run the pinned version" >&2
  exit 1
fi
npm_version=$(PATH="$bin:$PATH" "$bin/npm" --version)
PATH="$bin:$PATH" "$bin/npx" --version >/dev/null
publish_new "$stage/node" "$dir/node"
printf 'export PATH=%q:%s\n' "$dir/node/bin" "\$PATH" >"$stage/node-env.sh"

src="$dir/typescript"
mkdir -- "$src"
git -C "$src" init -q
git -C "$src" remote add origin "$TS_REPO"
git -C "$src" fetch -q --depth 1 origin "$TS_COMMIT"
git -C "$src" checkout -q --detach FETCH_HEAD
head=$(git -C "$src" rev-parse HEAD)
if [ "$head" != "$TS_COMMIT" ]; then
  echo "TypeScript checkout is $head, expected $TS_COMMIT (tag $TS_TAG)" >&2
  exit 1
fi

# shellcheck disable=SC1091
. "$stage/node-env.sh"
cd "$src"
# Kept under the bench directory so warm mode can save and restore it.
export npm_config_cache="$dir/npm-cache"
"$dir/node/bin/npm" ci --no-audit --no-fund
printf 'setup verified: node %s, npm %s, TypeScript %s at %s\n' "$node_version" "$npm_version" "$TS_TAG" "$head"
publish_new "$stage/node-env.sh" "$dir/node-env.sh"
