package handler

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/idealland-apps/valenote/internal/mcp"
	"github.com/idealland-apps/valenote/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type sseSession struct {
	agentID   int64
	messages  chan *mcp.JSONRPCResponse
	createdAt time.Time
}

type MCPHandler struct {
	server       *mcp.Server
	agentService *service.AgentService
	sessions     map[string]*sseSession
	sessionsMu   sync.RWMutex
}

func NewMCPHandler(server *mcp.Server, agentService *service.AgentService) *MCPHandler {
	h := &MCPHandler{
		server:       server,
		agentService: agentService,
		sessions:     make(map[string]*sseSession),
	}
	go h.cleanupSessions()
	return h
}

func (h *MCPHandler) cleanupSessions() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		h.sessionsMu.Lock()
		for id, sess := range h.sessions {
			if time.Since(sess.createdAt) > 30*time.Minute {
				close(sess.messages)
				delete(h.sessions, id)
			}
		}
		h.sessionsMu.Unlock()
	}
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

	// Check if this is a legacy SSE session that expects responses via SSE stream
	// Session ID can be in header or query parameter
	sessionID := c.GetHeader("X-Session-Id")
	if sessionID == "" {
		sessionID = c.Query("sessionId")
	}
	if sessionID != "" {
		h.sessionsMu.RLock()
		sess, exists := h.sessions[sessionID]
		h.sessionsMu.RUnlock()
		if exists && sess.agentID == agentID {
			select {
			case sess.messages <- resp:
				c.Status(http.StatusAccepted)
				return
			default:
				// Channel full or closed, fall through to direct response
			}
		}
	}

	// Direct JSON response (Streamable HTTP transport or fallback)
	c.JSON(http.StatusOK, resp)
}

// HandleSSEPost returns 405 to signal that this endpoint doesn't support Streamable HTTP,
// so mcp-remote will fallback to legacy SSE transport
func (h *MCPHandler) HandleSSEPost(c *gin.Context) {
	c.Header("Allow", "GET")
	c.JSON(http.StatusMethodNotAllowed, gin.H{"error": "Use GET for SSE connection"})
}

func (h *MCPHandler) HandleSSE(c *gin.Context) {
	agentID, err := h.authenticateAgent(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}

	sessionID := uuid.New().String()
	sess := &sseSession{
		agentID:   agentID,
		messages:  make(chan *mcp.JSONRPCResponse, 100),
		createdAt: time.Now(),
	}

	h.sessionsMu.Lock()
	h.sessions[sessionID] = sess
	h.sessionsMu.Unlock()

	defer func() {
		h.sessionsMu.Lock()
		delete(h.sessions, sessionID)
		h.sessionsMu.Unlock()
		close(sess.messages)
	}()

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	scheme := "http"
	if c.Request.TLS != nil {
		scheme = "https"
	}
	endpointURL := fmt.Sprintf("%s://%s/mcp?sessionId=%s", scheme, c.Request.Host, sessionID)
	c.SSEvent("endpoint", endpointURL)
	c.Writer.Flush()

	ctx := c.Request.Context()
	keepalive := time.NewTicker(25 * time.Second)
	defer keepalive.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case msg, ok := <-sess.messages:
			if !ok {
				return
			}
			data, _ := json.Marshal(msg)
			c.SSEvent("message", string(data))
			c.Writer.Flush()
		case <-keepalive.C:
			// Send SSE comment as keepalive to prevent proxy timeouts
			fmt.Fprintf(c.Writer, ": keepalive\n\n")
			c.Writer.Flush()
		}
	}
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
