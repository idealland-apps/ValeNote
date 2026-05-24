package service

import (
	"bytes"
	"html/template"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/idealland-apps/valenote/internal/config"
	"github.com/idealland-apps/valenote/internal/model"
	"gorm.io/gorm"
)

var reservedPaths = map[string]bool{
	"api": true, "ws": true, "mcp": true, "auth": true,
	"app": true, "assets": true, "settings": true, "admin": true,
	"health": true, "login": true, "attachments": true,
}

func GetReservedPaths() []string {
	paths := make([]string, 0, len(reservedPaths))
	for p := range reservedPaths {
		paths = append(paths, p)
	}
	return paths
}

func validatePublicPath(path string) error {
	if strings.Contains(path, "..") {
		return ErrPathEscape
	}
	cleaned := filepath.Clean(path)
	if strings.HasPrefix(cleaned, "/") || strings.HasPrefix(cleaned, "\\") {
		return ErrPathEscape
	}
	if strings.Contains(cleaned, "..") {
		return ErrPathEscape
	}
	return nil
}

type PublicTreeItem struct {
	Path     string           `json:"path"`
	Name     string           `json:"name"`
	Type     string           `json:"type"`
	Children []PublicTreeItem `json:"children,omitempty"`
}

type PublicService struct {
	db          *gorm.DB
	cfg         *config.Config
	noteService *NoteService
}

func NewPublicService(db *gorm.DB, cfg *config.Config, noteService *NoteService) *PublicService {
	return &PublicService{
		db:          db,
		cfg:         cfg,
		noteService: noteService,
	}
}

func (s *PublicService) GetPublicBasePath() string {
	var setting model.Setting
	if err := s.db.Where("key = ?", "public_base_path").First(&setting).Error; err != nil {
		return "/public"
	}
	return setting.Value
}

func (s *PublicService) SetPublicBasePath(path string) error {
	if err := ValidatePublicBasePath(path); err != nil {
		return err
	}

	return s.db.Model(&model.Setting{}).
		Where("key = ?", "public_base_path").
		Update("value", path).Error
}

func ValidatePublicBasePath(path string) error {
	path = strings.Trim(path, "/")
	if path == "" {
		return ErrInvalidPath
	}
	if reservedPaths[path] {
		return ErrInvalidPath
	}
	if !regexp.MustCompile(`^[a-z0-9-]+$`).MatchString(path) {
		return ErrInvalidPath
	}
	return nil
}

func (s *PublicService) IsNotebookPublic(name string) bool {
	var notebook model.Notebook
	if err := s.db.Where("name = ? AND is_public = ?", name, true).First(&notebook).Error; err != nil {
		return false
	}
	return true
}

func (s *PublicService) SetNotebookPublic(name string, isPublic bool) error {
	return s.db.Model(&model.Notebook{}).
		Where("name = ?", name).
		Update("is_public", isPublic).Error
}

func (s *PublicService) GetPublicNotebooks() ([]model.Notebook, error) {
	var notebooks []model.Notebook
	err := s.db.Where("is_public = ?", true).Find(&notebooks).Error
	return notebooks, err
}

func (s *PublicService) GetPublicNote(notebookName, notePath string) (*Note, error) {
	if err := validatePublicPath(notebookName); err != nil {
		return nil, ErrNoteNotFound
	}
	if notePath != "" {
		if err := validatePublicPath(notePath); err != nil {
			return nil, ErrNoteNotFound
		}
	}

	if !s.IsNotebookPublic(notebookName) {
		return nil, ErrNoteNotFound
	}

	fullPath := notebookName
	if notePath != "" {
		fullPath = notebookName + "/" + notePath
	}

	note, err := s.noteService.GetNote(fullPath)
	if err != nil && !strings.HasSuffix(fullPath, ".md") {
		note, err = s.noteService.GetNote(fullPath + ".md")
	}
	return note, err
}

func (s *PublicService) ListPublicNotes(notebookName string) ([]Note, error) {
	if err := validatePublicPath(notebookName); err != nil {
		return nil, ErrNotebookNotFound
	}

	if !s.IsNotebookPublic(notebookName) {
		return nil, ErrNotebookNotFound
	}

	return s.noteService.ListNotes(notebookName, true)
}

