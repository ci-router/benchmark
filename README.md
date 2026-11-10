# CI runner benchmark

An open benchmark of CI runners: the same real build and test jobs, run on
different runners, with the duration, cost and reliability of each one.

## Status

**Bounded external collection.** The GitHub-hosted baseline is the default.
Depot 2-vCPU is enabled only for explicit one-workload, one-repeat pilot dispatches.
Other Depot sizes, Ubicloud, Boat and Tenki remain disabled. A prior successful
same-repository Depot run and the installed native App establish the pilot basis;
the new job still exercises current repository/account admission.

**No comparison published yet.** There are no results on this page and none
should be read into the numbers in a single run. Nothing is ranked.

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

## Conflict of interest

This benchmark is run by the people who build ci-router,
a routing layer that places GitHub Actions jobs on different compute providers.
ci-router sells one of the routes this benchmark will rank, so we have a reason
to want it to look good. Our answers to that:

- Every result links to a public GitHub Actions run, so the logs and timings can
  be read by anyone. A result without a public run link is not published.
- The workloads, pinned commits, scoring code and raw rows are all in this
  repository.
- Benchmark jobs get no special treatment from the router.
- You do not have to trust us: you can run the whole thing yourself (below).

The one planned exception to "every result has a public run" is the private
2-vCPU reference run, described in [METHODOLOGY.md](METHODOLOGY.md).

This repository does not accept outside pull requests. To run the benchmark
yourself, fork it (below).

## What is here

| Path | What it is |
| --- | --- |
| `LICENSE`, `LICENSE-RESULTS` | Apache-2.0 for the code, CC-BY-4.0 for results and raw data |
| `METHODOLOGY.md` | Principles, workloads, metrics, scoring, ranking rules, limits |
| `suite.json` | The suite version and the pinned workloads |
| `suites/<version>.json` | The workload list of earlier suite versions, so their results can still be scored |
| `routes.json` | The routes under test (GitHub default; explicit one-job Depot 2-vCPU pilot enabled) |
| `workloads/<name>/setup.sh`, `work.sh` | Install the toolchain and dependencies, then do the timed work |
| `bench/` | Fingerprint, planning, collection and scoring scripts, and their tests |
| `.github/workflows/benchmark.yml` | The benchmark, manual or scheduled |
| `.github/workflows/archive.yml` | Saves the raw data of an earlier run, started by hand |

## Reproduce it by forking

1. Fork this repository. Keep it public: a public repository's standard
   Ubuntu runner has 4 vCPUs and 16 GB, a private one has 2 vCPUs and 8 GB, and
   the results are only comparable at the same size.
2. In your fork's Actions tab, enable workflows.
3. Run the `benchmark` workflow from the default branch with `workflow_dispatch`.
   The `repeats` input is an integer from 1 to 10 (default 1). The optional `route`
   input selects exactly one enabled route; empty selects only the free GitHub
   baseline. There is no implicit run-all selection. For a paid route, select one
   explicit `workload` and `repeats=1`; `all` is rejected.
4. Each job is named `run <route> <workload> <repeat>`. The `setup` and `work`
   steps are timed by GitHub, and the log shows exactly what ran.
5. When the run is on the default branch, the `collect` job appends one row per
   job to a `results` branch in your fork, under `results/<suite>/`, and saves
   the raw jobs-API response and some logs under `raw/` (see
   [What is saved](METHODOLOGY.md#what-is-saved)). It never pushes to the
   default branch.
6. Score the rows with `node bench/score.mjs --results <dir> --time-baseline 4=github-hosted-4vcpu`.

A private fork needs `contents: read` on the jobs that check out the code. The
workflow sets `permissions: {}` because the public repository does not need it.

To run the checks on your own machine you need Node 22 and no packages:

```
node --test
```

## Safety

The workflow starts from `workflow_dispatch` or the schedule. There is no `pull_request`
trigger, no secrets in the benchmark jobs, no caches and no third-party actions;
the four GitHub-owned actions in use are pinned by full commit SHA. The router
itself refuses to place jobs that did not come from a manual or scheduled run on
the default branch, so a pull request from a fork cannot start paid compute.

## Licence

- The code in this repository (scripts, workflows, workload definitions and
  tests) is licensed under the [Apache License 2.0](LICENSE).
- The results and the raw data on the `results` branch are licensed under
  [Creative Commons Attribution 4.0 International](LICENSE-RESULTS) (CC-BY-4.0).
  Attribute them to "ci-router benchmark".

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
remains part of the external allocation for the explicit manual pilot; it is a
retained allocation, not a refund or an actual invoice. No paid schedule and no
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

## Qualifying another direct provider

A route declaration is preparation, not proof of access or measured performance.
Before enabling a paid route, verify repository-scoped runner access, publication
terms, size/image eligibility, cache settings, and a bounded collection allowance.
Account credits do not replace a spend limit. Include setup, teardown, startup fees,
storage and retry exposure when bounding costs. Selecting a route or limiting
parallel jobs is not a durable budget enforcement mechanism.

The default dispatch selects only `github-hosted-4vcpu`, even after other routes
are enabled. Explicit selection stays subject to the route's `enabled` flag.
Jobs have a 15-minute timeout and at most one matrix job runs at a time.
Only the explicit Depot 2-vCPU pilot is enabled alongside GitHub; other paid routes remain disabled.

Tenki's prepared label and resources come from its
[runner quickstart](https://tenki.cloud/docs/runners/quickstart) and
[Linux runner documentation](https://tenki.cloud/docs/runners/x64-runners), checked
2026-11-09. Sandbox credentials alone do not establish hosted Actions runner access.
Tenki documents automatic caching; record the actual settings rather than describing
all setup work as cold. No provider result is implied by these route declarations.

Tenki's [Terms of Service, section 4.2(iv)](https://tenki.cloud/docs/terms-of-service.md)
and [Acceptable Use Policy, section 3](https://tenki.cloud/docs/acceptable-use-policy.md),
checked 2026-11-09, require prior written consent for publishing benchmark results
and for the competing-service uses described there. Obtain and verify consent covering
the intended benchmark and publication before executing this route. Account setup,
runner access or credits do not establish that consent. The route remains disabled.

Briq and CI Router provider/size/image routes require their own verified execution
contract; no guessed hosted label is declared here. Direct-provider observations do
not qualify routed integrations or substitute for their independent measurements.


## Current external pilot

Only the collection owner dispatches the paid pilot. Reserve $1 within the shared
$2 external / $8 internal daily operational allocation ($10 total), retain uncertain
costs, and allow no second job until the prior run is terminal and its native
runner lifecycle is reconciled. Workflow concurrency serializes runs, but is not
aggregate budget enforcement. The free GitHub baseline is scheduled; no paid
schedule is enabled here and no plan purchase is authorized. Manual reruns need a
new allocation and are not automatic.

First cell: `route=depot-ubuntu-2vcpu`, `workload=node-typescript`, `repeats=1`.
The job has a 15-minute timeout, one matrix cell and no fallback. Depot's published
2-vCPU/8-GB runner rate is $0.006/minute (checked 2026-11-10 at
https://depot.dev/docs/github-actions/runner-types), giving a $0.09 estimate for
15 execution minutes before included minutes, rounding or other account charges.
The timeout is not a mathematical billing cutoff. Record actual setup/work/job
windows and fingerprint from GitHub; execution cost stays null unless known.
This is an external native Depot runner, never an internal CI Router sample.
