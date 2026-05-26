package service

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/idealland-apps/valenote/internal/config"
	"github.com/idealland-apps/valenote/internal/model"
	"gorm.io/gorm"
)

var (
	ErrNoteNotFound    = errors.New("note not found")
	ErrNotebookNotFound = errors.New("notebook not found")
	ErrInvalidPath     = errors.New("invalid path")
	ErrPathEscape      = errors.New("path escapes root directory")
)

type NoteService struct {
	db  *gorm.DB
	cfg *config.Config
}

func NewNoteService(db *gorm.DB, cfg *config.Config) *NoteService {
	return &NoteService{db: db, cfg: cfg}
}

type Note struct {
	Path      string    `json:"path"`
	Title     string    `json:"title"`
	Content   string    `json:"content,omitempty"`
	Tags      []string  `json:"tags,omitempty"`
	Size      int64     `json:"size"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type FileItem struct {
	Path      string    `json:"path"`
	Name      string    `json:"name"`
	Type      string    `json:"type"` // "file" or "folder"
	Size      int64     `json:"size,omitempty"`
	UpdatedAt time.Time `json:"updated_at,omitempty"`
}

type CreateNoteRequest struct {
	Path    string   `json:"path" binding:"required"`
	Title   string   `json:"title"`
	Content string   `json:"content"`
	Tags    []string `json:"tags,omitempty"`
}

type UpdateNoteRequest struct {
	Content string   `json:"content"`
	Title   string   `json:"title,omitempty"`
	Tags    []string `json:"tags,omitempty"`
	Append  bool     `json:"append,omitempty"`
}

func (s *NoteService) ValidatePath(userPath string) (string, error) {
	cleaned := filepath.Clean(userPath)
	if strings.Contains(cleaned, "..") {
		return "", ErrInvalidPath
	}

	absPath := filepath.Join(s.cfg.Notes.RootPath, cleaned)
	absRoot, _ := filepath.Abs(s.cfg.Notes.RootPath)
	absPath, _ = filepath.Abs(absPath)

	if !strings.HasPrefix(absPath, absRoot) {
		return "", ErrPathEscape
	}

	return cleaned, nil
}

func (s *NoteService) ListNotebooks() ([]model.Notebook, error) {
	var notebooks []model.Notebook
	if err := s.db.Find(&notebooks).Error; err != nil {
		return nil, err
	}
	return notebooks, nil
}

func (s *NoteService) CreateNotebook(name, description string) (*model.Notebook, error) {
	if err := os.MkdirAll(filepath.Join(s.cfg.Notes.RootPath, name), 0755); err != nil {
		return nil, err
	}

	notebook := &model.Notebook{
		Name:        name,
		Description: description,
	}

	if err := s.db.Create(notebook).Error; err != nil {
		return nil, err
	}

	return notebook, nil
}

func (s *NoteService) GetNotebook(name string) (*model.Notebook, error) {
	var notebook model.Notebook
	if err := s.db.Where("name = ?", name).First(&notebook).Error; err != nil {
		return nil, ErrNotebookNotFound
	}
	return &notebook, nil
}

func (s *NoteService) UpdateNotebook(name string, description *string, isPublic *bool) (*model.Notebook, error) {
	var notebook model.Notebook
	if err := s.db.Where("name = ?", name).First(&notebook).Error; err != nil {
		return nil, ErrNotebookNotFound
	}

	if description != nil {
		notebook.Description = *description
	}
	if isPublic != nil {
		notebook.IsPublic = *isPublic
	}

	if err := s.db.Save(&notebook).Error; err != nil {
		return nil, err
	}

	return &notebook, nil
}

func (s *NoteService) DeleteNotebook(name string) error {
	var notebook model.Notebook
	if err := s.db.Where("name = ?", name).First(&notebook).Error; err != nil {
		return ErrNotebookNotFound
	}

	notebookPath := filepath.Join(s.cfg.Notes.RootPath, name)
	entries, err := os.ReadDir(notebookPath)
	if err != nil && !os.IsNotExist(err) {
		return err
	}
	if len(entries) > 0 {
		return errors.New("notebook is not empty")
	}

	if err := os.RemoveAll(notebookPath); err != nil && !os.IsNotExist(err) {
		return err
	}

	return s.db.Delete(&notebook).Error
}

func (s *NoteService) ListNotes(notebook string, recursive bool) ([]Note, error) {
	basePath := s.cfg.Notes.RootPath
	if notebook != "" {
		basePath = filepath.Join(basePath, notebook)
	}

	var notes []Note
	err := filepath.Walk(basePath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}

		if info.IsDir() {
			if !recursive && path != basePath {
				return filepath.SkipDir
			}
			return nil
		}

		if !strings.HasSuffix(path, ".md") {
			return nil
		}

		relPath, _ := filepath.Rel(s.cfg.Notes.RootPath, path)
		note, err := s.getNoteMetadata(relPath, info)
		if err != nil {
			return nil
		}

		notes = append(notes, *note)
		return nil
	})

	return notes, err
}

func (s *NoteService) GetNote(path string) (*Note, error) {
	cleanPath, err := s.ValidatePath(path)
	if err != nil {
		return nil, err
	}

	if !strings.HasSuffix(cleanPath, ".md") {
		cleanPath += ".md"
	}

	fullPath := filepath.Join(s.cfg.Notes.RootPath, cleanPath)
	content, err := os.ReadFile(fullPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, ErrNoteNotFound
		}
		return nil, err
	}

	info, _ := os.Stat(fullPath)
	title, tags := parseFrontmatter(content)

	return &Note{
		Path:      cleanPath,
		Title:     title,
		Content:   string(content),
		Tags:      tags,
		Size:      info.Size(),
		UpdatedAt: info.ModTime(),
	}, nil
}

func (s *NoteService) CreateNote(req *CreateNoteRequest, userID int64) (*Note, error) {
	cleanPath, err := s.ValidatePath(req.Path)
	if err != nil {
		return nil, err
	}

	if !strings.HasSuffix(cleanPath, ".md") {
		cleanPath += ".md"
	}

	fullPath := filepath.Join(s.cfg.Notes.RootPath, cleanPath)

	if _, err := os.Stat(fullPath); err == nil {
		return nil, errors.New("note already exists")
	}

	if err := os.MkdirAll(filepath.Dir(fullPath), 0755); err != nil {
		return nil, err
	}

	content := s.buildNoteContent(req.Title, req.Content, req.Tags)

	if err := os.WriteFile(fullPath, []byte(content), 0644); err != nil {
		return nil, err
	}

	s.indexNote(cleanPath)
	InvalidateSearchCache()

	return s.GetNote(cleanPath)
}

func (s *NoteService) UpdateNote(path string, req *UpdateNoteRequest, userID int64) (*Note, error) {
	cleanPath, err := s.ValidatePath(path)
	if err != nil {
		return nil, err
	}

	if !strings.HasSuffix(cleanPath, ".md") {
		cleanPath += ".md"
	}

	fullPath := filepath.Join(s.cfg.Notes.RootPath, cleanPath)

	existingContent, err := os.ReadFile(fullPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, ErrNoteNotFound
		}
		return nil, err
	}

	s.SaveVersion(cleanPath, existingContent, userID)

	var newContent string
	if req.Append {
		newContent = string(existingContent) + "\n" + req.Content
	} else {
		newContent = req.Content
	}

	if err := os.WriteFile(fullPath, []byte(newContent), 0644); err != nil {
		return nil, err
	}

	s.indexNote(cleanPath)

	return s.GetNote(cleanPath)
}

func (s *NoteService) DeleteNote(path string) error {
	cleanPath, err := s.ValidatePath(path)
	if err != nil {
		return err
	}

	if !strings.HasSuffix(cleanPath, ".md") {
		cleanPath += ".md"
	}

	fullPath := filepath.Join(s.cfg.Notes.RootPath, cleanPath)

	if err := os.Remove(fullPath); err != nil {
		if os.IsNotExist(err) {
			return ErrNoteNotFound
		}
		return err
	}

	s.db.Where("path = ?", cleanPath).Delete(&model.NoteMetadata{})

	s.deleteAttachmentDir(cleanPath)

	InvalidateSearchCache()

	return nil
}

func (s *NoteService) Search(query, notebook string, tags []string, limit int) ([]Note, error) {
	var metadata []model.NoteMetadata

	tx := s.db.Model(&model.NoteMetadata{})

	if query != "" {
		tx = tx.Where("title LIKE ? OR path LIKE ?", "%"+query+"%", "%"+query+"%")
	}

	if notebook != "" {
		tx = tx.Where("path LIKE ?", notebook+"/%")
	}

	if len(tags) > 0 {
		for _, tag := range tags {
			tx = tx.Where("tags LIKE ?", "%\""+tag+"\"%")
		}
	}

	if limit > 0 {
		tx = tx.Limit(limit)
	}

	if err := tx.Find(&metadata).Error; err != nil {
		return nil, err
	}

	var notes []Note
	for _, m := range metadata {
		var tagList []string
		if m.Tags != "" {
			json.Unmarshal([]byte(m.Tags), &tagList)
		}
		notes = append(notes, Note{
			Path:      m.Path,
			Title:     m.Title,
			Tags:      tagList,
			Size:      m.Size,
			UpdatedAt: m.UpdatedAt,
		})
	}

	return notes, nil
}

func (s *NoteService) getNoteMetadata(path string, info os.FileInfo) (*Note, error) {
	fullPath := filepath.Join(s.cfg.Notes.RootPath, path)
	content, err := os.ReadFile(fullPath)
	if err != nil {
		return nil, err
	}

	title, tags := parseFrontmatter(content)
	if title == "" {
		title = extractTitleFromContent(content)
	}

	return &Note{
		Path:      path,
		Title:     title,
		Tags:      tags,
		Size:      info.Size(),
		UpdatedAt: info.ModTime(),
	}, nil
}

func (s *NoteService) indexNote(path string) error {
	fullPath := filepath.Join(s.cfg.Notes.RootPath, path)
	info, err := os.Stat(fullPath)
	if err != nil {
		return err
	}

	content, err := os.ReadFile(fullPath)
	if err != nil {
		return err
	}

	title, tags := parseFrontmatter(content)
	if title == "" {
		title = extractTitleFromContent(content)
	}

	checksum := sha256sum(content)
	tagsJSON, _ := json.Marshal(tags)

	notebook := strings.Split(path, string(os.PathSeparator))[0]
	var notebookModel model.Notebook
	s.db.Where("name = ?", notebook).First(&notebookModel)

	metadata := model.NoteMetadata{
		NotebookID: notebookModel.ID,
		Path:       path,
		Title:      title,
		Checksum:   checksum,
		Size:       info.Size(),
		Tags:       string(tagsJSON),
		FileMtime:  info.ModTime(),
		IndexedAt:  time.Now(),
	}

	return s.db.Where("path = ?", path).Assign(metadata).FirstOrCreate(&metadata).Error
}

func (s *NoteService) SaveVersion(path string, content []byte, userID int64) error {
	checksum := sha256sum(content)[:6]
	versionDir := s.getVersionDir(path)

	if err := os.MkdirAll(versionDir, 0755); err != nil {
		return err
	}

	versionFileName := filepath.Join(versionDir, time.Now().Format("20060102-150405")+"-"+checksum+".md")
	if err := os.WriteFile(versionFileName, content, 0644); err != nil {
		return err
	}

	s.cleanupOldVersions(path)
	return nil
}

func (s *NoteService) getVersionDir(notePath string) string {
	dir := filepath.Dir(notePath)
	base := filepath.Base(notePath)
	base = strings.ReplaceAll(base, ".", "-")
	return filepath.Join(s.cfg.Notes.VersionsPath, dir, base)
}

func (s *NoteService) moveVersionDir(oldPath, newPath string) error {
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

func (s *NoteService) moveVersionDirRecursive(oldBasePath, newBasePath string) error {
	oldVersionBase := filepath.Join(s.cfg.Notes.VersionsPath, oldBasePath)

	if _, err := os.Stat(oldVersionBase); os.IsNotExist(err) {
		return nil
	}

	newVersionBase := filepath.Join(s.cfg.Notes.VersionsPath, newBasePath)

	if err := os.MkdirAll(filepath.Dir(newVersionBase), 0755); err != nil {
		return err
	}

	return os.Rename(oldVersionBase, newVersionBase)
}

func (s *NoteService) getAttachmentDir(notePath string) string {
	dir := filepath.Dir(notePath)
	base := filepath.Base(notePath)
	base = strings.ReplaceAll(base, ".", "-")
	if dir == "." {
		return filepath.Join(s.cfg.Notes.RootPath, "attachments", base)
	}
	return filepath.Join(s.cfg.Notes.RootPath, dir, "attachments", base)
}

func (s *NoteService) moveAttachmentDir(oldPath, newPath string) error {
	oldAttachDir := s.getAttachmentDir(oldPath)
	newAttachDir := s.getAttachmentDir(newPath)

	if _, err := os.Stat(oldAttachDir); os.IsNotExist(err) {
		return nil
	}

	if err := os.MkdirAll(filepath.Dir(newAttachDir), 0755); err != nil {
		return err
	}

	return os.Rename(oldAttachDir, newAttachDir)
}

func (s *NoteService) moveAttachmentDirRecursive(oldBasePath, newBasePath string) error {
	oldDir := filepath.Dir(oldBasePath)
	newDir := filepath.Dir(newBasePath)
	oldBase := filepath.Base(oldBasePath)
	newBase := filepath.Base(newBasePath)

	var oldAttachBase, newAttachBase string
	if oldDir == "." {
		oldAttachBase = filepath.Join(s.cfg.Notes.RootPath, oldBase, "attachments")
		newAttachBase = filepath.Join(s.cfg.Notes.RootPath, newBase, "attachments")
	} else {
		oldAttachBase = filepath.Join(s.cfg.Notes.RootPath, oldDir, oldBase, "attachments")
		newAttachBase = filepath.Join(s.cfg.Notes.RootPath, newDir, newBase, "attachments")
	}

	if _, err := os.Stat(oldAttachBase); os.IsNotExist(err) {
		return nil
	}

	if err := os.MkdirAll(filepath.Dir(newAttachBase), 0755); err != nil {
		return err
	}

	return os.Rename(oldAttachBase, newAttachBase)
}

func (s *NoteService) deleteAttachmentDir(notePath string) {
	attachDir := s.getAttachmentDir(notePath)
	os.RemoveAll(attachDir)
}

func (s *NoteService) deleteAttachmentDirRecursive(folderPath string) {
	fullPath := filepath.Join(s.cfg.Notes.RootPath, folderPath)

	filepath.Walk(fullPath, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}
		if strings.HasSuffix(path, ".md") {
			relPath, _ := filepath.Rel(s.cfg.Notes.RootPath, path)
			s.deleteAttachmentDir(relPath)
		}
		return nil
	})
}

func (s *NoteService) cleanupOldVersions(notePath string) {
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
		return
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
		createdAt, err := s.parseVersionFilename(entry.Name())
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
}

func (s *NoteService) parseVersionFilename(filename string) (time.Time, error) {
	base := strings.TrimSuffix(filename, ".md")
	parts := strings.Split(base, "-")
	if len(parts) < 3 {
		return time.Time{}, os.ErrInvalid
	}
	dateStr := parts[0] + "-" + parts[1]
	return time.ParseInLocation("20060102-150405", dateStr, time.Local)
}

func (s *NoteService) buildNoteContent(title, content string, tags []string) string {
	var sb strings.Builder
	sb.WriteString("---\n")
	if title != "" {
		sb.WriteString("title: " + title + "\n")
	}
	if len(tags) > 0 {
		tagsJSON, _ := json.Marshal(tags)
		sb.WriteString("tags: " + string(tagsJSON) + "\n")
	}
	sb.WriteString("created: " + time.Now().Format("2006-01-02 15:04:05") + "\n")
	sb.WriteString("updated: " + time.Now().Format("2006-01-02 15:04:05") + "\n")
	sb.WriteString("---\n\n")
	if title != "" {
		sb.WriteString("# " + title + "\n\n")
	}
	sb.WriteString(content)
	return sb.String()
}

func parseFrontmatter(content []byte) (title string, tags []string) {
	lines := strings.Split(string(content), "\n")
	if len(lines) < 2 || lines[0] != "---" {
		return "", nil
	}

	inFrontmatter := true
	for i := 1; i < len(lines) && inFrontmatter; i++ {
		line := lines[i]
		if line == "---" {
			break
		}
		if strings.HasPrefix(line, "title:") {
			title = strings.TrimSpace(strings.TrimPrefix(line, "title:"))
		}
		if strings.HasPrefix(line, "tags:") {
			tagsStr := strings.TrimSpace(strings.TrimPrefix(line, "tags:"))
			json.Unmarshal([]byte(tagsStr), &tags)
		}
	}
	return
}

func extractTitleFromContent(content []byte) string {
	lines := strings.Split(string(content), "\n")
	re := regexp.MustCompile(`^#\s+(.+)$`)
	for _, line := range lines {
		if matches := re.FindStringSubmatch(line); len(matches) > 1 {
			return matches[1]
		}
	}
	return ""
}

