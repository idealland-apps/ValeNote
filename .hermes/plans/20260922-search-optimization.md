# Search correctness and bounded scanning

## Scope

Implement search phases 1–2 only. Preserve the existing REST/MCP parameter and response shapes, single-request search results, document-level case-insensitive term AND, default/max result limits. No extra MCP tools, pagination, multi-round workflow, rg runtime dependency, FTS, vector database, or traditional full-text index. No remote deployment or push.

## Design

- One context-aware search service for web, Agent REST and MCP. Permission notebook allowlists apply before scanning and limiting. nil allowlist = unrestricted authenticated user; empty non-nil allowlist = no access.
- Per-service/root byte-budgeted file cache with original and folded text, absolute maximum age, per-file filesystem validation and mutation invalidation. No global corpus cache or refresh-on-read TTL.
- Enumerate only authorized/explicit scope with WalkDir, omit attachments and symlinks, bounded workers and service-wide concurrency, propagate context cancellation and I/O errors. Cache all query-independent work once. Metadata-only matches must not gate body recall.
- Deterministic ordering and result limit, UTF-8-safe snippets aligned to original content. No new relevance-ranking feature in this iteration.
- All note mutations (including copy/move/folder/notebook operations and version restore) invalidate only affected cached paths/prefixes and maintain existing DB metadata.
- HTTP forwards request cancellation; MCP keeps its external schema and rich one-shot result. Web discards/cancels obsolete requests.

## Work order / verification

| Milestone | Status | Verification | Notes |
|---|---|---|---|
| Go setup and baseline | Done | Go 1.27.1 official SHA256 verified; pristine worktree `go test ./...` and `go vet ./...` PASS; web build PASS | installed ~/.local/share/go1.27.1, ~/.local/bin/go; baseline ESLint 35 errors/3 warnings; command-scoped proxy resolved Go module timeout |
| Correctness regressions | Done | RED observed for stale update, REST/MCP permission limit, restore metadata, response fields and invalid MCP arguments; focused and full Go tests PASS | temporary SQLite + filesystem fixtures; no live user data |
| Scoped bounded scanner/cache | Done | service tests + race PASS: scope, budget, expiry, generation, concurrency, symlink replacement, cancellation; benchmark comparison in README | safe early stop with deterministic queued-prefix draining; no index |
| Integration and delivery | Done | full go test/race/vet PASS; frontend build PASS; 21 UI tests PASS; real binary HTTP/MCP + Chromium smoke PASS; both independent reviews PASS | local branch feat/scoped-search-cache; executable ./server and web/dist; no push/deployment |

Expected files: internal/service/search.go and new tests/cache helpers; internal/service/note.go, version.go, agent.go; handlers and MCP search call sites; cmd/server/main.go; web search request cancellation as needed; README search behavior and verification documentation.

## Acceptance

Editing/restoring/moving/deleting/copying notes is visible on the next completed search. Restricted agents cannot lose accessible matches due to unauthorized documents consuming limits. Authorized scope is not just a post-filter. Multi-term matches may span lines; Chinese snippets remain valid UTF-8. Cache growth and scanner parallelism are bounded, expired requests stop work. Empty and unusual queries cannot panic. The built server must start with isolated temporary data and serve its actual frontend and authenticated search endpoints.
