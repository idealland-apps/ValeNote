package model

import (
	"github.com/anthropics/valenote/internal/config"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"os"
	"path/filepath"
)

func InitDB(cfg *config.Config) (*gorm.DB, error) {
	if err := os.MkdirAll(filepath.Dir(cfg.Database.Path), 0755); err != nil {
		return nil, err
	}

	db, err := gorm.Open(sqlite.Open(cfg.Database.Path), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
	})
	if err != nil {
		return nil, err
	}

	if err := db.AutoMigrate(
		&User{},
		&Notebook{},
		&Agent{},
		&AgentNotebookPermission{},
		&NoteMetadata{},
		&NoteVersion{},
		&NoteLock{},
		&Setting{},
		&RemoteStorage{},
		&SyncState{},
	); err != nil {
		return nil, err
	}

	initDefaultSettings(db)

	return db, nil
}

func initDefaultSettings(db *gorm.DB) {
	defaults := map[string]string{
		"public_base_path":        "/public",
		"version_retention_days":  "30",
		"version_max_count":       "100",
	}

	for key, value := range defaults {
		db.FirstOrCreate(&Setting{Key: key, Value: value}, Setting{Key: key})
	}
}
