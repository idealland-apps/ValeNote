package pathutil

import (
	"errors"
	"path/filepath"
	"strings"
)

var (
	ErrInvalidPath = errors.New("invalid path")
	ErrPathEscape  = errors.New("path escapes root directory")
)

// Clean normalizes a user-provided path and validates it doesn't escape the root.
// It strips leading slashes, cleans the path, and rejects paths that would escape.
// Returns the cleaned path and an error if the path is invalid.
func Clean(path string) (string, error) {
	if path == "" {
		return "", nil
	}

	// Strip leading slashes (common from URL path params like c.Param("path"))
	path = strings.TrimLeft(path, "/")
	if path == "" {
		return "", nil
	}

	cleaned := filepath.Clean(path)

	// Reject paths that escape the root after cleaning
	if strings.HasPrefix(cleaned, "..") {
		return "", ErrInvalidPath
	}

	return cleaned, nil
}

// ExtractNotebook extracts the notebook name (first path segment) from a path.
// Returns empty string for empty paths or paths that are just ".".
func ExtractNotebook(path string) string {
	if path == "" || path == "." {
		return ""
	}
	return strings.Split(path, "/")[0]
}

// MustClean is like Clean but returns the original path if cleaning fails.
// Use only when you need a best-effort clean without error handling.
func MustClean(path string) string {
	cleaned, err := Clean(path)
	if err != nil {
		return path
	}
	return cleaned
}

// CleanOk is like Clean but returns (cleaned, ok) instead of (cleaned, error).
// Useful for handler code where you just need to check validity.
func CleanOk(path string) (string, bool) {
	cleaned, err := Clean(path)
	return cleaned, err == nil
}
