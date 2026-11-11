# Inside CI Router rows

Each file under `internal/<suite>/` holds a row for a job that CI Router placed on a provider VM,
not for a provider's own hosted runner. These are separate routes (`ci-router-<provider>-<size>`)
and are never mixed with the direct-provider routes under `results/`.

The jobs run in the private `ci-router/benchmark-internal` repository, so `runUrl` is null and
`runRef.evidence` is `redacted-run`. A row is built from that run's GitHub step timestamps and its
fingerprint artifact. `routerBootSeconds` comes from the router's own record. `costUsd` is CI
Router's public list price times billable seconds, never a negotiated provider cost.
`cleanup` says which component removed the VM: `self-shutdown` or `reaper`. Router, provider and team
identifiers, raw jobs API responses and logs are not published. The rules from `results/` still
apply: the branch is append-only, and a correction goes in a new file.
