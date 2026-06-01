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

	"github.com/idealland-apps/valenote/internal/config"
	"github.com/idealland-apps/valenote/internal/pathutil"
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

	cleanedPath, err := pathutil.Clean(notePath)
	if err != nil {
		return nil, ErrPathEscape
	}
	noteDir := filepath.Dir(cleanedPath)
	if noteDir == "." {
		noteDir = ""
	}
	noteBaseName := filepath.Base(cleanedPath)
	noteDirName := strings.ReplaceAll(noteBaseName, ".", "-")
	var attachDir string
	if noteDir == "" {
		attachDir = filepath.Join(s.cfg.Notes.RootPath, "attachments", noteDirName)
	} else {
		attachDir = filepath.Join(s.cfg.Notes.RootPath, noteDir, "attachments", noteDirName)
	}

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

	var relativePath string
	if noteDir == "" {
		relativePath = "./attachments/" + noteDirName + "/" + filename
	} else {
		relativePath = "./attachments/" + noteDirName + "/" + filename
	}

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
	cleaned, err := pathutil.Clean(relativePath)
	if err != nil {
		return "", ErrPathEscape
	}

	rootPath := filepath.Clean(s.cfg.Notes.RootPath)
	fullPath := filepath.Join(rootPath, cleaned)
	if !strings.HasPrefix(fullPath, rootPath) {
		return "", ErrPathEscape
	}

	if _, err := os.Stat(fullPath); os.IsNotExist(err) {
		return "", ErrNotFound
	}

	return fullPath, nil
}

type AttachmentInfo struct {
	Name     string `json:"name"`
	Path     string `json:"path"`
	Size     int64  `json:"size"`
	MimeType string `json:"mime_type"`
}

func (s *AttachmentService) List(notePath string) ([]AttachmentInfo, error) {
	cleanedPath, err := pathutil.Clean(notePath)
	if err != nil {
		return nil, ErrPathEscape
	}
	noteDir := filepath.Dir(cleanedPath)
	if noteDir == "." {
		noteDir = ""
	}
	noteBaseName := filepath.Base(cleanedPath)
	noteDirName := strings.ReplaceAll(noteBaseName, ".", "-")

	var attachDir string
	if noteDir == "" {
		attachDir = filepath.Join(s.cfg.Notes.RootPath, "attachments", noteDirName)
	} else {
		attachDir = filepath.Join(s.cfg.Notes.RootPath, noteDir, "attachments", noteDirName)
	}

	entries, err := os.ReadDir(attachDir)
	if os.IsNotExist(err) {
		return []AttachmentInfo{}, nil
	}
	if err != nil {
		return nil, err
	}

	var result []AttachmentInfo
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		ext := strings.ToLower(filepath.Ext(entry.Name()))
		mimeType := getMimeType(ext)
		result = append(result, AttachmentInfo{
			Name:     entry.Name(),
			Path:     "./attachments/" + noteDirName + "/" + entry.Name(),
			Size:     info.Size(),
			MimeType: mimeType,
		})
	}
	return result, nil
}

func getMimeType(ext string) string {
	switch ext {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	case ".svg":
		return "image/svg+xml"
	case ".pdf":
		return "application/pdf"
	case ".txt":
		return "text/plain"
	case ".md":
		return "text/markdown"
	default:
		return "application/octet-stream"
	}
}

func (s *AttachmentService) Delete(notePath, filename string) error {
	cleanedPath, err := pathutil.Clean(notePath)
	if err != nil {
		return ErrPathEscape
	}
	noteDir := filepath.Dir(cleanedPath)
	if noteDir == "." {
		noteDir = ""
	}
	noteBaseName := filepath.Base(cleanedPath)
	noteDirName := strings.ReplaceAll(noteBaseName, ".", "-")

	var attachDir string
	if noteDir == "" {
		attachDir = filepath.Join(s.cfg.Notes.RootPath, "attachments", noteDirName)
	} else {
		attachDir = filepath.Join(s.cfg.Notes.RootPath, noteDir, "attachments", noteDirName)
	}

	filename = filepath.Base(filename)
	if strings.Contains(filename, "..") {
		return ErrPathEscape
	}

	fullPath := filepath.Join(attachDir, filename)
	rootPath := filepath.Clean(s.cfg.Notes.RootPath)
	if !strings.HasPrefix(fullPath, rootPath) {
		return ErrPathEscape
	}

	if _, err := os.Stat(fullPath); os.IsNotExist(err) {
		return ErrNotFound
	}

	return os.Remove(fullPath)
}
