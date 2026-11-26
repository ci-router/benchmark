import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertScheduledFreeBaseline,
  assertCacheMode,
  assertScheduledSuite,
  buildPrimeMatrix,
  parseCacheMode,
  buildMatrix,
  listWorkloads,
  parseRepeats,
  readRoutes,
  scheduledRoutes,
  scheduledWorkloads,
  selectRoutes,
  selectWorkloads,
} from './plan.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const baseline = { id: 'github-hosted-4vcpu', provider: 'github', enabled: true, runsOn: 'ubuntu-24.04', image: 'ubuntu-24.04', vcpu: 4, memoryGb: 16, cacheBackend: 'github-actions-cache' };

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
  const routes = readRoutes(join(root, 'routes.json'));
  assert.ok(routes.length >= 1);
  assert.ok(routes.every((r) => !('archiveLogs' in r)), 'the matrix does not carry archive settings');
});

test('the Ubicloud hosted runner is declared but disabled, and stays out of the matrix', () => {
  const routes = readRoutes(join(root, 'routes.json'));
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
  const routes = readRoutes(join(root, 'routes.json'));
  const depot = routes.find((r) => r.id === 'depot-ubuntu-2vcpu');
  assert.ok(depot);
  assert.equal(depot.runsOn, 'depot-ubuntu-24.04');
  assert.equal(depot.vcpu, 2);
  assert.equal(depot.memoryGb, 8);
  assert.equal(selectRoutes(routes, 'depot-ubuntu-2vcpu')[0].id, depot.id);
});

test('the Boat routes are declared with their own labels and sizes', () => {
  const routes = readRoutes(join(root, 'routes.json'));
  const four = routes.find((r) => r.id === 'boat-4vcpu');
  const two = routes.find((r) => r.id === 'boat-2vcpu');
  assert.ok(four && two);
  assert.equal(four.runsOn, 'boat');
  assert.equal(four.vcpu, 4);
  assert.equal(two.runsOn, 'boat-small');
  assert.equal(two.vcpu, 2);
  assert.ok(!four.archiveLogs && !two.archiveLogs);
});

test('the Instabox routes are declared with their own labels, sizes and recorded price basis', () => {
  const routeFile = JSON.parse(readFileSync(join(root, 'routes.json'), 'utf8')).routes;
  const routes = readRoutes(join(root, 'routes.json'));
  const four = routes.find((r) => r.id === 'instabox-4vcpu');
  const two = routes.find((r) => r.id === 'instabox-2vcpu');
  assert.ok(four && two);
  assert.equal(four.runsOn, 'instabox-medium');
  assert.equal(four.vcpu, 4);
  assert.equal(four.memoryGb, 8);
  assert.equal(four.enabled, true);
  assert.equal(selectRoutes(routes, 'instabox-4vcpu')[0].id, four.id);
  assert.equal(two.runsOn, 'instabox-small');
  assert.equal(two.vcpu, 2);
  assert.equal(two.memoryGb, 4);
  assert.equal(two.enabled, false);
  assert.throws(() => selectRoutes(routes, 'instabox-2vcpu'), /disabled/);
  const raw = routeFile.find((r) => r.id === 'instabox-4vcpu');
  assert.equal(raw.settings.arch, null, 'architecture is unknown until a job fingerprint reports it');
  assert.match(raw.note, /\$0\.034\/hour/);
  assert.match(raw.note, /pending invoice check/);
  assert.match(routeFile.find((r) => r.id === 'instabox-2vcpu').note, /Pro plan/);
  assert.ok(!raw.archiveLogs);
});

test('a paid Instabox dispatch needs one explicit workload and one repeat', () => {
  const routes = readRoutes(join(root, 'routes.json'));
  const selected = selectRoutes(routes, 'instabox-4vcpu');
  assert.throws(() => selectWorkloads(selected, ['node-typescript', 'rust-analyzer'], 'all', 1), /explicit workload/);
  assert.throws(() => selectWorkloads(selected, ['node-typescript', 'rust-analyzer'], 'node-typescript', 2), /one repetition/);
  assert.deepEqual(selectWorkloads(selected, ['node-typescript', 'rust-analyzer'], 'node-typescript', 1), ['node-typescript']);
});

