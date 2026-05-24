package service

import (
	"errors"

	"github.com/idealland-apps/valenote/internal/model"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

var (
	ErrLastAdmin      = errors.New("cannot remove the last admin")
	ErrUsernameExists = errors.New("username already exists")
)

type UserService struct {
	db *gorm.DB
}

func NewUserService(db *gorm.DB) *UserService {
	return &UserService{db: db}
}

func (s *UserService) ListUsers() ([]model.User, error) {
	var users []model.User
	if err := s.db.Order("id").Find(&users).Error; err != nil {
		return nil, err
	}
	return users, nil
}

func (s *UserService) GetUser(id int64) (*model.User, error) {
	var user model.User
	if err := s.db.First(&user, id).Error; err != nil {
		return nil, ErrUserNotFound
	}
	return &user, nil
}

func (s *UserService) CreateUser(username, password, email string, isAdmin bool) (*model.User, error) {
	var existing model.User
	if err := s.db.Where("username = ?", username).First(&existing).Error; err == nil {
		return nil, ErrUsernameExists
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	if err != nil {
		return nil, err
	}

	user := &model.User{
		Username:     username,
		PasswordHash: string(hash),
		IsAdmin:      isAdmin,
	}
	if email != "" {
		user.Email = &email
	}

	if err := s.db.Create(user).Error; err != nil {
		return nil, err
	}

	return user, nil
}

func (s *UserService) UpdateUser(id int64, username, email string, isAdmin *bool) (*model.User, error) {
	var user model.User
	if err := s.db.First(&user, id).Error; err != nil {
		return nil, ErrUserNotFound
	}

	if username != "" && username != user.Username {
		var existing model.User
		if err := s.db.Where("username = ? AND id != ?", username, id).First(&existing).Error; err == nil {
			return nil, ErrUsernameExists
		}
		user.Username = username
	}

	if email != "" {
		user.Email = &email
	}

	if isAdmin != nil && *isAdmin != user.IsAdmin {
		if user.IsAdmin && !*isAdmin {
			if err := s.checkLastAdmin(id); err != nil {
				return nil, err
			}
		}
		user.IsAdmin = *isAdmin
	}

	if err := s.db.Save(&user).Error; err != nil {
		return nil, err
	}

	return &user, nil
}

func (s *UserService) UpdatePassword(id int64, newPassword string) error {
	var user model.User
	if err := s.db.First(&user, id).Error; err != nil {
		return ErrUserNotFound
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), 12)
	if err != nil {
		return err
	}

	user.PasswordHash = string(hash)
	return s.db.Save(&user).Error
}

func (s *UserService) DeleteUser(id int64) error {
	var user model.User
	if err := s.db.First(&user, id).Error; err != nil {
		return ErrUserNotFound
	}

	if user.IsAdmin {
		if err := s.checkLastAdmin(id); err != nil {
			return err
		}
	}

	return s.db.Delete(&user).Error
}

func (s *UserService) checkLastAdmin(excludeID int64) error {
	var count int64
	s.db.Model(&model.User{}).Where("is_admin = ? AND id != ?", true, excludeID).Count(&count)
	if count == 0 {
		return ErrLastAdmin
	}
	return nil
}
