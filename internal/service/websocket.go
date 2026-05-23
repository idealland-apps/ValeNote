package service

import (
	"encoding/json"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type WSMessageType string

const (
	MsgNoteUpdated  WSMessageType = "note.updated"
	MsgNoteDeleted  WSMessageType = "note.deleted"
	MsgEditorJoined WSMessageType = "editor.joined"
	MsgEditorLeft   WSMessageType = "editor.left"
	MsgConflict     WSMessageType = "conflict"
	MsgPing         WSMessageType = "ping"
	MsgPong         WSMessageType = "pong"
)

type WSMessage struct {
	Type    WSMessageType `json:"type"`
	Payload interface{}   `json:"payload"`
}

type Client struct {
	ID        string
	UserID    int64
	Username  string
	Conn      *websocket.Conn
	Send      chan []byte
	Hub       *Hub
	NotePath  string // Currently editing note
	mu        sync.Mutex
}

type Hub struct {
	clients    map[*Client]bool
	register   chan *Client
	unregister chan *Client
	broadcast  chan *BroadcastMessage
	mu         sync.RWMutex
}

type BroadcastMessage struct {
	Message  []byte
	NotePath string // If set, only send to clients editing this note
	Exclude  *Client
}

func NewHub() *Hub {
	return &Hub{
		clients:    make(map[*Client]bool),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		broadcast:  make(chan *BroadcastMessage),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.Send)
			}
			h.mu.Unlock()

		case message := <-h.broadcast:
			h.mu.RLock()
			for client := range h.clients {
				if message.Exclude != nil && client == message.Exclude {
					continue
				}
				if message.NotePath != "" && client.NotePath != message.NotePath {
					continue
				}
				select {
				case client.Send <- message.Message:
				default:
					close(client.Send)
					delete(h.clients, client)
				}
			}
			h.mu.RUnlock()
		}
	}
}

func (h *Hub) Register(client *Client) {
	h.register <- client
}

func (h *Hub) BroadcastNoteUpdate(notePath string, updatedBy string, excludeClient *Client) {
	msg := WSMessage{
		Type: MsgNoteUpdated,
		Payload: map[string]interface{}{
			"path":       notePath,
			"updated_by": updatedBy,
			"updated_at": time.Now().Format(time.RFC3339),
		},
	}
	data, _ := json.Marshal(msg)
	h.broadcast <- &BroadcastMessage{
		Message:  data,
		NotePath: notePath,
		Exclude:  excludeClient,
	}
}

func (h *Hub) BroadcastNoteDeleted(notePath string, deletedBy string) {
	msg := WSMessage{
		Type: MsgNoteDeleted,
		Payload: map[string]interface{}{
			"path":       notePath,
			"deleted_by": deletedBy,
		},
	}
	data, _ := json.Marshal(msg)
	h.broadcast <- &BroadcastMessage{
		Message:  data,
		NotePath: notePath,
	}
}

func (h *Hub) BroadcastEditorJoined(notePath string, username string, excludeClient *Client) {
	msg := WSMessage{
		Type: MsgEditorJoined,
		Payload: map[string]interface{}{
			"path":     notePath,
			"username": username,
		},
	}
	data, _ := json.Marshal(msg)
	h.broadcast <- &BroadcastMessage{
		Message:  data,
		NotePath: notePath,
		Exclude:  excludeClient,
	}
}

func (h *Hub) BroadcastEditorLeft(notePath string, username string) {
	msg := WSMessage{
		Type: MsgEditorLeft,
		Payload: map[string]interface{}{
			"path":     notePath,
			"username": username,
		},
	}
	data, _ := json.Marshal(msg)
	h.broadcast <- &BroadcastMessage{
		Message:  data,
		NotePath: notePath,
	}
}

func (h *Hub) GetEditorsForNote(notePath string) []string {
	h.mu.RLock()
	defer h.mu.RUnlock()

	var editors []string
	for client := range h.clients {
		if client.NotePath == notePath {
			editors = append(editors, client.Username)
		}
	}
	return editors
}

func (c *Client) SetNotePath(path string) {
	c.mu.Lock()
	oldPath := c.NotePath
	c.NotePath = path
	c.mu.Unlock()

	if oldPath != "" && oldPath != path {
		c.Hub.BroadcastEditorLeft(oldPath, c.Username)
	}
	if path != "" {
		c.Hub.BroadcastEditorJoined(path, c.Username, c)
	}
}

func (c *Client) ReadPump() {
	defer func() {
		if c.NotePath != "" {
			c.Hub.BroadcastEditorLeft(c.NotePath, c.Username)
		}
		c.Hub.unregister <- c
		c.Conn.Close()
	}()

	c.Conn.SetReadLimit(512 * 1024)
	c.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.Conn.SetPongHandler(func(string) error {
		c.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			break
		}

		var msg WSMessage
		if err := json.Unmarshal(message, &msg); err != nil {
			continue
		}

		switch msg.Type {
		case MsgPing:
			pong := WSMessage{Type: MsgPong}
			data, _ := json.Marshal(pong)
			c.Send <- data

		case "editor.focus":
			if payload, ok := msg.Payload.(map[string]interface{}); ok {
				if path, ok := payload["path"].(string); ok {
					c.SetNotePath(path)
				}
			}

		case "editor.blur":
			if c.NotePath != "" {
				c.Hub.BroadcastEditorLeft(c.NotePath, c.Username)
				c.mu.Lock()
				c.NotePath = ""
				c.mu.Unlock()
			}
		}
	}
}

func (c *Client) WritePump() {
	ticker := time.NewTicker(30 * time.Second)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.Conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			n := len(c.Send)
			for i := 0; i < n; i++ {
				w.Write([]byte{'\n'})
				w.Write(<-c.Send)
			}

			if err := w.Close(); err != nil {
				return
			}

		case <-ticker.C:
			c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
