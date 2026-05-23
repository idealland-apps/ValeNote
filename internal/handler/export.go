package handler

import (
	"net/http"
	"os"
	"path/filepath"

	"github.com/anthropics/valenote/internal/service"
	"github.com/gin-gonic/gin"
)

type ExportHandler struct {
	exportService *service.ExportService
}

func NewExportHandler(exportService *service.ExportService) *ExportHandler {
	return &ExportHandler{exportService: exportService}
}

func (h *ExportHandler) Export(c *gin.Context) {
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
