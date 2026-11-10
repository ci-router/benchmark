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
| `routes.json` | The routes under test (free baseline enabled; other hosted routes disabled) |
| `workloads/<name>/setup.sh`, `work.sh` | Install the toolchain and dependencies, then do the timed work |
| `bench/` | Fingerprint, planning, collection and scoring scripts, and their tests |
| `.github/workflows/benchmark.yml` | The benchmark, started by hand |
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

The workflow starts only from `workflow_dispatch`. There is no `pull_request`
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

## Qualifying another direct provider

A route declaration is preparation, not proof of access or measured performance.
Before enabling a paid route, verify repository-scoped runner access, publication
terms, size/image eligibility, cache settings, and a bounded collection allowance.
Account credits do not replace a spend limit. Include setup, teardown, startup fees,
storage and retry exposure when bounding costs. Selecting a route or limiting
parallel jobs is not a durable budget enforcement mechanism.

The default dispatch selects only `github-hosted-4vcpu`, even after other routes
are enabled. Explicit selection stays subject to the route's `enabled` flag.
Jobs have a 30-minute timeout and at most two matrix jobs run concurrently.
Paid routes remain disabled until their collection controls are qualified.

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
aggregate budget enforcement. No schedule is enabled here and no plan purchase
is authorized. Manual reruns need a new allocation and are not automatic.

First cell: `route=depot-ubuntu-2vcpu`, `workload=node-typescript`, `repeats=1`.
The job has a 15-minute timeout, one matrix cell and no fallback. Depot's published
2-vCPU/8-GB runner rate is $0.006/minute (checked 2026-11-10 at
https://depot.dev/docs/github-actions/runner-types), giving a $0.09 estimate for
15 execution minutes before included minutes, rounding or other account charges.
The timeout is not a mathematical billing cutoff. Record actual setup/work/job
windows and fingerprint from GitHub; execution cost stays null unless known.
This is an external native Depot runner, never an internal CI Router sample.
