package service

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/anthropics/valenote/internal/config"
)

var (
	ErrFileTooBig  = errors.New("file too large")
	ErrInvalidType = errors.New("invalid file type")
	ErrNotFound    = errors.New("not found")
)

type AttachmentService struct {
	cfg *config.Config
}

func NewAttachmentService(cfg *config.Config) *AttachmentService {
	return &AttachmentService{cfg: cfg}
}

type UploadResult struct {
	Path     string `json:"path"`
	Filename string `json:"filename"`
	Size     int64  `json:"size"`
	MimeType string `json:"mime_type"`
}

var allowedMimeTypes = map[string]bool{
	"image/jpeg":      true,
	"image/png":       true,
	"image/gif":       true,
	"image/webp":      true,
	"image/svg+xml":   true,
	"application/pdf": true,
	"text/plain":      true,
	"text/markdown":   true,
}

const maxFileSize = 10 * 1024 * 1024 // 10MB

func (s *AttachmentService) Upload(notePath string, file *multipart.FileHeader) (*UploadResult, error) {
	if file.Size > maxFileSize {
		return nil, ErrFileTooBig
	}

	mimeType := file.Header.Get("Content-Type")
	if !allowedMimeTypes[mimeType] {
		ext := strings.ToLower(filepath.Ext(file.Filename))
		switch ext {
		case ".jpg", ".jpeg":
			mimeType = "image/jpeg"
		case ".png":
			mimeType = "image/png"
		case ".gif":
			mimeType = "image/gif"
		case ".webp":
			mimeType = "image/webp"
		case ".svg":
			mimeType = "image/svg+xml"
		case ".pdf":
			mimeType = "application/pdf"
		case ".txt":
			mimeType = "text/plain"
		case ".md":
			mimeType = "text/markdown"
		default:
			return nil, ErrInvalidType
		}
	}

	noteDir := filepath.Dir(notePath)
	noteName := strings.TrimSuffix(filepath.Base(notePath), ".md")
	attachDir := filepath.Join(s.cfg.Notes.RootPath, noteDir, noteName, "attachments")

	if err := os.MkdirAll(attachDir, 0755); err != nil {
		return nil, err
	}

	ext := filepath.Ext(file.Filename)
	filename := fmt.Sprintf("%d-%s%s", time.Now().Unix(), randomHex(6), ext)
	fullPath := filepath.Join(attachDir, filename)

	src, err := file.Open()
	if err != nil {
		return nil, err
	}
	defer src.Close()

	dst, err := os.Create(fullPath)
	if err != nil {
		return nil, err
	}
	defer dst.Close()

	if _, err := io.Copy(dst, src); err != nil {
		return nil, err
	}

	relativePath := filepath.Join(noteDir, noteName, "attachments", filename)

	return &UploadResult{
		Path:     relativePath,
		Filename: filename,
		Size:     file.Size,
		MimeType: mimeType,
	}, nil
}

func randomHex(n int) string {
	bytes := make([]byte, n)
	rand.Read(bytes)
	return hex.EncodeToString(bytes)
}

func (s *AttachmentService) GetAttachmentPath(relativePath string) (string, error) {
	cleaned := filepath.Clean(relativePath)
	if strings.Contains(cleaned, "..") {
		return "", ErrPathEscape
	}

	fullPath := filepath.Join(s.cfg.Notes.RootPath, cleaned)
	if !strings.HasPrefix(fullPath, s.cfg.Notes.RootPath) {
		return "", ErrPathEscape
	}

	if _, err := os.Stat(fullPath); os.IsNotExist(err) {
		return "", ErrNotFound
	}

	return fullPath, nil
}
