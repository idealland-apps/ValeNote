package mcp

import (
	"encoding/json"
	"fmt"

	"github.com/idealland-apps/valenote/internal/pathutil"
	"github.com/idealland-apps/valenote/internal/service"
)

type Server struct {
	noteService   *service.NoteService
	searchService *service.SearchService
	agentService  *service.AgentService
}

type RequestContext struct {
	AgentID int64
}

func NewServer(noteService *service.NoteService, searchService *service.SearchService, agentService *service.AgentService) *Server {
	return &Server{
		noteService:   noteService,
		searchService: searchService,
		agentService:  agentService,
	}
}

func (s *Server) GetTools() []Tool {
	return []Tool{
		{
			Name:        "list_notebooks",
			Description: "List all notebooks you have access to. Returns notebook names and whether they are public.",
			InputSchema: InputSchema{
				Type:       "object",
				Properties: map[string]Property{},
			},
		},
		{
			Name:        "list_notes",
			Description: "List all notes in a notebook or subdirectory. Returns note paths, titles, tags, and metadata. Use without path to list all accessible notes.",
			InputSchema: InputSchema{
				Type: "object",
				Properties: map[string]Property{
					"path": {
						Type:        "string",
						Description: "Notebook or directory path to list (e.g., 'work' for a notebook, 'work/projects' for a subdirectory). Omit to list all accessible notes.",
					},
					"recursive": {
						Type:        "boolean",
						Description: "If true (default), include notes in subdirectories. If false, only list notes in the immediate directory.",
					},
				},
			},
		},
		{
			Name:        "search_notes",
			Description: "Full-text search across note titles, content, and tags. Returns matching notes with paths and titles.",
			InputSchema: InputSchema{
				Type: "object",
				Properties: map[string]Property{
					"query": {
						Type:        "string",
						Description: "Search query to match against note titles, content, and tags",
					},
					"notebook": {
						Type:        "string",
						Description: "Limit search to a specific notebook (optional)",
					},
					"limit": {
						Type:        "integer",
						Description: "Maximum number of results to return (default: 20)",
					},
				},
				Required: []string{"query"},
			},
		},
		{
			Name:        "read_note",
			Description: "Read the full markdown content of a note. Returns the complete note content including frontmatter.",
			InputSchema: InputSchema{
				Type: "object",
				Properties: map[string]Property{
					"path": {
						Type:        "string",
						Description: "Full path to the note (e.g., 'work/projects/meeting-notes.md'). The .md extension is optional.",
					},
				},
				Required: []string{"path"},
			},
		},
		{
			Name:        "create_note",
			Description: "Create a new note with optional title and tags. The note will be created with proper frontmatter including creation timestamp.",
			InputSchema: InputSchema{
				Type: "object",
				Properties: map[string]Property{
					"path": {
						Type:        "string",
						Description: "Path for the new note (e.g., 'work/projects/new-idea.md'). Parent directories will be created if needed.",
					},
					"title": {
						Type:        "string",
						Description: "Title for the note (will be added to frontmatter and as H1 heading)",
					},
					"content": {
						Type:        "string",
						Description: "Markdown content of the note (without frontmatter, which is generated automatically)",
					},
					"tags": {
						Type:        "array",
						Description: "Tags for the note (will be added to frontmatter)",
						Items:       &Property{Type: "string", Description: "A tag string"},
					},
				},
				Required: []string{"path", "content"},
			},
		},
		{
			Name:        "update_note",
			Description: "Update an existing note's content. Can either replace the entire content or append to it. Previous version is automatically saved for history.",
			InputSchema: InputSchema{
				Type: "object",
				Properties: map[string]Property{
					"path": {
						Type:        "string",
						Description: "Path to the note to update",
					},
					"content": {
						Type:        "string",
						Description: "New content for the note. If append is false, this replaces the entire note. If append is true, this is added to the end.",
					},
					"append": {
						Type:        "boolean",
						Description: "If true, append content to the end of the note instead of replacing. Useful for adding new entries to logs or journals.",
					},
				},
				Required: []string{"path", "content"},
			},
		},
		{
			Name:        "move",
			Description: "Move or rename a note or folder. Can move between directories, rename in place, or both. Moving a folder moves all its contents. Previous versions and attachments are preserved. Requires write access to both source and target notebooks.",
			InputSchema: InputSchema{
				Type: "object",
				Properties: map[string]Property{
					"source": {
						Type:        "string",
						Description: "Current path of the note or folder (e.g., 'work/old-name.md' for a note, 'work/projects' for a folder)",
					},
					"target": {
						Type:        "string",
						Description: "New path for the note or folder (e.g., 'work/new-name.md' to rename, 'archive/old-name.md' to move, 'archive/new-name.md' to move and rename)",
					},
				},
				Required: []string{"source", "target"},
			},
		},
	}
}

