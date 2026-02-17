# azure-devops-cli

Tiny Bun-first CLI for Azure DevOps REST API.

## Required env

- `DEVOPS_PAT` (required)

## Optional env

- `ADO_COLLECTION_URL` (default: `https://devserver2/DefaultCollection`)
- `ADO_PROJECT` (default: `UserLock`)
- `ADO_REPO` (default: `Ulysse Interface`)

## Usage

```bash
bun src/cli.mjs help
bun src/cli.mjs smoke
```

## Commands

- `smoke`
- `repos`
- `branches [repo]`
- `workitem-get <id>`
- `workitems-recent [top]`
- `prs [status] [top] [repo]`
- `pr-get <id> [repo]`
- `pr-create --title=... --source=... --target=... [--description=...] [--repo=...]`
- `pr-approve <id> [repo]`
- `pr-autocomplete <id> [repo]`
- `builds [top]`

## Exposed command

A wrapper is installed at `~/.local/bin/ado` so I can call it quickly from anywhere:

```bash
ado smoke
ado prs active 5
```
