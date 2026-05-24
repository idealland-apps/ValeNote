package handler

import (
	"net/http"
	"path/filepath"

	"github.com/idealland-apps/valenote/internal/service"
	"github.com/gin-gonic/gin"
)

type AttachmentHandler struct {
	attachmentService *service.AttachmentService
}

func NewAttachmentHandler(attachmentService *service.AttachmentService) *AttachmentHandler {
	return &AttachmentHandler{attachmentService: attachmentService}
}

func (h *AttachmentHandler) Upload(c *gin.Context) {
	notePath := c.PostForm("note_path")
	if notePath == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "note_path is required"})
		return
	}

	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file is required"})
		return
	}

	result, err := h.attachmentService.Upload(notePath, file)
	if err != nil {
		if err == service.ErrFileTooBig {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "file too large (max 10MB)"})
			return
		}
		if err == service.ErrInvalidType {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid file type"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}

func (h *AttachmentHandler) Serve(c *gin.Context) {
	path := c.Param("path")
	if path == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "path is required"})
		return
	}

	fullPath, err := h.attachmentService.GetAttachmentPath(path)
	if err != nil {
		if err == service.ErrNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "attachment not found"})
			return
		}
		if err == service.ErrPathEscape {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid path"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.Header("Cache-Control", "public, max-age=31536000")
	c.File(fullPath)
}

func (h *AttachmentHandler) ServeFromNote(c *gin.Context) {
	notePath := c.Param("notePath")
	attachPath := c.Param("attachPath")
	if notePath == "" || attachPath == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "note path and attachment path are required"})
		return
	}

	noteName := filepath.Base(notePath)
	noteName = noteName[:len(noteName)-len(filepath.Ext(noteName))]
	noteDir := filepath.Dir(notePath)

	relativePath := filepath.Join(noteDir, noteName, "attachments", attachPath)

	fullPath, err := h.attachmentService.GetAttachmentPath(relativePath)
	if err != nil {
		if err == service.ErrNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "attachment not found"})
			return
		}
		if err == service.ErrPathEscape {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid path"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.Header("Cache-Control", "public, max-age=31536000")
	c.File(fullPath)
}

func (h *AttachmentHandler) List(c *gin.Context) {
	notePath := c.Query("note_path")
	if notePath == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "note_path is required"})
		return
	}

	attachments, err := h.attachmentService.List(notePath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, attachments)
}

func (h *AttachmentHandler) Delete(c *gin.Context) {
	var req struct {
		NotePath string `json:"note_path"`
		Filename string `json:"filename"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	if req.NotePath == "" || req.Filename == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "note_path and filename are required"})
		return
	}

	if err := h.attachmentService.Delete(req.NotePath, req.Filename); err != nil {
		if err == service.ErrNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "attachment not found"})
			return
		}
		if err == service.ErrPathEscape {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid path"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}