func (s *Server) HandleRequest(req *JSONRPCRequest, ctx *RequestContext) *JSONRPCResponse {
	switch req.Method {
	case "initialize":
		return s.handleInitialize(req)
	case "tools/list":
		return s.handleListTools(req)
	case "tools/call":
		return s.handleToolCall(req, ctx)
	default:
		return &JSONRPCResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Error: &JSONRPCError{
				Code:    -32601,
				Message: "Method not found",
			},
		}
	}
}

func (s *Server) handleInitialize(req *JSONRPCRequest) *JSONRPCResponse {
	return &JSONRPCResponse{
		JSONRPC: "2.0",
		ID:      req.ID,
		Result: InitializeResult{
			ProtocolVersion: "2024-11-05",
			ServerInfo: ServerInfo{
				Name:    "valenote",
				Version: "1.0.0",
			},
			Capabilities: ServerCapabilities{
				Tools: &ToolsCapability{},
			},
		},
	}
}

func (s *Server) handleListTools(req *JSONRPCRequest) *JSONRPCResponse {
	return &JSONRPCResponse{
		JSONRPC: "2.0",
		ID:      req.ID,
		Result: ListToolsResult{
			Tools: s.GetTools(),
		},
	}
}

func (s *Server) handleToolCall(req *JSONRPCRequest, ctx *RequestContext) *JSONRPCResponse {
	var params ToolCallParams
	if err := json.Unmarshal(req.Params, &params); err != nil {
		return &JSONRPCResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Error: &JSONRPCError{
				Code:    -32602,
				Message: "Invalid params",
			},
		}
	}

	result, isError := s.callTool(params.Name, params.Arguments, ctx)
	return &JSONRPCResponse{
		JSONRPC: "2.0",
		ID:      req.ID,
		Result: ToolResult{
			Content: result,
			IsError: isError,
		},
	}
}

func (s *Server) callTool(name string, arguments json.RawMessage, ctx *RequestContext) ([]ContentBlock, bool) {
	switch name {
	case "list_notebooks":
		return s.listNotebooks(ctx)
	case "list_notes":
		return s.listNotes(arguments, ctx)
	case "search_notes":
		return s.searchNotes(arguments, ctx)
	case "read_note":
		return s.readNote(arguments, ctx)
	case "create_note":
		return s.createNote(arguments, ctx)
	case "update_note":
		return s.updateNote(arguments, ctx)
	case "move":
		return s.move(arguments, ctx)
	default:
		return NewTextContent(fmt.Sprintf("Unknown tool: %s", name)), true
	}
}

func (s *Server) listNotebooks(ctx *RequestContext) ([]ContentBlock, bool) {
	notebooks, err := s.noteService.ListNotebooks()
	if err != nil {
		return NewErrorContent(err), true
	}

	accessible := make([]map[string]interface{}, 0)
	for _, nb := range notebooks {
		hasAccess, _ := s.agentService.CheckAgentAccess(ctx.AgentID, nb.Name, "read")
		if hasAccess {
			accessible = append(accessible, map[string]interface{}{
				"name":      nb.Name,
				"is_public": nb.IsPublic,
			})
		}
	}

	data, _ := json.MarshalIndent(accessible, "", "  ")
	return NewTextContent(string(data)), false
}

