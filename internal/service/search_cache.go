package service

import (
	"container/list"
	"context"
	"fmt"
	"io"
	"os"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf8"
)

const cacheTTL = 5 * time.Minute

type cachedNote struct {
	Path, Content, Title string
	Folded, Metadata     string
	shifts               []foldShift
	Tags                 []string
	size                 int64
	modified             time.Time
	loaded               time.Time
	cost                 int64
	order                *list.Element
}

// Only length-changing case folds need an offset record; ordinary ASCII and
// Chinese text have no mapping allocation.
type foldShift struct{ at, delta int }

func foldText(text string) (string, []foldShift) {
	folded := strings.ToLower(text)
	var shifts []foldShift
	foldedPos, delta := 0, 0
	for _, r := range text {
		originalWidth, foldedWidth := utf8.RuneLen(r), utf8.RuneLen(unicode.ToLower(r))
		foldedPos += foldedWidth
		if originalWidth != foldedWidth {
			delta += originalWidth - foldedWidth
			shifts = append(shifts, foldShift{foldedPos, delta})
		}
	}
	return folded, shifts
}
func (n *cachedNote) originalPosition(pos int) int {
	i := sort.Search(len(n.shifts), func(i int) bool { return n.shifts[i].at > pos })
	if i > 0 {
		pos += n.shifts[i-1].delta
	}
	return pos
}

type searchCache struct {
	mu         sync.Mutex
	entries    map[string]*cachedNote
	generation uint64
	budget     int64
	bytes      int64
	order      list.List
}

// readSearchFile checks identity before and after opening, and uses os.Root
// traversal-resistant handles. No symlink (including an internal target) is a
// note. Chunked reads observe cancellation between filesystem reads.
func readSearchFile(ctx context.Context, root *os.Root, path string, expected os.FileInfo) ([]byte, error) {
	info, err := root.Lstat(path)
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() || !os.SameFile(info, expected) {
		return nil, fmt.Errorf("search file changed during scan: %s", path)
	}
	file, err := root.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	opened, err := file.Stat()
	if err != nil {
		return nil, err
	}
	if !opened.Mode().IsRegular() || !os.SameFile(info, opened) {
		return nil, fmt.Errorf("search file changed during open: %s", path)
	}
	return io.ReadAll(searchContextReader{ctx, file})
}

type searchContextReader struct {
	ctx    context.Context
	reader io.Reader
}

func (r searchContextReader) Read(p []byte) (int, error) {
	if err := r.ctx.Err(); err != nil {
		return 0, err
	}
	return r.reader.Read(p)
}

// FIFO eviction bounds retention without touching absolute load time on hits.
// Accounting conservatively includes string backing storage and per-entry/map/
// list/offset metadata, even when case folding happens to share string storage.
func (c *searchCache) remove(path string) {
	if note := c.entries[path]; note != nil {
		c.bytes -= note.cost
		c.order.Remove(note.order)
		delete(c.entries, path)
	}
}
func (s *SearchService) loadNote(ctx context.Context, root *os.Root, path, rel string, info os.FileInfo) (*cachedNote, error) {
	s.cache.mu.Lock()
	generation := s.cache.generation
	note := s.cache.entries[rel]
	if note != nil && note.size == info.Size() && note.modified.Equal(info.ModTime()) && time.Since(note.loaded) < cacheTTL {
		s.cache.mu.Unlock()
		return note, nil
	}
	s.cache.mu.Unlock()
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case s.slots <- struct{}{}:
	}
	defer func() { <-s.slots }()
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	content, err := s.readFile(ctx, root, path, info)
	if err != nil {
		return nil, err
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	title, tags := parseFrontmatter(content)
	if title == "" {
		title = extractTitleFromContent(content)
	}
	note = &cachedNote{Path: rel, Content: string(content), Title: strings.Clone(title), Tags: tags, size: info.Size(), modified: info.ModTime(), loaded: time.Now()}
	note.Folded, note.shifts = foldText(note.Content)
	note.Metadata = strings.ToLower(note.Path + "\x00" + note.Title + "\x00" + strings.Join(note.Tags, "\x00"))
	s.cache.mu.Lock()
	if s.cache.generation == generation {
		s.cache.remove(rel)
		note.cost = int64(512 + len(note.Path) + len(note.Content) + len(note.Folded) + len(note.Title) + len(note.Metadata) + cap(note.shifts)*16 + cap(note.Tags)*16)
		for _, tag := range note.Tags {
			note.cost += int64(len(tag))
		}
		if note.cost <= s.cache.budget {
			for s.cache.bytes+note.cost > s.cache.budget {
				s.cache.remove(s.cache.order.Front().Value.(string))
			}
			note.order = s.cache.order.PushBack(rel)
			s.cache.entries[rel] = note
			s.cache.bytes += note.cost
		}
	}
	s.cache.mu.Unlock()
	return note, nil
}