test('the Namespace, Celesto and Blacksmith routes are their own 4 vCPU identities with pinned labels and list prices', () => {
  const routeFile = JSON.parse(readFileSync(join(root, 'routes.json'), 'utf8')).routes;
  const routes = readRoutes(join(root, 'routes.json'));
  for (const [id, provider, runsOn, price] of [
    ['namespace-hosted-4vcpu', 'namespace', 'nscloud-ubuntu-24.04-amd64-4x16', /\$0\.012 per minute/],
    ['celesto-hosted-4vcpu', 'celesto', 'celesto-large', /\$0\.08 per hour/],
    ['blacksmith-hosted-4vcpu', 'blacksmith', 'blacksmith-4vcpu-ubuntu-2404', /\$0\.008 per minute/],
  ]) {
    const route = routes.find((r) => r.id === id);
    assert.ok(route, id);
    assert.equal(route.provider, provider);
    assert.equal(route.runsOn, runsOn);
    assert.equal(route.vcpu, 4);
    assert.equal(route.memoryGb, 16);
    assert.equal(route.image, 'ubuntu-24.04');
    assert.equal(route.cacheBackend, null);
    assert.throws(() => assertCacheMode([route], 'warm'), /no recorded cache backend/);
    const selected = selectRoutes(routes, id);
    assert.throws(() => selectWorkloads(selected, ['node-typescript', 'rust-analyzer'], 'all', 1), /explicit workload/);
    assert.throws(() => selectWorkloads(selected, ['node-typescript', 'rust-analyzer'], 'node-typescript', 2), /one repetition/);
    const raw = routeFile.find((r) => r.id === id);
    assert.match(raw.note, price);
    assert.match(raw.note, /read 2026-11-18/);
    assert.ok(!raw.archiveLogs);
  }
});

test('unqualified hosted routes remain disabled, including the documented Luxor configuration', () => {
  const routes = readRoutes(join(root, 'routes.json'));
  assert.deepEqual(routes.filter((r) => r.enabled).map((r) => r.id), ['github-hosted-4vcpu', 'depot-ubuntu-2vcpu', 'depot-ubuntu-4vcpu', 'boat-4vcpu', 'instabox-4vcpu', 'namespace-hosted-4vcpu', 'celesto-hosted-4vcpu', 'blacksmith-hosted-4vcpu']);
  const luxor = routes.find((r) => r.id === 'luxor-hosted-4vcpu');
  assert.equal(luxor.runsOn, 'luxor-ubuntu-medium-4c-8g');
  assert.equal(luxor.vcpu, 4);
  assert.equal(luxor.memoryGb, 8);
  for (const route of routes.filter((r) => !r.enabled)) {
    assert.throws(() => selectRoutes(routes, route.id), /disabled/);
  }
});

test('missing or disabled baseline fails closed rather than selecting paid routes', () => {
  assert.throws(() => selectRoutes([{ id: 'paid', enabled: true }], ''), /not in routes.json/);
  assert.throws(() => selectRoutes([{ id: 'github-hosted-4vcpu', enabled: false }, { id: 'paid', enabled: true }], ''), /disabled/);
});

test('paid pilot requires exactly one explicit workload and one repetition', () => {
  const paid = [{ provider: 'depot' }];
  const workloads = ['node-typescript', 'rust-analyzer'];
  assert.throws(() => selectWorkloads(paid, workloads, 'all', 1), /explicit workload/);
  assert.throws(() => selectWorkloads(paid, workloads, 'node-typescript', 2), /one repetition/);
  for (const bad of ['', 'x', '$(id)', '../node-typescript', null]) assert.throws(() => selectWorkloads(paid, workloads, bad, 1), /workload/);
  assert.deepEqual(selectWorkloads(paid, workloads, 'node-typescript', 1), ['node-typescript']);
  assert.deepEqual(selectWorkloads([{ provider: 'github' }], workloads, 'all', 1), workloads);
});

test('scheduled sampling never enrolls a newly enabled paid route implicitly', () => {
  const routes = [{ ...baseline }, { id: 'paid', provider: 'depot', enabled: true }];
  const selected = scheduledRoutes(routes, { program: 'external', routes: ['github-hosted-4vcpu'], repeats: 1 });
  assert.deepEqual(selected, [routes[0]]);
  assert.equal(buildMatrix(selected, ['node', 'rust'], 1).include.length, 2);
});

test('scheduled sampling rejects disabled, unknown, duplicate and invalid routes or repeats', () => {
  const routes = [{ ...baseline }, { id: 'disabled', provider: 'github', enabled: false }];
  for (const config of [null, {}, { program: 'external', routes: [], repeats: 1 },
    { program: 'external', routes: ['disabled'], repeats: 1 }, { program: 'external', routes: ['missing'], repeats: 1 },
    { program: 'external', routes: ['github-hosted-4vcpu', 'github-hosted-4vcpu'], repeats: 1 },
    { program: 'external', routes: ['$(id)'], repeats: 1 },
    { program: 'external', routes: ['github-hosted-4vcpu'], repeats: 2 },
    { program: 'external', routes: ['github-hosted-4vcpu'], repeats: '1' }]) {
    assert.throws(() => scheduledRoutes(routes, config), /schedule.json/);
  }
});