func sha256sum(data []byte) string {
	hash := sha256.Sum256(data)
	return hex.EncodeToString(hash[:])
}

func (s *NoteService) CreateFolder(path string) error {
	cleanPath, err := s.ValidatePath(path)
	if err != nil {
		return err
	}

	parts := strings.Split(cleanPath, string(os.PathSeparator))
	if model.ContainsReservedFolder(parts) {
		return ErrInvalidPath
	}

	fullPath := filepath.Join(s.cfg.Notes.RootPath, cleanPath)
	return os.MkdirAll(fullPath, 0755)
}

func (s *NoteService) DeleteFolder(path string) error {
	cleanPath, err := s.ValidatePath(path)
	if err != nil {
		return err
	}

	fullPath := filepath.Join(s.cfg.Notes.RootPath, cleanPath)
	info, err := os.Stat(fullPath)
	if err != nil {
		if os.IsNotExist(err) {
			return ErrNoteNotFound
		}
		return err
	}

	if !info.IsDir() {
		return ErrInvalidPath
	}

	s.deleteAttachmentDirRecursive(cleanPath)

	if err := os.RemoveAll(fullPath); err != nil {
		return err
	}

	s.db.Where("path LIKE ?", cleanPath+"/%").Delete(&model.NoteMetadata{})

	return nil
}

