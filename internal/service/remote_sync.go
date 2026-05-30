package service

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	"github.com/idealland-apps/valenote/internal/config"
	"github.com/idealland-apps/valenote/internal/model"
	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"gorm.io/gorm"
)

var (
	ErrStorageNotFound = errors.New("storage not found")
	ErrConnectionFailed = errors.New("connection failed")
)

type StorageAdapter interface {
	Upload(ctx context.Context, localPath, remotePath string) error
	Delete(ctx context.Context, remotePath string) error
	TestConnection(ctx context.Context) error
}

type RemoteSyncService struct {
	db       *gorm.DB
	cfg      *config.Config
	stopChan chan struct{}
	running  bool
}

func NewRemoteSyncService(db *gorm.DB, cfg *config.Config) *RemoteSyncService {
	return &RemoteSyncService{
		db:       db,
		cfg:      cfg,
		stopChan: make(chan struct{}),
	}
}

func (s *RemoteSyncService) StartScheduler() {
	if s.running {
		return
	}
	s.running = true

	go func() {
		ticker := time.NewTicker(1 * time.Minute)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				s.runScheduledSyncs()
			case <-s.stopChan:
				return
			}
		}
	}()
}

func (s *RemoteSyncService) StopScheduler() {
	if s.running {
		close(s.stopChan)
		s.running = false
	}
}

func (s *RemoteSyncService) runScheduledSyncs() {
	var storages []model.RemoteStorage
	if err := s.db.Where("enabled = ? AND sync_interval_minutes > 0", true).Find(&storages).Error; err != nil {
		return
	}

	now := time.Now().UnixMilli()
	for _, storage := range storages {
		if storage.SyncIntervalMinutes <= 0 {
			continue
		}

		shouldSync := false
		if storage.LastSyncAt == nil {
			shouldSync = true
		} else {
			nextSyncTime := *storage.LastSyncAt + int64(storage.SyncIntervalMinutes)*60*1000
			if now > nextSyncTime {
				shouldSync = true
			}
		}

		if shouldSync {
			go s.Sync(int64(storage.ID))
		}
	}
}

func (s *RemoteSyncService) ListStorages() ([]model.RemoteStorage, error) {
	var storages []model.RemoteStorage
	err := s.db.Find(&storages).Error
	return storages, err
}

func (s *RemoteSyncService) GetStorage(id int64) (*model.RemoteStorage, error) {
	var storage model.RemoteStorage
	if err := s.db.First(&storage, id).Error; err != nil {
		return nil, ErrStorageNotFound
	}
	return &storage, nil
}

func (s *RemoteSyncService) CreateStorage(storage *model.RemoteStorage) error {
	return s.db.Create(storage).Error
}

type StorageUpdateRequest struct {
	Name                string
	Type                string
	Enabled             bool
	S3Endpoint          string
	S3Region            string
	S3Bucket            string
	S3AccessKey         string
	S3SecretKey         string
	S3Prefix            string
	WebDAVURL           string
	WebDAVUsername      string
	WebDAVPassword      string
	WebDAVPath          string
	SyncIntervalMinutes int
	DeleteRemote        bool
}

func (s *RemoteSyncService) UpdateStorage(id int64, req *StorageUpdateRequest) error {
	existing, err := s.GetStorage(id)
	if err != nil {
		return err
	}

	existing.Name = req.Name
	existing.Type = req.Type
	existing.Enabled = req.Enabled
	existing.S3Endpoint = req.S3Endpoint
	existing.S3Region = req.S3Region
	existing.S3Bucket = req.S3Bucket
	existing.S3AccessKey = req.S3AccessKey
	if req.S3SecretKey != "" {
		existing.S3SecretKey = req.S3SecretKey
	}
	existing.S3Prefix = req.S3Prefix
	existing.WebDAVURL = req.WebDAVURL
	existing.WebDAVUsername = req.WebDAVUsername
	if req.WebDAVPassword != "" {
		existing.WebDAVPassword = req.WebDAVPassword
	}
	existing.WebDAVPath = req.WebDAVPath
	existing.SyncIntervalMinutes = req.SyncIntervalMinutes
	existing.DeleteRemote = req.DeleteRemote

	return s.db.Save(existing).Error
}

func (s *RemoteSyncService) DeleteStorage(id int64) error {
	s.db.Where("storage_id = ?", id).Delete(&model.SyncState{})
	return s.db.Delete(&model.RemoteStorage{}, id).Error
}

func (s *RemoteSyncService) TestConnection(id int64) error {
	storage, err := s.GetStorage(id)
	if err != nil {
		return err
	}

	adapter, err := s.createAdapter(storage)
	if err != nil {
		return err
	}

	return adapter.TestConnection(context.Background())
}

