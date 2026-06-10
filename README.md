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

- Go 1.21+
- Node.js 18+

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
