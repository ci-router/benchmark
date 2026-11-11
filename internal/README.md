# Inside CI Router rows

Each file under `internal/<suite>/` holds a row for a job that CI Router placed on a provider VM,
not for a provider's own hosted runner. These are separate routes (`ci-router-<provider>-<size>`)
and are never mixed with the direct-provider routes under `results/`.

The jobs run in the private `ci-router/benchmark-internal` repository, so `runUrl` is null and
`runRef.evidence` is `redacted-run`. A row is built from that run's GitHub step timestamps and its
fingerprint artifact. `routerBootSeconds` comes from the router's own record, and is `null` when no boot record was retrieved. `costUsd` is CI
Router's public list price times billable seconds, never a negotiated provider cost.
`cleanup` says how the VM was removed: `self-shutdown` (in-guest poweroff with its own proof), `reaper`
(the control plane destroyed it after self-teardown failed), `destroyed` (the provider confirmed
it destroyed, no reaper action, no separate in-guest proof), or `absent` (an authenticated read of
the VM in its original scope returned not-found; who removed it is not claimed). Router, provider and team
identifiers, raw jobs API responses and logs are not published. The rules from `results/` still
apply: the branch is append-only, and a correction goes in a new file.
