package handler

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"github.com/idealland-apps/valenote/internal/mcp"
	"github.com/idealland-apps/valenote/internal/service"
	"github.com/gin-gonic/gin"
)

type MCPHandler struct {
	server       *mcp.Server
	agentService *service.AgentService
}

func NewMCPHandler(server *mcp.Server, agentService *service.AgentService) *MCPHandler {
	return &MCPHandler{server: server, agentService: agentService}
}

func (h *MCPHandler) HandleMCP(c *gin.Context) {
	agentID, err := h.authenticateAgent(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}

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

	ctx := &mcp.RequestContext{AgentID: agentID}
	resp := h.server.HandleRequest(&req, ctx)
	c.JSON(http.StatusOK, resp)
}

func (h *MCPHandler) HandleSSE(c *gin.Context) {
	_, err := h.authenticateAgent(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")

	c.SSEvent("endpoint", "/mcp")
	c.Writer.Flush()
}

func (h *MCPHandler) authenticateAgent(c *gin.Context) (int64, error) {
	authHeader := c.GetHeader("Authorization")
	if authHeader == "" {
		return 0, &authError{"authorization header required"}
	}

	apiKey := strings.TrimPrefix(authHeader, "Bearer ")
	if apiKey == authHeader {
		return 0, &authError{"bearer token required"}
	}

	if !strings.HasPrefix(apiKey, "vn_sk_") {
		return 0, &authError{"invalid API key format"}
	}

	agent, err := h.agentService.ValidateAPIKey(apiKey)
	if err != nil {
		return 0, &authError{"invalid API key"}
	}

	return agent.ID, nil
}

type authError struct {
	msg string
}

func (e *authError) Error() string {
	return e.msg
}
