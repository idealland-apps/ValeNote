package handler

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/idealland-apps/valenote/internal/middleware"
	"github.com/idealland-apps/valenote/internal/service"
	"github.com/gin-gonic/gin"
)

type VersionHandler struct {
	versionService *service.VersionService
	noteService    *service.NoteService
}

func NewVersionHandler(versionService *service.VersionService, noteService *service.NoteService) *VersionHandler {
	return &VersionHandler{
		versionService: versionService,
		noteService:    noteService,
	}
}

func (h *VersionHandler) ListVersions(c *gin.Context) {
	path := strings.TrimPrefix(c.Param("path"), "/")
	limitStr := c.DefaultQuery("limit", "50")
	limit, _ := strconv.Atoi(limitStr)

	versions, err := h.versionService.ListVersions(path, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, versions)
}

func (h *VersionHandler) GetVersionContent(c *gin.Context) {
	notePath := strings.TrimPrefix(c.Param("path"), "/")
	versionID := c.Query("id")
	if versionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "version id required"})
		return
	}

	content, version, err := h.versionService.GetVersionContent(notePath, versionID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "version not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":         version.ID,
		"note_path":  version.NotePath,
		"content":    content,
		"size":       version.Size,
		"checksum":   version.Checksum,
		"created_at": version.CreatedAt,
	})
}

func (h *VersionHandler) RestoreVersion(c *gin.Context) {
	notePath := strings.TrimPrefix(c.Param("path"), "/")
	versionID := c.Query("id")
	if versionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "version id required"})
		return
	}

	userID := middleware.GetUserID(c)
	if err := h.versionService.RestoreVersion(notePath, versionID, userID, h.noteService); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "version restored"})
}

func (h *VersionHandler) DiffVersion(c *gin.Context) {
	notePath := strings.TrimPrefix(c.Param("path"), "/")
	versionID := c.Query("id")
	if versionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "version id required"})
		return
	}

	diff, err := h.versionService.DiffVersion(notePath, versionID, h.noteService)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, diff)
}
