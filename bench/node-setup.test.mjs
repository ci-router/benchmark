import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync,
  readdirSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const setup = fileURLToPath(new URL('../workloads/node-typescript/setup.sh', import.meta.url));
const tsCommit = '1e4744d68260a7cb91b62b12edc3f6a2187faaf1';
const pin = {
  x64: 'b8492284c76a54baf58d61668dd0e41ee0fc98adabf9503d30f05d08f55b4406',
  arm64: 'f7a1e486dbc8b286847815b477d4fb5e9fb963ed4489c3e1588853d685f589f9',
};
const linux = { skip: process.platform !== 'linux' && 'requires GNU/Linux setup tools' };

function run(command, args, options = {}) {
  return spawnSync(command, args, { encoding: 'utf8', timeout: 10_000, ...options });
}

function fixture(t, fault = '', arch = 'x64') {
  const root = mkdtempSync(join(tmpdir(), 'benchmark-setup-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dir = "bench with spaces ' $HOME";
  const bench = join(root, dir);
  const shell = join(root, 'fake-bin');
  const archive = join(root, 'fixture.tar.gz');
  const tree = join(root, 'node-pinned');
  const cli = join(tree, 'lib/node_modules/npm/bin');
  const marker = join(bench, 'node-env.sh');
  const npmCi = join(root, 'npm-ci');
  const write = (path, script) => writeFileSync(path, '#!/bin/bash\nset -eu\n' + script + '\n', { mode: 0o755 });
  mkdirSync(cli, { recursive: true });
  mkdirSync(join(tree, 'bin'));
  mkdirSync(join(bench, 'npm-cache'), { recursive: true });
  writeFileSync(join(bench, 'npm-cache/preserved'), 'warm cache');
  mkdirSync(shell);
  if (fault !== 'missing-node') write(join(tree, 'bin/node'), 'echo "${FIXTURE_VERSION}"');
  for (const tool of ['npm', 'npx']) {
    symlinkSync('../lib/node_modules/npm/bin/' + tool + '-cli.js', join(tree, 'bin', tool));
    if (fault === 'missing-npx' && tool === 'npx') continue;
    write(join(cli, tool + '-cli.js'), [
      'case "$1" in',
      '  --version) [[ "$(node --version)" == v22.23.4 ]]; echo 10.9.8 ;;',
      '  ci)',
      '    [[ "$0" == "$FIXTURE_BENCH/node/bin/npm" ]]',
      '    [[ "$PWD" == "$FIXTURE_BENCH/typescript" ]]',
      '    [[ "$npm_config_cache" == "$FIXTURE_BENCH/npm-cache" ]]',
      '    [[ ! -e "$FIXTURE_BENCH/node-env.sh" ]]',
      '    [[ "$FIXTURE_FAULT" != npm-failure ]]',
      '    printf "%s\\n" "$*" > "$FIXTURE_NPM_CI" ;;',
      '  *) exit 9 ;;',
      'esac',
    ].join('\n'));
  }
  const packed = run('/usr/bin/tar', ['-czf', archive, '-C', root, 'node-pinned']);
  assert.equal(packed.status, 0, packed.stderr);
  write(join(shell, 'curl'), [
    '[[ "$*" == *"https://nodejs.org/dist/v22.23.4/node-v22.23.4-linux-$FIXTURE_ARCH.tar.gz"* ]]',
    'if [[ "$FIXTURE_FAULT" == contender && -z "${CONTENDER:-}" ]]; then',
    '  code=0',
    '  (cd "$FIXTURE_ROOT"; CONTENDER=1 bash "$FIXTURE_SETUP") > "$FIXTURE_ROOT/contender.log" 2>&1 || code=$?',
    '  printf "%s\\n" "$code" > "$FIXTURE_ROOT/contender.status"',
    'fi',
    'while [[ "$1" != -o ]]; do shift; done',
    'cp -- "$FIXTURE_ARCHIVE" "$2"',
  ].join('\n'));
  write(join(shell, 'sha256sum'), [
    'IFS= read -r line',
    '[[ "$line" == "$FIXTURE_SHA  "* ]]',
    'cmp -- "${line#*  }" "$FIXTURE_ARCHIVE"',
    '[[ "$FIXTURE_FAULT" != checksum-failure ]]',
  ].join('\n'));
  write(join(shell, 'tar'), [
    '[[ ! -e "$FIXTURE_BENCH/node" && ! -e "$FIXTURE_BENCH/node-env.sh" ]]',
    '[[ "$PWD" == "$FIXTURE_BENCH"/.node-stage.* && "$(stat -c %a .)" == 700 ]]',
    '[[ "$(stat -c %d .)" == "$(stat -c %d "$FIXTURE_BENCH")" ]]',
    '/usr/bin/tar "$@"',
    '[[ "$FIXTURE_FAULT" != tar-failure ]] || exit 2',
    'if [[ "$FIXTURE_FAULT" == publish-collision ]]; then',
    '  ln -s -- "$FIXTURE_ROOT/unowned" "$FIXTURE_BENCH/node"',
    'fi',
  ].join('\n'));
  write(join(shell, 'uname'), 'echo "$FIXTURE_MACHINE"');
  write(join(shell, 'git'), 'if [[ "$3" == rev-parse ]]; then echo ' + tsCommit + '; fi');
  for (const tool of ['node', 'npm', 'npx']) {
    write(join(shell, tool), 'echo "unexpected host tool" >&2; exit 9');
  }
  const env = {
    PATH: shell + ':/usr/bin:/bin',
    BENCH_DIR: dir,
    FIXTURE_BENCH: bench,
    FIXTURE_ARCHIVE: archive,
    FIXTURE_ARCH: arch,
    FIXTURE_MACHINE: arch === 'x64' ? 'x86_64' : 'aarch64',
    FIXTURE_SHA: pin[arch],
    FIXTURE_SETUP: setup,
    FIXTURE_ROOT: root,
    FIXTURE_NPM_CI: npmCi,
    FIXTURE_VERSION: fault === 'wrong-version' ? 'v20.0.0' : 'v22.23.4',
    FIXTURE_FAULT: fault,
  };
  return {
    root, bench, marker, npmCi, env,
    setup: () => run('/bin/bash', [setup], { cwd: root, env }),
  };
}

function assertClean(f) {
  assert.deepEqual(readdirSync(f.bench).filter((entry) => entry.startsWith('.')), []);
  assert.equal(readFileSync(join(f.bench, 'npm-cache/preserved'), 'utf8'), 'warm cache');
}

for (const arch of ['x64', 'arm64']) {
  test('publishes the pinned ' + arch + ' install and shell-safe marker after npm ci', linux, (t) => {
    const f = fixture(t, '', arch);
    const first = f.setup();
    assert.equal(first.status, 0, first.stderr);
    assert.equal(readFileSync(f.npmCi, 'utf8').trim(), 'ci --no-audit --no-fund');
    const loaded = run('/bin/bash', ['-ec', '. "$1"; command -v node; node --version', 'marker', f.marker], { env: f.env });
    assert.equal(loaded.status, 0, loaded.stderr);
    assert.equal(loaded.stdout.trim(), join(f.bench, 'node/bin/node') + '\nv22.23.4');
    const before = readFileSync(f.marker, 'utf8');
    const second = f.setup();
    assert.equal(second.status, 1, second.stderr);
    assert.match(second.stderr, /fresh BENCH_DIR/);
    assert.equal(readFileSync(f.marker, 'utf8'), before);
    assertClean(f);
  });
}

for (const fault of ['checksum-failure', 'tar-failure', 'missing-node', 'missing-npx', 'wrong-version', 'npm-failure']) {
  test('does not publish readiness on ' + fault, linux, (t) => {
    const f = fixture(t, fault);
    const failed = f.setup();
    assert.equal(failed.error, undefined);
    assert.equal(failed.status, fault === 'tar-failure' ? 2 : 1, failed.stderr);
    assert.equal(existsSync(f.marker), false);
    assert.equal(existsSync(join(f.bench, 'node')), fault === 'npm-failure');
    assert.equal(existsSync(f.npmCi), false);
    assert.doesNotMatch(failed.stderr, /unexpected host tool/);
    assertClean(f);
  });
}

test('leaves a dangling preexisting destination or claim alone', linux, (t) => {
  for (const name of ['node', 'typescript', 'node-env.sh', '.node-typescript-setup.lock']) {
    const f = fixture(t);
    const path = join(f.bench, name);
    symlinkSync(join(f.root, 'unowned'), path);
    const result = f.setup();
    assert.equal(result.status, 1, result.stderr);
    assert.equal(lstatSync(path).isSymbolicLink(), true);
    assert.equal(existsSync(f.npmCi), false);
    assert.deepEqual(readdirSync(f.bench).sort(), ['npm-cache', name].sort());
  }
});

test('does not clobber a destination that appears at publication', linux, (t) => {
  const f = fixture(t, 'publish-collision');
  const result = f.setup();
  assert.equal(result.status, 1, result.stderr);
  assert.equal(lstatSync(join(f.bench, 'node')).isSymbolicLink(), true);
  assert.equal(existsSync(f.marker), false);
  assert.equal(existsSync(f.npmCi), false);
  assertClean(f);
});

test('a competing setup cannot touch outputs or acquire the active claim', linux, (t) => {
  const f = fixture(t, 'contender');
  const first = f.setup();
  assert.equal(first.status, 0, first.stderr);
  assert.equal(readFileSync(join(f.root, 'contender.status'), 'utf8'), '1\n');
  assert.match(readFileSync(join(f.root, 'contender.log'), 'utf8'), /setup.*in progress/);
  assert.equal(existsSync(f.marker), true);
  assertClean(f);
});
