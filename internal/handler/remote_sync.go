package handler

import (
	"net/http"
	"strconv"

	"github.com/idealland-apps/valenote/internal/model"
	"github.com/idealland-apps/valenote/internal/service"
	"github.com/gin-gonic/gin"
)

type RemoteStorageRequest struct {
	ID                  int64  `json:"id"`
	Name                string `json:"name"`
	Type                string `json:"type"`
	Enabled             bool   `json:"enabled"`
	S3Endpoint          string `json:"s3_endpoint,omitempty"`
	S3Region            string `json:"s3_region,omitempty"`
	S3Bucket            string `json:"s3_bucket,omitempty"`
	S3AccessKey         string `json:"s3_access_key,omitempty"`
	S3SecretKey         string `json:"s3_secret_key,omitempty"`
	S3Prefix            string `json:"s3_prefix,omitempty"`
	WebDAVURL           string `json:"webdav_url,omitempty"`
	WebDAVUsername      string `json:"webdav_username,omitempty"`
	WebDAVPassword      string `json:"webdav_password,omitempty"`
	WebDAVPath          string `json:"webdav_path,omitempty"`
	SyncIntervalMinutes int    `json:"sync_interval_minutes"`
	DeleteRemote        bool   `json:"delete_remote"`
}

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
	var req RemoteStorageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	storage := &model.RemoteStorage{
		Name:                req.Name,
		Type:                req.Type,
		Enabled:             req.Enabled,
		S3Endpoint:          req.S3Endpoint,
		S3Region:            req.S3Region,
		S3Bucket:            req.S3Bucket,
		S3AccessKey:         req.S3AccessKey,
		S3SecretKey:         req.S3SecretKey,
		S3Prefix:            req.S3Prefix,
		WebDAVURL:           req.WebDAVURL,
		WebDAVUsername:      req.WebDAVUsername,
		WebDAVPassword:      req.WebDAVPassword,
		WebDAVPath:          req.WebDAVPath,
		SyncIntervalMinutes: req.SyncIntervalMinutes,
		DeleteRemote:        req.DeleteRemote,
	}

	if err := h.syncService.CreateStorage(storage); err != nil {
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

	var req RemoteStorageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updateReq := &service.StorageUpdateRequest{
		Name:                req.Name,
		Type:                req.Type,
		Enabled:             req.Enabled,
		S3Endpoint:          req.S3Endpoint,
		S3Region:            req.S3Region,
		S3Bucket:            req.S3Bucket,
		S3AccessKey:         req.S3AccessKey,
		S3SecretKey:         req.S3SecretKey,
		S3Prefix:            req.S3Prefix,
		WebDAVURL:           req.WebDAVURL,
		WebDAVUsername:      req.WebDAVUsername,
		WebDAVPassword:      req.WebDAVPassword,
		WebDAVPath:          req.WebDAVPath,
		SyncIntervalMinutes: req.SyncIntervalMinutes,
		DeleteRemote:        req.DeleteRemote,
	}

	if err := h.syncService.UpdateStorage(id, updateReq); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update storage"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "updated"})
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

func (h *RemoteSyncHandler) GetSyncHistory(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	history, err := h.syncService.GetSyncHistory(id, 20)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get history"})
		return
	}

	c.JSON(http.StatusOK, history)
}
