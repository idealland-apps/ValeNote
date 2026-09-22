# ValeNote

Self-hosted note-taking app based on Markdown. Access anywhere and fully control your data.

## Features

- **Pure Markdown** — Notes stored as plain `.md` files with YAML frontmatter, easy to backup and migrate
- **Version History** — Automatic versioning for all notes, never lose your work
- **Backlinks** — Track which notes link to the current note
- **Full-text Search** — Fast search across all notes content and tags
- **Image Upload** — Paste or drag-drop images directly into notes
- **Remote Sync** — Sync notes to S3 or WebDAV storage
- **MCP Server** — Built-in [Model Context Protocol](https://modelcontextprotocol.io/) server for AI agent integration
- **Dark Mode** — Eye-friendly dark theme support

## Self-Hosting

### Docker (Recommended)

The easiest way to deploy ValeNote. The image is available on [Docker Hub](https://hub.docker.com/r/bytetopia/valenote).

```bash
docker run -d \
  --name valenote \
  -p 8080:8080 \
  -v ./data:/data \
  -v ./notes:/notes \
  -e VALENOTE_SECRET_KEY=your-secure-secret \
  bytetopia/valenote:latest
```

Or use docker-compose:

```yaml
# docker-compose.yml
version: "3.8"
services:
  valenote:
    image: bytetopia/valenote:latest
    ports:
      - "8080:8080"
    volumes:
      - ./data:/data
      - ./notes:/notes
    environment:
      - VALENOTE_SECRET_KEY=your-secure-secret
      - VALENOTE_MODE=release
    restart: unless-stopped
```

```bash
docker-compose up -d
```

Then open `http://localhost:8080` in your browser.

**Default admin credentials:**
- Username: `admin`
- Password: `admin123abc`

Please change the default password after first login via Settings > User Management.

### Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `VALENOTE_PORT` | `8080` | Server port |
| `VALENOTE_MODE` | `release` | Server mode (`debug` / `release`) |
| `VALENOTE_DATA_PATH` | `/data` | Database and versions storage |
| `VALENOTE_NOTES_PATH` | `/notes` | Markdown notes directory |
| `VALENOTE_SECRET_KEY` | - | JWT signing secret (required in production) |

## Local Development

### Requirements

- Go 1.24+ (verified with Go 1.27.1)
- Node.js 22.12+ (verified with Node.js 22.22.2)

### Setup

```bash
# Clone
git clone https://github.com/idealland-apps/ValeNote.git
cd ValeNote

# Start backend
go mod download
go run ./cmd/server

# Start frontend (in another terminal)
cd web
npm install
npm run dev
```

- Backend: `http://localhost:8080`
- Frontend: `http://localhost:5173`

### Build from Source

```bash
# Build frontend
cd web && npm run build && cd ..

# Build server
go build -o valenote ./cmd/server

# Run
./valenote
```

## Search behavior

Search scans Markdown directly; no full-text index, external search service or `rg` binary is required.

- Web, Agent REST and MCP use the same scoped scanner. Agent notebook permissions are applied before reading files and before limiting results. Explicit notebook/subdirectory scopes are literal paths, not SQL wildcards.
- Terms are case-insensitive and ANDed at document level, including across lines. The combined search checks titles, paths, tags and content; `/search/fulltext` checks content. Metadata matches come first, with deterministic lexicographic directory-walk order within each group. The existing `/search` Note response and MCP tool schemas are retained. Default limit is 20, maximum 100; a single request includes the matching results and available snippets, without a new multi-call workflow.
- Each server search service has its own 64 MiB cache budget (original text, lowercase text and metadata accounting), not a global full-library snapshot. Reads/normalization are limited to four workers across the service; the scanner uses bounded per-request queues. This is a cache budget, not a total process-memory limit: large uncached notes and active requests still require memory.
- Files are validated against size and modification time on each search. Application edits, moves, copies, deletes and version restores invalidate affected paths immediately. External edits are detected by file stamps; same-size external edits that preserve timestamps are refreshed after an absolute five-minute cache age. Searches never extend that age. New and deleted files are discovered by scoped directory walks.
- Once enough highest-priority matches are found, scanning stops after a bounded queued prefix; earlier in-flight files are drained before selecting the first results. Combined search still checks for later metadata matches when only body matches have filled the limit. Snippets are generated only for admitted candidates.
- Attachment directories and symlinks are excluded. Unicode snippets preserve UTF-8 boundaries. HTTP cancellation propagates to search, and the UI aborts/discards obsolete requests. In-flight filesystem reads cannot necessarily be interrupted, but cancellation stops subsequent work.

### Verification

```bash
# From the repository root
go test ./...
go test -race ./...
go vet ./...
go build -o /tmp/valenote ./cmd/server

# Frontend build and deterministic search lifecycle regressions
(cd web && npm ci && npm run build && node --test src/components/SearchDialog.test.mjs)

# Real HTTP/MCP search against disposable notes/database; server is stopped afterwards
python3 scripts/search_smoke.py /tmp/valenote

# Optional real Chromium UI checks (requires installed Chrome)
npm ci
python3 scripts/search_smoke.py /tmp/valenote --browser
```

The smoke server uses the application's existing all-interface binding on a temporary port and disposable credentials/data; run it only on a trusted development host. The browser race test deliberately supplies delayed synthetic search responses to verify stale-result protection.

### Reproducible search microbenchmark

```bash
go test ./internal/service -run '^$' -bench BenchmarkSearchComparison -benchmem -benchtime=300ms -count=2
```

Local measurement on an AMD Ryzen 7 7735HS, Go 1.27.1, against the identical benchmark file on base commit `dcb2a49`: 1,000 synthetic Markdown files, 20,503 bytes each, ten notebooks, warm process and filesystem caches; values are means of two short runs. These are service microbenchmarks, not production or end-to-end HTTP latency guarantees.

| Query | Base | Optimized |
|---|---:|---:|
| Entire corpus, no match | 71.161 ms | 6.027 ms |
| One notebook, no match | 7.161 ms | 0.610 ms |
| Common term, first 20 matches | 1.299 ms | 0.315 ms |

Cold storage, smaller notes, concurrent traffic and network filesystems can behave differently. The implementation trades filesystem validation work for immediate detection of external changes; it does not make arbitrary no-index searches constant-time.

## Project Structure

```
ValeNote/
├── cmd/server/         # Main entry point
├── internal/
│   ├── config/         # Configuration
│   ├── handler/        # HTTP handlers
│   ├── middleware/     # Auth middleware
│   ├── model/          # Database models
│   ├── service/        # Business logic
│   └── mcp/            # MCP server
├── web/                # React frontend
└── docker-compose.yml
```

## License

MIT
