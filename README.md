# azure-devops-cli

Lightweight CLI for Azure DevOps REST workflows (repos, branches, work items, PRs, builds).

## Why this exists

This project provides a tiny scriptable command layer over the Azure DevOps REST API so automation agents and developers can run common actions quickly without rewriting `curl` calls.

## Requirements

- Node.js 18+ (or Bun)
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

On-prem / devserver2 example:

```bash
export DEVOPS_PAT="***"
export ADO_COLLECTION_URL="https://devserver2/DefaultCollection"
export ADO_PROJECT="UserLock"
export ADO_REPO="Ulysse Interface"
export ADO_INSECURE=1
```

## Usage

```bash
node src/cli.mjs help
node src/cli.mjs smoke
```

(or with Bun)

```bash
bun src/cli.mjs help
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

## Agent skill included

A reusable agent skill is included at:

- `skills/ado-workflows/SKILL.md`

This helps OpenClaw-compatible agents run consistent Azure DevOps workflows using this CLI.

## Security notes

- Never commit your PAT.
- Prefer setting secrets through runtime environment injection.
- `ADO_INSECURE=1` should only be used in trusted internal environments.

## Troubleshooting

- `400 Bad Request - Invalid URL` at startup usually means one of `ADO_COLLECTION_URL`, `ADO_PROJECT`, or `ADO_REPO` is still using placeholder defaults.
- If strict TLS fails on internal servers, validate reachability with `scripts/devserver2-reachability.mjs` from the workspace, then use `ADO_INSECURE=1` only when appropriate.
