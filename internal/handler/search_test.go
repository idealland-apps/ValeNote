package handler

import (
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/idealland-apps/valenote/internal/config"
	"github.com/idealland-apps/valenote/internal/mcp"
	"github.com/idealland-apps/valenote/internal/model"
	"github.com/idealland-apps/valenote/internal/service"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

type searchFixture struct {
	db     *gorm.DB
	cfg    *config.Config
	notes  *service.NoteService
	search *service.SearchService
	agents *service.AgentService
}

func newSearchFixture(t *testing.T) *searchFixture {
	t.Helper()
	root := t.TempDir()
	cfg := &config.Config{Notes: config.NotesConfig{RootPath: filepath.Join(root, "notes"), VersionsPath: filepath.Join(root, "versions")}}
	if err := os.MkdirAll(cfg.Notes.RootPath, 0755); err != nil {
		t.Fatal(err)
	}
	db, err := gorm.Open(sqlite.Open(filepath.Join(root, "test.db")), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })
	if err := db.AutoMigrate(&model.NoteMetadata{}, &model.Notebook{}, &model.Agent{}, &model.AgentNotebookPermission{}, &model.Setting{}); err != nil {
		t.Fatal(err)
	}
	notes := service.NewNoteService(db, cfg)
	search := service.NewSearchService(db, cfg)
	notes.SetSearchService(search)
	return &searchFixture{db: db, cfg: cfg, notes: notes, search: search, agents: service.NewAgentService(db)}
}

func (f *searchFixture) notebook(t *testing.T, name string, allowed bool) {
	t.Helper()
	nb, err := f.notes.CreateNotebook(name, "")
	if err != nil {
		t.Fatal(err)
	}
	if allowed {
		if err := f.db.Create(&model.AgentNotebookPermission{AgentID: 1, NotebookID: nb.ID, AccessLevel: "read"}).Error; err != nil {
			t.Fatal(err)
		}
	}
}
func (f *searchFixture) note(t *testing.T, path, title, body string) {
	t.Helper()
	if _, err := f.notes.CreateNote(&service.CreateNoteRequest{Path: path, Title: title, Content: body}, 0); err != nil {
		t.Fatal(err)
	}
}
func (f *searchFixture) query(t *testing.T, transport, query, notebook string) []service.SearchResult {
	t.Helper()
	if transport == "mcp" {
		args, _ := json.Marshal(map[string]interface{}{"query": query, "notebook": notebook})
		params, _ := json.Marshal(mcp.ToolCallParams{Name: "search_notes", Arguments: args})
		resp := mcp.NewServer(f.notes, f.search, f.agents).HandleRequest(&mcp.JSONRPCRequest{JSONRPC: "2.0", ID: 1, Method: "tools/call", Params: params}, &mcp.RequestContext{AgentID: 1})
		if resp.Error != nil {
			t.Fatal(resp.Error)
		}
		result := resp.Result.(mcp.ToolResult)
		if result.IsError {
			t.Fatal(result.Content)
		}
		var notes []service.SearchResult
		if err := json.Unmarshal([]byte(result.Content[0].Text), &notes); err != nil {
			t.Fatal(err)
		}
		return notes
	}
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(func(c *gin.Context) { c.Set("agent_id", int64(1)) })
	if transport == "rest" {
		router.GET("/search", NewAgentAPIHandler(f.notes, f.search, f.agents).SearchNotes)
	} else {
		h := NewNoteHandler(f.notes, f.search)
		if transport == "web-fulltext" {
			router.GET("/search", h.SearchFulltext)
		} else {
			router.GET("/search", h.SearchNotes)
		}
	}
	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest("GET", "/search?q="+url.QueryEscape(query)+"&notebook="+url.QueryEscape(notebook), nil))
	if w.Code != 200 {
		t.Fatalf("status %d: %s", w.Code, w.Body.String())
	}
	var notes []service.SearchResult
	if err := json.Unmarshal(w.Body.Bytes(), &notes); err != nil {
		t.Fatal(err)
	}
	return notes
}

func TestSearchReflectsUpdateWithUnchangedFileStamp(t *testing.T) {
	f := newSearchFixture(t)
	f.notebook(t, "book", true)
	f.note(t, "book/n.md", "title", "oldmarker")
	if got := f.query(t, "web-fulltext", "oldmarker", ""); len(got) != 1 {
		t.Fatal(got)
	}
	path := filepath.Join(f.cfg.Notes.RootPath, "book/n.md")
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := f.notes.UpdateNote("book/n.md", &service.UpdateNoteRequest{Content: strings.ReplaceAll(string(raw), "oldmarker", "newmarker")}, 0, 0); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(path, info.ModTime(), info.ModTime()); err != nil {
		t.Fatal(err)
	}
	if got := f.query(t, "web-fulltext", "newmarker", ""); len(got) != 1 {
		t.Fatalf("edit not visible: %#v", got)
	}
	if got := f.query(t, "web-fulltext", "oldmarker", ""); len(got) != 0 {
		t.Fatalf("stale content: %#v", got)
	}
}

