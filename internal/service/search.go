package service

import (
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/idealland-apps/valenote/internal/config"
	"github.com/idealland-apps/valenote/internal/model"
	"gorm.io/gorm"
)

type cachedNote struct {
	Path    string
	Content string
	Title   string
	Tags    []string
}

type searchCache struct {
	notes     []cachedNote
	timestamp time.Time
	mu        sync.RWMutex
}

const cacheTTL = 5 * time.Minute

var globalSearchCache = &searchCache{}

func InvalidateSearchCache() {
	globalSearchCache.mu.Lock()
	defer globalSearchCache.mu.Unlock()
	globalSearchCache.notes = nil
	globalSearchCache.timestamp = time.Time{}
}

type SearchService struct {
	db  *gorm.DB
	cfg *config.Config
}

func NewSearchService(db *gorm.DB, cfg *config.Config) *SearchService {
	return &SearchService{db: db, cfg: cfg}
}

type SearchResult struct {
	Path      string   `json:"path"`
	Title     string   `json:"title"`
	Snippet   string   `json:"snippet,omitempty"`
	Tags      []string `json:"tags,omitempty"`
	Score     float64  `json:"score,omitempty"`
	Notebook  string   `json:"notebook"`
}

func (s *SearchService) Search(query, notebook string, tags []string, limit int) ([]SearchResult, error) {
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}

	var metadata []model.NoteMetadata
	tx := s.db.Model(&model.NoteMetadata{})

	if query != "" {
		searchTerms := strings.Fields(query)
		for _, term := range searchTerms {
			likePattern := "%" + term + "%"
			tx = tx.Where("title LIKE ? OR path LIKE ? OR tags LIKE ?", likePattern, likePattern, likePattern)
		}
	}

	if notebook != "" {
		tx = tx.Where("path LIKE ?", notebook+"/%")
	}

	if len(tags) > 0 {
		for _, tag := range tags {
			tx = tx.Where("tags LIKE ?", "%\""+tag+"\"%")
		}
	}

	tx = tx.Order("updated_at DESC").Limit(limit)

	if err := tx.Find(&metadata).Error; err != nil {
		return nil, err
	}

	results := make([]SearchResult, 0, len(metadata))
	for _, m := range metadata {
		parts := strings.SplitN(m.Path, "/", 2)
		notebookName := ""
		if len(parts) > 0 {
			notebookName = parts[0]
		}

		var tagList []string
		if m.Tags != "" && m.Tags != "null" {
			m.Tags = strings.Trim(m.Tags, "[]")
			if m.Tags != "" {
				for _, t := range strings.Split(m.Tags, ",") {
					t = strings.Trim(t, "\" ")
					if t != "" {
						tagList = append(tagList, t)
					}
				}
			}
		}

		results = append(results, SearchResult{
			Path:     m.Path,
			Title:    m.Title,
			Tags:     tagList,
			Notebook: notebookName,
		})
	}

	return results, nil
}

func (s *SearchService) SearchFulltext(query, notebook string, limit int) ([]SearchResult, error) {
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}

	if query == "" {
		return []SearchResult{}, nil
	}

	notes, err := s.getOrLoadCache()
	if err != nil {
		return nil, err
	}

	searchTerms := strings.Fields(strings.ToLower(query))
	results := make([]SearchResult, 0)

	for _, note := range notes {
		if notebook != "" && !strings.HasPrefix(note.Path, notebook+"/") {
			continue
		}

		if len(results) >= limit {
			break
		}

		contentLower := strings.ToLower(note.Content)
		allMatch := true
		firstMatchPos := -1

		for _, term := range searchTerms {
			pos := strings.Index(contentLower, term)
			if pos == -1 {
				allMatch = false
				break
			}
			if firstMatchPos == -1 || pos < firstMatchPos {
				firstMatchPos = pos
			}
		}

		if !allMatch {
			continue
		}

		parts := strings.SplitN(note.Path, "/", 2)
		notebookName := ""
		if len(parts) > 0 {
			notebookName = parts[0]
		}

		snippet := extractSnippet(note.Content, firstMatchPos, 100)

		results = append(results, SearchResult{
			Path:     note.Path,
			Title:    note.Title,
			Tags:     note.Tags,
			Notebook: notebookName,
			Snippet:  snippet,
		})
	}

	return results, nil
}

func (s *SearchService) getOrLoadCache() ([]cachedNote, error) {
	globalSearchCache.mu.RLock()
	if globalSearchCache.notes != nil && time.Since(globalSearchCache.timestamp) < cacheTTL {
		notes := globalSearchCache.notes
		globalSearchCache.mu.RUnlock()
		s.refreshCacheTimestamp()
		return notes, nil
	}
	globalSearchCache.mu.RUnlock()

	return s.loadCache()
}

func (s *SearchService) refreshCacheTimestamp() {
	globalSearchCache.mu.Lock()
	defer globalSearchCache.mu.Unlock()
	globalSearchCache.timestamp = time.Now()
}

func (s *SearchService) loadCache() ([]cachedNote, error) {
	globalSearchCache.mu.Lock()
	defer globalSearchCache.mu.Unlock()

	if globalSearchCache.notes != nil && time.Since(globalSearchCache.timestamp) < cacheTTL {
		return globalSearchCache.notes, nil
	}

	var notes []cachedNote

	err := filepath.Walk(s.cfg.Notes.RootPath, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() || !strings.HasSuffix(path, ".md") {
			return nil
		}

		content, err := os.ReadFile(path)
		if err != nil {
			return nil
		}

		relPath, _ := filepath.Rel(s.cfg.Notes.RootPath, path)
		title, tags := parseFrontmatter(content)
		if title == "" {
			title = extractTitleFromContent(content)
		}

		notes = append(notes, cachedNote{
			Path:    relPath,
			Content: string(content),
			Title:   title,
			Tags:    tags,
		})

		return nil
	})

	if err != nil {
		return nil, err
	}

	globalSearchCache.notes = notes
	globalSearchCache.timestamp = time.Now()

	return notes, nil
}

func extractSnippet(content string, pos, length int) string {
	start := pos - length/2
	if start < 0 {
		start = 0
	}

	end := start + length
	if end > len(content) {
		end = len(content)
	}

	snippet := content[start:end]
	snippet = strings.ReplaceAll(snippet, "\n", " ")
	snippet = strings.TrimSpace(snippet)

	if start > 0 {
		snippet = "..." + snippet
	}
	if end < len(content) {
		snippet = snippet + "..."
	}

	return snippet
}

type TagInfo struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}

func (s *SearchService) ListTags() ([]TagInfo, error) {
	var metadata []model.NoteMetadata
	if err := s.db.Select("tags").Where("tags IS NOT NULL AND tags != '' AND tags != 'null'").Find(&metadata).Error; err != nil {
		return nil, err
	}

	tagCounts := make(map[string]int)
	for _, m := range metadata {
		tags := strings.Trim(m.Tags, "[]")
		if tags == "" {
			continue
		}
		for _, t := range strings.Split(tags, ",") {
			t = strings.Trim(t, "\" ")
			if t != "" {
				tagCounts[t]++
			}
		}
	}

	result := make([]TagInfo, 0, len(tagCounts))
	for name, count := range tagCounts {
		result = append(result, TagInfo{Name: name, Count: count})
	}

	return result, nil
}
