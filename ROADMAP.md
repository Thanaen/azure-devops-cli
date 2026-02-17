# ROADMAP

## Operating mode

- Treat this CLI as a continuously improved internal project.
- Do not ask for approval for low-risk improvements (new read/list commands, better errors, output modes, safer defaults, docs, tests).
- Batch improvements and ship in small commits.
- Ask only for potentially disruptive changes (breaking command syntax, auth model changes, destructive actions).

## Next improvements

1. **Config profiles**
   - Support `ado profile use <name>`
   - Persist URL/project/repo per profile in local config

2. **Safer TLS by default**
   - Replace `--insecure` with optional custom CA (`ADO_CA_CERT`)
   - Keep `--insecure` only via explicit flag/env

3. **Work item search helpers**
   - `workitems-query --wiql=...`
   - `workitems-open` shortcuts

4. **PR workflow helpers**
   - `pr-create` from current git branch
   - Auto-link work items in PR description

5. **Better output modes**
   - `--json` for all commands
   - compact table output

6. **Validation + tests**
   - Unit tests for command parsing and request builder
   - Contract smoke tests against devserver2