func (s *PublicService) GetNotebookTree(notebookName string) (*PublicTreeItem, error) {
	if err := validatePublicPath(notebookName); err != nil {
		return nil, ErrNotebookNotFound
	}

	if !s.IsNotebookPublic(notebookName) {
		return nil, ErrNotebookNotFound
	}

	basePath := filepath.Join(s.cfg.Notes.RootPath, notebookName)
	root := &PublicTreeItem{
		Path:     notebookName,
		Name:     notebookName,
		Type:     "folder",
		Children: []PublicTreeItem{},
	}

	err := s.buildTree(basePath, notebookName, root)
	if err != nil {
		return nil, err
	}

	return root, nil
}

func (s *PublicService) buildTree(fsPath, relativePath string, parent *PublicTreeItem) error {
	entries, err := os.ReadDir(fsPath)
	if err != nil {
		return err
	}

	for _, entry := range entries {
		name := entry.Name()

		if entry.IsDir() && model.IsReservedFolderName(name) {
			continue
		}

		childRelPath := relativePath + "/" + name
		childFsPath := filepath.Join(fsPath, name)

		if entry.IsDir() {
			folder := PublicTreeItem{
				Path:     childRelPath,
				Name:     name,
				Type:     "folder",
				Children: []PublicTreeItem{},
			}
			s.buildTree(childFsPath, childRelPath, &folder)
			parent.Children = append(parent.Children, folder)
		} else if strings.HasSuffix(name, ".md") {
			file := PublicTreeItem{
				Path: childRelPath,
				Name: name,
				Type: "file",
			}
			parent.Children = append(parent.Children, file)
		}
	}

	return nil
}

func (s *PublicService) GetFolderNotes(notebookName, folderPath string) ([]Note, error) {
	if err := validatePublicPath(notebookName); err != nil {
		return nil, ErrNotebookNotFound
	}
	if folderPath != "" {
		if err := validatePublicPath(folderPath); err != nil {
			return nil, ErrNotebookNotFound
		}
	}

	if !s.IsNotebookPublic(notebookName) {
		return nil, ErrNotebookNotFound
	}

	fullPath := notebookName
	if folderPath != "" {
		fullPath = notebookName + "/" + folderPath
	}

	basePath := filepath.Join(s.cfg.Notes.RootPath, fullPath)
	entries, err := os.ReadDir(basePath)
	if err != nil {
		return nil, err
	}

	var notes []Note
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".md") {
			continue
		}

		notePath := fullPath + "/" + entry.Name()
		note, err := s.noteService.GetNote(notePath)
		if err != nil {
			continue
		}

		notes = append(notes, Note{
			Path:      note.Path,
			Title:     note.Title,
			Size:      note.Size,
			UpdatedAt: note.UpdatedAt,
		})
	}

	return notes, nil
}

func (s *PublicService) GetAttachmentPath(notebookName, attachmentPath string) (string, error) {
	if err := validatePublicPath(notebookName); err != nil {
		return "", ErrNotebookNotFound
	}
	if err := validatePublicPath(attachmentPath); err != nil {
		return "", ErrPathEscape
	}

	if !s.IsNotebookPublic(notebookName) {
		return "", ErrNotebookNotFound
	}

	attachmentPath = strings.TrimPrefix(attachmentPath, "/")
	cleaned := filepath.Clean(attachmentPath)
	if strings.Contains(cleaned, "..") {
		return "", ErrPathEscape
	}

	fullPath := filepath.Join(s.cfg.Notes.RootPath, notebookName, cleaned)
	if !strings.HasPrefix(fullPath, filepath.Join(s.cfg.Notes.RootPath, notebookName)) {
		return "", ErrPathEscape
	}

	if _, err := os.Stat(fullPath); os.IsNotExist(err) {
		return "", ErrNotFound
	}

	return fullPath, nil
}

func (s *PublicService) RenderNoteHTML(note *Note) (string, error) {
	html := markdownToHTML(note.Content)

	tmpl := template.Must(template.New("note").Parse(noteTemplate))
	var buf bytes.Buffer
	err := tmpl.Execute(&buf, map[string]interface{}{
		"Title":   note.Title,
		"Content": template.HTML(html),
		"Path":    note.Path,
	})
	if err != nil {
		return "", err
	}

	return buf.String(), nil
}

