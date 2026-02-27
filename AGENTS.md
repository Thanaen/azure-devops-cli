# Agent Guidelines

## Pre-commit checklist

Always run the following scripts before committing:

```sh
bun run test       # ensure tests pass
bun run lint:fix   # detect errors and try to fix them
bun run fmt        # format all files
```
