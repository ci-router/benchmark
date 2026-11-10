// Builds the job matrix for the benchmark workflow. No dependencies.
//
// Reads routes.json and the workloads/ directory, takes the repeat count from
// the REPEATS environment variable and an optional single route id from ROUTE
// (never from the command line or a shell string), and writes `matrix=<json>` to $GITHUB_OUTPUT (or stdout).
//
// Scheduled runs are separate: they read schedule.json, which enrolls only the
// free public GitHub baseline. Manual dispatch keeps its explicit route/workload
// selection and is never widened by the schedule.
import { appendFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ID_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
export const FREE_BASELINE_ROUTE = 'github-hosted-4vcpu';

export function parseRepeats(value) {
  if (typeof value !== 'string' || !/^[0-9]{1,2}$/.test(value)) {
    throw new Error('repeats must be an integer from 1 to 10');
  }
  const n = Number.parseInt(value, 10);
  if (n < 1 || n > 10) throw new Error('repeats must be an integer from 1 to 10');
  return n;
}

export function readRoutes(path) {
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  if (!parsed || !Array.isArray(parsed.routes)) throw new Error('routes.json: "routes" must be an array');
  const seen = new Set();
  return parsed.routes.map((r) => {
    if (!r || typeof r !== 'object') throw new Error('routes.json: a route must be an object');
    if (typeof r.id !== 'string' || !ID_RE.test(r.id)) throw new Error(`routes.json: bad route id ${JSON.stringify(r.id)}`);
    if (seen.has(r.id)) throw new Error(`routes.json: duplicate route id ${r.id}`);
    seen.add(r.id);
    for (const key of ['provider', 'runsOn', 'image']) {
      if (typeof r[key] !== 'string' || !/^[A-Za-z0-9._-]{1,64}$/.test(r[key])) {
        throw new Error(`routes.json: route ${r.id} has a bad ${key}`);
      }
    }
    for (const key of ['vcpu', 'memoryGb']) {
      if (!Number.isInteger(r[key]) || r[key] < 1) throw new Error(`routes.json: route ${r.id} has a bad ${key}`);
    }
    if (typeof r.enabled !== 'boolean') throw new Error(`routes.json: route ${r.id} has a bad enabled`);
    return {
      id: r.id,
      provider: r.provider,
      runsOn: r.runsOn,
      vcpu: r.vcpu,
      memoryGb: r.memoryGb,
      image: r.image,
      enabled: r.enabled,
    };
  });
}

/** Pin the billing-sensitive runner label and reviewed baseline sample shape. */
function assertFreeBaselineRoute(route) {
  if (route.provider !== 'github' || route.id !== FREE_BASELINE_ROUTE ||
      route.runsOn !== 'ubuntu-24.04' || route.image !== 'ubuntu-24.04' ||
      route.vcpu !== 4 || route.memoryGb !== 16) {
    throw new Error(`schedule.json: ${route.id} is not the reviewed free public GitHub baseline`);
  }
}

/** Scheduled sampling is explicit: enabling a route for dispatch does not enroll it. */
export function scheduledRoutes(routes, config) {
  if (!config || config.program !== 'external') {
    throw new Error('schedule.json: program must be "external"');
  }
  if (!Array.isArray(config.routes) || config.routes.length === 0 ||
      config.repeats !== 1 || new Set(config.routes).size !== config.routes.length) {
    throw new Error('schedule.json: unique route ids and exactly one repeat are required');
  }
  return config.routes.map((id) => {
    if (typeof id !== 'string' || !ID_RE.test(id)) throw new Error('schedule.json: invalid route id');
    const route = routes.find((r) => r.id === id);
    if (!route?.enabled) throw new Error(`schedule.json: unknown or disabled route ${id}`);
    assertFreeBaselineRoute(route);
    return route;
  });
}

/** The schedule pins the reviewed workload set; a new workload cannot enroll silently. */
export function scheduledWorkloads(available, config) {
  if (!Array.isArray(config.workloads) || config.workloads.length === 0 ||
      new Set(config.workloads).size !== config.workloads.length) {
    throw new Error('schedule.json: unique workload ids are required');
  }
  for (const id of config.workloads) {
    if (typeof id !== 'string' || !ID_RE.test(id) || !available.includes(id)) {
      throw new Error(`schedule.json: unknown workload ${JSON.stringify(id)}`);
    }
  }
  const reviewed = [...config.workloads].sort();
  if (reviewed.length !== available.length || reviewed.some((id, i) => id !== available[i])) {
    throw new Error('schedule.json: workloads must match the reviewed workload set');
  }
  return config.workloads;
}

/** A suite change must be reviewed with the schedule rather than applied silently. */
export function assertScheduledSuite(config, suite) {
  if (typeof suite !== 'string' || config.suite !== suite) {
    throw new Error('schedule.json: suite must match suite.json');
  }
}

/**
 * The external schedule is free-only. This is an admission check, not a billing
 * limiter: it rejects any paid route or nonzero execution charge instead of
 * pretending to enforce a budget.
 */
export function assertScheduledFreeBaseline(routes, workloads, config) {
  if (config.dailyBudgetUsd !== 0) {
    throw new Error('schedule.json: the external schedule must be free ($0/day)');
  }
  if (workloads.length === 0) throw new Error('schedule.json: at least one workload is required');
  const costIds = Object.keys(config.maxJobCostUsd ?? {});
  if (costIds.length !== routes.length || costIds.some((id) => !routes.some((r) => r.id === id))) {
    throw new Error('schedule.json: maxJobCostUsd must list exactly the scheduled routes');
  }
  for (const route of routes) {
    assertFreeBaselineRoute(route);
    if (config.maxJobCostUsd?.[route.id] !== 0) {
      throw new Error(`schedule.json: ${route.id} must have a verified $0 execution charge`);
    }
  }
  return 0;
}

/** Names of the directories under workloads/ that are valid workload ids. */
export function listWorkloads(dir) {
  return readdirSync(dir)
    .filter((name) => ID_RE.test(name) && statSync(join(dir, name)).isDirectory())
    .sort();
}

/** Default to the free baseline. Every other route must be selected explicitly. */
export function selectRoutes(routes, only) {
  if (only === undefined || only === '') only = FREE_BASELINE_ROUTE;
  if (typeof only !== 'string' || !ID_RE.test(only)) throw new Error('route must be a route id');
  const route = routes.find((r) => r.id === only);
  if (!route) throw new Error(`route ${only} is not in routes.json`);
  if (!route.enabled) throw new Error(`route ${only} is disabled`);
  return [route];
}

export function selectWorkloads(routes, available, requested = 'all', repeats = 1) {
  const paid = routes.some(r => r.provider !== 'github');
  if (paid && repeats !== 1) throw new Error('paid pilot requires exactly one repetition');
  if (requested === 'all') {
    if (paid) throw new Error('paid pilot requires one explicit workload');
    return available;
  }
  if (typeof requested !== 'string' || !ID_RE.test(requested) || !available.includes(requested)) {
    throw new Error('workload must be an available workload id');
  }
  return [requested];
}

export function buildMatrix(routes, workloads, repeats) {
  const include = [];
  for (const route of routes.filter((r) => r.enabled)) {
    for (const workload of workloads) {
      for (let rep = 1; rep <= repeats; rep++) include.push({ route, workload, rep });
    }
  }
  return { include };
}

function main() {
  const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
  const routes = readRoutes(join(root, 'routes.json'));
  const available = listWorkloads(join(root, 'workloads'));
  const scheduled = process.env.BENCHMARK_EVENT === 'schedule';
  let selected;
  let workloads;
  let repeats;
  if (scheduled) {
    const config = JSON.parse(readFileSync(join(root, 'schedule.json'), 'utf8'));
    const suite = JSON.parse(readFileSync(join(root, 'suite.json'), 'utf8'));
    assertScheduledSuite(config, suite.suite);
    selected = scheduledRoutes(routes, config);
    workloads = scheduledWorkloads(available, config);
    repeats = config.repeats;
    assertScheduledFreeBaseline(selected, workloads, config);
  } else {
    repeats = parseRepeats(process.env.REPEATS ?? '1');
    selected = selectRoutes(routes, process.env.ROUTE ?? '');
    workloads = selectWorkloads(selected, available, process.env.WORKLOAD ?? 'all', repeats);
  }
  const matrix = buildMatrix(selected, workloads, repeats);
  if (matrix.include.length === 0) throw new Error('the matrix is empty: no enabled route or no workload');
  const line = `matrix=${JSON.stringify(matrix)}\n`;
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, line);
  else process.stdout.write(line);
  console.error(`plan: ${matrix.include.length} jobs`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (err) {
    console.error(`plan: ${err.message}`);
    process.exit(1);
  }
}
