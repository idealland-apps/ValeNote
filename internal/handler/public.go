package handler

import (
	"net/http"
	"strings"

	"github.com/anthropics/valenote/internal/service"
	"github.com/gin-gonic/gin"
)

type PublicHandler struct {
	publicService *service.PublicService
}

func NewPublicHandler(publicService *service.PublicService) *PublicHandler {
	return &PublicHandler{publicService: publicService}
}

func (h *PublicHandler) HandlePublicNote(c *gin.Context) {
	basePath := h.publicService.GetPublicBasePath()
	path := c.Request.URL.Path

	if !strings.HasPrefix(path, basePath+"/") && path != basePath {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}

	remaining := strings.TrimPrefix(path, basePath)
	remaining = strings.TrimPrefix(remaining, "/")
	if remaining == "" {
		c.JSON(http.StatusOK, gin.H{"message": "Please access a specific notebook, e.g., /public/notebook-name"})
		return
	}

	parts := strings.SplitN(remaining, "/", 2)
	notebook := parts[0]
	notePath := ""
	if len(parts) > 1 {
		notePath = parts[1]
	}

	if !h.publicService.IsNotebookPublic(notebook) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}

	if notePath == "" {
		notes, err := h.publicService.ListPublicNotes(notebook)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list notes"})
			return
		}
		c.JSON(http.StatusOK, notes)
		return
	}

	note, err := h.publicService.GetPublicNote(notebook, notePath)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "note not found"})
		return
	}

	render := c.Query("render")
	if render == "true" || render == "1" {
		html, err := h.publicService.RenderNoteHTML(note)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to render note"})
			return
		}
		c.Header("Content-Type", "text/html; charset=utf-8")
		c.String(http.StatusOK, html)
		return
	}

	c.JSON(http.StatusOK, note)
}

func (h *PublicHandler) GetPublicBasePath(c *gin.Context) {
	basePath := h.publicService.GetPublicBasePath()
	c.JSON(http.StatusOK, gin.H{"path": basePath})
}

func (h *PublicHandler) SetPublicBasePath(c *gin.Context) {
	var req struct {
		Path string `json:"path" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.publicService.SetPublicBasePath(req.Path); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid path"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"path": req.Path})
}

func (h *PublicHandler) SetNotebookPublic(c *gin.Context) {
	name := c.Param("name")

	var req struct {
		IsPublic bool `json:"is_public"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.publicService.SetNotebookPublic(name, req.IsPublic); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update notebook"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"name": name, "is_public": req.IsPublic})
}

func (h *PublicHandler) ListPublicNotebooks(c *gin.Context) {
	notebooks, err := h.publicService.GetPublicNotebooks()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list notebooks"})
		return
	}
	c.JSON(http.StatusOK, notebooks)
}

func (h *PublicHandler) GetNotebookTree(c *gin.Context) {
	notebook := c.Param("notebook")

	tree, err := h.publicService.GetNotebookTree(notebook)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "notebook not found"})
		return
	}

	c.JSON(http.StatusOK, tree)
}

func (h *PublicHandler) GetPublicNote(c *gin.Context) {
	notebook := c.Param("notebook")
	path := c.Param("path")
	path = strings.TrimPrefix(path, "/")

	note, err := h.publicService.GetPublicNote(notebook, path)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "note not found"})
		return
	}

	c.JSON(http.StatusOK, note)
}

func (h *PublicHandler) GetFolderNotes(c *gin.Context) {
	notebook := c.Param("notebook")
	path := c.Param("path")
	path = strings.TrimPrefix(path, "/")

	notes, err := h.publicService.GetFolderNotes(notebook, path)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "folder not found"})
		return
	}

	c.JSON(http.StatusOK, notes)
}
