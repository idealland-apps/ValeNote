package service

import (
	"context"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"unicode/utf8"

	"github.com/idealland-apps/valenote/internal/config"
	"github.com/idealland-apps/valenote/internal/model"
	"gorm.io/gorm"
)

type SearchService struct {
	db       *gorm.DB
	cfg      *config.Config
	cache    searchCache
	slots    chan struct{}
	readFile func(context.Context, *os.Root, string, os.FileInfo) ([]byte, error)
}

func NewSearchService(db *gorm.DB, cfg *config.Config) *SearchService {
	return &SearchService{db: db, cfg: cfg, readFile: readSearchFile, slots: make(chan struct{}, 4), cache: searchCache{budget: 64 << 20, entries: make(map[string]*cachedNote)}}
}
func (s *SearchService) InvalidatePaths(paths ...string) {
	s.cache.mu.Lock()
	defer s.cache.mu.Unlock()
	s.cache.generation++
	for _, path := range paths {
		path = filepath.ToSlash(filepath.Clean(path))
		for key := range s.cache.entries {
			if path == "." || key == path || strings.HasPrefix(key, path+"/") {
				s.cache.remove(key)
			}
		}
	}
}

type SearchOptions struct {
	Query            string
	Notebook         string
	Tags             []string
	Limit            int
	AllowedNotebooks []string
	FulltextOnly     bool
}
type SearchResult struct {
	Path     string   `json:"path"`
	Title    string   `json:"title"`
	Snippet  string   `json:"snippet,omitempty"`
	Tags     []string `json:"tags,omitempty"`
	Score    float64  `json:"score,omitempty"`
	Notebook string   `json:"notebook"`
}

func (s *SearchService) Search(query, notebook string, tags []string, limit int) ([]SearchResult, error) {
	return s.SearchContext(context.Background(), SearchOptions{Query: query, Notebook: notebook, Tags: tags, Limit: limit})
}
func (s *SearchService) SearchFulltext(query, notebook string, limit int) ([]SearchResult, error) {
	return s.SearchContext(context.Background(), SearchOptions{Query: query, Notebook: notebook, Limit: limit, FulltextOnly: true})
}
func (s *SearchService) SearchContext(ctx context.Context, opts SearchOptions) ([]SearchResult, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	limit := opts.Limit
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}
	results := make([]SearchResult, 0)
	if strings.TrimSpace(opts.Query) == "" && opts.FulltextOnly {
		return results, nil
	}
	terms := strings.Fields(strings.ToLower(opts.Query))
	roots, err := s.scopeRoots(opts)
	if err != nil {
		return nil, err
	}
	if len(roots) == 0 {
		return results, nil
	}
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	type fileJob struct {
		root      *os.Root
		path, rel string
		info      os.FileInfo
		order     uint64
	}
	var tasks sync.WaitGroup
	jobs := make(chan fileJob, 4)
	candidates := make([]searchCandidate, 0, limit)
	var mu sync.Mutex
	var firstErr error
	var nextOrder uint64
	enough := func() bool {
		mu.Lock()
		defer mu.Unlock()
		return len(candidates) == limit && (opts.FulltextOnly || candidates[limit-1].metadata)
	}
	fail := func(err error) {
		mu.Lock()
		if firstErr == nil {
			firstErr = err
		}
		mu.Unlock()
		cancel()
	}
	var workers sync.WaitGroup
	for i := 0; i < 4; i++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			for job := range jobs {
				func() {
					defer tasks.Done()
					if ctx.Err() != nil {
						return
					}
					note, err := s.loadNote(ctx, job.root, job.path, job.rel, job.info)
					if os.IsNotExist(err) {
						return
					}
					if err != nil {
						fail(err)
						return
					}
					candidate, ok := matchNote(note, terms, opts)
					if ok {
						candidate.order = job.order
						mu.Lock()
						candidates = keepCandidate(candidates, candidate, limit)
						mu.Unlock()
					}
				}()
			}
		}()
	}
	// Keep handles confined to the requested notebook/subtree, not merely the
	// corpus root. This also prevents races from redirecting reads into another
	// authorized or unauthorized notebook after enumeration.
	safe, err := s.safeScope(s.cfg.Notes.RootPath)
	if err != nil || !safe {
		close(jobs)
		workers.Wait()
		return results, err
	}
	base, err := os.OpenRoot(s.cfg.Notes.RootPath)
	if err != nil {
		close(jobs)
		workers.Wait()
		return nil, err
	}
	defer base.Close()
	for _, root := range roots {
		if ctx.Err() != nil || enough() {
			break
		}
		safe, err := s.safeScope(root)
		if err != nil {
			fail(err)
			break
		}
		if !safe {
			continue
		}
		scope, err := filepath.Rel(s.cfg.Notes.RootPath, root)
		if err != nil {
			fail(err)
			break
		}
		before, err := base.Lstat(scope)
		if os.IsNotExist(err) {
			continue
		}
		if err != nil {
			fail(err)
			break
		}
		scoped, err := base.OpenRoot(scope)
		if os.IsNotExist(err) {
			continue
		}
		if err != nil {
			fail(err)
			break
		}
		after, err := scoped.Stat(".")
		if err != nil || !os.SameFile(before, after) {
			scoped.Close()
			if err == nil {
				err = fmt.Errorf("search scope changed: %s", scope)
			}
			fail(err)
			break
		}
		err = fs.WalkDir(scoped.FS(), ".", func(path string, d os.DirEntry, err error) error {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			// All previously queued jobs form a prefix of the deterministic walk.
			// Drain that prefix before selecting results; later paths cannot beat
			// it once we have enough hits of the highest possible priority.
			if enough() {
				return fs.SkipAll
			}
			if os.IsNotExist(err) {
				return nil
			}
			if err != nil {
				return err
			}
			if d.Type()&os.ModeSymlink != 0 {
				return nil
			}
			if d.IsDir() {
				if d.Name() == "attachments" {
					return filepath.SkipDir
				}
				return nil
			}
			if !d.Type().IsRegular() || !strings.HasSuffix(path, ".md") {
				return nil
			}
			rel := filepath.Join(scope, filepath.FromSlash(path))
			info, err := d.Info()
			if os.IsNotExist(err) {
				return nil
			}
			if err != nil {
				return err
			}
			order := nextOrder
			nextOrder++
			tasks.Add(1)
			select {
			case <-ctx.Done():
				tasks.Done()
				return ctx.Err()
			case jobs <- fileJob{scoped, path, filepath.ToSlash(rel), info, order}:
				return nil
			}
		})
		tasks.Wait()
		scoped.Close()
		if err != nil {
			fail(err)
			break
		}
	}
	close(jobs)
	workers.Wait()
	if firstErr != nil {
		return nil, firstErr
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	for _, candidate := range candidates {
		candidate.result.Tags = append([]string(nil), candidate.result.Tags...)
		results = append(results, candidate.result)
	}
	return results, nil
}

