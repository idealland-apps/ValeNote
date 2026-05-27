package model

import (
	"time"
)

type User struct {
	ID           int64     `gorm:"primaryKey" json:"id"`
	Username     string    `gorm:"uniqueIndex;not null;size:50" json:"username"`
	Email        *string   `gorm:"uniqueIndex;size:255" json:"email,omitempty"`
	PasswordHash string    `gorm:"not null" json:"-"`
	IsAdmin      bool      `gorm:"default:false" json:"is_admin"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type Notebook struct {
	ID          int64     `gorm:"primaryKey" json:"id"`
	Name        string    `gorm:"uniqueIndex;not null;size:100" json:"name"`
	Description string    `json:"description,omitempty"`
	IsPublic    bool      `gorm:"default:false" json:"is_public"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type Agent struct {
	ID           int64      `gorm:"primaryKey" json:"id"`
	Name         string     `gorm:"uniqueIndex;not null;size:100" json:"name"`
	Description  string     `json:"description,omitempty"`
	APIKeyHash   string     `gorm:"column:api_key;uniqueIndex;not null" json:"-"`
	APIKeyPrefix string     `gorm:"not null;size:20" json:"api_key_prefix"`
	Enabled      bool       `gorm:"default:true" json:"enabled"`
	LastUsedAt   *time.Time `json:"last_used_at,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}

type AgentNotebookPermission struct {
	ID          int64     `gorm:"primaryKey" json:"id"`
	AgentID     int64     `gorm:"index;not null" json:"agent_id"`
	NotebookID  int64     `gorm:"index;not null" json:"notebook_id"`
	AccessLevel string    `gorm:"not null;size:20" json:"access_level"` // read, readwrite
	CreatedAt   time.Time `json:"created_at"`

	Agent    *Agent    `gorm:"foreignKey:AgentID" json:"agent,omitempty"`
	Notebook *Notebook `gorm:"foreignKey:NotebookID" json:"notebook,omitempty"`
}

func (AgentNotebookPermission) TableName() string {
	return "agent_notebook_permissions"
}

type NoteMetadata struct {
	ID         int64      `gorm:"primaryKey" json:"id"`
	NotebookID int64      `gorm:"index" json:"notebook_id"`
	Path       string     `gorm:"uniqueIndex;not null" json:"path"`
	Title      string     `gorm:"size:500" json:"title"`
	Checksum   string     `gorm:"not null;size:64" json:"checksum"`
	Size       int64      `json:"size"`
	Tags       string     `json:"tags,omitempty"` // JSON array
	FileMtime  time.Time  `json:"file_mtime"`
	CreatedAt  time.Time  `json:"created_at"`
	UpdatedAt  time.Time  `json:"updated_at"`
	IndexedAt  time.Time  `json:"indexed_at"`

	Notebook *Notebook `gorm:"foreignKey:NotebookID" json:"notebook,omitempty"`
}

type NoteVersion struct {
	ID          int64     `gorm:"primaryKey" json:"id"`
	NotePath    string    `gorm:"index;not null" json:"note_path"`
	VersionFile string    `gorm:"not null" json:"version_file"`
	Size        int64     `json:"size"`
	Checksum    string    `gorm:"not null;size:64" json:"checksum"`
	CreatedBy   *int64    `json:"created_by,omitempty"`
	CreatedAt   time.Time `gorm:"index" json:"created_at"`

	User *User `gorm:"foreignKey:CreatedBy" json:"user,omitempty"`
}

type NoteLock struct {
	NotePath  string    `gorm:"primaryKey" json:"note_path"`
	UserID    int64     `json:"user_id"`
	SessionID string    `gorm:"not null" json:"session_id"`
	LockedAt  time.Time `json:"locked_at"`
	ExpiresAt time.Time `gorm:"not null" json:"expires_at"`

	User *User `gorm:"foreignKey:UserID" json:"user,omitempty"`
}

type Setting struct {
	Key       string    `gorm:"primaryKey;size:100" json:"key"`
	Value     string    `gorm:"not null" json:"value"`
	UpdatedAt time.Time `json:"updated_at"`
}

type UserSetting struct {
	UserID    int64     `gorm:"primaryKey" json:"user_id"`
	Key       string    `gorm:"primaryKey;size:100" json:"key"`
	Value     string    `gorm:"not null" json:"value"`
	UpdatedAt time.Time `json:"updated_at"`

	User *User `gorm:"foreignKey:UserID" json:"-"`
}
