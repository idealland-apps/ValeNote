package config

import (
	"crypto/rand"
	"encoding/hex"
	"os"
	"path/filepath"
	"strings"
)

type Config struct {
	Server   ServerConfig
	Database DatabaseConfig
	JWT      JWTConfig
	Notes    NotesConfig
	DataPath string
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
		DataPath: dataRoot,
		Server: ServerConfig{
			Port: getEnv("VALENOTE_PORT", "8080"),
			Mode: getEnv("VALENOTE_MODE", "debug"),
		},
		Database: DatabaseConfig{
			Path: filepath.Join(dataRoot, "valenote.db"),
		},
		JWT: JWTConfig{
			Secret:     getOrGenerateSecret(dataRoot),
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

func getOrGenerateSecret(dataRoot string) string {
	if value := os.Getenv("VALENOTE_SECRET_KEY"); value != "" {
		return value
	}

	secretFile := filepath.Join(dataRoot, ".secret")
	if data, err := os.ReadFile(secretFile); err == nil {
		if secret := strings.TrimSpace(string(data)); secret != "" {
			return secret
		}
	}

	secret := generateRandomSecret(32)

	_ = os.MkdirAll(dataRoot, 0700)
	_ = os.WriteFile(secretFile, []byte(secret), 0600)

	return secret
}

func generateRandomSecret(length int) string {
	bytes := make([]byte, length)
	if _, err := rand.Read(bytes); err != nil {
		panic("failed to generate random secret: " + err.Error())
	}
	return hex.EncodeToString(bytes)
}
