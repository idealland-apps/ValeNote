package handler

import (
	"net/http"
	"strconv"

	"github.com/idealland-apps/valenote/internal/model"
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
	VersionRetentionDays int    `json:"version_retention_days"`
	VersionMaxCount      int    `json:"version_max_count"`
	SiteName             string `json:"site_name"`
	ShowPoweredBy        bool   `json:"show_powered_by"`
}

func (h *SettingsHandler) GetSettings(c *gin.Context) {
	settings := SystemSettings{
		VersionRetentionDays: 30,
		VersionMaxCount:      100,
		SiteName:             "ValeNote",
		ShowPoweredBy:        true,
	}

	var s1 model.Setting
	if err := h.db.Where("key = ?", "version_retention_days").First(&s1).Error; err == nil {
		if v, err := strconv.Atoi(s1.Value); err == nil {
			settings.VersionRetentionDays = v
		}
	}
	var s2 model.Setting
	if err := h.db.Where("key = ?", "version_max_count").First(&s2).Error; err == nil {
		if v, err := strconv.Atoi(s2.Value); err == nil {
			settings.VersionMaxCount = v
		}
	}
	var s3 model.Setting
	if err := h.db.Where("key = ?", "site_name").First(&s3).Error; err == nil {
		settings.SiteName = s3.Value
	}
	var s4 model.Setting
	if err := h.db.Where("key = ?", "show_powered_by").First(&s4).Error; err == nil {
		settings.ShowPoweredBy = s4.Value == "true"
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
	if req.SiteName == "" {
		req.SiteName = "ValeNote"
	}

	h.upsertSetting("version_retention_days", strconv.Itoa(req.VersionRetentionDays))
	h.upsertSetting("version_max_count", strconv.Itoa(req.VersionMaxCount))
	h.upsertSetting("site_name", req.SiteName)
	showPoweredBy := "false"
	if req.ShowPoweredBy {
		showPoweredBy = "true"
	}
	h.upsertSetting("show_powered_by", showPoweredBy)

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

func (h *SettingsHandler) GetSiteName(c *gin.Context) {
	siteName := "ValeNote"
	var s model.Setting
	if err := h.db.Where("key = ?", "site_name").First(&s).Error; err == nil {
		siteName = s.Value
	}
	c.JSON(http.StatusOK, gin.H{"site_name": siteName})
}
