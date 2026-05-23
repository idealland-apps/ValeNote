package config

import (
	"os"
	"path/filepath"
)

type Config struct {
	Server   ServerConfig
	Database DatabaseConfig
	JWT      JWTConfig
	Notes    NotesConfig
}

type ServerConfig struct {
	Port string
	Mode string // debug, release, test
}

type DatabaseConfig struct {
	Path string
}

type JWTConfig struct {
	Secret     string
	ExpireHour int
}

type NotesConfig struct {
	RootPath     string
	VersionsPath string
}

func Load() *Config {
	dataRoot := getEnv("VALENOTE_DATA_PATH", "./data")
	notesRoot := getEnv("VALENOTE_NOTES_PATH", "./notes")

	return &Config{
		Server: ServerConfig{
			Port: getEnv("VALENOTE_PORT", "8080"),
			Mode: getEnv("VALENOTE_MODE", "debug"),
		},
		Database: DatabaseConfig{
			Path: filepath.Join(dataRoot, "valenote.db"),
		},
		JWT: JWTConfig{
			Secret:     getEnv("VALENOTE_SECRET_KEY", "change-me-in-production"),
			ExpireHour: 24 * 7,
		},
		Notes: NotesConfig{
			RootPath:     notesRoot,
			VersionsPath: filepath.Join(dataRoot, "versions"),
		},
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
