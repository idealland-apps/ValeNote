package handler

import (
	"net/http"
	"strings"

	"github.com/idealland-apps/valenote/internal/middleware"
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
	notebook := c.Query("notebook")

	if notebook != "" {
		hasAccess, _ := h.agentService.CheckAgentAccess(agentID, notebook, "read")
		if !hasAccess {
			c.JSON(http.StatusForbidden, gin.H{"error": "no access to this notebook"})
			return
		}
	}

	notes, err := h.noteService.ListNotes(notebook, true)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list notes"})
		return
	}

	if notebook == "" {
		filtered := make([]service.Note, 0)
		for _, note := range notes {
			notebookName := strings.Split(note.Path, "/")[0]
			hasAccess, _ := h.agentService.CheckAgentAccess(agentID, notebookName, "read")
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
	path = strings.TrimPrefix(path, "/")

	notebookName := strings.Split(path, "/")[0]
	hasAccess, _ := h.agentService.CheckAgentAccess(agentID, notebookName, "read")
	if !hasAccess {
		c.JSON(http.StatusForbidden, gin.H{"error": "no access to this notebook"})
		return
	}

	note, err := h.noteService.GetNote(path)
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

	notebookName := strings.Split(req.Path, "/")[0]
	hasAccess, _ := h.agentService.CheckAgentAccess(agentID, notebookName, "readwrite")
	if !hasAccess {
		c.JSON(http.StatusForbidden, gin.H{"error": "no write access to this notebook"})
		return
	}

	noteReq := &service.CreateNoteRequest{
		Path:    req.Path,
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
	path = strings.TrimPrefix(path, "/")

	notebookName := strings.Split(path, "/")[0]
	hasAccess, _ := h.agentService.CheckAgentAccess(agentID, notebookName, "readwrite")
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

	note, _, err := h.noteService.UpdateNote(path, noteReq, 0)
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
		hasAccess, _ := h.agentService.CheckAgentAccess(agentID, notebook, "read")
		if !hasAccess {
			c.JSON(http.StatusForbidden, gin.H{"error": "no access to this notebook"})
			return
		}
	}

	results, err := h.searchService.Search(query, notebook, nil, 20)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "search failed"})
		return
	}

	if notebook == "" {
		filtered := make([]service.SearchResult, 0)
		for _, result := range results {
			notebookName := strings.Split(result.Path, "/")[0]
			hasAccess, _ := h.agentService.CheckAgentAccess(agentID, notebookName, "read")
			if hasAccess {
				filtered = append(filtered, result)
			}
		}
		results = filtered
	}

	c.JSON(http.StatusOK, results)
}
