package handler

import (
	"net/http"

	"github.com/idealland-apps/valenote/internal/service"
	"github.com/gin-gonic/gin"
)

type TagHandler struct {
	searchService *service.SearchService
}

func NewTagHandler(searchService *service.SearchService) *TagHandler {
	return &TagHandler{searchService: searchService}
}

func (h *TagHandler) ListTags(c *gin.Context) {
	tags, err := h.searchService.ListTags()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list tags"})
		return
	}

	c.JSON(http.StatusOK, tags)
}
