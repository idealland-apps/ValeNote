package handler

import (
	"net/http"

	"github.com/idealland-apps/valenote/internal/middleware"
	"github.com/idealland-apps/valenote/internal/pathutil"
	"github.com/idealland-apps/valenote/internal/service"
	"github.com/gin-gonic/gin"
)

type AgentAPIHandler struct {
	noteService   *service.NoteService
	searchService *service.SearchService
	agentService  *service.AgentService
}

func NewAgentAPIHandler(noteService *service.NoteService, searchService *service.SearchService, agentService *service.AgentService) *AgentAPIHandler {
	return &AgentAPIHandler{
		noteService:   noteService,
		searchService: searchService,
		agentService:  agentService,
	}
}

func (h *AgentAPIHandler) ListNotebooks(c *gin.Context) {
	agentID := middleware.GetAgentID(c)

	notebooks, err := h.noteService.ListNotebooks()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list notebooks"})
		return
	}

	accessible := make([]gin.H, 0)
	for _, nb := range notebooks {
		hasAccess, _ := h.agentService.CheckAgentAccess(agentID, nb.Name, "read")
		if hasAccess {
			accessible = append(accessible, gin.H{
				"name":      nb.Name,
				"is_public": nb.IsPublic,
			})
		}
	}

	c.JSON(http.StatusOK, accessible)
}

func (h *AgentAPIHandler) ListNotes(c *gin.Context) {
	agentID := middleware.GetAgentID(c)
	path := c.Query("path")

	if path != "" {
		cleaned, ok := pathutil.CleanOk(path)
		if !ok {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid path"})
			return
		}
		path = cleaned
		hasAccess, _ := h.agentService.CheckAgentAccess(agentID, pathutil.ExtractNotebook(cleaned), "read")
		if !hasAccess {
			c.JSON(http.StatusForbidden, gin.H{"error": "no access to this notebook"})
			return
		}
	}

	notes, err := h.noteService.ListNotes(path, true)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list notes"})
		return
	}

	if path == "" {
		filtered := make([]service.Note, 0)
		for _, note := range notes {
			hasAccess, _ := h.agentService.CheckAgentAccess(agentID, pathutil.ExtractNotebook(note.Path), "read")
			if hasAccess {
				filtered = append(filtered, note)
			}
		}
		notes = filtered
	}

	c.JSON(http.StatusOK, notes)
}

func (h *AgentAPIHandler) GetNote(c *gin.Context) {
	agentID := middleware.GetAgentID(c)
	path := c.Param("path")

	cleaned, ok := pathutil.CleanOk(path)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid path"})
		return
	}
	hasAccess, _ := h.agentService.CheckAgentAccess(agentID, pathutil.ExtractNotebook(cleaned), "read")
	if !hasAccess {
		c.JSON(http.StatusForbidden, gin.H{"error": "no access to this notebook"})
		return
	}

	note, err := h.noteService.GetNote(cleaned)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "note not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"path":    note.Path,
		"title":   note.Title,
		"content": note.Content,
		"tags":    note.Tags,
	})
}

func (h *AgentAPIHandler) CreateNote(c *gin.Context) {
	agentID := middleware.GetAgentID(c)

	var req struct {
		Path    string   `json:"path" binding:"required"`
		Title   string   `json:"title"`
		Content string   `json:"content" binding:"required"`
		Tags    []string `json:"tags"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	cleaned, ok := pathutil.CleanOk(req.Path)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid path"})
		return
	}
	hasAccess, _ := h.agentService.CheckAgentAccess(agentID, pathutil.ExtractNotebook(cleaned), "readwrite")
	if !hasAccess {
		c.JSON(http.StatusForbidden, gin.H{"error": "no write access to this notebook"})
		return
	}

	noteReq := &service.CreateNoteRequest{
		Path:    cleaned,
		Title:   req.Title,
		Content: req.Content,
		Tags:    req.Tags,
	}

	note, err := h.noteService.CreateNote(noteReq, 0)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create note"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"path":  note.Path,
		"title": note.Title,
	})
}

func (h *AgentAPIHandler) UpdateNote(c *gin.Context) {
	agentID := middleware.GetAgentID(c)
	path := c.Param("path")

	cleaned, ok := pathutil.CleanOk(path)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid path"})
		return
	}
	hasAccess, _ := h.agentService.CheckAgentAccess(agentID, pathutil.ExtractNotebook(cleaned), "readwrite")
	if !hasAccess {
		c.JSON(http.StatusForbidden, gin.H{"error": "no write access to this notebook"})
		return
	}

	var req struct {
		Content string `json:"content" binding:"required"`
		Append  bool   `json:"append"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	noteReq := &service.UpdateNoteRequest{
		Content: req.Content,
		Append:  req.Append,
	}

	note, _, err := h.noteService.UpdateNote(cleaned, noteReq, 0, agentID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update note"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"path":  note.Path,
		"title": note.Title,
	})
}

func (h *AgentAPIHandler) SearchNotes(c *gin.Context) {
	agentID := middleware.GetAgentID(c)
	query := c.Query("q")
	notebook := c.Query("notebook")

	if query == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "query parameter 'q' is required"})
		return
	}

	if notebook != "" {
		cleaned, ok := pathutil.CleanOk(notebook)
		if !ok {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid path"})
			return
		}
		notebook = cleaned
		hasAccess, _ := h.agentService.CheckAgentAccess(agentID, pathutil.ExtractNotebook(cleaned), "read")
		if !hasAccess {
			c.JSON(http.StatusForbidden, gin.H{"error": "no access to this notebook"})
			return
		}
	}

	// Search metadata (title, path, tags)
	metaResults, err := h.searchService.Search(query, notebook, nil, 20)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "search failed"})
		return
	}

	// Search fulltext content
	fulltextResults, err := h.searchService.SearchFulltext(query, notebook, 20)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "search failed"})
		return
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
	if len(results) > 20 {
		results = results[:20]
	}

	// Filter by agent access
	if notebook == "" {
		filtered := make([]service.SearchResult, 0)
		for _, result := range results {
			hasAccess, _ := h.agentService.CheckAgentAccess(agentID, pathutil.ExtractNotebook(result.Path), "read")
			if hasAccess {
				filtered = append(filtered, result)
			}
		}
		results = filtered
	}

	c.JSON(http.StatusOK, results)
}

func (h *AgentAPIHandler) MoveNote(c *gin.Context) {
	agentID := middleware.GetAgentID(c)

	var req struct {
		Source string `json:"source" binding:"required"`
		Target string `json:"target" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	cleanedSource, ok := pathutil.CleanOk(req.Source)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid source path"})
		return
	}
	cleanedTarget, ok := pathutil.CleanOk(req.Target)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid target path"})
		return
	}

	hasSourceAccess, _ := h.agentService.CheckAgentAccess(agentID, pathutil.ExtractNotebook(cleanedSource), "readwrite")
	if !hasSourceAccess {
		c.JSON(http.StatusForbidden, gin.H{"error": "no write access to source notebook"})
		return
	}

	hasTargetAccess, _ := h.agentService.CheckAgentAccess(agentID, pathutil.ExtractNotebook(cleanedTarget), "readwrite")
	if !hasTargetAccess {
		c.JSON(http.StatusForbidden, gin.H{"error": "no write access to target notebook"})
		return
	}

	if err := h.noteService.MoveFile(cleanedSource, cleanedTarget); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to move note"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"source": cleanedSource,
		"target": cleanedTarget,
	})
}
