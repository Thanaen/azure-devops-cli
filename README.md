# azure-devops-cli

Tiny Bun/Node-compatible CLI to query Azure DevOps REST API.

## Env vars

- `DEVOPS_PAT` (required)
- `ADO_COLLECTION_URL` (default: `https://devserver2/DefaultCollection`)
- `ADO_PROJECT` (default: `UserLock`)
- `ADO_REPO` (default: `Ulysse Interface`)

## Usage

### Bun (preferred)

```bash
bun src/cli.mjs smoke
```

### Node

```bash
node src/cli.mjs smoke
```

This smoke command reads:
- latest work item
- latest pull request

It prints only summary fields (id/title).
