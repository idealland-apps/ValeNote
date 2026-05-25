package handler

import (
	"net/http"
	"os"
	"path/filepath"

	"github.com/idealland-apps/valenote/internal/service"
	"github.com/gin-gonic/gin"
)

type ExportHandler struct {
	exportService *service.ExportService
	authService   *service.AuthService
}

func NewExportHandler(exportService *service.ExportService, authService *service.AuthService) *ExportHandler {
	return &ExportHandler{
		exportService: exportService,
		authService:   authService,
	}
}

func (h *ExportHandler) GetExportToken(c *gin.Context) {
	userID := c.GetInt64("userID")
	token, err := h.authService.GenerateExportToken(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"token": token})
}

func (h *ExportHandler) Export(c *gin.Context) {
	token := c.Query("token")
	if token == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing token"})
		return
	}

	_, err := h.authService.ValidateExportToken(token)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired token"})
		return
	}

	zipPath, err := h.exportService.Export()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create export"})
		return
	}
	defer os.Remove(zipPath)

	c.Header("Content-Description", "File Transfer")
	c.Header("Content-Disposition", "attachment; filename="+filepath.Base(zipPath))
	c.Header("Content-Type", "application/zip")
	c.File(zipPath)
}
