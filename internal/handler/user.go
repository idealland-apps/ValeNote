package handler

import (
	"net/http"
	"strconv"

	"github.com/anthropics/valenote/internal/service"
	"github.com/gin-gonic/gin"
)

type UserHandler struct {
	userService *service.UserService
	authService *service.AuthService
}

func NewUserHandler(userService *service.UserService, authService *service.AuthService) *UserHandler {
	return &UserHandler{userService: userService, authService: authService}
}

type CreateUserRequest struct {
	Username string `json:"username" binding:"required,min=3,max=50"`
	Password string `json:"password" binding:"required,min=6"`
	Email    string `json:"email" binding:"omitempty,email"`
	IsAdmin  bool   `json:"is_admin"`
}

type UpdateUserRequest struct {
	Username string `json:"username" binding:"omitempty,min=3,max=50"`
	Email    string `json:"email" binding:"omitempty,email"`
	IsAdmin  *bool  `json:"is_admin"`
}

type UpdatePasswordRequest struct {
	Password string `json:"password" binding:"required,min=6"`
}

func (h *UserHandler) requireAdmin(c *gin.Context) bool {
	userID, _ := c.Get("user_id")
	user, err := h.authService.GetUserByID(userID.(int64))
	if err != nil || !user.IsAdmin {
		c.JSON(http.StatusForbidden, gin.H{"error": "admin access required"})
		return false
	}
	return true
}

func (h *UserHandler) ListUsers(c *gin.Context) {
	if !h.requireAdmin(c) {
		return
	}

	users, err := h.userService.ListUsers()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list users"})
		return
	}

	result := make([]gin.H, len(users))
	for i, u := range users {
		result[i] = gin.H{
			"id":         u.ID,
			"username":   u.Username,
			"email":      u.Email,
			"is_admin":   u.IsAdmin,
			"created_at": u.CreatedAt,
			"updated_at": u.UpdatedAt,
		}
	}

	c.JSON(http.StatusOK, result)
}

func (h *UserHandler) CreateUser(c *gin.Context) {
	if !h.requireAdmin(c) {
		return
	}

	var req CreateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user, err := h.userService.CreateUser(req.Username, req.Password, req.Email, req.IsAdmin)
	if err != nil {
		if err == service.ErrUsernameExists {
			c.JSON(http.StatusConflict, gin.H{"error": "username already exists"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create user"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"id":         user.ID,
		"username":   user.Username,
		"email":      user.Email,
		"is_admin":   user.IsAdmin,
		"created_at": user.CreatedAt,
	})
}

func (h *UserHandler) UpdateUser(c *gin.Context) {
	if !h.requireAdmin(c) {
		return
	}

	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user id"})
		return
	}

	var req UpdateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user, err := h.userService.UpdateUser(id, req.Username, req.Email, req.IsAdmin)
	if err != nil {
		if err == service.ErrUserNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
			return
		}
		if err == service.ErrUsernameExists {
			c.JSON(http.StatusConflict, gin.H{"error": "username already exists"})
			return
		}
		if err == service.ErrLastAdmin {
			c.JSON(http.StatusBadRequest, gin.H{"error": "cannot remove the last admin"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update user"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":         user.ID,
		"username":   user.Username,
		"email":      user.Email,
		"is_admin":   user.IsAdmin,
		"updated_at": user.UpdatedAt,
	})
}

func (h *UserHandler) UpdatePassword(c *gin.Context) {
	if !h.requireAdmin(c) {
		return
	}

	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user id"})
		return
	}

	var req UpdatePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.userService.UpdatePassword(id, req.Password); err != nil {
		if err == service.ErrUserNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update password"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "password updated"})
}

func (h *UserHandler) DeleteUser(c *gin.Context) {
	if !h.requireAdmin(c) {
		return
	}

	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user id"})
		return
	}

	if err := h.userService.DeleteUser(id); err != nil {
		if err == service.ErrUserNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
			return
		}
		if err == service.ErrLastAdmin {
			c.JSON(http.StatusBadRequest, gin.H{"error": "cannot delete the last admin"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete user"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "user deleted"})
}