func TestSearchVersionRestoreRefreshesCacheAndMetadata(t *testing.T) {
	f := newSearchFixture(t)
	f.notebook(t, "book", true)
	f.note(t, "book/n.md", "firsttitle", "restoremarker")
	original, err := os.ReadFile(filepath.Join(f.cfg.Notes.RootPath, "book/n.md"))
	if err != nil {
		t.Fatal(err)
	}
	if err := f.notes.SaveVersion("book/n.md", original, 0, 0); err != nil {
		t.Fatal(err)
	}
	versions := service.NewVersionService(f.db, f.cfg)
	entries, err := versions.ListVersions("book/n.md", 10)
	if err != nil || len(entries) == 0 {
		t.Fatalf("versions: %v %v", entries, err)
	}
	versionID := entries[0].ID
	if _, _, err := f.notes.UpdateNote("book/n.md", &service.UpdateNoteRequest{Content: "# secondtitle\nreplacementxx"}, 0, 0); err != nil {
		t.Fatal(err)
	}
	f.query(t, "web-fulltext", "replacementxx", "")
	if err := versions.RestoreVersion("book/n.md", versionID, 0, f.notes); err != nil {
		t.Fatal(err)
	}
	if got := f.query(t, "web-fulltext", "restoremarker", ""); len(got) != 1 {
		t.Fatalf("restored content missing: %#v", got)
	}
	var metadata model.NoteMetadata
	if err := f.db.Where("path = ?", "book/n.md").First(&metadata).Error; err != nil {
		t.Fatal(err)
	}
	if metadata.Title != "firsttitle" {
		t.Fatalf("restored metadata stale: %q", metadata.Title)
	}
}

func TestWebSearchPreservesNoteResponseFields(t *testing.T) {
	f := newSearchFixture(t)
	f.notebook(t, "book", true)
	f.note(t, "book/n.md", "needle", "body")
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/search", NewNoteHandler(f.notes, f.search).SearchNotes)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest("GET", "/search?q=needle", nil))
	var got []service.Note
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if w.Code != 200 || len(got) != 1 || got[0].Size <= 0 || got[0].UpdatedAt <= 0 || got[0].Content != "" {
		t.Fatalf("note response changed: %d %s", w.Code, w.Body.String())
	}
}

func TestMCPSearchRejectsMalformedArguments(t *testing.T) {
	f := newSearchFixture(t)
	params := json.RawMessage(`{"name":"search_notes","arguments":{"query":true}}`)
	resp := mcp.NewServer(f.notes, f.search, f.agents).HandleRequest(&mcp.JSONRPCRequest{JSONRPC: "2.0", ID: 1, Method: "tools/call", Params: params}, &mcp.RequestContext{AgentID: 1})
	if result := resp.Result.(mcp.ToolResult); !result.IsError {
		t.Fatalf("invalid query silently accepted: %#v", result)
	}
}

func TestAgentSearchNoPermissionsReturnsEmpty(t *testing.T) {
	for _, transport := range []string{"rest", "mcp"} {
		t.Run(transport, func(t *testing.T) {
			f := newSearchFixture(t)
			f.notebook(t, "book", false)
			f.note(t, "book/n.md", "needle", "needle")
			if got := f.query(t, transport, "needle", ""); len(got) != 0 {
				t.Fatalf("unauthorized results: %#v", got)
			}
		})
	}
}

func TestSearchReflectsFileAndFolderMutations(t *testing.T) {
	cases := []struct {
		name   string
		change func(*searchFixture) error
		want   []string
	}{
		{"move file", func(f *searchFixture) error { return f.notes.MoveFile("book/dir/n.md", "book/moved.md") }, []string{"book/moved.md"}},
		{"move folder", func(f *searchFixture) error { return f.notes.MoveFile("book/dir", "book/moved") }, []string{"book/moved/n.md"}},
		{"copy", func(f *searchFixture) error { return f.notes.CopyFile("book/dir/n.md", "book/copied.md") }, []string{"book/copied.md", "book/dir/n.md"}},
		{"delete note", func(f *searchFixture) error { return f.notes.DeleteNote("book/dir/n.md") }, nil},
		{"delete folder", func(f *searchFixture) error { return f.notes.DeleteFolder("book/dir") }, nil},
		{"rename notebook", func(f *searchFixture) error {
			name := "renamed"
			_, err := f.notes.UpdateNotebook("book", &name, nil, nil)
			return err
		}, []string{"renamed/dir/n.md"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := newSearchFixture(t)
			f.notebook(t, "book", true)
			f.note(t, "book/dir/n.md", "title", "mutationmarker")
			if got := f.query(t, "web-fulltext", "mutationmarker", ""); len(got) != 1 {
				t.Fatal(got)
			}
			if err := tc.change(f); err != nil {
				t.Fatal(err)
			}
			got := f.query(t, "web-fulltext", "mutationmarker", "")
			if len(got) != len(tc.want) {
				t.Fatalf("want %v got %#v", tc.want, got)
			}
			for i, path := range tc.want {
				if got[i].Path != path {
					t.Fatalf("want %v got %#v", tc.want, got)
				}
			}
		})
	}
}

func TestAgentSearchFiltersBeforeLimit(t *testing.T) {
	for _, transport := range []string{"rest", "mcp"} {
		t.Run(transport, func(t *testing.T) {
			f := newSearchFixture(t)
			f.notebook(t, "a_private", false)
			f.notebook(t, "z_allowed", true)
			f.note(t, "z_allowed/result.md", "needle", "needle in authorized document")
			// Private metadata is newer AND private content sorts before allowed content.
			for i := 0; i < 25; i++ {
				f.note(t, fmt.Sprintf("a_private/%02d.md", i), "needle", "needle in private document")
			}
			f.db.Model(&model.NoteMetadata{}).Where("path LIKE ?", "a_private/%").Update("updated_at", int64(9999999999999))
			got := f.query(t, transport, "needle", "")
			if len(got) != 1 || got[0].Path != "z_allowed/result.md" {
				t.Fatalf("authorized hit lost before limit: %#v", got)
			}
			if got[0].Snippet == "" {
				t.Fatal("combined result lost content snippet")
			}
		})
	}
}
