package mcp

import (
	"encoding/json"
	"fmt"
	"strings"

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
			Description: "List all available notebooks",
			InputSchema: InputSchema{
				Type:       "object",
				Properties: map[string]Property{},
			},
		},
		{
			Name:        "list_notes",
			Description: "List notes in a notebook or directory",
			InputSchema: InputSchema{
				Type: "object",
				Properties: map[string]Property{
					"notebook": {
						Type:        "string",
						Description: "Notebook name to list notes from",
					},
					"recursive": {
						Type:        "boolean",
						Description: "Whether to list notes recursively (default: true)",
					},
				},
			},
		},
		{
			Name:        "search_notes",
			Description: "Search for notes by title, content, or tags",
			InputSchema: InputSchema{
				Type: "object",
				Properties: map[string]Property{
					"query": {
						Type:        "string",
						Description: "Search query",
					},
					"notebook": {
						Type:        "string",
						Description: "Limit search to a specific notebook",
					},
					"limit": {
						Type:        "integer",
						Description: "Maximum number of results (default: 20)",
					},
				},
				Required: []string{"query"},
			},
		},
		{
			Name:        "read_note",
			Description: "Read the full content of a note",
			InputSchema: InputSchema{
				Type: "object",
				Properties: map[string]Property{
					"path": {
						Type:        "string",
						Description: "Path to the note (e.g., 'work/projects/valenote.md')",
					},
				},
				Required: []string{"path"},
			},
		},
		{
			Name:        "create_note",
			Description: "Create a new note",
			InputSchema: InputSchema{
				Type: "object",
				Properties: map[string]Property{
					"path": {
						Type:        "string",
						Description: "Path for the new note (e.g., 'work/projects/new-idea.md')",
					},
					"title": {
						Type:        "string",
						Description: "Title of the note",
					},
					"content": {
						Type:        "string",
						Description: "Markdown content of the note",
					},
					"tags": {
						Type:        "array",
						Description: "Tags for the note",
					},
				},
				Required: []string{"path", "content"},
			},
		},
		{
			Name:        "update_note",
			Description: "Update an existing note",
			InputSchema: InputSchema{
				Type: "object",
				Properties: map[string]Property{
					"path": {
						Type:        "string",
						Description: "Path to the note",
					},
					"content": {
						Type:        "string",
						Description: "New content for the note",
					},
					"append": {
						Type:        "boolean",
						Description: "If true, append content instead of replacing",
					},
				},
				Required: []string{"path", "content"},
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
		Notebook  string `json:"notebook"`
		Recursive *bool  `json:"recursive"`
	}
	json.Unmarshal(args, &params)

	if params.Notebook != "" {
		hasAccess, _ := s.agentService.CheckAgentAccess(ctx.AgentID, params.Notebook, "read")
		if !hasAccess {
			return NewTextContent("Error: no access to this notebook"), true
		}
	}

	recursive := true
	if params.Recursive != nil {
		recursive = *params.Recursive
	}

	notes, err := s.noteService.ListNotes(params.Notebook, recursive)
	if err != nil {
		return NewErrorContent(err), true
	}

	if params.Notebook == "" {
		filtered := make([]service.Note, 0)
		for _, note := range notes {
			notebookName := strings.Split(note.Path, "/")[0]
			hasAccess, _ := s.agentService.CheckAgentAccess(ctx.AgentID, notebookName, "read")
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
		hasAccess, _ := s.agentService.CheckAgentAccess(ctx.AgentID, params.Notebook, "read")
		if !hasAccess {
			return NewTextContent("Error: no access to this notebook"), true
		}
	}

	if params.Limit == 0 {
		params.Limit = 20
	}

	results, err := s.searchService.Search(params.Query, params.Notebook, nil, params.Limit)
	if err != nil {
		return NewErrorContent(err), true
	}

	if params.Notebook == "" {
		filtered := make([]service.SearchResult, 0)
		for _, result := range results {
			notebookName := strings.Split(result.Path, "/")[0]
			hasAccess, _ := s.agentService.CheckAgentAccess(ctx.AgentID, notebookName, "read")
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

	notebookName := strings.Split(params.Path, "/")[0]
	hasAccess, _ := s.agentService.CheckAgentAccess(ctx.AgentID, notebookName, "read")
	if !hasAccess {
		return NewTextContent("Error: no access to this notebook"), true
	}

	note, err := s.noteService.GetNote(params.Path)
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

	notebookName := strings.Split(params.Path, "/")[0]
	hasAccess, _ := s.agentService.CheckAgentAccess(ctx.AgentID, notebookName, "readwrite")
	if !hasAccess {
		return NewTextContent("Error: no write access to this notebook"), true
	}

	req := &service.CreateNoteRequest{
		Path:    params.Path,
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

	notebookName := strings.Split(params.Path, "/")[0]
	hasAccess, _ := s.agentService.CheckAgentAccess(ctx.AgentID, notebookName, "readwrite")
	if !hasAccess {
		return NewTextContent("Error: no write access to this notebook"), true
	}

	req := &service.UpdateNoteRequest{
		Content: params.Content,
		Append:  params.Append,
	}

	note, err := s.noteService.UpdateNote(params.Path, req, 0)
	if err != nil {
		return NewErrorContent(err), true
	}

	return NewTextContent(fmt.Sprintf("Updated note: %s", note.Path)), false
}
