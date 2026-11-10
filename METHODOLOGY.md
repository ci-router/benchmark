# Methodology

Suite version: see `suite.json`. Scores are only compared within one suite
version. A change to any pin, toolchain or script makes a new one.

Status: GitHub baseline collection plus a bounded native Depot 2-vCPU pilot.
Two workloads are available; each paid pilot dispatch selects exactly one.

## Why this exists

- **A public comparison people can check.** Cost against duration for real CI
  work, per runner and size, with every number linked to a public GitHub
  Actions run.
- **A starting guess for placement.** A job that has never run before has no
  history. Internal benchmark results by workload type can seed a first guess for
  ci-router; external market references cannot. Measured runs of a customer's own
  job always win over the benchmark.
- **A standing end-to-end test.** Every pass exercises each route for real.

## External and internal benchmarks

These are two separate benchmark programs with different purposes. They may use
identical pinned workloads, but their results are not directly comparable and
must not be pooled into one ranking or statistical population.

- **External benchmarks** run on providers' own CI runner products. They provide
  market reference points, including providers such as Blacksmith that are not
  available as compute backends for ci-router. Their timings include that
  product's runner image, provisioning, caching and service configuration. They
  do not qualify a ci-router route and do not feed its placement scores or
  starting estimates. The current GitHub-hosted baseline belongs here.
- **Internal benchmarks** run through ci-router against an explicitly selected
  provider, size and image in its routing matrix. They compare and qualify those
  routes, including provisioning, reliability, workload performance and resource
  telemetry. Only eligible internal measurements can inform route qualification
  and future routing starting estimates; the customer's own job history takes
  precedence. Internal collection and routing ingestion are not implemented by
  the recurring external sampling change.

An external product and an internal backend from the same vendor are different
routes. Shared workloads enable consistent experiments within each program;
they do not remove differences in the execution path. A provider may participate
in either program or both. Blacksmith can therefore appear in external market
comparisons without an internal routing-matrix entry. Conversely, sandbox-only
providers such as agents37 belong in internal benchmarks through ci-router and
have no external hosted-CI product to benchmark. Neither program requires a
provider to participate in the other.

Keep program identity in future route/result contracts and separate statistical
aggregation, ranking and ingestion. Before collecting internal samples alongside
external ones, implement that separation in the collector and scorer. Today's
schema and scorer contain external samples only; this document does not claim
that mixed-program collection is already supported.

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

## What is saved

GitHub deletes run logs after 90 days and artifacts after at most 90 days, and a
row keeps only a few fields of what the jobs API returns. Everything below is
also copied to the `results` branch.

| What | Where | How long |
| --- | --- | --- |
| One row per job: timings, conclusion, fingerprint, `headSha`, `jobId` | `results/<suite>/<runId>-<attempt>.jsonl` | Permanent |
| The complete jobs-API response for the run attempt, every job and field | `raw/<runId>-<attempt>/jobs.json` | Permanent |
| The log of each job on a route marked `"archiveLogs": true` in `routes.json`, gzipped | `raw/<runId>-<attempt>/logs/<jobId>.log.gz` | Permanent |
| For every `run ...` job, whether its log was saved or why not (`route-not-enabled`, `missing`, `too-large`, `secret-shaped`) | `raw/<runId>-<attempt>/manifest.json` | Permanent |
| The fingerprint artifact | The Actions run | 90 days, then only the row remains |
| The original run page and its logs | GitHub | 90 days for logs |

- **The branch is permanent.** It is append-only: a file that is already on it
  is never overwritten, and a reviewed correction is a new file, not an edit.
  Treat anything saved there as public forever.
- **Logs are archived only for routes marked `archiveLogs`.** The default is
  not to archive, so a route added later gets no log saved until a reviewed
  change to `routes.json` says its logs are safe. Only the GitHub-hosted
  baseline is marked today.
- **A log is never saved if it looks like it holds a credential** (a GitHub
  token, or an HTTP basic authorization header), if it is over 50 MB, or if
  GitHub no longer has it. The manifest says which.
- **A run that was not archived at the time** can be saved later with the
  `archive` workflow (manual, default branch only), while GitHub still has its
  logs. It refuses any run that is not this repository's benchmark workflow on
  `main`, started by a dispatch or a schedule.