func (s *NoteService) MoveFile(source, target string) error {
	sourcePath, err := s.ValidatePath(source)
	if err != nil {
		return err
	}
	targetPath, err := s.ValidatePath(target)
	if err != nil {
		return err
	}

	fullSource := filepath.Join(s.cfg.Notes.RootPath, sourcePath)
	fullTarget := filepath.Join(s.cfg.Notes.RootPath, targetPath)

	if _, err := os.Stat(fullSource); os.IsNotExist(err) {
		return ErrNoteNotFound
	}

	if err := os.MkdirAll(filepath.Dir(fullTarget), 0755); err != nil {
		return err
	}

	if err := os.Rename(fullSource, fullTarget); err != nil {
		return err
	}

	info, _ := os.Stat(fullTarget)
	if info != nil && !info.IsDir() {
		s.db.Model(&model.NoteMetadata{}).Where("path = ?", sourcePath).Update("path", targetPath)
		s.moveVersionDir(sourcePath, targetPath)
		s.moveAttachmentDir(sourcePath, targetPath)
	} else {
		s.db.Model(&model.NoteMetadata{}).Where("path LIKE ?", sourcePath+"/%").Updates(map[string]interface{}{
			"path": gorm.Expr("REPLACE(path, ?, ?)", sourcePath+"/", targetPath+"/"),
		})
		s.moveVersionDirRecursive(sourcePath, targetPath)
		s.moveAttachmentDirRecursive(sourcePath, targetPath)
	}

	return nil
}