func markdownToHTML(md string) string {
	lines := strings.Split(md, "\n")
	var html strings.Builder
	inCodeBlock := false
	inList := false

	for _, line := range lines {
		if strings.HasPrefix(line, "```") {
			if inCodeBlock {
				html.WriteString("</code></pre>\n")
				inCodeBlock = false
			} else {
				html.WriteString("<pre><code>")
				inCodeBlock = true
			}
			continue
		}

		if inCodeBlock {
			html.WriteString(escapeHTML(line) + "\n")
			continue
		}

		if strings.HasPrefix(line, "# ") {
			html.WriteString("<h1>" + escapeHTML(line[2:]) + "</h1>\n")
		} else if strings.HasPrefix(line, "## ") {
			html.WriteString("<h2>" + escapeHTML(line[3:]) + "</h2>\n")
		} else if strings.HasPrefix(line, "### ") {
			html.WriteString("<h3>" + escapeHTML(line[4:]) + "</h3>\n")
		} else if strings.HasPrefix(line, "- ") || strings.HasPrefix(line, "* ") {
			if !inList {
				html.WriteString("<ul>\n")
				inList = true
			}
			html.WriteString("<li>" + escapeHTML(line[2:]) + "</li>\n")
		} else if strings.HasPrefix(line, "> ") {
			html.WriteString("<blockquote>" + escapeHTML(line[2:]) + "</blockquote>\n")
		} else if line == "" {
			if inList {
				html.WriteString("</ul>\n")
				inList = false
			}
			html.WriteString("\n")
		} else {
			if inList {
				html.WriteString("</ul>\n")
				inList = false
			}
			processedLine := processInlineMarkdown(line)
			html.WriteString("<p>" + processedLine + "</p>\n")
		}
	}

	if inList {
		html.WriteString("</ul>\n")
	}

	return html.String()
}

func processInlineMarkdown(line string) string {
	line = regexp.MustCompile(`\*\*(.+?)\*\*`).ReplaceAllString(line, "<strong>$1</strong>")
	line = regexp.MustCompile(`\*(.+?)\*`).ReplaceAllString(line, "<em>$1</em>")
	line = regexp.MustCompile("`(.+?)`").ReplaceAllString(line, "<code>$1</code>")
	line = regexp.MustCompile(`\[(.+?)\]\((.+?)\)`).ReplaceAllString(line, `<a href="$2">$1</a>`)
	return line
}

func escapeHTML(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	return s
}

const noteTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{.Title}} - ValeNote</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            line-height: 1.6;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            color: #333;
        }
        h1, h2, h3 { margin-top: 1.5em; margin-bottom: 0.5em; }
        h1 { font-size: 2em; border-bottom: 2px solid #eee; padding-bottom: 0.3em; }
        h2 { font-size: 1.5em; }
        h3 { font-size: 1.25em; }
        p { margin: 1em 0; }
        code { background: #f5f5f5; padding: 0.2em 0.4em; border-radius: 3px; font-size: 0.9em; }
        pre { background: #f5f5f5; padding: 1em; border-radius: 4px; overflow-x: auto; }
        pre code { background: none; padding: 0; }
        blockquote { border-left: 3px solid #ccc; padding-left: 1em; color: #666; margin: 1em 0; }
        a { color: #1976d2; }
        ul { padding-left: 1.5em; }
        li { margin: 0.5em 0; }
        footer { margin-top: 3em; padding-top: 1em; border-top: 1px solid #eee; color: #666; font-size: 0.9em; }
    </style>
</head>
<body>
    <article>
        {{.Content}}
    </article>
    <footer>
        Published via ValeNote
    </footer>
</body>
</html>`

type PublicSettings struct {
	SiteName      string `json:"site_name"`
	ShowPoweredBy bool   `json:"show_powered_by"`
}

func (s *PublicService) GetPublicSettings() PublicSettings {
	settings := PublicSettings{
		SiteName:      "ValeNote",
		ShowPoweredBy: true,
	}

	var siteName model.Setting
	if err := s.db.Where("key = ?", "site_name").First(&siteName).Error; err == nil {
		settings.SiteName = siteName.Value
	}

	var showPoweredBy model.Setting
	if err := s.db.Where("key = ?", "show_powered_by").First(&showPoweredBy).Error; err == nil {
		settings.ShowPoweredBy = showPoweredBy.Value == "true"
	}

	return settings
}

func (s *PublicService) SetShowPoweredBy(show bool) error {
	value := "false"
	if show {
		value = "true"
	}

	var setting model.Setting
	if err := s.db.Where("key = ?", "show_powered_by").First(&setting).Error; err != nil {
		return s.db.Create(&model.Setting{Key: "show_powered_by", Value: value}).Error
	}
	return s.db.Model(&setting).Update("value", value).Error
}
