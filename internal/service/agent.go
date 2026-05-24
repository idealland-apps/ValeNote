package service

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"

	"github.com/idealland-apps/valenote/internal/model"
	"gorm.io/gorm"
)

type AgentService struct {
	db *gorm.DB
}

func NewAgentService(db *gorm.DB) *AgentService {
	return &AgentService{db: db}
}

type AgentWithPermissions struct {
	model.Agent
	Permissions []AgentPermission `json:"permissions"`
}

type AgentPermission struct {
	NotebookID   int64  `json:"notebook_id"`
	NotebookName string `json:"notebook_name"`
	AccessLevel  string `json:"access_level"`
}

func (s *AgentService) ListAgents() ([]AgentWithPermissions, error) {
	var agents []model.Agent
	if err := s.db.Order("created_at DESC").Find(&agents).Error; err != nil {
		return nil, err
	}

	result := make([]AgentWithPermissions, len(agents))
	for i, agent := range agents {
		permissions, _ := s.GetAgentPermissions(agent.ID)
		result[i] = AgentWithPermissions{
			Agent:       agent,
			Permissions: permissions,
		}
	}
	return result, nil
}

func (s *AgentService) GetAgent(id int64) (*AgentWithPermissions, error) {
	var agent model.Agent
	if err := s.db.First(&agent, id).Error; err != nil {
		return nil, err
	}

	permissions, _ := s.GetAgentPermissions(id)
	return &AgentWithPermissions{
		Agent:       agent,
		Permissions: permissions,
	}, nil
}

func (s *AgentService) CreateAgent(name, description string) (*model.Agent, string, error) {
	apiKey, err := generateAPIKey()
	if err != nil {
		return nil, "", err
	}

	keyHash := hashAPIKey(apiKey)
	keyPrefix := apiKey[:12] + "..."

	agent := &model.Agent{
		Name:         name,
		Description:  description,
		APIKeyHash:   keyHash,
		APIKeyPrefix: keyPrefix,
		Enabled:      true,
	}

	if err := s.db.Create(agent).Error; err != nil {
		return nil, "", err
	}

	return agent, apiKey, nil
}

func (s *AgentService) UpdateAgent(id int64, name, description string, enabled bool) error {
	return s.db.Model(&model.Agent{}).Where("id = ?", id).Updates(map[string]interface{}{
		"name":        name,
		"description": description,
		"enabled":     enabled,
	}).Error
}

func (s *AgentService) DeleteAgent(id int64) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("agent_id = ?", id).Delete(&model.AgentNotebookPermission{}).Error; err != nil {
			return err
		}
		return tx.Delete(&model.Agent{}, id).Error
	})
}

func (s *AgentService) RegenerateAPIKey(id int64) (string, error) {
	apiKey, err := generateAPIKey()
	if err != nil {
		return "", err
	}

	keyHash := hashAPIKey(apiKey)
	keyPrefix := apiKey[:12] + "..."

	if err := s.db.Model(&model.Agent{}).Where("id = ?", id).Updates(map[string]interface{}{
		"api_key":        keyHash,
		"api_key_prefix": keyPrefix,
	}).Error; err != nil {
		return "", err
	}

	return apiKey, nil
}

func (s *AgentService) GetAgentPermissions(agentID int64) ([]AgentPermission, error) {
	var perms []model.AgentNotebookPermission
	if err := s.db.Preload("Notebook").Where("agent_id = ?", agentID).Find(&perms).Error; err != nil {
		return nil, err
	}

	result := make([]AgentPermission, len(perms))
	for i, p := range perms {
		notebookName := ""
		if p.Notebook != nil {
			notebookName = p.Notebook.Name
		}
		result[i] = AgentPermission{
			NotebookID:   p.NotebookID,
			NotebookName: notebookName,
			AccessLevel:  p.AccessLevel,
		}
	}
	return result, nil
}

func (s *AgentService) SetAgentPermissions(agentID int64, permissions []AgentPermission) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("agent_id = ?", agentID).Delete(&model.AgentNotebookPermission{}).Error; err != nil {
			return err
		}

		for _, p := range permissions {
			if p.AccessLevel == "" || p.AccessLevel == "none" {
				continue
			}
			perm := model.AgentNotebookPermission{
				AgentID:     agentID,
				NotebookID:  p.NotebookID,
				AccessLevel: p.AccessLevel,
			}
			if err := tx.Create(&perm).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func (s *AgentService) ValidateAPIKey(apiKey string) (*model.Agent, error) {
	keyHash := hashAPIKey(apiKey)

	var agent model.Agent
	if err := s.db.Where("api_key = ? AND enabled = ?", keyHash, true).First(&agent).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("invalid API key")
		}
		return nil, err
	}

	go s.db.Model(&agent).Update("last_used_at", gorm.Expr("CURRENT_TIMESTAMP"))

	return &agent, nil
}

func (s *AgentService) CheckAgentAccess(agentID int64, notebookName string, requiredLevel string) (bool, error) {
	var notebook model.Notebook
	if err := s.db.Where("name = ?", notebookName).First(&notebook).Error; err != nil {
		return false, err
	}

	var perm model.AgentNotebookPermission
	if err := s.db.Where("agent_id = ? AND notebook_id = ?", agentID, notebook.ID).First(&perm).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return false, nil
		}
		return false, err
	}

	if requiredLevel == "read" {
		return perm.AccessLevel == "read" || perm.AccessLevel == "readwrite", nil
	}
	return perm.AccessLevel == "readwrite", nil
}

func generateAPIKey() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return fmt.Sprintf("vn_sk_%s", hex.EncodeToString(bytes)), nil
}

func hashAPIKey(apiKey string) string {
	hash := sha256.Sum256([]byte(apiKey))
	return hex.EncodeToString(hash[:])
}
