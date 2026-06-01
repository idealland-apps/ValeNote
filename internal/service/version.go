package service

import (
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/idealland-apps/valenote/internal/config"
	"github.com/idealland-apps/valenote/internal/model"
	"github.com/idealland-apps/valenote/internal/pathutil"
	"gorm.io/gorm"
)

type VersionService struct {
	db  *gorm.DB
	cfg *config.Config
}

func NewVersionService(db *gorm.DB, cfg *config.Config) *VersionService {
	return &VersionService{db: db, cfg: cfg}
}

type Version struct {
	ID           string `json:"id"`
	NotePath     string `json:"note_path"`
	Size         int64  `json:"size"`
	Checksum     string `json:"checksum"`
	ModifierType string `json:"modifier_type,omitempty"` // "u" for user, "a" for agent, empty for legacy
	ModifierID   int64  `json:"modifier_id,omitempty"`
	ModifierName string `json:"modifier_name,omitempty"`
	CreatedAt    int64  `json:"created_at"`
}

func (s *VersionService) getVersionDir(notePath string) string {
	dir := filepath.Dir(notePath)
	base := filepath.Base(notePath)
	base = strings.ReplaceAll(base, ".", "-")
	return filepath.Join(s.cfg.Notes.VersionsPath, dir, base)
}

func (s *VersionService) parseVersionFile(filename string) (int64, string, string, int64, error) {
	base := strings.TrimSuffix(filename, ".md")
	parts := strings.Split(base, "-")
	if len(parts) < 2 {
		return 0, "", "", 0, os.ErrInvalid
	}

	createdAt, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return 0, "", "", 0, err
	}

	checksum := parts[1]

	// New format: {timestamp_ms}-{checksum}-{type}-{id}.md
	var modifierType string
	var modifierID int64
	if len(parts) == 4 {
		modifierType = parts[2]
		modifierID, _ = strconv.ParseInt(parts[3], 10, 64)
	}

	return createdAt, checksum, modifierType, modifierID, nil
}

func (s *VersionService) getModifierName(modifierType string, modifierID int64) string {
	if modifierType == "" || modifierID == 0 {
		return ""
	}
	if modifierType == "u" {
		var user model.User
		if err := s.db.Select("username").First(&user, modifierID).Error; err == nil {
			return user.Username
		}
	} else if modifierType == "a" {
		var agent model.Agent
		if err := s.db.Select("name").First(&agent, modifierID).Error; err == nil {
			return agent.Name
		}
	}
	return ""
}

func (s *VersionService) ListVersions(notePath string, limit int) ([]Version, error) {
	cleaned, err := pathutil.Clean(notePath)
	if err != nil {
		return nil, ErrInvalidPath
	}

	if limit <= 0 {
		limit = 50
	}

	versionDir := s.getVersionDir(cleaned)
	entries, err := os.ReadDir(versionDir)
	if err != nil {
		if os.IsNotExist(err) {
			return []Version{}, nil
		}
		return nil, err
	}

	var versions []Version
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".md") {
			continue
		}

		createdAt, checksum, modifierType, modifierID, err := s.parseVersionFile(entry.Name())
		if err != nil {
			continue
		}

		info, err := entry.Info()
		if err != nil {
			continue
		}

		versions = append(versions, Version{
			ID:           entry.Name(),
			NotePath:     notePath,
			Size:         info.Size(),
			Checksum:     checksum,
			ModifierType: modifierType,
			ModifierID:   modifierID,
			ModifierName: s.getModifierName(modifierType, modifierID),
			CreatedAt:    createdAt,
		})
	}

	sort.Slice(versions, func(i, j int) bool {
		return versions[i].CreatedAt > versions[j].CreatedAt
	})

	if len(versions) > limit {
		versions = versions[:limit]
	}

	return versions, nil
}

func (s *VersionService) GetVersionContent(notePath, versionID string) (string, *Version, error) {
	cleaned, err := pathutil.Clean(notePath)
	if err != nil {
		return "", nil, ErrInvalidPath
	}

	versionDir := s.getVersionDir(cleaned)
	versionFile := filepath.Join(versionDir, versionID)

	content, err := os.ReadFile(versionFile)
	if err != nil {
		return "", nil, err
	}

	info, err := os.Stat(versionFile)
	if err != nil {
		return "", nil, err
	}

	createdAt, checksum, modifierType, modifierID, _ := s.parseVersionFile(versionID)

	version := &Version{
		ID:           versionID,
		NotePath:     notePath,
		Size:         info.Size(),
		Checksum:     checksum,
		ModifierType: modifierType,
		ModifierID:   modifierID,
		ModifierName: s.getModifierName(modifierType, modifierID),
		CreatedAt:    createdAt,
	}

	return string(content), version, nil
}

