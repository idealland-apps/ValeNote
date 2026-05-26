# ValeNote

Self-hosted note web app based on markdown. Access anywhere and fully control your data.

## Features

- Pure Markdown storage with YAML frontmatter
- Real-time collaboration with WebSocket
- Version history and conflict resolution
- Tag management and full-text search
- Wiki-style `[[links]]` with backlinks
- Image paste/drag-drop upload
- Remote sync to S3/WebDAV
- MCP server for AI agent integration
- Dark mode support

## Requirements

- Go 1.21+
- Node.js 18+
- npm

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/anthropics/valenote.git
cd valenote
```

### 2. Start the backend

```bash
# Install Go dependencies
go mod download

# Run the server
go run ./cmd/server
```

The server will start at `http://localhost:8080`.

### 3. Start the frontend (development)

```bash
cd web

# Install dependencies
npm install

# Start dev server
npm run dev
```

The frontend will start at `http://localhost:5173`.

### 4. Access the app

Open `http://localhost:5173` in your browser.

**Default admin credentials:**
- Username: `admin`
- Password: `admin123abc`

Please change the default password after first login via Settings > User Management.

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `VALENOTE_PORT` | `8080` | Server port |
| `VALENOTE_MODE` | `debug` | Server mode (`debug` / `release`) |
| `VALENOTE_DATA_PATH` | `./data` | Database and versions storage |
| `VALENOTE_NOTES_PATH` | `./notes` | Markdown notes directory |
| `VALENOTE_SECRET_KEY` | `change-me-in-production` | JWT signing secret |

Example:

```bash
export VALENOTE_SECRET_KEY="your-secure-secret"
export VALENOTE_NOTES_PATH="/path/to/your/notes"
go run ./cmd/server
```

## Docker

```bash
docker-compose up -d
```

Or build manually:

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
│   ├── src/
│   │   ├── components/ # UI components
│   │   ├── pages/      # Page components
│   │   ├── stores/     # Zustand stores
│   │   └── services/   # API client
│   └── package.json
├── docs/               # Documentation
├── go.mod
└── docker-compose.yml
```

## License

MIT
