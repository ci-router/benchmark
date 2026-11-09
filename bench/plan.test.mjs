import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMatrix, parseRepeats, readRoutes, selectRoutes } from './plan.mjs';

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

test('the Ubicloud hosted runner is declared but disabled, and stays out of the matrix', () => {
  const routes = readRoutes(join(dirname(fileURLToPath(import.meta.url)), '..', 'routes.json'));
  const ubicloud = routes.find((r) => r.id === 'ubicloud-hosted-4vcpu');
  assert.ok(ubicloud);
  assert.equal(ubicloud.runsOn, 'ubicloud-standard-4-ubuntu-2404');
  assert.equal(ubicloud.enabled, false);
  const m = buildMatrix(routes, ['w1'], 1);
  assert.ok(m.include.every((j) => j.route.id !== 'ubicloud-hosted-4vcpu'));
});

test('selectRoutes: default is only the free baseline; explicit selection cannot fan out', () => {
  const routes = [
    { id: 'github-hosted-4vcpu', enabled: true },
    { id: 'b', enabled: true },
    { id: 'c', enabled: false },
  ];
  assert.deepEqual(selectRoutes(routes, '').map((r) => r.id), ['github-hosted-4vcpu']);
  assert.deepEqual(selectRoutes(routes, undefined).map((r) => r.id), ['github-hosted-4vcpu']);
  assert.deepEqual(selectRoutes(routes, 'b').map((r) => r.id), ['b']);
  assert.throws(() => selectRoutes(routes, 'c'), /disabled/);
  assert.throws(() => selectRoutes(routes, 'zz'), /not in routes.json/);
  for (const bad of ['A', 'a b', '$(id)', 'a;b', '-a']) assert.throws(() => selectRoutes(routes, bad), /route id/, bad);
});

test('the Depot route is declared with its own label and 2 vCPU / 8 GB', () => {
  const routes = readRoutes(join(dirname(fileURLToPath(import.meta.url)), '..', 'routes.json'));
  const depot = routes.find((r) => r.id === 'depot-ubuntu-2vcpu');
  assert.ok(depot);
  assert.equal(depot.runsOn, 'depot-ubuntu-24.04');
  assert.equal(depot.vcpu, 2);
  assert.equal(depot.memoryGb, 8);
  assert.throws(() => selectRoutes(routes, 'depot-ubuntu-2vcpu'), /disabled/);
});

test('the Boat routes are declared with their own labels and sizes', () => {
  const routes = readRoutes(join(dirname(fileURLToPath(import.meta.url)), '..', 'routes.json'));
  const four = routes.find((r) => r.id === 'boat-4vcpu');
  const two = routes.find((r) => r.id === 'boat-2vcpu');
  assert.ok(four && two);
  assert.equal(four.runsOn, 'boat');
  assert.equal(four.vcpu, 4);
  assert.equal(two.runsOn, 'boat-small');
  assert.equal(two.vcpu, 2);
  assert.ok(!four.archiveLogs && !two.archiveLogs);
});


test('unqualified hosted routes remain disabled, including the documented Tenki configuration', () => {
  const routes = readRoutes(join(dirname(fileURLToPath(import.meta.url)), '..', 'routes.json'));
  assert.deepEqual(routes.filter((r) => r.enabled).map((r) => r.id), ['github-hosted-4vcpu']);
  const tenki = routes.find((r) => r.id === 'tenki-hosted-4vcpu');
  assert.equal(tenki.runsOn, 'tenki-standard-medium-4c-8g');
  assert.equal(tenki.vcpu, 4);
  assert.equal(tenki.memoryGb, 8);
  for (const route of routes.filter((r) => r.provider !== 'github')) {
    assert.throws(() => selectRoutes(routes, route.id), /disabled/);
  }
});

test('missing or disabled baseline fails closed rather than selecting paid routes', () => {
  assert.throws(() => selectRoutes([{ id: 'paid', enabled: true }], ''), /not in routes.json/);
  assert.throws(() => selectRoutes([{ id: 'github-hosted-4vcpu', enabled: false }, { id: 'paid', enabled: true }], ''), /disabled/);
});