func (s *NoteService) CopyFile(source, target string) error {
	sourcePath, err := s.ValidatePath(source)
	if err != nil {
		return err
	}
	targetPath, err := s.ValidatePath(target)
	if err != nil {
		return err
	}

	fullSource := filepath.Join(s.cfg.Notes.RootPath, sourcePath)
	fullTarget := filepath.Join(s.cfg.Notes.RootPath, targetPath)

	info, err := os.Stat(fullSource)
	if os.IsNotExist(err) {
		return ErrNoteNotFound
	}
	if err != nil {
		return err
	}

	if info.IsDir() {
		return s.copyDir(fullSource, fullTarget, sourcePath, targetPath)
	}

	return s.copyFileAndIndex(fullSource, fullTarget, targetPath)
}

func (s *NoteService) copyDir(src, dst, srcRelPath, dstRelPath string) error {
	if err := os.MkdirAll(dst, 0755); err != nil {
		return err
	}

	entries, err := os.ReadDir(src)
	if err != nil {
		return err
	}

	for _, entry := range entries {
		srcPath := filepath.Join(src, entry.Name())
		dstPath := filepath.Join(dst, entry.Name())
		srcRel := srcRelPath + "/" + entry.Name()
		dstRel := dstRelPath + "/" + entry.Name()

		if entry.IsDir() {
			if err := s.copyDir(srcPath, dstPath, srcRel, dstRel); err != nil {
				return err
			}
		} else {
			if err := s.copyFileAndIndex(srcPath, dstPath, dstRel); err != nil {
				return err
			}
		}
	}
	return nil
}

