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
- `workitem-get <id>`
- `workitems-recent [top]`
- `prs [status] [top] [repo]`
- `pr-get <id> [repo]`
- `pr-create --title=... --source=... --target=... [--description=...] [--repo=...] [--work-items=123,456]`
- `pr-update <id> [--title=...] [--description=...] [--repo=...] [--work-items=123,456]`
- `pr-approve <id> [repo]`
- `pr-autocomplete <id> [repo]`
- `builds [top]`

## Agent skill included

A reusable agent skill is included at:

- `skills/ado-workflows/SKILL.md`

This helps OpenClaw-compatible agents run consistent Azure DevOps workflows using this CLI.

## Security notes

- Never commit your PAT.
- Prefer setting secrets through runtime environment injection.
- `ADO_INSECURE=1` should only be used in trusted internal environments.
