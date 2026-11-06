# Methodology

Suite version: see `suite.json`. Scores are only compared within one suite
version. A change to any pin, toolchain or script makes a new one.

Status: stage 1. One route, two workloads, no comparison published.

## Why this exists

- **A public comparison people can check.** Cost against duration for real CI
  work, per runner and size, with every number linked to a public GitHub
  Actions run.
- **A starting guess for placement.** A job that has never run before has no
  history. Benchmark results by workload type can seed a first guess for
  ci-router. Measured runs of a customer's own
  job always win over the benchmark.
- **A standing end-to-end test.** Every pass exercises each route for real.

## Principles

1. **Run in public.** The jobs run in this repository's GitHub Actions, so logs,
   timings and workflow files are visible. A result without a public run link is
   not published.
2. **Reproducible.** Workloads are public projects pinned to exact commits.
   Anyone can fork the repository and run it on their own account.
3. **We rank ourselves too, and say so.** ci-router sells a route that this
   benchmark will rank. The results page states that conflict of interest, and
   benchmark jobs get no special treatment.
4. **Unknown is null, never 0.** A missing price or sample stays missing and is
   left out of a score. It is never counted as free or fast.

## What is public

Workloads, pinned commits and scripts; the workflow files, route list and runner
labels; this methodology and the scoring code; price snapshots; the raw rows and
links to every run. Customer data of any kind is never part of the results, and
customer runs never feed the public results.

## How a run works

```
workflow_dispatch (a schedule may be added later) on the default branch
  -> plan: read routes.json and workloads/, build the matrix
  -> run: one job per route x workload x repeat, permissions: {}
       steps: fingerprint, setup, work, then upload the fingerprint
  -> collect: read GitHub's jobs API and the artifacts,
       append rows to the `results` branch
```

- **Timings come from GitHub's jobs API:** the job's `created_at`, `started_at`
  and `completed_at`, and the start and end of the `setup` and `work` steps.
- **Fingerprint:** a script records CPU model, vCPUs, memory, disk, OS and
  kernel from named sources only (`/proc/cpuinfo`, `/proc/meminfo`, `df`,
  `uname`, `/etc/os-release`). A value it cannot read is `null`. It never prints
  the environment or the process list.
- **Artifacts are untrusted.** The collector parses the fingerprint as JSON,
  keeps only known fields with type and length limits, and never uses its
  content in a path or a shell command. A row's route, workload and repeat come
  from the job name as GitHub reports it, checked against `routes.json` and the
  `workloads/` directory, not from the artifact.

## Routes

A route is one way of getting a runner:
`{ id, provider, runsOn, vcpu, memoryGb, image, enabled }`.

- **GitHub-hosted (the baseline).** Free on public repositories. It uses
  `ubuntu-24.04`, not `-latest`, so an image change is explicit. A standard
  runner has **4 vCPUs and 16 GB on a public repository, but 2 vCPUs and 8 GB on
  a private one**. The baseline is therefore the 4-vCPU size, and other routes
  are compared at 4 vCPUs. Smaller and larger sizes are published as raw numbers
  and are not scored.
- **Providers with their own GitHub Actions integration**, using their own
  labels. This measures what a customer gets from that provider directly. Not in
  stage 1.
- **Router routes.** These come later. A router route can only be started from a
  manual or scheduled run on the default branch: the router refuses to place
  jobs from anything else, including a pull request from a fork. Not in stage 1.

## Workloads

Each workload has a `setup.sh` (toolchain and dependencies) and a `work.sh` (the
part that is compared). No caches, a fresh VM every time, toolchains pinned to
exact versions.

| Workload | Measures | Pin | Stage |
| --- | --- | --- | --- |
| `rust-ripgrep`: release build | all-core compile | ripgrep 15.2.0, commit `e89fff89ac9af12e8d4ce9d5fd07beb408ca730f`, Rust 1.99.1 | 1 |
| `node-typescript`: build and tests | single-thread speed, disk, npm I/O | TypeScript v7.0.2, commit `1e4744d68260a7cb91b62b12edc3f6a2187faaf1`, Node 22.23.4 | 1 |
| Go build and tests | parallel compile and test | to be chosen | later |
| Browser tests | memory, browser dependencies, image contents | to be chosen | later |
| Docker image build | Docker availability, disk I/O | to be chosen | later |

- **ripgrep:** `cargo build --release --locked --offline` after
  `cargo fetch --locked` in setup.
- **TypeScript:** the tag `v7.0.2` points to a commit whose tree is the
  JavaScript code base (its `package.json` says version 6.0.0), so it is a Node
  project. Setup runs `npm ci`. Work runs `hereby local` (build the compiler) and
  `hereby runtests-parallel --light=false --lint=false` (build and run the compiler's own
  test suite). The tests need no browser, no network and no secrets.
- Setup uses the network (the Rust installer, npm, git, a Node tarball checked
  against a pinned SHA-256). That is why it is timed separately and not used
  for speed.

## Metrics

