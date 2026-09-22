package service

import (
	"context"
	"fmt"
	"os"
	"sync/atomic"
	"testing"
)

func TestFulltextStopsReadingAfterLimit(t *testing.T) {
	s := searchFixture(t)
	for i := 0; i < 100; i++ {
		putNote(t, s, fmt.Sprintf("book/%03d.md", i), "commonword")
	}
	original := s.readFile
	var reads atomic.Int32
	s.readFile = func(ctx context.Context, root *os.Root, path string, info os.FileInfo) ([]byte, error) {
		reads.Add(1)
		return original(ctx, root, path, info)
	}
	got, err := s.SearchFulltext("commonword", "", 20)
	if err != nil || len(got) != 20 {
		t.Fatalf("results: %v %v", got, err)
	}
	if reads.Load() > 32 {
		t.Fatalf("read %d files for 20 first matches; expected only bounded lookahead", reads.Load())
	}
	for i, result := range got {
		if result.Path != fmt.Sprintf("book/%03d.md", i) {
			t.Fatalf("out-of-order prefix: %#v", got)
		}
	}
}

func TestFulltextLimitWaitsForEarlierInflightMatches(t *testing.T) {
	s := searchFixture(t)
	putNote(t, s, "a/first.md", "needle")
	putNote(t, s, "a-.md", "needle")
	original := s.readFile
	secondStarted := make(chan struct{})
	s.readFile = func(ctx context.Context, root *os.Root, path string, info os.FileInfo) ([]byte, error) {
		if path == "a/first.md" {
			<-secondStarted
		} else if path == "a-.md" {
			close(secondStarted)
		}
		return original(ctx, root, path, info)
	}
	got, err := s.SearchFulltext("needle", "", 1)
	if err != nil || len(got) != 1 || got[0].Path != "a/first.md" {
		t.Fatalf("must return the first directory-walk match, not first worker completion: %#v %v", got, err)
	}
}

func TestSearchLimitAcrossSortedAuthorizedRoots(t *testing.T) {
	s := searchFixture(t)
	putNote(t, s, "a/first.md", "# unrelated\nneedle")
	putNote(t, s, "b/private.md", "# needle\nprivate")
	putNote(t, s, "z/last.md", "# needle\nauthorized")
	opts := SearchOptions{Query: "needle", Limit: 1, AllowedNotebooks: []string{"z", "a", "z"}}
	got, err := s.SearchContext(context.Background(), opts)
	if err != nil || len(got) != 1 || got[0].Path != "z/last.md" {
		t.Fatalf("late authorized metadata lost or private hit leaked: %#v %v", got, err)
	}
	opts.FulltextOnly = true
	got, err = s.SearchContext(context.Background(), opts)
	if err != nil || len(got) != 1 || got[0].Path != "a/first.md" {
		t.Fatalf("multi-root prefix order changed: %#v %v", got, err)
	}
}

func TestCombinedSearchDoesNotStopBeforeMetadataMatches(t *testing.T) {
	s := searchFixture(t)
	for i := 0; i < 40; i++ {
		putNote(t, s, fmt.Sprintf("book/a%03d.md", i), "# unrelated\nneedle")
	}
	putNote(t, s, "book/z.md", "# needle\nbody")
	got, err := s.SearchContext(context.Background(), SearchOptions{Query: "needle", Limit: 1})
	if err != nil || len(got) != 1 || got[0].Path != "book/z.md" {
		t.Fatalf("late metadata hit lost: %#v %v", got, err)
	}
}
