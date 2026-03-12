# @thanaen/ado-cli

Lightweight CLI for Azure DevOps REST workflows (repos, branches, work items, PRs, builds).

## Why this exists

This project provides a tiny scriptable command layer over the Azure DevOps API so automation agents and developers can run common actions quickly.

## Requirements

- Node.js 18+ (runtime for the published npm package)
- An Azure DevOps Personal Access Token (PAT)

For development you also need [Bun](https://bun.sh/) (used for builds, tests, and scripts).

## Configuration

Set environment variables before running commands:

- `DEVOPS_PAT` **(required)**
- `ADO_COLLECTION_URL` (default: `https://dev.azure.com/<your-org>`)
- `ADO_PROJECT` (default: `<your-project>`)
- `ADO_REPO` (default: `<your-repository>`)
- `ADO_INSECURE=1` (optional; only for self-signed TLS environments)

Example:

```bash
export DEVOPS_PAT="***"
export ADO_COLLECTION_URL="https://dev.azure.com/acme"
export ADO_PROJECT="MyProject"
export ADO_REPO="MyRepo"
```

On-prem / localserver example:

```bash
export DEVOPS_PAT="***"
export ADO_COLLECTION_URL="https://localserver/DefaultCollection"
export ADO_PROJECT="ExampleProject"
export ADO_REPO="Example Repository"
export ADO_INSECURE=1
```

## Install

Global install (CLI available as `ado`):

```bash
npm i -g @thanaen/ado-cli
```

## Usage

```bash
ado help
ado smoke
```

## Commands

- `-v`, `--version`
- `init [--local]`
- `config`
- `smoke`
- `repos`
- `branches [repo]`
- `workitem-get <id> [--raw] [--expand=all|fields|links|relations]`
- `workitems-recent [top] [--tag=<tag>] [--type=<work-item-type>] [--state=<state>]`
- `workitem-comments <id> [top] [--top=<n>] [--order=asc|desc]`
- `workitem-comment-add <id> --text="..." [--file=path]`
- `workitem-comment-update <id> <commentId> --text="..." [--file=path]`
- `prs [status] [top] [repo]`
- `pr-get <id> [repo]`
- `pr-create --title=... --source=... --target=... [--description=...] [--repo=...] [--work-items=123,456] [--tags=tag-a,tag-b]`
- `pr-update <id> [--title=...] [--description=...] [--repo=...] [--work-items=123,456] [--tags=tag-a,tag-b]`
- `pr-cherry-pick <id> --target=... [--topic=branch-name] [--repo=...]`
- `pr-approve <id> [repo]`
- `pr-autocomplete <id> [repo]`
- `builds [top]`

Examples:

```bash
# 20 derniers bugs taggés "bot"
ado workitems-recent 20 --type=Bug --tag=bot

# Bugs "bot" encore en état New
ado workitems-recent --type=Bug --tag=bot --state=New

# Mettre à jour un commentaire existant (dédup)
ado workitem-comment-update 20485 12527 --file=./comment.md
```

## npm publication (GitHub Actions)

The repository includes a workflow at `.github/workflows/npm-publish.yml`.

It can publish in two ways:

- automatically when a GitHub Release is published
- manually with **Run workflow** (`workflow_dispatch`)

### Required repository secret

- `NPM_TOKEN`: npm automation token allowed to publish `@thanaen/ado-cli`

### Release prep

- bump `package.json` version before creating the release/tag

### Workflow behavior

Before publishing, the workflow runs:

- `bun run fmt:check`
- `bun run lint`
- `bun run typecheck`
- `bun test`
- `npm pack --dry-run`

Then it publishes with:

```bash
npm publish --access public --provenance
```

## Claude Code plugin included

This repository also ships as a Claude Code plugin and local marketplace.

### What it adds

- a reusable skill at `skills/ado-workflows/SKILL.md`
- a bundled MCP server at `claude-code/ado-mcp.mjs`
- plugin metadata in `.claude-plugin/plugin.json`
- a local marketplace manifest in `.claude-plugin/marketplace.json`

### Local development

Load the plugin directly from a checkout:

```bash
claude --plugin-dir .
```

The bundled MCP server resolves the CLI in this order:

1. `ADO_MCP_COMMAND` / `ADO_MCP_COMMAND_ARGS` override
2. bundled `dist/cli.js` when present
3. `ado` from `PATH`
4. `bun src/cli.ts` as a development fallback

### Install through the bundled marketplace

From Claude Code:

```text
/plugin marketplace add https://github.com/Thanaen/azure-devops-cli.git
/plugin install ado-cli@thanaen-ado-cli
```

### Main bundled MCP tools

- `ado_config_show`
- `ado_smoke`
- `ado_repos_list`
- `ado_branches_list`
- `ado_workitem_get`
- `ado_workitems_recent`
- `ado_workitem_comments_list`
- `ado_workitem_comment_add`
- `ado_workitem_comment_update`
- `ado_pull_requests_list`
- `ado_pull_request_get`
- `ado_pull_request_create`
- `ado_pull_request_update`
- `ado_pull_request_cherry_pick`
- `ado_pull_request_approve`
- `ado_pull_request_autocomplete`
- `ado_builds_list`

This helps AI coding agents run consistent Azure DevOps workflows using the same CLI source of truth.

## Development

### Setup

```bash
bun install          # installs deps + sets up git hooks via lefthook
```

### Scripts

| Script               | Description                                |
| -------------------- | ------------------------------------------ |
| `bun run lint`       | Lint with oxlint (type-aware + type-check) |
| `bun run lint:fix`   | Lint and auto-fix safe issues              |
| `bun run fmt`        | Format all files with oxfmt                |
| `bun run fmt:check`  | Check formatting without writing           |
| `bun test`           | Run tests                                  |
| `bun run typecheck`  | Run tsc type-check (manual, not in hooks)  |
| `bun run build`      | Compile to standalone binary               |
| `bun run build:dist` | Build Node CLI used for npm publication    |
| `bun run prepack`    | Rebuild dist before `npm pack/publish`     |

### Quality gates (git hooks via Lefthook)

**Pre-commit** — runs on staged files, auto-fixes and re-stages:

- `oxfmt` (format)
- `oxlint --type-aware --type-check --fix` (lint + fix)

### Editor

Install the recommended VS Code extension (`oxc.oxc-vscode`) when prompted. Format-on-save and lint fix-on-save are pre-configured in `.vscode/settings.json`.

## Security notes

- Never commit your PAT.
- Prefer setting secrets through runtime environment injection.
- `ADO_INSECURE=1` should only be used in trusted internal environments.

## Troubleshooting

- `400 Bad Request - Invalid URL` at startup usually means one of `ADO_COLLECTION_URL`, `ADO_PROJECT`, or `ADO_REPO` is still using placeholder defaults.
- If strict TLS fails on internal servers, use `ADO_INSECURE=1` only when appropriate for trusted self-signed endpoints.
