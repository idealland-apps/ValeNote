package handler

import (
	"encoding/json"
	"io"
	"net/http"

	"github.com/idealland-apps/valenote/internal/mcp"
	"github.com/gin-gonic/gin"
)

type MCPHandler struct {
	server *mcp.Server
}

func NewMCPHandler(server *mcp.Server) *MCPHandler {
	return &MCPHandler{server: server}
}

func (h *MCPHandler) HandleMCP(c *gin.Context) {
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "failed to read request body"})
		return
	}

	var req mcp.JSONRPCRequest
	if err := json.Unmarshal(body, &req); err != nil {
		c.JSON(http.StatusBadRequest, mcp.JSONRPCResponse{
			JSONRPC: "2.0",
			ID:      nil,
			Error: &mcp.JSONRPCError{
				Code:    -32700,
				Message: "Parse error",
			},
		})
		return
	}

	resp := h.server.HandleRequest(&req)
	c.JSON(http.StatusOK, resp)
}

func (h *MCPHandler) HandleSSE(c *gin.Context) {
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")

	c.SSEvent("endpoint", "/mcp")
	c.Writer.Flush()
}