func (s *Server) listNotes(args json.RawMessage, ctx *RequestContext) ([]ContentBlock, bool) {
	var params struct {
		Path      string `json:"path"`
		Recursive *bool  `json:"recursive"`
	}
	json.Unmarshal(args, &params)

	if params.Path != "" {
		cleaned, err := pathutil.Clean(params.Path)
		if err != nil {
			return NewTextContent("Error: invalid path"), true
		}
		params.Path = cleaned
		hasAccess, _ := s.agentService.CheckAgentAccess(ctx.AgentID, pathutil.ExtractNotebook(cleaned), "read")
		if !hasAccess {
			return NewTextContent("Error: no access to this notebook"), true
		}
	}

	recursive := true
	if params.Recursive != nil {
		recursive = *params.Recursive
	}

	notes, err := s.noteService.ListNotes(params.Path, recursive)
	if err != nil {
		return NewErrorContent(err), true
	}

	if params.Path == "" {
		filtered := make([]service.Note, 0)
		for _, note := range notes {
			hasAccess, _ := s.agentService.CheckAgentAccess(ctx.AgentID, pathutil.ExtractNotebook(note.Path), "read")
			if hasAccess {
				filtered = append(filtered, note)
			}
		}
		notes = filtered
	}

	data, _ := json.MarshalIndent(notes, "", "  ")
	return NewTextContent(string(data)), false
}

func (s *Server) searchNotes(args json.RawMessage, ctx *RequestContext) ([]ContentBlock, bool) {
	var params struct {
		Query    string `json:"query"`
		Notebook string `json:"notebook"`
		Limit    int    `json:"limit"`
	}
	json.Unmarshal(args, &params)

	if params.Notebook != "" {
		cleaned, err := pathutil.Clean(params.Notebook)
		if err != nil {
			return NewTextContent("Error: invalid path"), true
		}
		params.Notebook = cleaned
		hasAccess, _ := s.agentService.CheckAgentAccess(ctx.AgentID, pathutil.ExtractNotebook(cleaned), "read")
		if !hasAccess {
			return NewTextContent("Error: no access to this notebook"), true
		}
	}

	if params.Limit == 0 {
		params.Limit = 20
	}

	// Search metadata (title, path, tags)
	metaResults, err := s.searchService.Search(params.Query, params.Notebook, nil, params.Limit)
	if err != nil {
		return NewErrorContent(err), true
	}

	// Search fulltext content
	fulltextResults, err := s.searchService.SearchFulltext(params.Query, params.Notebook, params.Limit)
	if err != nil {
		return NewErrorContent(err), true
	}

	// Merge and dedupe results (metadata results first, then fulltext)
	seen := make(map[string]bool)
	results := make([]service.SearchResult, 0, len(metaResults)+len(fulltextResults))

	for _, r := range metaResults {
		if !seen[r.Path] {
			seen[r.Path] = true
			results = append(results, r)
		}
	}
	for _, r := range fulltextResults {
		if !seen[r.Path] {
			seen[r.Path] = true
			results = append(results, r)
		}
	}

	// Apply limit after merge
	if len(results) > params.Limit {
		results = results[:params.Limit]
	}

	// Filter by agent access
	if params.Notebook == "" {
		filtered := make([]service.SearchResult, 0)
		for _, result := range results {
			hasAccess, _ := s.agentService.CheckAgentAccess(ctx.AgentID, pathutil.ExtractNotebook(result.Path), "read")
			if hasAccess {
				filtered = append(filtered, result)
			}
		}
		results = filtered
	}

	data, _ := json.MarshalIndent(results, "", "  ")
	return NewTextContent(string(data)), false
}

