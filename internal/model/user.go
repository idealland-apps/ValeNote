package model

type User struct {
	ID           int64  `gorm:"primaryKey" json:"id"`
	Username     string `gorm:"uniqueIndex;not null;size:50" json:"username"`
	Email        *string `gorm:"uniqueIndex;size:255" json:"email,omitempty"`
	PasswordHash string `gorm:"not null" json:"-"`
	IsAdmin      bool   `gorm:"default:false" json:"is_admin"`
	CreatedAt    int64  `json:"created_at"`
	UpdatedAt    int64  `json:"updated_at"`
}

type Notebook struct {
	ID          int64  `gorm:"primaryKey" json:"id"`
	Name        string `gorm:"uniqueIndex;not null;size:100" json:"name"`
	Description string `json:"description,omitempty"`
	IsPublic    bool   `gorm:"default:false" json:"is_public"`
	CreatedAt   int64  `json:"created_at"`
	UpdatedAt   int64  `json:"updated_at"`
}

type Agent struct {
	ID           int64  `gorm:"primaryKey" json:"id"`
	Name         string `gorm:"uniqueIndex;not null;size:100" json:"name"`
	Description  string `json:"description,omitempty"`
	APIKeyHash   string `gorm:"column:api_key;uniqueIndex;not null" json:"-"`
	APIKeyPrefix string `gorm:"not null;size:20" json:"api_key_prefix"`
	Enabled      bool   `gorm:"default:true" json:"enabled"`
	LastUsedAt   *int64 `json:"last_used_at,omitempty"`
	CreatedAt    int64  `json:"created_at"`
	UpdatedAt    int64  `json:"updated_at"`
}

type AgentNotebookPermission struct {
	ID          int64  `gorm:"primaryKey" json:"id"`
	AgentID     int64  `gorm:"index;not null" json:"agent_id"`
	NotebookID  int64  `gorm:"index;not null" json:"notebook_id"`
	AccessLevel string `gorm:"not null;size:20" json:"access_level"` // read, readwrite
	CreatedAt   int64  `json:"created_at"`

	Agent    *Agent    `gorm:"foreignKey:AgentID" json:"agent,omitempty"`
	Notebook *Notebook `gorm:"foreignKey:NotebookID" json:"notebook,omitempty"`
}

func (AgentNotebookPermission) TableName() string {
	return "agent_notebook_permissions"
}

type NoteMetadata struct {
	ID         int64  `gorm:"primaryKey" json:"id"`
	NotebookID int64  `gorm:"index" json:"notebook_id"`
	Path       string `gorm:"uniqueIndex;not null" json:"path"`
	Title      string `gorm:"size:500" json:"title"`
	Checksum   string `gorm:"not null;size:64" json:"checksum"`
	Size       int64  `json:"size"`
	Tags       string `json:"tags,omitempty"` // JSON array
	FileMtime  int64  `json:"file_mtime"`
	CreatedAt  int64  `json:"created_at"`
	UpdatedAt  int64  `json:"updated_at"`
	IndexedAt  int64  `json:"indexed_at"`

	Notebook *Notebook `gorm:"foreignKey:NotebookID" json:"notebook,omitempty"`
}


type Setting struct {
	Key       string `gorm:"primaryKey;size:100" json:"key"`
	Value     string `gorm:"not null" json:"value"`
	UpdatedAt int64  `json:"updated_at"`
}

type UserSetting struct {
	UserID    int64  `gorm:"primaryKey" json:"user_id"`
	Key       string `gorm:"primaryKey;size:100" json:"key"`
	Value     string `gorm:"not null" json:"value"`
	UpdatedAt int64  `json:"updated_at"`

	User *User `gorm:"foreignKey:UserID" json:"-"`
}