func (s *RemoteSyncService) Sync(id int64) error {
	storage, err := s.GetStorage(id)
	if err != nil {
		return err
	}

	now := time.Now().UnixMilli()
	history := &model.SyncHistory{
		StorageID: id,
		StartedAt: now,
	}

	adapter, err := s.createAdapter(storage)
	if err != nil {
		s.updateSyncStatus(storage, "failed", err.Error())
		s.saveSyncHistory(history, "failed", err.Error(), 0, 0)
		return err
	}

	ctx := context.Background()

	if err := adapter.TestConnection(ctx); err != nil {
		errMsg := "Connection failed: " + err.Error()
		s.updateSyncStatus(storage, "failed", errMsg)
		s.saveSyncHistory(history, "failed", errMsg, 0, 0)
		return err
	}

	localFiles, err := s.scanLocalFiles()
	if err != nil {
		errMsg := "Scan failed: " + err.Error()
		s.updateSyncStatus(storage, "failed", errMsg)
		s.saveSyncHistory(history, "failed", errMsg, 0, 0)
		return err
	}

	syncStates, err := s.getSyncStates(id)
	if err != nil {
		errMsg := "Get sync states failed: " + err.Error()
		s.updateSyncStatus(storage, "failed", errMsg)
		s.saveSyncHistory(history, "failed", errMsg, 0, 0)
		return err
	}

	toUpload, toDelete := s.diff(localFiles, syncStates)

	filesUploaded := 0
	for _, f := range toUpload {
		remotePath := filepath.Join(storage.S3Prefix, f.Path)
		if storage.Type == "webdav" {
			remotePath = filepath.Join(storage.WebDAVPath, f.Path)
		}

		localPath := filepath.Join(s.cfg.Notes.RootPath, f.Path)
		if err := adapter.Upload(ctx, localPath, remotePath); err != nil {
			continue
		}

		s.updateSyncState(id, f.Path, f.Checksum)
		filesUploaded++
	}

	filesDeleted := 0
	if storage.DeleteRemote {
		for _, path := range toDelete {
			remotePath := filepath.Join(storage.S3Prefix, path)
			if storage.Type == "webdav" {
				remotePath = filepath.Join(storage.WebDAVPath, path)
			}

			if err := adapter.Delete(ctx, remotePath); err != nil {
				continue
			}

			s.deleteSyncState(id, path)
			filesDeleted++
		}
	}

	s.updateSyncStatus(storage, "success", "")
	s.saveSyncHistory(history, "success", "", filesUploaded, filesDeleted)
	return nil
}

func (s *RemoteSyncService) saveSyncHistory(history *model.SyncHistory, status, errorMsg string, uploaded, deleted int) {
	history.Status = status
	history.Error = errorMsg
	history.FilesUploaded = uploaded
	history.FilesDeleted = deleted
	history.FinishedAt = time.Now().UnixMilli()
	s.db.Create(history)
}

func (s *RemoteSyncService) GetSyncHistory(storageID int64, limit int) ([]model.SyncHistory, error) {
	var history []model.SyncHistory
	err := s.db.Where("storage_id = ?", storageID).Order("started_at DESC").Limit(limit).Find(&history).Error
	return history, err
}

type localFile struct {
	Path     string
	Checksum string
}

func (s *RemoteSyncService) scanLocalFiles() ([]localFile, error) {
	var files []localFile

	err := filepath.Walk(s.cfg.Notes.RootPath, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}

		relPath, _ := filepath.Rel(s.cfg.Notes.RootPath, path)

		content, err := os.ReadFile(path)
		if err != nil {
			return nil
		}

		hash := sha256.Sum256(content)
		checksum := hex.EncodeToString(hash[:])

		files = append(files, localFile{
			Path:     relPath,
			Checksum: checksum,
		})

		return nil
	})

	return files, err
}

func (s *RemoteSyncService) getSyncStates(storageID int64) (map[string]model.SyncState, error) {
	var states []model.SyncState
	if err := s.db.Where("storage_id = ?", storageID).Find(&states).Error; err != nil {
		return nil, err
	}

	result := make(map[string]model.SyncState)
	for _, state := range states {
		result[state.FilePath] = state
	}
	return result, nil
}

func (s *RemoteSyncService) diff(localFiles []localFile, syncStates map[string]model.SyncState) (toUpload []localFile, toDelete []string) {
	localMap := make(map[string]localFile)
	for _, f := range localFiles {
		localMap[f.Path] = f
	}

	for _, f := range localFiles {
		state, exists := syncStates[f.Path]
		if !exists || state.LocalChecksum != f.Checksum {
			toUpload = append(toUpload, f)
		}
	}

	for path := range syncStates {
		if _, exists := localMap[path]; !exists {
			toDelete = append(toDelete, path)
		}
	}

	return
}

func (s *RemoteSyncService) updateSyncState(storageID int64, path, checksum string) {
	now := time.Now().UnixMilli()
	state := model.SyncState{
		StorageID:      storageID,
		FilePath:       path,
		LocalChecksum:  checksum,
		RemoteChecksum: checksum,
		SyncedAt:       &now,
	}

	s.db.Where("storage_id = ? AND file_path = ?", storageID, path).
		Assign(state).
		FirstOrCreate(&state)
}

func (s *RemoteSyncService) deleteSyncState(storageID int64, path string) {
	s.db.Where("storage_id = ? AND file_path = ?", storageID, path).
		Delete(&model.SyncState{})
}

