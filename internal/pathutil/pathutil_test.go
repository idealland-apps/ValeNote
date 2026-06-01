package pathutil

import "testing"

func TestClean(t *testing.T) {
	tests := []struct {
		input   string
		want    string
		wantErr bool
	}{
		// Valid paths
		{"work/projects/note.md", "work/projects/note.md", false},
		{"work/projects", "work/projects", false},
		{"work", "work", false},
		{"work//projects/note.md", "work/projects/note.md", false},
		{"", "", false},

		// Leading slashes should be stripped (from URL path params)
		{"/test/install/hahaha/gissl.md", "test/install/hahaha/gissl.md", false},
		{"/work/note.md", "work/note.md", false},
		{"///work/note.md", "work/note.md", false},
		{"/", "", false},

		// Invalid paths - direct traversal
		{"../secret/note.md", "", true},
		{"../../etc/passwd", "", true},

		// Invalid paths - traversal after clean
		{"work/../secret/note.md", "secret/note.md", false}, // cleans to valid path
		{"work/../../etc/passwd", "", true},                 // cleans to ../etc/passwd

		// Leading slash + traversal
		{"/../etc/passwd", "", true},
		{"/work/../secret", "secret", false},
	}

	for _, tt := range tests {
		got, err := Clean(tt.input)
		if (err != nil) != tt.wantErr {
			t.Errorf("Clean(%q) error = %v, wantErr %v", tt.input, err, tt.wantErr)
			continue
		}
		if !tt.wantErr && got != tt.want {
			t.Errorf("Clean(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestExtractNotebook(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"work/projects/note.md", "work"},
		{"work/projects", "work"},
		{"work", "work"},
		{"", ""},
		{".", ""},
	}

	for _, tt := range tests {
		got := ExtractNotebook(tt.input)
		if got != tt.want {
			t.Errorf("ExtractNotebook(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestCleanOk(t *testing.T) {
	// Valid path
	cleaned, ok := CleanOk("work/note.md")
	if !ok || cleaned != "work/note.md" {
		t.Errorf("CleanOk(valid) failed")
	}

	// Invalid path
	_, ok = CleanOk("../secret")
	if ok {
		t.Errorf("CleanOk(invalid) should return false")
	}
}
