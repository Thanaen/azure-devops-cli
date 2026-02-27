# ROADMAP

## Operating mode

- Treat this CLI as a continuously improved internal project.
- Do not ask for approval for low-risk improvements (new read/list commands, better errors, output modes, safer defaults, docs, tests).
- Batch improvements and ship in small commits.
- Ask only for potentially disruptive changes (breaking command syntax, auth model changes, destructive actions).

## Done

1. **Client layer migration**
   - Migrated from raw `curl` calls to `azure-devops-node-api` (typed clients, auth handling, retries).

2. **Work item search helpers**
   - `workitems-recent` with `--tag`, `--type`, `--state` filters via WIQL.

3. **PR workflow helpers (partial)**
   - `pr-create` with `--work-items` auto-links work items via artifact URLs.
   - `pr-update` can update metadata and link work items in one call.
   - `pr-autocomplete` with intelligent optional-policy detection.
   - `pr-cherry-pick` cherry-picks a PR onto a target branch with optional custom topic branch name.

4. **Validation + tests (partial)**
   - Unit tests for command parsing (`workitems-query`), PR helpers (`pr-workitems`), and package config (10 test cases).

## Next improvements

1. **Config profiles**
   - Support `ado profile use <name>`
   - Persist URL/project/repo per profile in local config

2. **Safer TLS by default**
   - Support optional custom CA via `ADO_CA_CERT`
   - Keep `ADO_INSECURE=1` only via explicit env

3. **Better output modes**
   - `--json` flag for commands that currently output tab-separated text (`repos`, `branches`, `prs`, `builds`, `workitems-recent`)
   - Compact table output

4. **PR workflow helpers (remaining)**
   - Auto-detect current git branch for `pr-create --source`
   - `workitems-query --wiql=...` for arbitrary WIQL

5. **Validation + tests (remaining)**
   - Contract smoke tests against a dedicated integration environment
   - Expand unit test coverage to remaining commands
