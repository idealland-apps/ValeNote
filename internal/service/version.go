package service

import (
	"os"
	"path/filepath"
	"sort"
	"time"

	"github.com/anthropics/valenote/internal/config"
	"github.com/anthropics/valenote/internal/model"
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
	ID        int64     `json:"id"`
	NotePath  string    `json:"note_path"`
	Size      int64     `json:"size"`
	Checksum  string    `json:"checksum"`
	CreatedBy *int64    `json:"created_by,omitempty"`
	Username  string    `json:"username,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

func (s *VersionService) ListVersions(notePath string, limit int) ([]Version, error) {
	if limit <= 0 {
		limit = 50
	}

	var versions []model.NoteVersion
	err := s.db.Where("note_path = ?", notePath).
		Order("created_at DESC").
		Limit(limit).
		Preload("User").
		Find(&versions).Error
	if err != nil {
		return nil, err
	}

	result := make([]Version, 0, len(versions))
	for _, v := range versions {
		ver := Version{
			ID:        v.ID,
			NotePath:  v.NotePath,
			Size:      v.Size,
			Checksum:  v.Checksum,
			CreatedBy: v.CreatedBy,
			CreatedAt: v.CreatedAt,
		}
		if v.User != nil {
			ver.Username = v.User.Username
		}
		result = append(result, ver)
	}

	return result, nil
}

func (s *VersionService) GetVersionContent(versionID int64) (string, *model.NoteVersion, error) {
	var version model.NoteVersion
	if err := s.db.First(&version, versionID).Error; err != nil {
		return "", nil, err
	}

	content, err := os.ReadFile(version.VersionFile)
	if err != nil {
		return "", nil, err
	}

	return string(content), &version, nil
}

func (s *VersionService) RestoreVersion(versionID int64, userID int64, noteService *NoteService) error {
	content, version, err := s.GetVersionContent(versionID)
	if err != nil {
		return err
	}

	currentPath := filepath.Join(s.cfg.Notes.RootPath, version.NotePath)
	currentContent, err := os.ReadFile(currentPath)
	if err != nil && !os.IsNotExist(err) {
		return err
	}

	if len(currentContent) > 0 {
		noteService.saveVersion(version.NotePath, currentContent, userID)
	}

	return os.WriteFile(currentPath, []byte(content), 0644)
}

func (s *VersionService) CleanupOldVersions(notePath string) error {
	var retentionDays int
	var maxCount int

	var daysSetting model.Setting
	if err := s.db.Where("key = ?", "version_retention_days").First(&daysSetting).Error; err == nil {
		retentionDays = 30
	}

	var countSetting model.Setting
	if err := s.db.Where("key = ?", "version_max_count").First(&countSetting).Error; err == nil {
		maxCount = 100
	}

	var versions []model.NoteVersion
	s.db.Where("note_path = ?", notePath).Order("created_at DESC").Find(&versions)

	if len(versions) <= maxCount {
		return nil
	}

	cutoffTime := time.Now().AddDate(0, 0, -retentionDays)
	toDelete := make([]model.NoteVersion, 0)

	for i, v := range versions {
		if i >= maxCount && v.CreatedAt.Before(cutoffTime) {
			toDelete = append(toDelete, v)
		}
	}

	for _, v := range toDelete {
		os.Remove(v.VersionFile)
		s.db.Delete(&v)
	}

	return nil
}

type DiffLine struct {
	Type    string `json:"type"` // added, removed, unchanged
	Content string `json:"content"`
	OldLine int    `json:"old_line,omitempty"`
	NewLine int    `json:"new_line,omitempty"`
}

func (s *VersionService) DiffVersion(versionID int64, noteService *NoteService) ([]DiffLine, error) {
	versionContent, version, err := s.GetVersionContent(versionID)
	if err != nil {
		return nil, err
	}

	note, err := noteService.GetNote(version.NotePath)
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

func init() {
	_ = sort.Search
}
