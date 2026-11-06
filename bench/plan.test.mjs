import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMatrix, parseRepeats, readRoutes } from './plan.mjs';

test('parseRepeats accepts 1 to 10 only', () => {
  assert.equal(parseRepeats('1'), 1);
  assert.equal(parseRepeats('10'), 10);
  for (const bad of ['', '0', '11', '-1', '1.5', '1e1', ' 1', '1 ', '1;id', '$(id)', '`id`', '١', '100', 'abc', undefined, null, 3]) {
    assert.throws(() => parseRepeats(bad), /repeats/, JSON.stringify(bad));
  }
});

test('buildMatrix uses enabled routes only, every workload and every repeat', () => {
  const routes = [
    { id: 'a', enabled: true },
    { id: 'b', enabled: false },
  ];
  const m = buildMatrix(routes, ['w1', 'w2'], 2);
  assert.equal(m.include.length, 4);
  assert.ok(m.include.every((j) => j.route.id === 'a'));
  assert.deepEqual(m.include.map((j) => `${j.workload}${j.rep}`), ['w11', 'w12', 'w21', 'w22']);
});

test('readRoutes tolerates the archiveLogs field', () => {
  const routes = readRoutes(join(dirname(fileURLToPath(import.meta.url)), '..', 'routes.json'));
  assert.ok(routes.length >= 1);
  assert.ok(routes.every((r) => !('archiveLogs' in r)), 'the matrix does not carry archive settings');
});