func (s *RemoteSyncService) updateSyncStatus(storage *model.RemoteStorage, status, errorMsg string) {
	now := time.Now().UnixMilli()
	storage.LastSyncAt = &now
	storage.LastSyncStatus = status
	storage.LastSyncError = errorMsg
	s.db.Save(storage)
}

func (s *RemoteSyncService) createAdapter(storage *model.RemoteStorage) (StorageAdapter, error) {
	switch storage.Type {
	case "s3":
		return NewS3Adapter(storage)
	case "webdav":
		return NewWebDAVAdapter(storage)
	default:
		return nil, errors.New("unsupported storage type")
	}
}

type S3Adapter struct {
	client *s3.Client
	bucket string
}

func NewS3Adapter(storage *model.RemoteStorage) (*S3Adapter, error) {
	cfg, err := awsconfig.LoadDefaultConfig(context.Background(),
		awsconfig.WithRegion(storage.S3Region),
		awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
			storage.S3AccessKey,
			storage.S3SecretKey,
			"",
		)),
	)
	if err != nil {
		return nil, err
	}

	client := s3.NewFromConfig(cfg, func(o *s3.Options) {
		if storage.S3Endpoint != "" {
			o.BaseEndpoint = aws.String(storage.S3Endpoint)
			o.UsePathStyle = true
		}
	})

	return &S3Adapter{
		client: client,
		bucket: storage.S3Bucket,
	}, nil
}

func (a *S3Adapter) Upload(ctx context.Context, localPath, remotePath string) error {
	file, err := os.Open(localPath)
	if err != nil {
		return err
	}
	defer file.Close()

	_, err = a.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket: aws.String(a.bucket),
		Key:    aws.String(remotePath),
		Body:   file,
	})

	return err
}

func (a *S3Adapter) Delete(ctx context.Context, remotePath string) error {
	_, err := a.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(a.bucket),
		Key:    aws.String(remotePath),
	})
	return err
}

func (a *S3Adapter) TestConnection(ctx context.Context) error {
	_, err := a.client.HeadBucket(ctx, &s3.HeadBucketInput{
		Bucket: aws.String(a.bucket),
	})
	return err
}

type WebDAVAdapter struct {
	url      string
	username string
	password string
	client   *http.Client
}

func NewWebDAVAdapter(storage *model.RemoteStorage) (*WebDAVAdapter, error) {
	return &WebDAVAdapter{
		url:      strings.TrimSuffix(storage.WebDAVURL, "/"),
		username: storage.WebDAVUsername,
		password: storage.WebDAVPassword,
		client:   &http.Client{Timeout: 30 * time.Second},
	}, nil
}

func (a *WebDAVAdapter) doRequest(ctx context.Context, method, remotePath string, body io.Reader) (*http.Response, error) {
	fullURL := a.url + "/" + strings.TrimPrefix(remotePath, "/")
	req, err := http.NewRequestWithContext(ctx, method, fullURL, body)
	if err != nil {
		return nil, err
	}

	if a.username != "" || a.password != "" {
		req.SetBasicAuth(a.username, a.password)
	}

	return a.client.Do(req)
}

func (a *WebDAVAdapter) ensureParentDir(ctx context.Context, remotePath string) error {
	dir := path.Dir(remotePath)
	if dir == "." || dir == "/" {
		return nil
	}

	parts := strings.Split(strings.Trim(dir, "/"), "/")
	current := ""
	for _, part := range parts {
		current = current + "/" + part
		resp, err := a.doRequest(ctx, "MKCOL", current+"/", nil)
		if err != nil {
			return err
		}
		resp.Body.Close()
		if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusMethodNotAllowed && resp.StatusCode != http.StatusConflict {
			continue
		}
	}
	return nil
}

func (a *WebDAVAdapter) Upload(ctx context.Context, localPath, remotePath string) error {
	if err := a.ensureParentDir(ctx, remotePath); err != nil {
		return err
	}

	file, err := os.Open(localPath)
	if err != nil {
		return err
	}
	defer file.Close()

	content, err := io.ReadAll(file)
	if err != nil {
		return err
	}

	resp, err := a.doRequest(ctx, "PUT", remotePath, bytes.NewReader(content))
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusNoContent && resp.StatusCode != http.StatusOK {
		return fmt.Errorf("upload failed with status %d", resp.StatusCode)
	}

	return nil
}

func (a *WebDAVAdapter) Delete(ctx context.Context, remotePath string) error {
	resp, err := a.doRequest(ctx, "DELETE", remotePath, nil)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent && resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNotFound {
		return fmt.Errorf("delete failed with status %d", resp.StatusCode)
	}

	return nil
}

func (a *WebDAVAdapter) TestConnection(ctx context.Context) error {
	resp, err := a.doRequest(ctx, "PROPFIND", "/", nil)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized {
		return errors.New("authentication failed")
	}

	if resp.StatusCode != http.StatusMultiStatus && resp.StatusCode != http.StatusOK {
		return fmt.Errorf("connection test failed with status %d", resp.StatusCode)
	}

	return nil
}
