package handler

import (
	"net/http"
	"strconv"

	"github.com/anthropics/valenote/internal/middleware"
	"github.com/anthropics/valenote/internal/service"
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
	path := c.Param("path")
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
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid version id"})
		return
	}

	content, version, err := h.versionService.GetVersionContent(id)
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
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid version id"})
		return
	}

	userID := middleware.GetUserID(c)
	if err := h.versionService.RestoreVersion(id, userID, h.noteService); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "version restored"})
}

func (h *VersionHandler) DiffVersion(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid version id"})
		return
	}

	diff, err := h.versionService.DiffVersion(id, h.noteService)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, diff)
}