- **Work time:** the `work` step. Used for speed, because setup mostly measures
  the network.
- **Setup time:** published separately. A runner image that already has the
  tools baked in shows its advantage here.
- **Queue time:** the job's `started_at - created_at`. How long a job waits for
  a runner.
- **Cost:** billed minutes for the whole job, at the provider's rounding, times
  the dated price a customer pays. Each price snapshot records its source URL.
  A router route uses the router's published pay-as-you-go price, never the
  provider's list price. In stage 1 the cost column is `null` and nothing is
  scored on cost.
- **Reliability:** the share of attempts that finished (conclusion `success`
  out of `success`, `failure` and `timed_out`; cancelled and skipped jobs are not
  attempts). A workload's failure is not held against a route if it fails on
  every route in the same suite version and data set.

Speed uses only the `work` step, while cost covers the whole job, because
customers pay for the whole job. Both are stated next to the results.

Each published cell gives the sample count, p50, p90 and the coefficient of
variation (standard deviation of the successful samples divided by their mean).
Percentiles interpolate linearly between the closest ranks. p95 is published
only from 40 samples, because at 20 it is just the second-worst run.

## Baselines

- **Public, measured:** the 4-vCPU standard runner. Free, so it has a time but no
  meaningful cost.
- **Private, measured:** the 2-vCPU standard runner most paying customers use,
  run from a private repository with the same workflow at its published price.
  **This is the reference for `Value`.** Its logs cannot be public, so its
  results are labelled as the one exception to principle 1.
- **4-core larger runner:** shown at its list price for reference.

## Scoring

Per workload:

- `time ratio = p50 work time / p50 work time of the same-sized baseline`
- `cost ratio = p50 job cost / p50 job cost of the private 2-vCPU baseline`

Per route, using the geometric mean across the workloads of the suite, so one
long build does not dominate:

- `Speed = 100 / geomean(time ratios)`
- `Value = 100 / geomean(cost ratios)`
- `Score = sqrt(Speed x Value)`

The baseline is 100 and higher is better. The main view stays cost against
duration per workload, highlighting the routes nothing else beats on both.
`Score` is a summary for people who want one number. It counts duration twice on
purpose, since a faster job is also a cheaper one: a route twice as fast at the
same rate scores 200, and one at half the rate scores 141.

Unknown stays unknown:

- A workload with no successful sample, or no baseline sample, gives no ratio,
  so Speed is `null`.
- A missing cost for any workload gives `null` for Value, and so for Score.
- A ratio of zero or less (a price of 0) is not scored, rather than producing an
  infinite Value.

The scoring code is `bench/score.mjs`; its tests show each rule.

## Ranking rules

A route is ranked only if it meets all of these:

- at least 20 attempts per workload, spread across at least 3 days and different
  times of day (reading used by the code: at least 3 distinct UTC days and at
  least 2 of the four 6-hour UTC windows)
- at least 95% reliability (at 20 attempts, that allows exactly one failure)
- a result for every workload in the suite version
- a Score (so a route with no known cost is shown but not ranked)

Otherwise it is shown unranked, with the reason. Equal scores share a rank. A
cell whose coefficient of variation is above 15% is flagged as unstable.

## Safety of the benchmark itself

- Only `workflow_dispatch` starts the workflow today (a schedule may follow). It
  has no `pull_request` trigger, so a fork's pull request cannot add its own run.
- The default branch is protected: no direct pushes, changes need a review.
- Benchmark jobs have no secrets and `permissions: {}`. Only the GitHub-hosted
  `collect` job can write, only on the default branch, and only to the `results`
  branch.
- Actions are pinned by full commit SHA and change only in a reviewed suite
  version. No caches, no third-party actions.
- Scripts avoid printing the environment or the process list. Workloads run
  third-party test suites that we do not control, so this alone is not a
  guarantee that nothing sensitive reaches a public log; that is why the jobs
  carry no secrets.

## Limits to state publicly

- Step timings are reported by the runner software through GitHub. On a
  provider's own runner we do not control that software, and on a router route
  we ship it. Job-level `created_at` and `completed_at` are harder for us to
  influence, so they are published alongside.
- A fingerprint is self-reported by the machine.
- A provider, or we ourselves, could recognise benchmark jobs (the repository
  name is visible when a runner boots) and favour them, for example by keeping a
  host idle. We say we do not, and anyone can reproduce the run on their own
  account.
- Results describe the workloads in the suite. I/O-heavy or cache-heavy jobs
  can behave differently.
- The public hosted runner has more CPU than the private one most paying
  customers get.
- With one route and a few runs, nothing here says anything about the spread of
  results. Stage 1 exists to measure that.

## Stages

1. **Baseline:** this repository, two workloads, GitHub-hosted only. Proves the
   harness and shows how noisy repeated runs are. No comparison is published.
2. Other providers' own labels, once their terms are checked.
3. Router routes, once the router's checks for these runs are in place.
4. The full suite, a schedule and a results page, after each provider's terms
   are checked for restrictions on publishing benchmarks.
