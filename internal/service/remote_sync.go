package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
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

	now := time.Now()
	for _, storage := range storages {
		if storage.SyncIntervalMinutes <= 0 {
			continue
		}

		shouldSync := false
		if storage.LastSyncAt == nil {
			shouldSync = true
		} else {
			nextSyncTime := storage.LastSyncAt.Add(time.Duration(storage.SyncIntervalMinutes) * time.Minute)
			if now.After(nextSyncTime) {
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

func (s *RemoteSyncService) UpdateStorage(storage *model.RemoteStorage) error {
	return s.db.Save(storage).Error
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

	adapter, err := s.createAdapter(storage)
	if err != nil {
		s.updateSyncStatus(storage, "failed", err.Error())
		return err
	}

	ctx := context.Background()

	if err := adapter.TestConnection(ctx); err != nil {
		s.updateSyncStatus(storage, "failed", "Connection failed: "+err.Error())
		return err
	}

	localFiles, err := s.scanLocalFiles()
	if err != nil {
		s.updateSyncStatus(storage, "failed", "Scan failed: "+err.Error())
		return err
	}

	syncStates, err := s.getSyncStates(id)
	if err != nil {
		s.updateSyncStatus(storage, "failed", "Get sync states failed: "+err.Error())
		return err
	}

	toUpload, toDelete := s.diff(localFiles, syncStates)

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
	}

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
		}
	}

	s.updateSyncStatus(storage, "success", "")
	return nil
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
	now := time.Now()
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
	now := time.Now()
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
}

func NewWebDAVAdapter(storage *model.RemoteStorage) (*WebDAVAdapter, error) {
	return &WebDAVAdapter{
		url:      strings.TrimSuffix(storage.WebDAVURL, "/"),
		username: storage.WebDAVUsername,
		password: storage.WebDAVPassword,
	}, nil
}

func (a *WebDAVAdapter) Upload(ctx context.Context, localPath, remotePath string) error {
	return errors.New("WebDAV upload not implemented")
}

func (a *WebDAVAdapter) Delete(ctx context.Context, remotePath string) error {
	return errors.New("WebDAV delete not implemented")
}

func (a *WebDAVAdapter) TestConnection(ctx context.Context) error {
	return errors.New("WebDAV test not implemented")
}
