package service

import (
	"regexp"
	"strings"

	"github.com/idealland-apps/valenote/internal/model"
	"github.com/idealland-apps/valenote/internal/pathutil"
	"gorm.io/gorm"
)

var wikiLinkRegex = regexp.MustCompile(`\[\[([^\]]+)\]\]`)

type LinkService struct {
	db          *gorm.DB
	noteService *NoteService
}

func NewLinkService(db *gorm.DB, noteService *NoteService) *LinkService {
	return &LinkService{db: db, noteService: noteService}
}

type Link struct {
	From  string `json:"from"`
	To    string `json:"to"`
	Title string `json:"title,omitempty"`
}

type Backlink struct {
	Path    string `json:"path"`
	Title   string `json:"title"`
	Context string `json:"context,omitempty"`
}

func (s *LinkService) ExtractLinks(content string) []string {
	matches := wikiLinkRegex.FindAllStringSubmatch(content, -1)
	links := make([]string, 0, len(matches))
	seen := make(map[string]bool)

	for _, match := range matches {
		if len(match) > 1 {
			link := match[1]
			if parts := strings.Split(link, "|"); len(parts) > 0 {
				link = strings.TrimSpace(parts[0])
			}
			if !seen[link] {
				links = append(links, link)
				seen[link] = true
			}
		}
	}

	return links
}

func (s *LinkService) ResolveLink(linkText, currentNotebook string) (string, error) {
	linkText = strings.TrimSpace(linkText)

	if strings.Contains(linkText, "/") {
		path := linkText
		if !strings.HasSuffix(path, ".md") {
			path += ".md"
		}
		note, err := s.noteService.GetNote(path)
		if err == nil {
			return note.Path, nil
		}
	}

	if currentNotebook != "" {
		path := currentNotebook + "/" + linkText
		if !strings.HasSuffix(path, ".md") {
			path += ".md"
		}
		note, err := s.noteService.GetNote(path)
		if err == nil {
			return note.Path, nil
		}
	}

	var metadata model.NoteMetadata
	searchTerm := "%" + linkText + "%"
	err := s.db.Where("title LIKE ? OR path LIKE ?", searchTerm, searchTerm).First(&metadata).Error
	if err == nil {
		return metadata.Path, nil
	}

	return "", ErrNoteNotFound
}

func (s *LinkService) GetBacklinks(notePath string) ([]Backlink, error) {
	cleaned, err := pathutil.Clean(notePath)
	if err != nil {
		return nil, ErrInvalidPath
	}

	noteName := strings.TrimSuffix(strings.TrimSuffix(cleaned, ".md"), "/")
	parts := strings.Split(noteName, "/")
	shortName := parts[len(parts)-1]

	var allMetadata []model.NoteMetadata
	if err := s.db.Find(&allMetadata).Error; err != nil {
		return nil, err
	}

	var backlinks []Backlink

	for _, meta := range allMetadata {
		if meta.Path == cleaned {
			continue
		}

		note, err := s.noteService.GetNote(meta.Path)
		if err != nil {
			continue
		}

		links := s.ExtractLinks(note.Content)
		for _, link := range links {
			if link == shortName || link == noteName || link == cleaned {
				context := s.extractContext(note.Content, link)
				backlinks = append(backlinks, Backlink{
					Path:    meta.Path,
					Title:   meta.Title,
					Context: context,
				})
				break
			}
		}
	}

	return backlinks, nil
}

func (s *LinkService) extractContext(content, link string) string {
	pattern := `\[\[` + regexp.QuoteMeta(link) + `(\|[^\]]+)?\]\]`
	re := regexp.MustCompile(pattern)
	loc := re.FindStringIndex(content)
	if loc == nil {
		return ""
	}

	start := loc[0] - 50
	if start < 0 {
		start = 0
	}
	end := loc[1] + 50
	if end > len(content) {
		end = len(content)
	}

	context := content[start:end]
	context = strings.ReplaceAll(context, "\n", " ")

	if start > 0 {
		context = "..." + context
	}
	if end < len(content) {
		context = context + "..."
	}

	return context
}

func (s *LinkService) ProcessWikiLinks(content, currentNotebook string) string {
	return wikiLinkRegex.ReplaceAllStringFunc(content, func(match string) string {
		inner := match[2 : len(match)-2]

		displayText := inner
		linkTarget := inner
		if parts := strings.SplitN(inner, "|", 2); len(parts) == 2 {
			linkTarget = strings.TrimSpace(parts[0])
			displayText = strings.TrimSpace(parts[1])
		}

		resolvedPath, err := s.ResolveLink(linkTarget, currentNotebook)
		if err != nil {
			return `<span class="wiki-link broken">` + displayText + `</span>`
		}

		return `<a href="/notes/` + resolvedPath + `" class="wiki-link">` + displayText + `</a>`
	})
}
