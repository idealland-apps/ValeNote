package service

import (
	"archive/zip"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"time"

	"github.com/idealland-apps/valenote/internal/config"
)

type ExportService struct {
	cfg *config.Config
}

func NewExportService(cfg *config.Config) *ExportService {
	return &ExportService{cfg: cfg}
}

type Manifest struct {
	Version    string `json:"version"`
	ExportedAt int64  `json:"exported_at"`
	NotesCount int    `json:"notes_count"`
}

func (s *ExportService) Export() (string, error) {
	timestamp := time.Now().UnixMilli()
	filename := "valenote-export-" + time.Now().Format("2006-01-02-150405") + ".zip"
	tmpPath := filepath.Join(os.TempDir(), filename)

	zipFile, err := os.Create(tmpPath)
	if err != nil {
		return "", err
	}
	defer zipFile.Close()

	zipWriter := zip.NewWriter(zipFile)
	defer zipWriter.Close()

	notesCount := 0
	err = filepath.Walk(s.cfg.Notes.RootPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}

		if info.IsDir() {
			return nil
		}

		relPath, err := filepath.Rel(s.cfg.Notes.RootPath, path)
		if err != nil {
			return nil
		}

		header, err := zip.FileInfoHeader(info)
		if err != nil {
			return nil
		}
		header.Name = relPath
		header.Method = zip.Deflate

		writer, err := zipWriter.CreateHeader(header)
		if err != nil {
			return nil
		}

		file, err := os.Open(path)
		if err != nil {
			return nil
		}
		defer file.Close()

		_, err = io.Copy(writer, file)
		if err != nil {
			return nil
		}

		if filepath.Ext(path) == ".md" {
			notesCount++
		}

		return nil
	})

	if err != nil {
		return "", err
	}

	manifest := Manifest{
		Version:    "1.0",
		ExportedAt: timestamp,
		NotesCount: notesCount,
	}
	manifestData, _ := json.MarshalIndent(manifest, "", "  ")

	manifestWriter, err := zipWriter.Create("manifest.json")
	if err != nil {
		return "", err
	}
	manifestWriter.Write(manifestData)

	return tmpPath, nil
}
