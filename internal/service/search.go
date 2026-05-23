package service

import (
	"strings"

	"github.com/anthropics/valenote/internal/model"
	"gorm.io/gorm"
)

type SearchService struct {
	db *gorm.DB
}

func NewSearchService(db *gorm.DB) *SearchService {
	return &SearchService{db: db}
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
