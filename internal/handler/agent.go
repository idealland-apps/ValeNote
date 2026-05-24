package handler

import (
	"net/http"
	"strconv"

	"github.com/idealland-apps/valenote/internal/service"
	"github.com/gin-gonic/gin"
)

type AgentHandler struct {
	agentService *service.AgentService
}

func NewAgentHandler(agentService *service.AgentService) *AgentHandler {
	return &AgentHandler{agentService: agentService}
}

func (h *AgentHandler) ListAgents(c *gin.Context) {
	agents, err := h.agentService.ListAgents()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list agents"})
		return
	}
	c.JSON(http.StatusOK, agents)
}

func (h *AgentHandler) GetAgent(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid agent id"})
		return
	}

	agent, err := h.agentService.GetAgent(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "agent not found"})
		return
	}
	c.JSON(http.StatusOK, agent)
}

func (h *AgentHandler) CreateAgent(c *gin.Context) {
	var req struct {
		Name        string `json:"name" binding:"required"`
		Description string `json:"description"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	agent, apiKey, err := h.agentService.CreateAgent(req.Name, req.Description)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create agent"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"agent":   agent,
		"api_key": apiKey,
	})
}

func (h *AgentHandler) UpdateAgent(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid agent id"})
		return
	}

	var req struct {
		Name        string `json:"name" binding:"required"`
		Description string `json:"description"`
		Enabled     bool   `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.agentService.UpdateAgent(id, req.Name, req.Description, req.Enabled); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update agent"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "agent updated"})
}

func (h *AgentHandler) DeleteAgent(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid agent id"})
		return
	}

	if err := h.agentService.DeleteAgent(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete agent"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "agent deleted"})
}

func (h *AgentHandler) RegenerateAPIKey(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid agent id"})
		return
	}

	apiKey, err := h.agentService.RegenerateAPIKey(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to regenerate API key"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"api_key": apiKey})
}

func (h *AgentHandler) GetPermissions(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid agent id"})
		return
	}

	permissions, err := h.agentService.GetAgentPermissions(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get permissions"})
		return
	}

	c.JSON(http.StatusOK, permissions)
}

func (h *AgentHandler) SetPermissions(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid agent id"})
		return
	}

	var req struct {
		Permissions []service.AgentPermission `json:"permissions"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.agentService.SetAgentPermissions(id, req.Permissions); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to set permissions"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "permissions updated"})
}
