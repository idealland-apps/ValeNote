package handler

import (
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/idealland-apps/valenote/internal/model"
	"gorm.io/gorm"
)

type SettingsHandler struct {
	db         *gorm.DB
	webDistPath string
}

func NewSettingsHandler(db *gorm.DB, webDistPath string) *SettingsHandler {
	return &SettingsHandler{db: db, webDistPath: webDistPath}
}

type SystemSettings struct {
	VersionRetentionDays int    `json:"version_retention_days"`
	VersionMaxCount      int    `json:"version_max_count"`
	SiteName             string `json:"site_name"`
	ShowPoweredBy        bool   `json:"show_powered_by"`
	Timezone             string `json:"timezone"`
}

func (h *SettingsHandler) GetSettings(c *gin.Context) {
	settings := SystemSettings{
		VersionRetentionDays: 30,
		VersionMaxCount:      100,
		SiteName:             "ValeNote",
		ShowPoweredBy:        true,
		Timezone:             "UTC",
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
	var s5 model.Setting
	if err := h.db.Where("key = ?", "timezone").First(&s5).Error; err == nil {
		settings.Timezone = s5.Value
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
	if req.Timezone == "" {
		req.Timezone = "UTC"
	}

	h.upsertSetting("version_retention_days", strconv.Itoa(req.VersionRetentionDays))
	h.upsertSetting("version_max_count", strconv.Itoa(req.VersionMaxCount))
	h.upsertSetting("site_name", req.SiteName)
	showPoweredBy := "false"
	if req.ShowPoweredBy {
		showPoweredBy = "true"
	}
	h.upsertSetting("show_powered_by", showPoweredBy)
	h.upsertSetting("timezone", req.Timezone)

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

func (h *SettingsHandler) UploadFavicon(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file is required"})
		return
	}

	if file.Size > 2*1024*1024 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file too large (max 2MB)"})
		return
	}

	src, err := file.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to open file"})
		return
	}
	defer src.Close()

	data, err := io.ReadAll(src)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read file"})
		return
	}

	mimeType := http.DetectContentType(data)

	// Check if it's already an SVG (DetectContentType returns text/xml for SVG)
	if len(data) > 5 && string(data[:5]) == "<?xml" || (len(data) > 4 && string(data[:4]) == "<svg") {
		// It's an SVG, save directly
		faviconPath := filepath.Join(h.webDistPath, "favicon.svg")
		if err := os.WriteFile(faviconPath, data, 0644); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save favicon"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "favicon updated"})
		return
	}

	// Check if it's a supported image type
	supportedTypes := map[string]bool{
		"image/png":  true,
		"image/jpeg": true,
		"image/gif":  true,
		"image/webp": true,
		"image/bmp":  true,
		"image/x-icon": true,
		"image/vnd.microsoft.icon": true,
	}
	if !supportedTypes[mimeType] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported image format"})
		return
	}

	// Convert to SVG with embedded base64 image
	b64 := base64.StdEncoding.EncodeToString(data)
	svg := fmt.Sprintf(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="32" height="32" viewBox="0 0 32 32">
  <image width="32" height="32" xlink:href="data:%s;base64,%s"/>
</svg>`, mimeType, b64)

	faviconPath := filepath.Join(h.webDistPath, "favicon.svg")
	if err := os.WriteFile(faviconPath, []byte(svg), 0644); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save favicon"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "favicon updated"})
}

type UserSettings struct {
	ThemeMode      string `json:"theme_mode"`
	PrimaryColor   string `json:"primary_color"`
	EditorFontSize int    `json:"editor_font_size"`
	SidebarWidth   int    `json:"sidebar_width"`
	SmartPasteLink bool   `json:"smart_paste_link"`
}

func (h *SettingsHandler) GetUserSettings(c *gin.Context) {
	userID := c.GetInt64("user_id")

	settings := UserSettings{
		ThemeMode:      "system",
		PrimaryColor:   "#1976d2",
		EditorFontSize: 14,
		SidebarWidth:   280,
		SmartPasteLink: true,
	}

	var userSettings []model.UserSetting
	h.db.Where("user_id = ?", userID).Find(&userSettings)

	for _, s := range userSettings {
		switch s.Key {
		case "theme_mode":
			settings.ThemeMode = s.Value
		case "primary_color":
			settings.PrimaryColor = s.Value
		case "editor_font_size":
			if v, err := strconv.Atoi(s.Value); err == nil {
				settings.EditorFontSize = v
			}
		case "sidebar_width":
			if v, err := strconv.Atoi(s.Value); err == nil {
				settings.SidebarWidth = v
			}
		case "smart_paste_link":
			settings.SmartPasteLink = s.Value == "true"
		}
	}

	c.JSON(http.StatusOK, settings)
}

func (h *SettingsHandler) UpdateUserSettings(c *gin.Context) {
	userID := c.GetInt64("user_id")

	var req UserSettings
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.ThemeMode == "" {
		req.ThemeMode = "system"
	}
	if req.PrimaryColor == "" {
		req.PrimaryColor = "#1976d2"
	}
	if req.EditorFontSize < 12 {
		req.EditorFontSize = 12
	}
	if req.EditorFontSize > 24 {
		req.EditorFontSize = 24
	}
	if req.SidebarWidth < 200 {
		req.SidebarWidth = 200
	}
	if req.SidebarWidth > 500 {
		req.SidebarWidth = 500
	}

	h.upsertUserSetting(userID, "theme_mode", req.ThemeMode)
	h.upsertUserSetting(userID, "primary_color", req.PrimaryColor)
	h.upsertUserSetting(userID, "editor_font_size", strconv.Itoa(req.EditorFontSize))
	h.upsertUserSetting(userID, "sidebar_width", strconv.Itoa(req.SidebarWidth))
	smartPasteLink := "false"
	if req.SmartPasteLink {
		smartPasteLink = "true"
	}
	h.upsertUserSetting(userID, "smart_paste_link", smartPasteLink)

	c.JSON(http.StatusOK, req)
}

func (h *SettingsHandler) upsertUserSetting(userID int64, key, value string) {
	var s model.UserSetting
	if err := h.db.Where("user_id = ? AND key = ?", userID, key).First(&s).Error; err != nil {
		h.db.Create(&model.UserSetting{UserID: userID, Key: key, Value: value})
	} else {
		h.db.Model(&s).Update("value", value)
	}
}
