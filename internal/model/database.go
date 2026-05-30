package model

import (
	"github.com/idealland-apps/valenote/internal/config"
	"golang.org/x/crypto/bcrypt"
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
		&Setting{},
		&UserSetting{},
		&RemoteStorage{},
		&SyncState{},
		&SyncHistory{},
	); err != nil {
		return nil, err
	}

	// Drop display_name column if exists (migration for simplified naming model)
	if db.Migrator().HasColumn(&Notebook{}, "display_name") {
		db.Migrator().DropColumn(&Notebook{}, "display_name")
	}

	initDefaultSettings(db)
	initDefaultAdmin(db)

	return db, nil
}

func initDefaultSettings(db *gorm.DB) {
	defaults := map[string]string{
		"public_base_path":        "/public",
		"version_retention_days":  "30",
		"version_max_count":       "100",
		"show_powered_by":         "true",
		"timezone":                "UTC",
	}

	for key, value := range defaults {
		db.FirstOrCreate(&Setting{Key: key, Value: value}, Setting{Key: key})
	}
}

func initDefaultAdmin(db *gorm.DB) {
	var count int64
	db.Model(&User{}).Count(&count)
	if count > 0 {
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte("admin123abc"), 12)
	if err != nil {
		return
	}

	admin := &User{
		Username:     "admin",
		PasswordHash: string(hash),
		IsAdmin:      true,
	}
	db.Create(admin)
}