func (s *NoteService) copyFileAndIndex(src, dst, dstRelPath string) error {
	if err := os.MkdirAll(filepath.Dir(dst), 0755); err != nil {
		return err
	}

	content, err := os.ReadFile(src)
	if err != nil {
		return err
	}

	if err := os.WriteFile(dst, content, 0644); err != nil {
		return err
	}

	if strings.HasSuffix(dstRelPath, ".md") {
		s.indexNote(dstRelPath)
	}

	return nil
}

func (s *NoteService) ListFiles(notebook string, includeFolders bool) ([]FileItem, error) {
	basePath := s.cfg.Notes.RootPath
	if notebook != "" {
		basePath = filepath.Join(basePath, notebook)
	}

	// Sync root-level folders as notebooks
	if notebook == "" {
		s.syncNotebooks()
	}

	var items []FileItem
	err := filepath.Walk(basePath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}

		if path == basePath {
			return nil
		}

		relPath, _ := filepath.Rel(s.cfg.Notes.RootPath, path)

		if info.IsDir() {
			if includeFolders {
				items = append(items, FileItem{
					Path:      relPath,
					Name:      info.Name(),
					Type:      "folder",
					UpdatedAt: info.ModTime(),
				})
			}
		} else {
			items = append(items, FileItem{
				Path:      relPath,
				Name:      info.Name(),
				Type:      "file",
				Size:      info.Size(),
				UpdatedAt: info.ModTime(),
			})
		}

		return nil
	})

	return items, err
}