func (s *VersionService) RestoreVersion(notePath, versionID string, userID int64, noteService *NoteService) error {
	content, _, err := s.GetVersionContent(notePath, versionID)
	if err != nil {
		return err
	}

	currentPath := filepath.Join(s.cfg.Notes.RootPath, notePath)
	currentContent, err := os.ReadFile(currentPath)
	if err != nil && !os.IsNotExist(err) {
		return err
	}

	if len(currentContent) > 0 {
		noteService.SaveVersion(notePath, currentContent, userID, 0)
	}

	return os.WriteFile(currentPath, []byte(content), 0644)
}

func (s *VersionService) CleanupOldVersions(notePath string) error {
	retentionDays := 30
	maxCount := 100

	var daysSetting model.Setting
	if err := s.db.Where("key = ?", "version_retention_days").First(&daysSetting).Error; err == nil {
		if v, err := strconv.Atoi(daysSetting.Value); err == nil {
			retentionDays = v
		}
	}

	var countSetting model.Setting
	if err := s.db.Where("key = ?", "version_max_count").First(&countSetting).Error; err == nil {
		if v, err := strconv.Atoi(countSetting.Value); err == nil {
			maxCount = v
		}
	}

	versionDir := s.getVersionDir(notePath)
	entries, err := os.ReadDir(versionDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	type versionFile struct {
		name      string
		createdAt int64
	}

	var versions []versionFile
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".md") {
			continue
		}
		createdAt, _, _, _, err := s.parseVersionFile(entry.Name())
		if err != nil {
			continue
		}
		versions = append(versions, versionFile{name: entry.Name(), createdAt: createdAt})
	}

	sort.Slice(versions, func(i, j int) bool {
		return versions[i].createdAt > versions[j].createdAt
	})

	cutoffTime := time.Now().AddDate(0, 0, -retentionDays).UnixMilli()

	for i, v := range versions {
		if i >= maxCount || v.createdAt < cutoffTime {
			os.Remove(filepath.Join(versionDir, v.name))
		}
	}

	remaining, _ := os.ReadDir(versionDir)
	if len(remaining) == 0 {
		os.Remove(versionDir)
	}

	return nil
}

func (s *VersionService) MoveVersionDir(oldPath, newPath string) error {
	oldVersionDir := s.getVersionDir(oldPath)
	newVersionDir := s.getVersionDir(newPath)

	if _, err := os.Stat(oldVersionDir); os.IsNotExist(err) {
		return nil
	}

	if err := os.MkdirAll(filepath.Dir(newVersionDir), 0755); err != nil {
		return err
	}

	return os.Rename(oldVersionDir, newVersionDir)
}

type DiffLine struct {
	Type    string `json:"type"`
	Content string `json:"content"`
	OldLine int    `json:"old_line,omitempty"`
	NewLine int    `json:"new_line,omitempty"`
}

func (s *VersionService) DiffVersion(notePath, versionID string, noteService *NoteService) ([]DiffLine, error) {
	versionContent, _, err := s.GetVersionContent(notePath, versionID)
	if err != nil {
		return nil, err
	}

	note, err := noteService.GetNote(notePath)
	if err != nil {
		return nil, err
	}

	return simpleDiff(versionContent, note.Content), nil
}

func simpleDiff(old, new string) []DiffLine {
	oldLines := splitLines(old)
	newLines := splitLines(new)

	var result []DiffLine
	maxLen := len(oldLines)
	if len(newLines) > maxLen {
		maxLen = len(newLines)
	}

	for i := 0; i < maxLen; i++ {
		var oldLine, newLine string
		if i < len(oldLines) {
			oldLine = oldLines[i]
		}
		if i < len(newLines) {
			newLine = newLines[i]
		}

		if oldLine == newLine {
			result = append(result, DiffLine{
				Type:    "unchanged",
				Content: newLine,
				OldLine: i + 1,
				NewLine: i + 1,
			})
		} else {
			if oldLine != "" {
				result = append(result, DiffLine{
					Type:    "removed",
					Content: oldLine,
					OldLine: i + 1,
				})
			}
			if newLine != "" {
				result = append(result, DiffLine{
					Type:    "added",
					Content: newLine,
					NewLine: i + 1,
				})
			}
		}
	}

	return result
}

func splitLines(s string) []string {
	if s == "" {
		return nil
	}
	lines := make([]string, 0)
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == '\n' {
			lines = append(lines, s[start:i])
			start = i + 1
		}
	}
	if start < len(s) {
		lines = append(lines, s[start:])
	}
	return lines
}