func (s *Server) readNote(args json.RawMessage, ctx *RequestContext) ([]ContentBlock, bool) {
	var params struct {
		Path string `json:"path"`
	}
	json.Unmarshal(args, &params)

	cleaned, err := pathutil.Clean(params.Path)
	if err != nil {
		return NewTextContent("Error: invalid path"), true
	}
	hasAccess, _ := s.agentService.CheckAgentAccess(ctx.AgentID, pathutil.ExtractNotebook(cleaned), "read")
	if !hasAccess {
		return NewTextContent("Error: no access to this notebook"), true
	}

	note, err := s.noteService.GetNote(cleaned)
	if err != nil {
		return NewErrorContent(err), true
	}

	return NewTextContent(note.Content), false
}

func (s *Server) createNote(args json.RawMessage, ctx *RequestContext) ([]ContentBlock, bool) {
	var params struct {
		Path    string   `json:"path"`
		Title   string   `json:"title"`
		Content string   `json:"content"`
		Tags    []string `json:"tags"`
	}
	json.Unmarshal(args, &params)

	cleaned, err := pathutil.Clean(params.Path)
	if err != nil {
		return NewTextContent("Error: invalid path"), true
	}
	hasAccess, _ := s.agentService.CheckAgentAccess(ctx.AgentID, pathutil.ExtractNotebook(cleaned), "readwrite")
	if !hasAccess {
		return NewTextContent("Error: no write access to this notebook"), true
	}

	req := &service.CreateNoteRequest{
		Path:    cleaned,
		Title:   params.Title,
		Content: params.Content,
		Tags:    params.Tags,
	}

	note, err := s.noteService.CreateNote(req, 0)
	if err != nil {
		return NewErrorContent(err), true
	}

	return NewTextContent(fmt.Sprintf("Created note: %s", note.Path)), false
}

func (s *Server) updateNote(args json.RawMessage, ctx *RequestContext) ([]ContentBlock, bool) {
	var params struct {
		Path    string `json:"path"`
		Content string `json:"content"`
		Append  bool   `json:"append"`
	}
	json.Unmarshal(args, &params)

	cleaned, err := pathutil.Clean(params.Path)
	if err != nil {
		return NewTextContent("Error: invalid path"), true
	}
	hasAccess, _ := s.agentService.CheckAgentAccess(ctx.AgentID, pathutil.ExtractNotebook(cleaned), "readwrite")
	if !hasAccess {
		return NewTextContent("Error: no write access to this notebook"), true
	}

	req := &service.UpdateNoteRequest{
		Content: params.Content,
		Append:  params.Append,
	}

	note, _, err := s.noteService.UpdateNote(cleaned, req, 0, ctx.AgentID)
	if err != nil {
		return NewErrorContent(err), true
	}

	return NewTextContent(fmt.Sprintf("Updated note: %s", note.Path)), false
}

func (s *Server) move(args json.RawMessage, ctx *RequestContext) ([]ContentBlock, bool) {
	var params struct {
		Source string `json:"source"`
		Target string `json:"target"`
	}
	json.Unmarshal(args, &params)

	cleanedSource, err := pathutil.Clean(params.Source)
	if err != nil {
		return NewTextContent("Error: invalid source path"), true
	}
	cleanedTarget, err := pathutil.Clean(params.Target)
	if err != nil {
		return NewTextContent("Error: invalid target path"), true
	}

	hasSourceAccess, _ := s.agentService.CheckAgentAccess(ctx.AgentID, pathutil.ExtractNotebook(cleanedSource), "readwrite")
	if !hasSourceAccess {
		return NewTextContent("Error: no write access to source notebook"), true
	}

	hasTargetAccess, _ := s.agentService.CheckAgentAccess(ctx.AgentID, pathutil.ExtractNotebook(cleanedTarget), "readwrite")
	if !hasTargetAccess {
		return NewTextContent("Error: no write access to target notebook"), true
	}

	if err := s.noteService.MoveFile(cleanedSource, cleanedTarget); err != nil {
		return NewErrorContent(err), true
	}

	return NewTextContent(fmt.Sprintf("Moved note: %s -> %s", cleanedSource, cleanedTarget)), false
}
