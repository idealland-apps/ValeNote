package model

type RemoteStorage struct {
	ID                  int64  `gorm:"primaryKey" json:"id"`
	Name                string `gorm:"not null" json:"name"`
	Type                string `gorm:"not null" json:"type"` // s3, webdav
	Enabled             bool   `gorm:"default:false" json:"enabled"`
	S3Endpoint          string `json:"s3_endpoint,omitempty"`
	S3Region            string `json:"s3_region,omitempty"`
	S3Bucket            string `json:"s3_bucket,omitempty"`
	S3AccessKey         string `json:"s3_access_key,omitempty"`
	S3SecretKey         string `json:"-"`
	S3Prefix            string `json:"s3_prefix,omitempty"`
	WebDAVURL           string `json:"webdav_url,omitempty"`
	WebDAVUsername      string `json:"webdav_username,omitempty"`
	WebDAVPassword      string `json:"-"`
	WebDAVPath          string `json:"webdav_path,omitempty"`
	SyncIntervalMinutes int    `gorm:"default:60" json:"sync_interval_minutes"`
	DeleteRemote        bool   `gorm:"default:false" json:"delete_remote"`
	LastSyncAt          *int64 `json:"last_sync_at,omitempty"`
	LastSyncStatus      string `json:"last_sync_status,omitempty"`
	LastSyncError       string `json:"last_sync_error,omitempty"`
	CreatedAt           int64  `json:"created_at"`
	UpdatedAt           int64  `json:"updated_at"`
}

type SyncState struct {
	ID             int64  `gorm:"primaryKey" json:"id"`
	StorageID      int64  `gorm:"index;not null" json:"storage_id"`
	FilePath       string `gorm:"not null" json:"file_path"`
	LocalChecksum  string `json:"local_checksum"`
	RemoteChecksum string `json:"remote_checksum"`
	SyncedAt       *int64 `json:"synced_at"`
}

type SyncHistory struct {
	ID            int64  `gorm:"primaryKey" json:"id"`
	StorageID     int64  `gorm:"index;not null" json:"storage_id"`
	Status        string `gorm:"not null" json:"status"`
	Error         string `json:"error,omitempty"`
	FilesUploaded int    `json:"files_uploaded"`
	FilesDeleted  int    `json:"files_deleted"`
	StartedAt     int64  `json:"started_at"`
	FinishedAt    int64  `json:"finished_at"`
}
