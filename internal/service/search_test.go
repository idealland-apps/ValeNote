package service

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
	"unicode/utf8"

	"github.com/idealland-apps/valenote/internal/config"
)

func searchFixture(t testing.TB) *SearchService {
	t.Helper()
	cfg := &config.Config{}
	cfg.Notes.RootPath = t.TempDir()
	return NewSearchService(nil, cfg)
}
func putNote(t testing.TB, s *SearchService, path, text string) {
	t.Helper()
	full := filepath.Join(s.cfg.Notes.RootPath, filepath.FromSlash(path))
	if err := os.MkdirAll(filepath.Dir(full), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(full, []byte(text), 0644); err != nil {
		t.Fatal(err)
	}
}
func TestSearchReflectsFilesystemChanges(t *testing.T) {
	s := searchFixture(t)
	putNote(t, s, "book/old.md", "needle")
	if _, err := s.SearchFulltext("needle", "book", 20); err != nil {
		t.Fatal(err)
	}
	putNote(t, s, "book/old.md", "no longer matching")
	putNote(t, s, "book/new.md", "needle")
	got, err := s.SearchFulltext("needle", "book", 20)
	if err != nil || len(got) != 1 || got[0].Path != "book/new.md" {
		t.Fatalf("stale filesystem: %#v, %v", got, err)
	}
	if err := os.Remove(filepath.Join(s.cfg.Notes.RootPath, "book/new.md")); err != nil {
		t.Fatal(err)
	}
	got, err = s.SearchFulltext("needle", "book", 20)
	if err != nil || len(got) != 0 {
		t.Fatalf("deleted note retained: %#v, %v", got, err)
	}
}
func TestSearchScopesBeforeCaching(t *testing.T) {
	for _, tc := range []struct {
		name, notebook string
		allowed        []string
		want           []string
	}{
		{"nil", "", nil, []string{"a/a.md", "b/b.md", "x%_/c.md"}},
		{"deny", "", []string{}, nil},
		{"allow", "", []string{"b"}, []string{"b/b.md"}},
		{"intersection", "a", []string{"b"}, nil},
		{"literal", "x%_", nil, []string{"x%_/c.md"}},
		{"explicit", "a", nil, []string{"a/a.md"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s := searchFixture(t)
			for _, p := range []string{"a/a.md", "b/b.md", "x%_/c.md"} {
				putNote(t, s, p, "needle")
			}
			got, err := s.SearchContext(context.Background(), SearchOptions{Query: "needle", Notebook: tc.notebook, AllowedNotebooks: tc.allowed})
			if err != nil || len(got) != len(tc.want) {
				t.Fatalf("scope got %#v, %v; want %v", got, err, tc.want)
			}
			for i, p := range tc.want {
				if got[i].Path != p {
					t.Fatalf("got %s want %s", got[i].Path, p)
				}
			}
			if len(s.cache.entries) != len(tc.want) {
				t.Fatalf("cached outside scope: %v", s.cache.entries)
			}
		})
	}
}
func TestSearchRejectsUnsafeScopes(t *testing.T) {
	s := searchFixture(t)
	outside := t.TempDir()
	if err := os.WriteFile(filepath.Join(outside, "secret.md"), []byte("needle"), 0644); err != nil {
		t.Fatal(err)
	}
	putNote(t, s, "book/real.md", "needle")
	putNote(t, s, "book/attachments/hidden.md", "needle")
	if err := os.Symlink(outside, filepath.Join(s.cfg.Notes.RootPath, "link")); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(filepath.Join(outside, "secret.md"), filepath.Join(s.cfg.Notes.RootPath, "book/linked.md")); err != nil {
		t.Fatal(err)
	}
	for _, notebook := range []string{"", "book", "link", "link/deeper", "book/attachments"} {
		got, err := s.SearchContext(context.Background(), SearchOptions{Query: "needle", Notebook: notebook})
		if err != nil {
			t.Errorf("scope %q: %v", notebook, err)
			continue
		}
		want := 0
		if notebook == "" || notebook == "book" {
			want = 1
		}
		if len(got) != want {
			t.Errorf("unsafe scope %q: %#v", notebook, got)
		}
	}
	for _, notebook := range []string{"../", "/tmp", "book/../", "book/../../", ".", "book//sub"} {
		if _, err := s.SearchContext(context.Background(), SearchOptions{Query: "needle", Notebook: notebook}); err == nil {
			t.Errorf("accepted invalid scope %q", notebook)
		}
	}
	for _, allowed := range [][]string{{""}, {"."}, {"../"}, {"book/sub"}} {
		if _, err := s.SearchContext(context.Background(), SearchOptions{Query: "needle", AllowedNotebooks: allowed}); err == nil {
			t.Errorf("accepted invalid allowlist %q", allowed)
		}
	}
}
func TestSearchAllFieldsKeepsBodyRecall(t *testing.T) {
	s := searchFixture(t)
	putNote(t, s, "book/a.md", "---\ntitle: Other\ntags: [\"green\"]\n---\nneedle\nacross lines")
	putNote(t, s, "book/z-needle.md", "---\ntitle: Different\ntags: [\"green\"]\n---\nacross lines")
	got, err := s.Search("needle", "book", []string{"green"}, 20)
	if err != nil || len(got) != 2 || got[0].Path != "book/z-needle.md" {
		t.Fatalf("metadata priority/body recall: %#v, %v", got, err)
	}
	got, err = s.Search("needle across", "book", []string{"green"}, 20)
	if err != nil || len(got) != 2 {
		t.Fatalf("document AND across fields/lines: %#v, %v", got, err)
	}
	got, err = s.Search("needle", "book", []string{"gree"}, 20)
	if err != nil || len(got) != 0 {
		t.Fatalf("tag filters must be exact: %#v, %v", got, err)
	}
	got, err = s.SearchFulltext("needle", "book", 20)
	if err != nil || len(got) != 1 || got[0].Path != "book/a.md" {
		t.Fatalf("fulltext mode: %#v, %v", got, err)
	}
}
func TestSearchUnicodeSnippet(t *testing.T) {
	for _, prefix := range []string{strings.Repeat("İ", 200), strings.Repeat("世", 200), strings.Repeat("Ⱥ", 200)} {
		s := searchFixture(t)
		putNote(t, s, "book/unicode.md", prefix+"TARGET"+strings.Repeat("界", 100))
		got, err := s.SearchFulltext("target", "book", 20)
		if err != nil || len(got) != 1 {
			t.Fatalf("match: %#v, %v", got, err)
		}
		if !utf8.ValidString(got[0].Snippet) || !strings.Contains(got[0].Snippet, "TARGET") {
			t.Errorf("broken snippet: %q", got[0].Snippet)
		}
	}
}
func TestSearchWhitespaceAndLiteralAND(t *testing.T) {
	s := searchFixture(t)
	putNote(t, s, "book/a.md", "one.*\nTWO")
	got, err := s.SearchFulltext(" \t\n", "book", 20)
	if err != nil || len(got) != 0 {
		t.Fatalf("whitespace matched: %#v %v", got, err)
	}
	got, err = s.SearchFulltext("one.* two", "book", 20)
	if err != nil || len(got) != 1 {
		t.Fatalf("literal cross-line AND failed: %#v %v", got, err)
	}
	got, err = s.SearchFulltext("one.+", "book", 20)
	if err != nil || len(got) != 0 {
		t.Fatalf("regex unexpectedly enabled: %#v %v", got, err)
	}
}
func TestSearchInvalidationIsExactAndRecursive(t *testing.T) {
	s := searchFixture(t)
	for _, p := range []string{"book/a.md", "book/dir/b.md", "book/directory/c.md"} {
		putNote(t, s, p, "oldword")
	}
	if _, err := s.SearchFulltext("oldword", "book", 20); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(s.cfg.Notes.RootPath, "book/a.md")
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	putNote(t, s, "book/a.md", "newword")
	if err := os.Chtimes(path, info.ModTime(), info.ModTime()); err != nil {
		t.Fatal(err)
	}
	s.InvalidatePaths("book/a.md", "book/dir")
	if len(s.cache.entries) != 1 || s.cache.entries["book/directory/c.md"] == nil {
		t.Fatalf("invalidation scope: %v", s.cache.entries)
	}
	got, err := s.SearchFulltext("newword", "book", 20)
	if err != nil || len(got) != 1 {
		t.Fatalf("same-stat edit not visible: %#v, %v", got, err)
	}
}
func TestSearchAbsoluteExpiry(t *testing.T) {
	s := searchFixture(t)
	putNote(t, s, "book/a.md", "oldword")
	if _, err := s.SearchFulltext("oldword", "book", 20); err != nil {
		t.Fatal(err)
	}
	cached := s.cache.entries["book/a.md"]
	loaded := cached.loaded
	if _, err := s.SearchFulltext("oldword", "book", 20); err != nil {
		t.Fatal(err)
	}
	if !cached.loaded.Equal(loaded) {
		t.Fatal("read renewed TTL")
	}
	path := filepath.Join(s.cfg.Notes.RootPath, "book/a.md")
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	putNote(t, s, "book/a.md", "newword")
	if err := os.Chtimes(path, info.ModTime(), info.ModTime()); err != nil {
		t.Fatal(err)
	}
	cached.loaded = time.Now().Add(-cacheTTL - time.Second)
	got, err := s.SearchFulltext("newword", "book", 20)
	if err != nil || len(got) != 1 {
		t.Fatalf("absolute expiry failed: %#v, %v", got, err)
	}
}
func TestSearchInvalidationRejectsInflightPublication(t *testing.T) {
	s := searchFixture(t)
	putNote(t, s, "book/a.md", "oldword")
	started, release := make(chan struct{}), make(chan struct{})
	s.readFile = func(ctx context.Context, root *os.Root, path string, info os.FileInfo) ([]byte, error) {
		content, err := readSearchFile(ctx, root, path, info)
		close(started)
		<-release
		return content, err
	}
	done := make(chan error, 1)
	go func() { _, err := s.SearchFulltext("oldword", "book", 20); done <- err }()
	<-started
	s.InvalidatePaths("book/a.md")
	close(release)
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	if len(s.cache.entries) != 0 {
		t.Fatalf("invalidated in-flight load published: %v", s.cache.entries)
	}
}
func TestSearchCacheBudget(t *testing.T) {
	s := searchFixture(t)
	s.cache.budget = 2048
	for i := 0; i < 10; i++ {
		putNote(t, s, fmt.Sprintf("book/%02d.md", i), strings.Repeat("needle ", 60))
	}
	got, err := s.SearchFulltext("needle", "book", 20)
	if err != nil || len(got) != 10 {
		t.Fatalf("eviction lost results: %d %v", len(got), err)
	}
	// Original and folded bytes alone exceed this budget without eviction.
	var contentBytes int
	for _, note := range s.cache.entries {
		contentBytes += len(note.Content) + len(note.Folded)
	}
	if int64(contentBytes) > s.cache.budget {
		t.Fatalf("unbounded cache: content=%d budget=%d entries=%d", contentBytes, s.cache.budget, len(s.cache.entries))
	}
	if len(s.cache.entries) == 0 {
		t.Fatal("small notes should be cacheable")
	}
	putNote(t, s, "book/huge.md", strings.Repeat("needle ", 1000))
	if _, err := s.SearchFulltext("needle", "book", 20); err != nil {
		t.Fatal(err)
	}
	if s.cache.entries["book/huge.md"] != nil {
		t.Fatal("oversize note must not enter cache")
	}
}
func TestSearchCancellation(t *testing.T) {
	s := searchFixture(t)
	putNote(t, s, "book/a.md", "needle")
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	got, err := s.SearchContext(ctx, SearchOptions{Query: "needle"})
	if !errors.Is(err, context.Canceled) || got != nil || len(s.cache.entries) != 0 {
		t.Fatalf("cancellation ignored: %#v, %v", got, err)
	}
	ctx, cancel = context.WithCancel(context.Background())
	defer cancel()
	s.readFile = func(ctx context.Context, root *os.Root, path string, info os.FileInfo) ([]byte, error) {
		content, err := readSearchFile(ctx, root, path, info)
		cancel()
		return content, err
	}
	got, err = s.SearchContext(ctx, SearchOptions{Query: "needle"})
	if !errors.Is(err, context.Canceled) || got != nil || len(s.cache.entries) != 0 {
		t.Fatalf("mid-read cancellation ignored: %#v, %v", got, err)
	}
}
func TestSearchParallelReadsAreServiceBounded(t *testing.T) {
	s := searchFixture(t)
	for i := 0; i < 12; i++ {
		putNote(t, s, fmt.Sprintf("book/%02d.md", i), "needle")
	}
	started := make(chan struct{}, 1024)
	release := make(chan struct{})
	var active, maxActive atomic.Int32
	var callers sync.WaitGroup
	callers.Add(8)
	s.readFile = func(ctx context.Context, root *os.Root, path string, info os.FileInfo) ([]byte, error) {
		n := active.Add(1)
		for {
			old := maxActive.Load()
			if n <= old || maxActive.CompareAndSwap(old, n) {
				break
			}
		}
		started <- struct{}{}
		<-release
		defer active.Add(-1)
		return readSearchFile(ctx, root, path, info)
	}
	done := make(chan error, 10)
	go func() { _, err := s.SearchFulltext("needle", "book", 20); done <- err }()
	parallel := true
	for i := 0; i < 2; i++ {
		select {
		case <-started:
		case <-time.After(time.Second):
			parallel = false
		}
		if !parallel {
			break
		}
	}
	for i := 0; i < 8; i++ {
		go func() { callers.Done(); _, err := s.SearchFulltext("needle", "book", 20); done <- err }()
	}
	callers.Wait()
	// Let competing requests reach the reader barrier, not the filesystem.
	time.Sleep(30 * time.Millisecond)
	close(release)
	for i := 0; i < 9; i++ {
		if err := <-done; err != nil {
			t.Fatal(err)
		}
	}
	if !parallel {
		t.Error("a single query did not read files in parallel")
	}
	if maxActive.Load() > 4 {
		t.Errorf("service-wide concurrency exceeded 4: %d", maxActive.Load())
	}
}
func TestSearchDoesNotFollowFileReplacedBySymlink(t *testing.T) {
	s := searchFixture(t)
	putNote(t, s, "book/a.md", "needle")
	secret := filepath.Join(t.TempDir(), "secret.md")
	if err := os.WriteFile(secret, []byte("secret"), 0644); err != nil {
		t.Fatal(err)
	}
	read := s.readFile
	s.readFile = func(ctx context.Context, root *os.Root, path string, info os.FileInfo) ([]byte, error) {
		if err := os.Remove(filepath.Join(root.Name(), path)); err != nil {
			return nil, err
		}
		if err := os.Symlink(secret, filepath.Join(root.Name(), path)); err != nil {
			return nil, err
		}
		return read(ctx, root, path, info)
	}
	got, err := s.SearchFulltext("secret", "book", 20)
	if err == nil && len(got) != 0 {
		t.Fatalf("followed raced symlink outside root: %#v", got)
	}
	if len(s.cache.entries) != 0 {
		t.Fatal("cached raced symlink")
	}
}
func TestSearchIOErrorsVersusDisappearingFiles(t *testing.T) {
	s := searchFixture(t)
	putNote(t, s, "book/a.md", "needle")
	s.readFile = func(context.Context, *os.Root, string, os.FileInfo) ([]byte, error) { return nil, os.ErrPermission }
	got, err := s.SearchFulltext("needle", "book", 20)
	if !errors.Is(err, os.ErrPermission) || got != nil {
		t.Fatalf("I/O failure silently returned partial results: %#v %v", got, err)
	}
	s.readFile = func(context.Context, *os.Root, string, os.FileInfo) ([]byte, error) { return nil, os.ErrNotExist }
	got, err = s.SearchFulltext("needle", "book", 20)
	if err != nil || len(got) != 0 {
		t.Fatalf("concurrently removed file should be absent: %#v %v", got, err)
	}
	got, err = s.SearchFulltext("needle", "missing", 20)
	if err != nil || len(got) != 0 {
		t.Fatalf("missing root: %#v %v", got, err)
	}
}
func TestSearchResultsDoNotExposeMutableCache(t *testing.T) {
	s := searchFixture(t)
	putNote(t, s, "book/a.md", "---\ntags: [\"green\"]\n---\nneedle")
	got, err := s.Search("needle", "book", nil, 20)
	if err != nil || len(got) != 1 || len(got[0].Tags) != 1 {
		t.Fatalf("setup: %#v %v", got, err)
	}
	got[0].Tags[0] = "changed"
	got, err = s.Search("needle", "book", []string{"green"}, 20)
	if err != nil || len(got) != 1 || got[0].Tags[0] != "green" {
		t.Fatalf("caller mutated cache: %#v %v", got, err)
	}
}
func TestSearchDeterministicBoundedLimits(t *testing.T) {
	s := searchFixture(t)
	for i := 0; i < 130; i++ {
		putNote(t, s, fmt.Sprintf("book/%03d.md", i), "needle")
	}
	putNote(t, s, "private/first.md", "needle")
	for _, limit := range []int{0, -1, 1, 20, 100, 1000} {
		want := limit
		if want <= 0 {
			want = 20
		}
		if want > 100 {
			want = 100
		}
		for run := 0; run < 3; run++ {
			got, err := s.SearchContext(context.Background(), SearchOptions{Query: "needle", Limit: limit, AllowedNotebooks: []string{"book"}})
			if err != nil || len(got) != want {
				t.Fatalf("limit %d: count=%d err=%v", limit, len(got), err)
			}
			for i, result := range got {
				if result.Path != fmt.Sprintf("book/%03d.md", i) {
					t.Fatalf("nondeterministic order: %s at %d", result.Path, i)
				}
			}
		}
	}
	if s.cache.entries["private/first.md"] != nil {
		t.Fatal("unauthorized cache pollution")
	}
}
func TestSearchCancellationWhileWaitingForReadSlot(t *testing.T) {
	s := searchFixture(t)
	putNote(t, s, "book/a.md", "needle")
	for i := 0; i < cap(s.slots); i++ {
		s.slots <- struct{}{}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	got, err := s.SearchContext(ctx, SearchOptions{Query: "needle"})
	if !errors.Is(err, context.DeadlineExceeded) || got != nil {
		t.Fatalf("read-slot wait ignored deadline: %#v %v", got, err)
	}
	for i := 0; i < cap(s.slots); i++ {
		<-s.slots
	}
}
func TestSearchConcurrentInvalidation(t *testing.T) {
	s := searchFixture(t)
	for i := 0; i < 20; i++ {
		putNote(t, s, fmt.Sprintf("book/%02d.md", i), "needle")
	}
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 10; j++ {
				if _, err := s.SearchFulltext("needle", "book", 5); err != nil {
					t.Error(err)
					return
				}
				s.InvalidatePaths("book/01.md", "book/02.md")
			}
		}()
	}
	wg.Wait()
	if s.cache.bytes > s.cache.budget || s.cache.bytes < 0 {
		t.Fatalf("bad accounting: %d", s.cache.bytes)
	}
	var bytes int64
	for _, note := range s.cache.entries {
		bytes += note.cost
	}
	if bytes != s.cache.bytes || s.cache.order.Len() != len(s.cache.entries) {
		t.Fatal("cache accounting/list drift")
	}
}
func TestSearchServiceIsolation(t *testing.T) {
	a, b := searchFixture(t), searchFixture(t)
	putNote(t, a, "a/a.md", "only first")
	putNote(t, b, "b/b.md", "only second")
	if _, err := a.SearchFulltext("only", "", 20); err != nil {
		t.Fatal(err)
	}
	got, err := b.SearchFulltext("only", "", 20)
	if err != nil || len(got) != 1 || got[0].Path != "b/b.md" {
		t.Fatalf("cross-service leak: %#v, %v", got, err)
	}
}