test('scheduled sampling rejects non-external programs and every paid or non-GitHub route', () => {
  const routes = [
    { ...baseline },
    { id: 'depot-ubuntu-2vcpu', provider: 'depot', enabled: true },
    { id: 'other-github', provider: 'github', enabled: true },
  ];
  assert.throws(() => scheduledRoutes(routes, { program: 'internal', routes: ['github-hosted-4vcpu'], repeats: 1 }), /program/);
  assert.throws(() => scheduledRoutes(routes, { program: 'external', routes: ['depot-ubuntu-2vcpu'], repeats: 1 }), /free public GitHub baseline/);
  assert.throws(() => scheduledRoutes(routes, { program: 'external', routes: ['other-github'], repeats: 1 }), /free public GitHub baseline/);
});

test('scheduled workloads are pinned to the reviewed set', () => {
  const available = ['node-typescript', 'rust-analyzer'];
  const config = { workloads: ['node-typescript', 'rust-analyzer'] };
  assert.deepEqual(scheduledWorkloads(available, config), available);
  assert.throws(() => scheduledWorkloads([...available, 'go'], config), /reviewed workload set/);
  assert.throws(() => scheduledWorkloads(available, { workloads: ['node-typescript'] }), /reviewed workload set/);
  assert.throws(() => scheduledWorkloads(available, { workloads: ['node-typescript', 'node-typescript'] }), /unique workload/);
  assert.throws(() => scheduledWorkloads(available, { workloads: ['node-typescript', 'missing'] }), /unknown workload/);
});

test('scheduled suite must match suite.json', () => {
  assert.doesNotThrow(() => assertScheduledSuite({ suite: '0.2.0' }, '0.2.0'));
  assert.throws(() => assertScheduledSuite({ suite: '0.1.0' }, '0.2.0'), /suite/);
  assert.throws(() => assertScheduledSuite({}, '0.2.0'), /suite/);
});

test('the external schedule is free-only and rejects paid enrollment metadata', () => {
  const routes = [{ ...baseline }];
  const workloads = ['node-typescript', 'rust-analyzer'];
  const config = { dailyBudgetUsd: 0, maxJobCostUsd: { 'github-hosted-4vcpu': 0 } };
  assert.equal(assertScheduledFreeBaseline(routes, workloads, config), 0);
  assert.throws(() => assertScheduledFreeBaseline(routes, workloads, { ...config, dailyBudgetUsd: 1 }), /free/);
  assert.throws(() => assertScheduledFreeBaseline(routes, workloads, { ...config, maxJobCostUsd: { 'github-hosted-4vcpu': 0.01 } }), /execution charge/);
  assert.throws(() => assertScheduledFreeBaseline(routes, workloads, { ...config, maxJobCostUsd: { 'github-hosted-4vcpu': 0, paid: 0 } }), /exactly the scheduled routes/);
  assert.throws(() => assertScheduledFreeBaseline([{ id: 'depot-ubuntu-2vcpu', provider: 'depot' }], workloads, {
    ...config, maxJobCostUsd: { 'depot-ubuntu-2vcpu': 0 },
  }), /free public GitHub baseline/);
});

test('scheduled baseline rejects paid runner labels and sample shape drift', () => {
  const config = { program: 'external', routes: [baseline.id], repeats: 1,
    dailyBudgetUsd: 0, maxJobCostUsd: { [baseline.id]: 0 } };
  for (const change of [
    { runsOn: 'depot-ubuntu-24.04' }, { runsOn: 'ubuntu-latest' },
    { runsOn: undefined }, { image: 'ubuntu-22.04' }, { vcpu: 8 }, { memoryGb: 32 },
  ]) {
    const routes = [{ ...baseline, ...change }];
    assert.throws(() => scheduledRoutes(routes, config), /reviewed free public GitHub baseline/);
    assert.throws(() => assertScheduledFreeBaseline(routes, ['node-typescript'], config), /reviewed free public GitHub baseline/);
  }
});

test('the committed schedule validates against the committed routes, workloads and suite', () => {
  const routes = readRoutes(join(root, 'routes.json'));
  const available = listWorkloads(join(root, 'workloads'));
  const config = JSON.parse(readFileSync(join(root, 'schedule.json'), 'utf8'));
  const suite = JSON.parse(readFileSync(join(root, 'suite.json'), 'utf8'));
  assert.equal(config.program, 'external');
  assertScheduledSuite(config, suite.suite);
  const selected = scheduledRoutes(routes, config);
  assert.deepEqual(selected, [baseline]);
  const workloads = scheduledWorkloads(available, config);
  assert.deepEqual(workloads, ['node-typescript', 'rust-analyzer']);
  assert.equal(assertScheduledFreeBaseline(selected, workloads, config), 0);
  const matrix = buildMatrix(selected, workloads, config.repeats);
  assert.equal(matrix.include.length, 2);
  assert.ok(matrix.include.every((j) => j.route.id === 'github-hosted-4vcpu'));
});