type searchCandidate struct {
	result   SearchResult
	metadata bool
	order    uint64
	note     *cachedNote
	position int
}

func keepCandidate(best []searchCandidate, candidate searchCandidate, limit int) []searchCandidate {
	i := sort.Search(len(best), func(i int) bool {
		if candidate.metadata != best[i].metadata {
			return candidate.metadata
		}
		return candidate.order < best[i].order
	})
	if i >= limit {
		return best
	}
	// Generate a small snippet only for admitted candidates, not every hit.
	candidate.result.Snippet = extractSnippet(candidate.note.Content, candidate.note.originalPosition(candidate.position), 100)
	candidate.note = nil
	if len(best) < limit {
		best = append(best, searchCandidate{})
	}
	copy(best[i+1:], best[i:len(best)-1])
	best[i] = candidate
	return best
}
func matchNote(note *cachedNote, terms []string, opts SearchOptions) (searchCandidate, bool) {
	for _, wanted := range opts.Tags {
		found := false
		for _, tag := range note.Tags {
			if strings.EqualFold(wanted, tag) {
				found = true
				break
			}
		}
		if !found {
			return searchCandidate{}, false
		}
	}
	pos := -1
	metadata := !opts.FulltextOnly
	for _, term := range terms {
		p := strings.Index(note.Folded, term)
		meta := !opts.FulltextOnly && strings.Contains(note.Metadata, term)
		if p < 0 && !meta {
			return searchCandidate{}, false
		}
		metadata = metadata && meta
		if p >= 0 && (pos < 0 || p < pos) {
			pos = p
		}
	}
	return searchCandidate{metadata: metadata, note: note, position: pos, result: SearchResult{Path: note.Path, Title: note.Title, Tags: note.Tags, Notebook: strings.SplitN(note.Path, "/", 2)[0]}}, true
}

// Notebook scopes are literal, slash-separated relative paths. Allowlists contain
// top-level notebook names, never glob/SQL patterns or paths.
func (s *SearchService) scopeRoots(opts SearchOptions) ([]string, error) {
	if opts.Notebook != "" && (!fs.ValidPath(opts.Notebook) || opts.Notebook == "." || strings.Contains(opts.Notebook, "\\")) {
		return nil, fmt.Errorf("invalid notebook scope %q", opts.Notebook)
	}
	for _, name := range opts.AllowedNotebooks {
		if !fs.ValidPath(name) || name == "." || strings.ContainsAny(name, "/\\") {
			return nil, fmt.Errorf("invalid allowed notebook %q", name)
		}
	}
	if opts.Notebook != "" {
		if opts.AllowedNotebooks != nil {
			allowed := false
			for _, name := range opts.AllowedNotebooks {
				if strings.SplitN(opts.Notebook, "/", 2)[0] == name {
					allowed = true
					break
				}
			}
			if !allowed {
				return nil, nil
			}
		}
		return []string{filepath.Join(s.cfg.Notes.RootPath, opts.Notebook)}, nil
	}
	if opts.AllowedNotebooks == nil {
		return []string{s.cfg.Notes.RootPath}, nil
	}
	names := append([]string(nil), opts.AllowedNotebooks...)
	sort.Strings(names)
	roots := make([]string, 0, len(names))
	for i, name := range names {
		if i > 0 && name == names[i-1] {
			continue
		}
		roots = append(roots, filepath.Join(s.cfg.Notes.RootPath, name))
	}
	return roots, nil
}

func (s *SearchService) safeScope(path string) (bool, error) {
	rel, err := filepath.Rel(s.cfg.Notes.RootPath, path)
	if err != nil {
		return false, err
	}
	current := s.cfg.Notes.RootPath
	parts := []string{""}
	if rel != "." {
		parts = append(parts, strings.Split(rel, string(filepath.Separator))...)
	}
	for _, part := range parts {
		if part == "attachments" {
			return false, nil
		}
		current = filepath.Join(current, part)
		info, err := os.Lstat(current)
		if os.IsNotExist(err) {
			return false, nil
		}
		if err != nil {
			return false, err
		}
		if info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
			return false, nil
		}
	}
	return true, nil
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

	for start > 0 && !utf8.RuneStart(content[start]) {
		start--
	}
	for end < len(content) && !utf8.RuneStart(content[end]) {
		end++
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
