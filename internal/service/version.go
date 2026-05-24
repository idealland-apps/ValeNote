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
	ID        string    `json:"id"`
	NotePath  string    `json:"note_path"`
	Size      int64     `json:"size"`
	Checksum  string    `json:"checksum"`
	CreatedAt time.Time `json:"created_at"`
}

func (s *VersionService) getVersionDir(notePath string) string {
	dir := filepath.Dir(notePath)
	base := filepath.Base(notePath)
	base = strings.ReplaceAll(base, ".", "-")
	return filepath.Join(s.cfg.Notes.VersionsPath, dir, base)
}

func (s *VersionService) parseVersionFile(filename string) (time.Time, string, error) {
	base := strings.TrimSuffix(filename, ".md")
	parts := strings.Split(base, "-")
	if len(parts) < 3 {
		return time.Time{}, "", os.ErrInvalid
	}

	dateStr := parts[0] + "-" + parts[1]
	createdAt, err := time.ParseInLocation("20060102-150405", dateStr, time.Local)
	if err != nil {
		return time.Time{}, "", err
	}

	checksum := parts[2]
	return createdAt, checksum, nil
}

func (s *VersionService) ListVersions(notePath string, limit int) ([]Version, error) {
	if limit <= 0 {
		limit = 50
	}

	versionDir := s.getVersionDir(notePath)
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

		createdAt, checksum, err := s.parseVersionFile(entry.Name())
		if err != nil {
			continue
		}

		info, err := entry.Info()
		if err != nil {
			continue
		}

		versions = append(versions, Version{
			ID:        entry.Name(),
			NotePath:  notePath,
			Size:      info.Size(),
			Checksum:  checksum,
			CreatedAt: createdAt,
		})
	}

	sort.Slice(versions, func(i, j int) bool {
		return versions[i].CreatedAt.After(versions[j].CreatedAt)
	})

	if len(versions) > limit {
		versions = versions[:limit]
	}

	return versions, nil
}

func (s *VersionService) GetVersionContent(notePath, versionID string) (string, *Version, error) {
	versionDir := s.getVersionDir(notePath)
	versionFile := filepath.Join(versionDir, versionID)

	content, err := os.ReadFile(versionFile)
	if err != nil {
		return "", nil, err
	}

	info, err := os.Stat(versionFile)
	if err != nil {
		return "", nil, err
	}

	createdAt, checksum, _ := s.parseVersionFile(versionID)

	version := &Version{
		ID:        versionID,
		NotePath:  notePath,
		Size:      info.Size(),
		Checksum:  checksum,
		CreatedAt: createdAt,
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
		noteService.SaveVersion(notePath, currentContent, userID)
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
		createdAt time.Time
	}

	var versions []versionFile
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".md") {
			continue
		}
		createdAt, _, err := s.parseVersionFile(entry.Name())
		if err != nil {
			continue
		}
		versions = append(versions, versionFile{name: entry.Name(), createdAt: createdAt})
	}

	sort.Slice(versions, func(i, j int) bool {
		return versions[i].createdAt.After(versions[j].createdAt)
	})

	cutoffTime := time.Now().AddDate(0, 0, -retentionDays)

	for i, v := range versions {
		if i >= maxCount || v.createdAt.Before(cutoffTime) {
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
