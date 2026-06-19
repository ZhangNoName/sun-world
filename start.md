# Start

This file explains how to start Sun World for local development.

## Quick Start

### VSCode

Use VSCode tasks so the terminals stay inside the VSCode Terminal panel:

1. Open the Command Palette.
2. Run `Tasks: Run Task`.
3. Choose one task:
   - `Sun World: Dev All` starts API and web together.
   - `Sun World: Dev API` starts only the Python API.
   - `Sun World: Dev Web` starts only the web client.

The task definitions live in `.vscode/tasks.json`.

### Windows

From the repository root:

```powershell
.\dev.ps1
.\dev.ps1 py
.\dev.ps1 client
```

`.\dev.ps1` starts API and web together. `py` or `api` starts only the Python
API. `client` or `web` starts only the frontend.

### macOS Or Linux

From the repository root:

```bash
pnpm dev:local
pnpm dev:local py
pnpm dev:local client
sh dev.sh
sh dev.sh py
sh dev.sh client
```

On macOS, these commands open Terminal.app windows. On Linux, the launcher tries
common terminal programs such as `gnome-terminal`, `konsole`, and
`xfce4-terminal`.

## Modes

All launchers accept the same mode names:

```text
all      API + web
py       API only
api      API only
client   web only
web      web only
```

## What Runs

The web client runs:

```bash
pnpm dev:web
```

The Python API runs:

```bash
pnpm dev:api
```

`pnpm dev:api` calls `scripts/start-api.mjs`. That Node wrapper is
cross-platform:

- creates `apps/api/.venv` when missing,
- installs the API package from `apps/api/pyproject.toml` when dependencies are
  missing,
- sets local development placeholders for required secrets when they are not
  already set,
- starts FastAPI through `scripts/start-api.py`.

## Why VSCode Uses Tasks

`dev.mjs` and `dev.ps1` can open external terminal windows, but a process
started from inside a VSCode terminal cannot directly create new VSCode
integrated terminals. VSCode integrated terminals are owned by VSCode itself,
so this repository uses `.vscode/tasks.json` for that workflow.

In short:

- use VSCode tasks when you want terminals inside VSCode,
- use `pnpm dev:local`, `.\dev.ps1`, or `sh dev.sh` when you want external
  terminals.

## Files

- `dev.mjs` is the cross-platform external terminal launcher.
- `dev.ps1` is the Windows wrapper around `dev.mjs`.
- `dev.sh` is the macOS/Linux wrapper around `dev.mjs`.
- `.vscode/tasks.json` defines VSCode integrated terminal tasks.
- `scripts/start-api.mjs` is the cross-platform API environment and server
  launcher.
- `scripts/check-dev-launcher.mjs` verifies the launcher and documentation
  protocol.

## Verification

Use this check after changing startup scripts:

```bash
pnpm check:dev-launcher
```
