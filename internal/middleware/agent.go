package middleware

import (
	"net/http"
	"strings"

	"github.com/idealland-apps/valenote/internal/service"
	"github.com/gin-gonic/gin"
)

func AgentAuthMiddleware(agentService *service.AgentService) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "authorization header required"})
			return
		}

		apiKey := strings.TrimPrefix(authHeader, "Bearer ")
		if apiKey == authHeader {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "bearer token required"})
			return
		}

		if !strings.HasPrefix(apiKey, "vn_sk_") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid API key format"})
			return
		}

		agent, err := agentService.ValidateAPIKey(apiKey)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid API key"})
			return
		}

		c.Set("agent_id", agent.ID)
		c.Set("agent_name", agent.Name)
		c.Set("is_agent", true)
		c.Next()
	}
}

func GetAgentID(c *gin.Context) int64 {
	if id, exists := c.Get("agent_id"); exists {
		return id.(int64)
	}
	return 0
}

func GetAgentName(c *gin.Context) string {
	if name, exists := c.Get("agent_name"); exists {
		return name.(string)
	}
	return ""
}

func IsAgent(c *gin.Context) bool {
	if isAgent, exists := c.Get("is_agent"); exists {
		return isAgent.(bool)
	}
	return false
}
