package handler

import (
	"net/http"
	"strconv"

	"github.com/anthropics/valenote/internal/model"
	"github.com/anthropics/valenote/internal/service"
	"github.com/gin-gonic/gin"
)

type RemoteSyncHandler struct {
	syncService *service.RemoteSyncService
}

func NewRemoteSyncHandler(syncService *service.RemoteSyncService) *RemoteSyncHandler {
	return &RemoteSyncHandler{syncService: syncService}
}

func (h *RemoteSyncHandler) ListStorages(c *gin.Context) {
	storages, err := h.syncService.ListStorages()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list storages"})
		return
	}
	c.JSON(http.StatusOK, storages)
}

func (h *RemoteSyncHandler) CreateStorage(c *gin.Context) {
	var storage model.RemoteStorage
	if err := c.ShouldBindJSON(&storage); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.syncService.CreateStorage(&storage); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create storage"})
		return
	}

	c.JSON(http.StatusCreated, storage)
}

func (h *RemoteSyncHandler) UpdateStorage(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var storage model.RemoteStorage
	if err := c.ShouldBindJSON(&storage); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	storage.ID = id
	if err := h.syncService.UpdateStorage(&storage); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update storage"})
		return
	}

	c.JSON(http.StatusOK, storage)
}

func (h *RemoteSyncHandler) DeleteStorage(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	if err := h.syncService.DeleteStorage(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete storage"})
		return
	}

	c.JSON(http.StatusNoContent, nil)
}

func (h *RemoteSyncHandler) TestConnection(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	if err := h.syncService.TestConnection(id); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "connected"})
}

func (h *RemoteSyncHandler) TriggerSync(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	go h.syncService.Sync(id)

	c.JSON(http.StatusAccepted, gin.H{"status": "sync started"})
}
