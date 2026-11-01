# Local development

Run commands from the repository root unless a command explicitly changes directory.
The app needs both the Go backend and the Vite frontend.

## Requirements

- Go 1.24 or newer.
- Node.js 22.12 or newer and npm.
- Check the installed tools with `go version`, `node --version`, and `npm --version`.
- Reuse installed dependencies. Run `go mod download` or `(cd web && npm ci)`
  only if dependencies are missing.

## Start the servers

Check for existing listeners before starting another instance:

```bash
lsof -nP -iTCP:8080 -iTCP:5173 -sTCP:LISTEN
```

In one terminal, start the backend:

```bash
go run ./cmd/server
```

In a second terminal, start the frontend:

```bash
cd web
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Open http://127.0.0.1:5173/ for browser testing. Vite reloads frontend changes
automatically; restart the Go backend after changing Go code.

Use the Vite URL, not port 8080, to test current frontend source. The backend
serves `web/dist` when available, which may contain an older frontend build.

The frontend configuration in `web/vite.config.ts` proxies `/api` to
`http://localhost:8080` and `/ws` to `ws://localhost:8080`. `--strictPort`
prevents silently switching the frontend to another port.

## Runtime data and configuration

Without environment overrides, the backend uses:

- Port: `8080`; mode: `debug`.
- Database: `./data/valenote.db`.
- Note files: `./notes`.
- Version history: `./data/versions`.
- JWT secret: the backend reuses or generates `./data/.secret`.

These defaults are defined in `internal/config/config.go`. Running the backend
from the repository root is important because these paths are relative.
Reuse existing data for local testing; do not delete or replace it.
Login with the existing local account. See `README.md` for first-run login
instructions if using a new database.

Overrides are `VALENOTE_PORT`, `VALENOTE_MODE`, `VALENOTE_DATA_PATH`,
`VALENOTE_NOTES_PATH`, and `VALENOTE_SECRET_KEY`. Changing the backend port also
requires updating Vite's proxy targets. Never put a real secret in this file.
The backend currently listens on all interfaces; use a trusted development
network. The frontend command above binds only to loopback.

## Verify readiness

```bash
# Backend health: expected {"status":"ok"}
curl --fail --silent --show-error http://127.0.0.1:8080/health

# Frontend: expected HTML with the Vite development client
curl --fail --silent --show-error http://127.0.0.1:5173/

# Frontend-to-backend proxy: expected a JSON version response
curl --fail --silent --show-error http://127.0.0.1:5173/api/v1/version
```

Do not consider startup complete until both servers respond and the proxy works.

## Agent-managed processes

When the user needs the servers to stay available for browser testing, launch
each server with the Bash tool's `mode: "async"` and `detach: true`. Keep their
returned shell IDs so they can be inspected with `read_bash` and stopped with
`stop_bash`. Do not use `nohup`, shell backgrounding, or name-based process kills.

For manually started servers, use Ctrl+C in their respective terminals.
If a port is already occupied, identify the listener before acting; do not
terminate an unknown process or start a second server against the same data.

## Focused frontend validation

```bash
cd web
node --test src/stores/noteStore.test.mjs src/components/SearchDialog.test.mjs src/components/FileTree/useFileTree.test.mjs
npm run build
```

To check file-tree refresh in the browser, expand a notebook and open a note.
Create or rename a note through an AI agent or another client, then click
**Refresh file tree** above the sidebar tree. The new file list should appear
without reloading the page, collapsing existing folders, or replacing the
current editor content.

The toolbar's leftmost button opens the existing notebook creation dialog.
The collapse button sits immediately to the left of refresh, with both aligned
right. It collapses only notebook roots and persists subfolder expansion;
reopening a notebook should restore its previously expanded subfolders.
