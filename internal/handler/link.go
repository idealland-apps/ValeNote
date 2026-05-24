package handler

import (
	"net/http"
	"strings"

	"github.com/idealland-apps/valenote/internal/service"
	"github.com/gin-gonic/gin"
)

type LinkHandler struct {
	linkService *service.LinkService
}

func NewLinkHandler(linkService *service.LinkService) *LinkHandler {
	return &LinkHandler{linkService: linkService}
}

func (h *LinkHandler) GetBacklinks(c *gin.Context) {
	path := c.Param("path")
	path = strings.TrimPrefix(path, "/")

	backlinks, err := h.linkService.GetBacklinks(path)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get backlinks"})
		return
	}

	c.JSON(http.StatusOK, backlinks)
}

func (h *LinkHandler) ResolveLink(c *gin.Context) {
	var req struct {
		Link     string `json:"link" binding:"required"`
		Notebook string `json:"notebook"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	path, err := h.linkService.ResolveLink(req.Link, req.Notebook)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "link not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"path": path})
}
