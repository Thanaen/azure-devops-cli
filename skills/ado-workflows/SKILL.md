---
name: ado-workflows
description: Use the local Azure DevOps CLI for day-to-day workflows (work items, PRs, repos, branches, builds). Trigger when a task mentions Azure DevOps REST API actions, PR management, work item lookup, or CI/build validation.
---

# ADO Workflows

Use this repository CLI (`node src/cli.mjs`) instead of ad-hoc curl commands.

## Preflight

1. Verify auth is available:
   - `test -n "$DEVOPS_PAT" && echo OK || echo MISSING`
2. Verify connectivity:
   - `node src/cli.mjs smoke`

If auth is missing, stop and ask for `DEVOPS_PAT`.

## Core commands

- List repos: `node src/cli.mjs repos`
- List branches: `node src/cli.mjs branches "MyRepo"`
- Get work item: `node src/cli.mjs workitem-get <id>`
- List recent work items: `node src/cli.mjs workitems-recent 10`
- List recent work items filtered by tag/type/state: `node src/cli.mjs workitems-recent 20 --type=Bug --tag=bot --state=New`
- List PRs: `node src/cli.mjs prs active 10 "MyRepo"`
- Get PR: `node src/cli.mjs pr-get <id> "MyRepo"`
- Create PR: `node src/cli.mjs pr-create --title="..." --source="feature/x" --target="develop" --description="..." --repo="MyRepo"`
- Approve PR: `node src/cli.mjs pr-approve <id> "MyRepo"`
- Enable auto-complete: `node src/cli.mjs pr-autocomplete <id> "MyRepo"`
- List builds: `node src/cli.mjs builds 10`

## Safety rules

- Never print `DEVOPS_PAT`.
- Prefer CLI commands over direct API calls.
- Use `ADO_INSECURE=1` only when needed for trusted self-signed endpoints.