func (s *NoteService) syncNotebooks() {
	entries, err := os.ReadDir(s.cfg.Notes.RootPath)
	if err != nil {
		return
	}

	// Track existing notebooks in filesystem
	fsNotebooks := make(map[string]bool)

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		name := entry.Name()
		fsNotebooks[name] = true
		var existing model.Notebook
		if err := s.db.Where("name = ?", name).First(&existing).Error; err != nil {
			notebook := &model.Notebook{
				Name: name,
			}
			s.db.Create(notebook)
		}
	}

	// Remove notebooks from database that no longer exist in filesystem
	var dbNotebooks []model.Notebook
	s.db.Find(&dbNotebooks)
	for _, nb := range dbNotebooks {
		if !fsNotebooks[nb.Name] {
			s.db.Delete(&nb)
		}
	}
}

// SyncFromFilesystem performs a full sync from filesystem to database on startup.
// This ensures database metadata matches the actual filesystem state.
func (s *NoteService) SyncFromFilesystem() error {
	// Step 1: Sync notebooks (folders at root level)
	s.syncNotebooks()

	// Step 2: Scan all markdown files and build a set of existing paths
	existingPaths := make(map[string]bool)

	err := filepath.Walk(s.cfg.Notes.RootPath, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}

		if !strings.HasSuffix(path, ".md") {
			return nil
		}

		relPath, _ := filepath.Rel(s.cfg.Notes.RootPath, path)
		existingPaths[relPath] = true

		// Check if metadata needs update by comparing checksum
		content, err := os.ReadFile(path)
		if err != nil {
			return nil
		}

		currentChecksum := sha256sum(content)

		var metadata model.NoteMetadata
		if err := s.db.Where("path = ?", relPath).First(&metadata).Error; err != nil {
			// Not in database, index it
			s.indexNote(relPath)
		} else if metadata.Checksum != currentChecksum || metadata.FileMtime != info.ModTime() {
			// Checksum or mtime changed, re-index
			s.indexNote(relPath)
		}

		return nil
	})

	if err != nil {
		return err
	}

	// Step 3: Remove metadata entries for files that no longer exist
	var allMetadata []model.NoteMetadata
	s.db.Find(&allMetadata)

	for _, m := range allMetadata {
		if !existingPaths[m.Path] {
			s.db.Delete(&m)
		}
	}

	return nil
}
