---
name: ado-workflows
description: Use the local Azure DevOps CLI for day-to-day workflows (work items, PRs, repos, branches, builds). Trigger when a task mentions Azure DevOps REST API actions, PR management, work item lookup, or CI/build validation.
---

# ADO Workflows

Use the `ado` CLI instead of ad-hoc curl commands.

## Preflight

Run `ado status` before any other command. It checks token, configuration, and connectivity in one step.
If it reports an issue, guide the user to set the required environment variables (`ADO_PAT`, `ADO_COLLECTION_URL`, `ADO_PROJECT`, `ADO_REPO`).
Do **not** suggest `ado init` — it requires an interactive terminal and cannot run in this context.

## Core commands

- Show resolved config: `ado config`
- List repos: `ado repos` (or `ado repos --json` for structured output)
- List branches: `ado branches "MyRepo"` (or `--json`)
- Get work item: `ado workitem-get <id>`
- Get full raw work item payload: `ado workitem-get <id> --raw --expand=all`
- List recent work items: `ado workitems-recent 10` (or `--json`)
- List recent work items filtered by tag/type/state: `ado workitems-recent 20 --type=Bug --tag=bot --state=New`
- List comments on a work item: `ado workitem-comments <id> --top=100 --order=desc`
- Add a comment on a work item: `ado workitem-comment-add <id> --text="..."`
- Update an existing comment on a work item: `ado workitem-comment-update <id> <commentId> --text="..."`
- List PRs: `ado prs active 10 "MyRepo"` (or `--json`)
- Get PR: `ado pr-get <id> "MyRepo"`
- Create PR: `ado pr-create --title="..." --source="feature/x" --target="develop" --description="..." --repo="MyRepo" --work-items=123,456 --tags=backend,release-1`
- Update PR: `ado pr-update <id> --title="..." --description="..." --repo="MyRepo" --work-items=123,456 --tags=backend,release-1`
- Cherry-pick PR onto another branch: `ado pr-cherry-pick <id> --target="main" --topic="cherry-pick-branch" --repo="MyRepo"`
- Approve PR: `ado pr-approve <id> "MyRepo"`
- Enable auto-complete: `ado pr-autocomplete <id> "MyRepo"`
- List builds: `ado builds 10` (or `--json`)

## Structured output

Add `--json` to listing commands (`repos`, `branches`, `prs`, `builds`, `workitems-recent`) to get JSON arrays instead of tab-delimited text. Commands like `workitem-get`, `pr-get`, `workitem-comments`, and `config` already output JSON by default.

## Safety rules

- Never print `ADO_PAT` or `DEVOPS_PAT`.
- Prefer CLI commands over direct API calls.
- Use `ADO_INSECURE=1` only when needed for trusted self-signed endpoints.
