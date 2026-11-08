import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertScheduledBudget, buildMatrix, parseRepeats, readRoutes, scheduledRoutes } from './plan.mjs';

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


test('scheduled sampling never enrolls a newly enabled paid route implicitly', () => {
  const routes = [{ id: 'baseline', enabled: true }, { id: 'paid', enabled: true }];
  const selected = scheduledRoutes(routes, { routes: ['baseline'], repeats: 1 });
  assert.deepEqual(selected, [routes[0]]);
  assert.equal(buildMatrix(selected, ['node', 'rust'], 1).include.length, 2);
});

test('scheduled sampling rejects disabled, unknown, duplicate and invalid routes or repeats', () => {
  const routes = [{ id: 'baseline', enabled: true }, { id: 'disabled', enabled: false }];
  for (const config of [null, {}, { routes: [], repeats: 1 },
    { routes: ['disabled'], repeats: 1 }, { routes: ['missing'], repeats: 1 },
    { routes: ['baseline', 'baseline'], repeats: 1 }, { routes: ['$(id)'], repeats: 1 },
    { routes: ['baseline'], repeats: 2 }, { routes: ['baseline'], repeats: '1' }]) {
    assert.throws(() => scheduledRoutes(routes, config), /schedule.json/);
  }
});


test('scheduled budget includes every workload and all four daily passes', () => {
  const routes = [{ id: 'paid' }];
  const config = { dailyBudgetUsd: 5, maxJobCostUsd: { paid: 0.625 } };
  assert.equal(assertScheduledBudget(routes, ['node', 'rust'], config), 5);
  assert.throws(() => assertScheduledBudget(routes, ['node', 'rust', 'go'], config), /exceeds/);
  assert.throws(() => assertScheduledBudget([...routes, { id: 'new' }], ['node'], config), /maximum job cost/);
});

test('scheduled budget refuses unknown, zero paid, nonfinite costs and unapproved budgets', () => {
  for (const cost of [undefined, null, '0.5', -1, NaN, Infinity, 0]) {
    assert.throws(() => assertScheduledBudget([{ id: 'paid' }], ['node'], {
      dailyBudgetUsd: 5, maxJobCostUsd: { paid: cost },
    }), /maximum job cost/);
  }
  for (const budget of [undefined, null, -1, 6, Infinity, '5']) {
    assert.throws(() => assertScheduledBudget([], [], { dailyBudgetUsd: budget }), /dailyBudgetUsd/);
  }
  assert.equal(assertScheduledBudget([{ id: 'github-hosted-4vcpu' }], ['node'], {
    dailyBudgetUsd: 5, maxJobCostUsd: { 'github-hosted-4vcpu': 0 },
  }), 0);
});


test('external zero-dollar allocation permits the free baseline but no paid route', () => {
  assert.equal(assertScheduledBudget([{ id: 'github-hosted-4vcpu' }], ['node'], {
    dailyBudgetUsd: 0, maxJobCostUsd: { 'github-hosted-4vcpu': 0 },
  }), 0);
  assert.throws(() => assertScheduledBudget([{ id: 'paid' }], ['node'], {
    dailyBudgetUsd: 0, maxJobCostUsd: { paid: 0.01 },
  }), /exceeds/);
});
