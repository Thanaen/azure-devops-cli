---
name: ado-workflows
description: Use the local Azure DevOps CLI for day-to-day workflows (work items, PRs, repos, branches, builds). Trigger when a task mentions Azure DevOps REST API actions, PR management, work item lookup, or CI/build validation.
---

# ADO Workflows

Use the `ado` CLI instead of ad-hoc curl commands.

## Preflight

1. Verify auth is available:
   - `test -n "$DEVOPS_PAT" && echo OK || echo MISSING`
2. Verify connectivity:
   - `ado smoke`
   - If needed, run an independent host check (outside the CLI) to distinguish network issues from ADO config issues.

If auth is missing, stop and ask for `DEVOPS_PAT`.

## Core commands

- List repos: `ado repos`
- List branches: `ado branches "MyRepo"`
- Get work item: `ado workitem-get <id>`
- Get full raw work item payload: `ado workitem-get <id> --raw --expand=all`
- List recent work items: `ado workitems-recent 10`
- List recent work items filtered by tag/type/state: `ado workitems-recent 20 --type=Bug --tag=bot --state=New`
- List comments on a work item: `ado workitem-comments <id> --top=100 --order=desc`
- Add a comment on a work item: `ado workitem-comment-add <id> --text="..."`
- Update an existing comment on a work item: `ado workitem-comment-update <id> <commentId> --text="..."`
- List PRs: `ado prs active 10 "MyRepo"`
- Get PR: `ado pr-get <id> "MyRepo"`
- Create PR: `ado pr-create --title="..." --source="feature/x" --target="develop" --description="..." --repo="MyRepo" --work-items=123,456`
- Update PR: `ado pr-update <id> --title="..." --description="..." --repo="MyRepo" --work-items=123,456`
- Approve PR: `ado pr-approve <id> "MyRepo"`
- Enable auto-complete: `ado pr-autocomplete <id> "MyRepo"`
- List builds: `ado builds 10`

## Safety rules

- Never print `DEVOPS_PAT`.
- Prefer CLI commands over direct API calls.
- Use `ADO_INSECURE=1` only when needed for trusted self-signed endpoints.
