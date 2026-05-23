package handler

import (
	"net/http"
	"strconv"

	"github.com/anthropics/valenote/internal/model"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type SettingsHandler struct {
	db *gorm.DB
}

func NewSettingsHandler(db *gorm.DB) *SettingsHandler {
	return &SettingsHandler{db: db}
}

type SystemSettings struct {
	VersionRetentionDays  int `json:"version_retention_days"`
	VersionMaxCount       int `json:"version_max_count"`
}

func (h *SettingsHandler) GetSettings(c *gin.Context) {
	settings := SystemSettings{
		VersionRetentionDays:  30,
		VersionMaxCount:       100,
	}

	var s model.Setting
	if err := h.db.Where("key = ?", "version_retention_days").First(&s).Error; err == nil {
		if v, err := strconv.Atoi(s.Value); err == nil {
			settings.VersionRetentionDays = v
		}
	}
	if err := h.db.Where("key = ?", "version_max_count").First(&s).Error; err == nil {
		if v, err := strconv.Atoi(s.Value); err == nil {
			settings.VersionMaxCount = v
		}
	}

	c.JSON(http.StatusOK, settings)
}

func (h *SettingsHandler) UpdateSettings(c *gin.Context) {
	var req SystemSettings
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.VersionRetentionDays < 1 {
		req.VersionRetentionDays = 1
	}
	if req.VersionMaxCount < 1 {
		req.VersionMaxCount = 1
	}

	h.upsertSetting("version_retention_days", strconv.Itoa(req.VersionRetentionDays))
	h.upsertSetting("version_max_count", strconv.Itoa(req.VersionMaxCount))

	c.JSON(http.StatusOK, req)
}

func (h *SettingsHandler) upsertSetting(key, value string) {
	var s model.Setting
	if err := h.db.Where("key = ?", key).First(&s).Error; err != nil {
		h.db.Create(&model.Setting{Key: key, Value: value})
	} else {
		h.db.Model(&s).Update("value", value)
	}
}
