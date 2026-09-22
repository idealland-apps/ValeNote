package service

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/idealland-apps/valenote/internal/config"
)

// This benchmark uses only the original public service API, so the identical file
// can be run against the base commit. Synthetic data, warm process + OS caches.
func BenchmarkSearchComparison(b *testing.B) {
	root := b.TempDir()
	body := []byte("# Example\nCOMMONMARKER\n" + strings.Repeat("MixedCase 文档 search corpus content.\n", 512))
	for i := 0; i < 1000; i++ {
		path := filepath.Join(root, fmt.Sprintf("book-%02d/%04d.md", i/100, i))
		if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
			b.Fatal(err)
		}
		if err := os.WriteFile(path, body, 0644); err != nil {
			b.Fatal(err)
		}
	}
	cfg := &config.Config{Notes: config.NotesConfig{RootPath: root}}
	s := NewSearchService(nil, cfg)
	if _, err := s.SearchFulltext("NOTPRESENT", "", 20); err != nil {
		b.Fatal(err)
	}
	for _, tc := range []struct{ name, query, scope string }{
		{"AllNoHit", "NOTPRESENT", ""},
		{"ScopedNoHit", "NOTPRESENT", "book-00"},
		{"AllCommonHit", "COMMONMARKER", ""},
	} {
		b.Run(tc.name, func(b *testing.B) {
			b.ReportAllocs()
			for i := 0; i < b.N; i++ {
				got, err := s.SearchFulltext(tc.query, tc.scope, 20)
				if err != nil {
					b.Fatal(err)
				}
				if tc.name == "AllCommonHit" && len(got) != 20 {
					b.Fatalf("want 20 hits, got %d", len(got))
				}
				if tc.name != "AllCommonHit" && len(got) != 0 {
					b.Fatalf("unexpected hits: %d", len(got))
				}
			}
		})
	}
}