test('default manual dispatch stays on the free baseline and does not enroll Depot', () => {
  const routes = readRoutes(join(root, 'routes.json'));
  const available = listWorkloads(join(root, 'workloads'));
  const selected = selectRoutes(routes, '');
  const workloads = selectWorkloads(selected, available, 'all', 1);
  const matrix = buildMatrix(selected, workloads, 1);
  assert.equal(matrix.include.length, 2);
  assert.ok(matrix.include.every((j) => j.route.id === 'github-hosted-4vcpu'));
});

test('cache mode: cold is the default, warm needs a recorded backend and never runs on the schedule', () => {
  assert.equal(parseCacheMode(undefined), 'cold');
  assert.equal(parseCacheMode(''), 'cold');
  assert.equal(parseCacheMode('warm'), 'warm');
  for (const bad of ['hot', 'Warm', 'warm ', 'cold;id']) assert.throws(() => parseCacheMode(bad), /cache mode/, bad);
  const withBackend = { ...baseline, cacheBackend: 'github-actions-cache' };
  assertCacheMode([baseline], 'cold');
  assertCacheMode([withBackend], 'warm');
  assert.throws(() => assertCacheMode([{ ...baseline, cacheBackend: null }], 'warm'), /no recorded cache backend/);
  assert.throws(() => assertCacheMode([withBackend], 'warm', true), /cold only/);
});

test('matrix entries carry the mode and only warm gets priming jobs', () => {
  const cold = buildMatrix([baseline], ['w1'], 2);
  assert.deepEqual(cold.include.map((e) => e.mode), ['cold', 'cold']);
  assert.equal(buildPrimeMatrix([baseline], ['w1'], 'cold').include.length, 0);
  const warm = buildMatrix([baseline], ['w1'], 2, 'warm');
  assert.deepEqual(warm.include.map((e) => e.mode), ['warm', 'warm']);
  const prime = buildPrimeMatrix([baseline], ['w1', 'w2'], 'warm');
  assert.deepEqual(prime.include.map((e) => e.workload), ['w1', 'w2']); // once per workload, not per repeat
});

test('routes.json records a cache backend field per route', () => {
  const routes = readRoutes(join(root, 'routes.json'));
  for (const r of routes) assert.ok(r.cacheBackend === null || /^[a-z0-9-]+$/.test(r.cacheBackend), r.id);
  assert.equal(routes.find((r) => r.id === 'github-hosted-4vcpu').cacheBackend, 'github-actions-cache');
});

test('every workload with a priming script or cache list has cache paths', () => {
  for (const w of listWorkloads(join(root, 'workloads'))) {
    const list = readFileSync(join(root, 'workloads', w, 'cache-paths.txt'), 'utf8').split('\n').filter(Boolean);
    assert.ok(list.length > 0, w);
    for (const p of list) assert.ok(!p.startsWith('/') && !p.includes('..'), `${w}: ${p}`);
  }
});

test('the WarpBuild 4 vCPU route is declared, pinned and disabled until its App is installed', () => {
  const routes = readRoutes(join(root, 'routes.json'));
  const route = routes.find((r) => r.id === 'warpbuild-hosted-4vcpu');
  assert.ok(route);
  assert.equal(route.provider, 'warpbuild');
  assert.equal(route.runsOn, 'warp-ubuntu-2404-x64-4x');
  assert.equal(route.vcpu, 4);
  assert.equal(route.memoryGb, 16);
  assert.equal(route.image, 'ubuntu-24.04');
  assert.equal(route.cacheBackend, null);
  assert.equal(route.enabled, false);
  const raw = JSON.parse(readFileSync(join(root, 'routes.json'), 'utf8')).routes.find((r) => r.id === route.id);
  assert.match(raw.note, /\$0\.008 per minute/);
  assert.match(raw.note, /read 2026-11-25/);
});

test('the Depot 4 vCPU route records no cache backend, so its cold rows carry the plain identity', () => {
  const routes = readRoutes(join(root, 'routes.json'));
  const route = routes.find((r) => r.id === 'depot-ubuntu-4vcpu');
  assert.equal(route.enabled, true);
  assert.equal(route.cacheBackend, null);
  assert.throws(() => assertCacheMode([route], 'warm'), /no recorded cache backend/);
});
