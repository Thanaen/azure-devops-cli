# @thanaen/ado-cli

Lightweight CLI for Azure DevOps REST workflows (repos, branches, work items, PRs, builds).

## Why this exists

This project provides a tiny scriptable command layer over the Azure DevOps REST API so automation agents and developers can run common actions quickly without rewriting `curl` calls.

## Requirements

- Node.js 18+
- npm
- `curl`
- An Azure DevOps Personal Access Token (PAT)

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
export ADO_PROJECT="UserLock"
export ADO_REPO="Ulysse Interface"
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
- `pr-create --title=... --source=... --target=... [--description=...] [--repo=...] [--work-items=123,456]`
- `pr-update <id> [--title=...] [--description=...] [--repo=...] [--work-items=123,456]`
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

## Agent skill included

A reusable agent skill is included at:

- `skills/ado-workflows/SKILL.md`

This helps OpenClaw-compatible agents run consistent Azure DevOps workflows using this CLI.

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

**Pre-push** — repo-wide checks, blocks push on failure:

- `fmt:check` (formatting)
- `lint` (type-aware + type-check linting)
- `test` (unit tests)

### Editor

Install the recommended VS Code extension (`oxc.oxc-vscode`) when prompted. Format-on-save and lint fix-on-save are pre-configured in `.vscode/settings.json`.

## Security notes

- Never commit your PAT.
- Prefer setting secrets through runtime environment injection.
- `ADO_INSECURE=1` should only be used in trusted internal environments.

## Troubleshooting

- `400 Bad Request - Invalid URL` at startup usually means one of `ADO_COLLECTION_URL`, `ADO_PROJECT`, or `ADO_REPO` is still using placeholder defaults.
- If strict TLS fails on internal servers, validate reachability with `scripts/localserver-reachability.mjs` from the workspace, then use `ADO_INSECURE=1` only when appropriate.
