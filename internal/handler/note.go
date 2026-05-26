package handler

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/idealland-apps/valenote/internal/middleware"
	"github.com/idealland-apps/valenote/internal/service"
	"github.com/gin-gonic/gin"
)

type NoteHandler struct {
	noteService   *service.NoteService
	searchService *service.SearchService
}

func NewNoteHandler(noteService *service.NoteService, searchService *service.SearchService) *NoteHandler {
	return &NoteHandler{noteService: noteService, searchService: searchService}
}

func (h *NoteHandler) ListNotebooks(c *gin.Context) {
	notebooks, err := h.noteService.ListNotebooks()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list notebooks"})
		return
	}
	c.JSON(http.StatusOK, notebooks)
}

type CreateNotebookRequest struct {
	Name        string `json:"name" binding:"required"`
	Description string `json:"description"`
}

func (h *NoteHandler) CreateNotebook(c *gin.Context) {
	var req CreateNotebookRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	notebook, err := h.noteService.CreateNotebook(req.Name, req.Description)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, notebook)
}

func (h *NoteHandler) GetNotebook(c *gin.Context) {
	name := c.Param("name")
	notebook, err := h.noteService.GetNotebook(name)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "notebook not found"})
		return
	}
	c.JSON(http.StatusOK, notebook)
}

type UpdateNotebookRequest struct {
	Description *string `json:"description"`
	IsPublic    *bool   `json:"is_public"`
}

func (h *NoteHandler) UpdateNotebook(c *gin.Context) {
	name := c.Param("name")
	var req UpdateNotebookRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	notebook, err := h.noteService.UpdateNotebook(name, req.Description, req.IsPublic)
	if err != nil {
		if err == service.ErrNotebookNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "notebook not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, notebook)
}

func (h *NoteHandler) DeleteNotebook(c *gin.Context) {
	name := c.Param("name")
	if err := h.noteService.DeleteNotebook(name); err != nil {
		if err == service.ErrNotebookNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "notebook not found"})
			return
		}
		if strings.Contains(err.Error(), "not empty") {
			c.JSON(http.StatusBadRequest, gin.H{"error": "notebook is not empty"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusNoContent, nil)
}

func (h *NoteHandler) ListNotes(c *gin.Context) {
	notebook := c.Query("notebook")
	recursive := c.Query("recursive") != "false"

	notes, err := h.noteService.ListNotes(notebook, recursive)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list notes"})
		return
	}

	c.JSON(http.StatusOK, notes)
}

func (h *NoteHandler) GetNote(c *gin.Context) {
	path := c.Param("path")
	note, err := h.noteService.GetNote(path)
	if err != nil {
		if err == service.ErrNoteNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "note not found"})
			return
		}
		if err == service.ErrInvalidPath || err == service.ErrPathEscape {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid path"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, note)
}

func (h *NoteHandler) CreateNote(c *gin.Context) {
	var req service.CreateNoteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID := middleware.GetUserID(c)
	note, err := h.noteService.CreateNote(&req, userID)
	if err != nil {
		if err == service.ErrInvalidPath || err == service.ErrPathEscape {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid path"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, note)
}

func (h *NoteHandler) UpdateNote(c *gin.Context) {
	path := c.Param("path")

	var req service.UpdateNoteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID := middleware.GetUserID(c)
	note, conflict, err := h.noteService.UpdateNote(path, &req, userID)
	if err != nil {
		if err == service.ErrConflict {
			c.JSON(http.StatusConflict, gin.H{
				"error":   "conflict",
				"message": "The note has been modified since you started editing",
				"detail":  conflict,
			})
			return
		}
		if err == service.ErrNoteNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "note not found"})
			return
		}
		if err == service.ErrInvalidPath || err == service.ErrPathEscape {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid path"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, note)
}

func (h *NoteHandler) DeleteNote(c *gin.Context) {
	path := c.Param("path")

	if err := h.noteService.DeleteNote(path); err != nil {
		if err == service.ErrNoteNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "note not found"})
			return
		}
		if err == service.ErrInvalidPath || err == service.ErrPathEscape {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid path"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusNoContent, nil)
}

func (h *NoteHandler) SearchNotes(c *gin.Context) {
	query := c.Query("q")
	notebook := c.Query("notebook")
	tagsStr := c.Query("tags")
	limitStr := c.DefaultQuery("limit", "20")

	limit, _ := strconv.Atoi(limitStr)

	var tags []string
	if tagsStr != "" {
		tags = strings.Split(tagsStr, ",")
	}

	notes, err := h.noteService.Search(query, notebook, tags, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "search failed"})
		return
	}

	c.JSON(http.StatusOK, notes)
}

func (h *NoteHandler) SearchFulltext(c *gin.Context) {
	query := c.Query("q")
	notebook := c.Query("notebook")
	limitStr := c.DefaultQuery("limit", "20")

	limit, _ := strconv.Atoi(limitStr)

	results, err := h.searchService.SearchFulltext(query, notebook, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "search failed"})
		return
	}

	c.JSON(http.StatusOK, results)
}

type CreateFolderRequest struct {
	Path string `json:"path" binding:"required"`
}

func (h *NoteHandler) CreateFolder(c *gin.Context) {
	var req CreateFolderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.noteService.CreateFolder(req.Path); err != nil {
		if err == service.ErrInvalidPath || err == service.ErrPathEscape {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid path"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"path": req.Path})
}

func (h *NoteHandler) DeleteFolder(c *gin.Context) {
	path := c.Param("path")

	if err := h.noteService.DeleteFolder(path); err != nil {
		if err == service.ErrNoteNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "folder not found"})
			return
		}
		if err == service.ErrInvalidPath || err == service.ErrPathEscape {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid path"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusNoContent, nil)
}

type MoveFileRequest struct {
	Source string `json:"source" binding:"required"`
	Target string `json:"target" binding:"required"`
}

func (h *NoteHandler) MoveFile(c *gin.Context) {
	var req MoveFileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.noteService.MoveFile(req.Source, req.Target); err != nil {
		if err == service.ErrNoteNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "source not found"})
			return
		}
		if err == service.ErrInvalidPath || err == service.ErrPathEscape {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid path"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"source": req.Source, "target": req.Target})
}

type CopyFileRequest struct {
	Source string `json:"source" binding:"required"`
	Target string `json:"target" binding:"required"`
}

func (h *NoteHandler) CopyFile(c *gin.Context) {
	var req CopyFileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.noteService.CopyFile(req.Source, req.Target); err != nil {
		if err == service.ErrNoteNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "source not found"})
			return
		}
		if err == service.ErrInvalidPath || err == service.ErrPathEscape {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid path"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"source": req.Source, "target": req.Target})
}

func (h *NoteHandler) ListFiles(c *gin.Context) {
	notebook := c.Query("notebook")
	includeFolders := c.Query("include_folders") == "true"

	items, err := h.noteService.ListFiles(notebook, includeFolders)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list files"})
		return
	}

	c.JSON(http.StatusOK, items)
}
