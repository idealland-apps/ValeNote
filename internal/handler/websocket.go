package handler

import (
	"net/http"

	"github.com/idealland-apps/valenote/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type WebSocketHandler struct {
	hub         *service.Hub
	authService *service.AuthService
}

func NewWebSocketHandler(hub *service.Hub, authService *service.AuthService) *WebSocketHandler {
	return &WebSocketHandler{
		hub:         hub,
		authService: authService,
	}
}

func (h *WebSocketHandler) HandleWebSocket(c *gin.Context) {
	token := c.Query("token")
	if token == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "token required"})
		return
	}

	claims, err := h.authService.ValidateToken(token)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
		return
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}

	client := &service.Client{
		ID:       uuid.New().String(),
		UserID:   claims.UserID,
		Username: claims.Username,
		Conn:     conn,
		Send:     make(chan []byte, 256),
		Hub:      h.hub,
	}

	h.hub.Register(client)

	go client.WritePump()
	go client.ReadPump()
}

func (h *WebSocketHandler) GetEditors(c *gin.Context) {
	notePath := c.Query("path")
	if notePath == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "path required"})
		return
	}

	editors := h.hub.GetEditorsForNote(notePath)
	c.JSON(http.StatusOK, gin.H{"editors": editors})
}