- **`jobs.json` is taken while the `collect` job is still running**, so that job
  shows as in progress in it.
- A change to the collector or the archive does not change what is measured, so
  it does not start a new suite version.

## How a run works

```
workflow_dispatch / schedule on the default branch
  -> plan: read routes.json and workloads/, build the matrix
  -> run: one job per route x workload x repeat, permissions: {}
       steps: fingerprint, setup, work, then upload the fingerprint
  -> collect: read GitHub's jobs API and the artifacts,
       append rows and raw copies to the `results` branch
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
  labels. This measures what a customer gets from that provider directly. The
  bounded Depot 2-vCPU and Boat default (4-vCPU) pilots are the currently enabled native integrations. `ubicloud-hosted-4vcpu` (label `ubicloud-standard-4-ubuntu-2404`) is
  declared in `routes.json` with `"enabled": false`: it is Ubicloud's own hosted
  runner, and it stays out of the dispatch matrix until the Ubicloud GitHub App
  is installed on the organization. Its `settings` object (`premiumCpu`,
  `transparentCache`) is where those two Ubicloud options are recorded before
  the route is enabled; `null` means not recorded. Both may change speed, so a
  result must be read together with them.
  `depot-ubuntu-2vcpu` (label `depot-ubuntu-24.04`, 2 vCPU, 8 GB) is Depot's
  own hosted runner. Its App was installed on 2026-11-08; the 2026-11-10
  pilot enables only this size with one explicit workload and repetition. At 2 vCPUs it is published as raw numbers and not scored, and its
  job logs are not archived (`archiveLogs` is only set on the GitHub-hosted
  baseline). A dispatch selects it with `route=depot-ubuntu-2vcpu` and an explicit `workload`.
  `boat-4vcpu` (label `boat`, 4 vCPU, 8 GB) and `boat-2vcpu` (label
  `boat-small`, 2 vCPU, 4 GB) are prepared Boat CI runner routes. The Boat
  GitHub App was installed on 2026-11-08. A `boat-2vcpu` job (run 42802720019)
  was refused for the $20/month plan; the owner started the plan on 2026-11-10.
  Only `boat-4vcpu` is now enabled, for two explicit jobs: one Node canary, then
  one Rust. The canary diagnoses repository/account/plan/public-job admission; a
  refusal is not a measurement. No subscription change is made by this suite. Boat runs each job in a fresh sandbox
  on shared vCPUs and does not promise a CPU model, so the CPU model each job
  reports matters more than usual when reading its numbers. `boat-4vcpu` is at
  the reference size; `boat-2vcpu` is published as raw numbers and not scored.
  Neither archives job logs.
- **Router routes.** These come later. A router route can only be started from a
  manual or scheduled run on the default branch: the router refuses to place
  jobs from anything else, including a pull request from a fork. Not in stage 1.

## Workloads

Each workload has a `setup.sh` (toolchain and dependencies) and a `work.sh` (the
part that is compared). No caches, a fresh VM every time, toolchains pinned to
exact versions.

| Workload | Measures | Pin | Stage |
| --- | --- | --- | --- |
| `rust-analyzer`: release build | all-core compile | rust-analyzer tag `2026-11-02`, commit `b98172d80f0da12bbde3d6733c274e17cb6417aa`, Rust 1.98.0 | 1 |
| `node-typescript`: build and tests | single-thread speed, disk, npm I/O | TypeScript v7.0.2, commit `1e4744d68260a7cb91b62b12edc3f6a2187faaf1`, Node 22.23.4 | 1 |
| Go build and tests | parallel compile and test | to be chosen | later |
| Browser tests | memory, browser dependencies, image contents | to be chosen | later |
| Docker image build | Docker availability, disk I/O | to be chosen | later |

- **rust-analyzer:** `cargo build --release --locked --offline --bin rust-analyzer`
  after `cargo fetch --locked` in setup. It is pure Rust, needs only a C linker,
  and compiles for minutes rather than seconds, so the 1-second step timings are
  a small share of the measured time. Rust 1.98.0 is the `rust-version` the
  pinned tag declares, pinned to that exact release.
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

**One route spans several CPU models.** A provider's pool of hosts is rarely
uniform, and the same route label can land on different processors from one run
to the next. The coefficient of variation of a cell is therefore partly hardware
mix and not only run-to-run noise on one machine. To make this visible, each
cell also carries `byCpu`: for every `fingerprint.cpuModel` seen among the
finished attempts, the sample count, p50, p90, mean and coefficient of
variation of the work time. A run whose fingerprint has no CPU model is grouped
as `cpuModel: null`; it is never dropped and never read as 0. `byCpu` is
published for reading only: `Speed`, `Value`, `Score`, the ranking rules and the
unstable flag still use the whole cell, so the route is judged on what a
customer would get, not on the best processor it sometimes has.

## Suite versions

The suite version is in `suite.json`, and every row records the version it was
run under. Results are scored per version and never mixed.

- **0.2.0** replaces the `rust-ripgrep` workload (a build of 18 to 29 seconds,
  too short to measure with 1-second step timings) with `rust-analyzer`.
- **0.1.0** rows under `results/0.1.0` keep their meaning: they were run with
  `rust-ripgrep`, and `suites/0.1.0.json` keeps that suite's workload list so
  that `node bench/score.mjs --suite 0.1.0` still scores them as before.

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

- Only `workflow_dispatch` and the schedule start the workflow. It
  has no `pull_request` trigger, so a fork's pull request cannot add its own run.
- The default branch is protected: no direct pushes, changes need a review.
- Benchmark jobs have no secrets and `permissions: {}`. Only the GitHub-hosted
  `collect` job (and the manual `archive` workflow, which checks the run it is
  given) can write, only on the default branch, and only to the `results`
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
- With few runs per route, conclusions about the spread of results remain limited.
  Repeated observations are retained to show that variation.

## Stages

1. **Baseline:** GitHub-hosted measurements established the two-workload harness
   and recorded repeated-run variation.
2. **Native provider pilots (current):** Depot 2-vCPU and Boat 4-vCPU pilots are enabled
   for explicit one-workload, one-repeat jobs. Other native routes remain disabled.
3. Router routes, once the router's checks for these runs are in place.
4. The full suite, a schedule and a results page, after each provider's terms
   are checked for restrictions on publishing benchmarks.

## Recurring samples

The free public GitHub baseline is sampled every six hours, at 00:23, 06:23,
12:23 and 18:23 UTC. GitHub may delay or skip scheduled workflows, and the
workflow's global concurrency group can drop a pending pass when a newer one
queues; these times are sampling targets, not availability guarantees. The
schedule is enabled for this public repository on `main`; forks do not run it.
Manual dispatch remains available.

`schedule.json` is an explicit external-program enrollment: `program` is
`external`, `suite` is `0.2.0`, the routes are exactly the public
`github-hosted-4vcpu` baseline, the workloads are exactly `node-typescript` and
`rust-analyzer`, and there is exactly one repeat. The schedule assumes the
public repository's standard GitHub-hosted runner has no execution charge
(`$0/day`). Adding or enabling an unrelated route does not enroll it or stop
baseline planning. Changes to the workload set or the enrolled baseline's runner
label, image or size fail closed until reviewed. The baseline is pinned to
`ubuntu-24.04`, 4 vCPUs and 16 GB; paid routes are rejected by the schedule entirely.

The owner-approved operational allocation is $10/day combined ($2 external /
$8 internal). This external schedule reserves $0/day. The $1 Depot allocation
remains retained and the remaining $1 external headroom is reserved for one Boat
small pilot. Together these consume the $2 external allocation; they are
operational holds, not refunds or actual invoices. No paid schedule and no
paid retry are authorized by this change. Scheduled reruns are skipped; a
replacement sample needs a fresh explicit allocation and is not automatic.

The workflow runs at most one matrix job at a time with a 15-minute timeout and
serializes benchmark workflows without cancelling running samples. It keeps the
existing immutable raw results and collector. At four successful passes per day
a workload reaches 20 samples in five days and 40 in ten; missing, skipped and
failed runs can extend that. Existing scoring thresholds still apply. Scheduling
does not establish comparative performance, adequate coverage or routing
integration.

External hosted runner results describe their CI product and settings. Only
qualified internal ci-router samples can inform future routing starting estimates.
Customer job history remains private and takes precedence over those estimates.
