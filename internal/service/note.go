package service

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/anthropics/valenote/internal/config"
	"github.com/anthropics/valenote/internal/model"
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

func (s *NoteService) CreateNotebook(name, displayName, description string) (*model.Notebook, error) {
	if err := os.MkdirAll(filepath.Join(s.cfg.Notes.RootPath, name), 0755); err != nil {
		return nil, err
	}

	notebook := &model.Notebook{
		Name:        name,
		DisplayName: displayName,
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

func (s *NoteService) UpdateNotebook(name string, displayName, description *string, isPublic *bool) (*model.Notebook, error) {
	var notebook model.Notebook
	if err := s.db.Where("name = ?", name).First(&notebook).Error; err != nil {
		return nil, ErrNotebookNotFound
	}

	if displayName != nil {
		notebook.DisplayName = *displayName
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

	s.saveVersion(cleanPath, existingContent, userID)

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

func (s *NoteService) saveVersion(path string, content []byte, userID int64) error {
	checksum := sha256sum(content)[:6]
	versionDir := filepath.Join(s.cfg.Notes.VersionsPath, filepath.Dir(path), strings.TrimSuffix(filepath.Base(path), ".md"))

	if err := os.MkdirAll(versionDir, 0755); err != nil {
		return err
	}

	versionFileName := filepath.Join(versionDir, time.Now().Format("20060102-150405")+"-"+checksum+".md")
	if err := os.WriteFile(versionFileName, content, 0644); err != nil {
		return err
	}

	version := model.NoteVersion{
		NotePath:    path,
		VersionFile: versionFileName,
		Size:        int64(len(content)),
		Checksum:    sha256sum(content),
		CreatedBy:   &userID,
	}

	return s.db.Create(&version).Error
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
	sb.WriteString("created: " + time.Now().Format(time.RFC3339) + "\n")
	sb.WriteString("updated: " + time.Now().Format(time.RFC3339) + "\n")
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
