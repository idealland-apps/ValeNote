package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/idealland-apps/valenote/internal/config"
	"github.com/idealland-apps/valenote/internal/handler"
	"github.com/idealland-apps/valenote/internal/mcp"
	"github.com/idealland-apps/valenote/internal/middleware"
	"github.com/idealland-apps/valenote/internal/model"
	"github.com/idealland-apps/valenote/internal/service"
	"github.com/gin-gonic/gin"
)

func main() {
	cfg := config.Load()

	if cfg.Server.Mode == "release" {
		gin.SetMode(gin.ReleaseMode)
	}

	db, err := model.InitDB(cfg)
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}

	if err := os.MkdirAll(cfg.Notes.RootPath, 0755); err != nil {
		log.Fatalf("Failed to create notes directory: %v", err)
	}
	if err := os.MkdirAll(cfg.Notes.VersionsPath, 0755); err != nil {
		log.Fatalf("Failed to create versions directory: %v", err)
	}

	authService := service.NewAuthService(db, cfg)
	noteService := service.NewNoteService(db, cfg)

	// Sync filesystem with database on startup
	if err := noteService.SyncFromFilesystem(); err != nil {
		log.Printf("Warning: Initial filesystem sync failed: %v", err)
	}
	attachmentService := service.NewAttachmentService(cfg)
	versionService := service.NewVersionService(db, cfg)
	exportService := service.NewExportService(cfg)
	searchService := service.NewSearchService(db, cfg)
	publicService := service.NewPublicService(db, cfg, noteService)
	linkService := service.NewLinkService(db, noteService)
	remoteSyncService := service.NewRemoteSyncService(db, cfg)
	remoteSyncService.StartScheduler()
	agentService := service.NewAgentService(db)
	userService := service.NewUserService(db)

	webDistPath := filepath.Join("web", "dist")

	mcpServer := mcp.NewServer(noteService, searchService, agentService)

	authHandler := handler.NewAuthHandler(authService)
	noteHandler := handler.NewNoteHandler(noteService, searchService)
	attachmentHandler := handler.NewAttachmentHandler(attachmentService)
	versionHandler := handler.NewVersionHandler(versionService, noteService)
	exportHandler := handler.NewExportHandler(exportService, authService)
	mcpHandler := handler.NewMCPHandler(mcpServer, agentService)
	publicHandler := handler.NewPublicHandler(publicService)
	linkHandler := handler.NewLinkHandler(linkService)
	remoteSyncHandler := handler.NewRemoteSyncHandler(remoteSyncService)
	tagHandler := handler.NewTagHandler(searchService)
	agentHandler := handler.NewAgentHandler(agentService)
	settingsHandler := handler.NewSettingsHandler(db, webDistPath)
	userHandler := handler.NewUserHandler(userService, authService)
	agentAPIHandler := handler.NewAgentAPIHandler(noteService, searchService, agentService)

	r := gin.Default()

	r.Use(corsMiddleware())

	r.GET("/mcp/sse", mcpHandler.HandleSSE)
	r.POST("/mcp/sse", mcpHandler.HandleSSEPost)
	r.POST("/mcp", mcpHandler.HandleMCP)

	api := r.Group("/api/v1")
	{
		auth := api.Group("/auth")
		{
			auth.POST("/login", authHandler.Login)
		}

		api.GET("/export", exportHandler.Export)

		protected := api.Group("")
		protected.Use(middleware.AuthMiddleware(authService))
		{
			protected.GET("/auth/me", authHandler.Me)

			protected.GET("/notebooks", noteHandler.ListNotebooks)
			protected.POST("/notebooks", noteHandler.CreateNotebook)
			protected.GET("/notebooks/:name", noteHandler.GetNotebook)
			protected.PUT("/notebooks/:name", noteHandler.UpdateNotebook)
			protected.DELETE("/notebooks/:name", noteHandler.DeleteNotebook)
			protected.PUT("/notebooks/:name/public", publicHandler.SetNotebookPublic)

			protected.GET("/notes", noteHandler.ListNotes)
			protected.POST("/notes", noteHandler.CreateNote)
			protected.GET("/notes/*path", noteHandler.GetNote)
			protected.PUT("/notes/*path", noteHandler.UpdateNote)
			protected.DELETE("/notes/*path", noteHandler.DeleteNote)

			protected.GET("/files", noteHandler.ListFiles)
			protected.POST("/files/move", noteHandler.MoveFile)
			protected.POST("/files/copy", noteHandler.CopyFile)
			protected.POST("/folders", noteHandler.CreateFolder)
			protected.DELETE("/folders/*path", noteHandler.DeleteFolder)

			protected.GET("/search", noteHandler.SearchNotes)
			protected.GET("/search/fulltext", noteHandler.SearchFulltext)
			protected.GET("/tags", tagHandler.ListTags)

			protected.POST("/upload", attachmentHandler.Upload)
			protected.GET("/note-attachments", attachmentHandler.List)
			protected.DELETE("/note-attachments", attachmentHandler.Delete)

			protected.GET("/versions/*path", versionHandler.ListVersions)
			protected.GET("/version/*path", versionHandler.GetVersionContent)
			protected.POST("/version/*path", versionHandler.RestoreVersion)
			protected.GET("/version-diff/*path", versionHandler.DiffVersion)

			protected.GET("/attachments/*path", attachmentHandler.Serve)

			protected.POST("/export/token", exportHandler.GetExportToken)

			protected.GET("/settings/public-path", publicHandler.GetPublicBasePath)
			protected.PUT("/settings/public-path", publicHandler.SetPublicBasePath)

			protected.GET("/backlinks/*path", linkHandler.GetBacklinks)
			protected.POST("/resolve-link", linkHandler.ResolveLink)

			protected.GET("/settings/remote-storage", remoteSyncHandler.ListStorages)
			protected.POST("/settings/remote-storage", remoteSyncHandler.CreateStorage)
			protected.PUT("/settings/remote-storage/:id", remoteSyncHandler.UpdateStorage)
			protected.DELETE("/settings/remote-storage/:id", remoteSyncHandler.DeleteStorage)
			protected.POST("/settings/remote-storage/:id/test", remoteSyncHandler.TestConnection)
			protected.POST("/settings/remote-storage/:id/sync", remoteSyncHandler.TriggerSync)
			protected.GET("/settings/remote-storage/:id/history", remoteSyncHandler.GetSyncHistory)

			protected.GET("/settings/system", settingsHandler.GetSettings)
			protected.PUT("/settings/system", settingsHandler.UpdateSettings)
			protected.POST("/settings/favicon", settingsHandler.UploadFavicon)

			protected.GET("/settings/user", settingsHandler.GetUserSettings)
			protected.PUT("/settings/user", settingsHandler.UpdateUserSettings)

			protected.GET("/agents", agentHandler.ListAgents)
			protected.POST("/agents", agentHandler.CreateAgent)
			protected.GET("/agents/:id", agentHandler.GetAgent)
			protected.PUT("/agents/:id", agentHandler.UpdateAgent)
			protected.DELETE("/agents/:id", agentHandler.DeleteAgent)
			protected.POST("/agents/:id/regenerate-key", agentHandler.RegenerateAPIKey)
			protected.GET("/agents/:id/permissions", agentHandler.GetPermissions)
			protected.PUT("/agents/:id/permissions", agentHandler.SetPermissions)

			protected.GET("/users", userHandler.ListUsers)
			protected.POST("/users", userHandler.CreateUser)
			protected.PUT("/users/:id", userHandler.UpdateUser)
			protected.PUT("/users/:id/password", userHandler.UpdatePassword)
			protected.DELETE("/users/:id", userHandler.DeleteUser)
		}

		// Agent API routes (agent API key auth only)
		agentAPI := api.Group("/agent")
		agentAPI.Use(middleware.AgentAuthMiddleware(agentService))
		{
			agentAPI.GET("/notebooks", agentAPIHandler.ListNotebooks)
			agentAPI.GET("/notes", agentAPIHandler.ListNotes)
			agentAPI.GET("/notes/*path", agentAPIHandler.GetNote)
			agentAPI.POST("/notes", agentAPIHandler.CreateNote)
			agentAPI.PUT("/notes/*path", agentAPIHandler.UpdateNote)
			agentAPI.POST("/notes/move", agentAPIHandler.MoveNote)
			agentAPI.GET("/search", agentAPIHandler.SearchNotes)
		}
	}

	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	r.GET("/api/v1/version", func(c *gin.Context) {
		version := "dev"
		if data, err := os.ReadFile("version.txt"); err == nil {
			version = strings.TrimSpace(string(data))
		}
		c.JSON(200, gin.H{"version": version})
	})

	// Public API routes (no auth required)
	publicAPI := r.Group("/api/v1/public")
	{
		publicAPI.GET("/notebooks", publicHandler.ListPublicNotebooks)
		publicAPI.GET("/site-name", settingsHandler.GetSiteName)
		publicAPI.GET("/base-path", publicHandler.GetPublicBasePath)
		publicAPI.GET("/settings", publicHandler.GetPublicSettings)
		publicAPI.GET("/:notebook/tree", publicHandler.GetNotebookTree)
		publicAPI.GET("/:notebook/note/*path", publicHandler.GetPublicNote)
		publicAPI.GET("/:notebook/folder", publicHandler.GetFolderNotes)
		publicAPI.GET("/:notebook/folder/*path", publicHandler.GetFolderNotes)
		publicAPI.GET("/:notebook/attachment/*path", publicHandler.ServePublicAttachment)
	}

	// Serve static files for SPA
	if _, err := os.Stat(webDistPath); err == nil {
		r.Static("/assets", filepath.Join(webDistPath, "assets"))
		r.StaticFile("/favicon.svg", filepath.Join(webDistPath, "favicon.svg"))
		r.StaticFile("/default-logo.svg", filepath.Join(webDistPath, "default-logo.svg"))

		indexPath := filepath.Join(webDistPath, "index.html")
		serveIndex := func(c *gin.Context) {
			html, err := os.ReadFile(indexPath)
			if err != nil {
				c.String(http.StatusInternalServerError, "Failed to load page")
				return
			}
			basePath := publicService.GetPublicBasePath()
			injection := `<script>window.__VALENOTE_CONFIG__={publicBasePath:"` + basePath + `"}</script>`
			modified := strings.Replace(string(html), "<head>", "<head>"+injection, 1)
			c.Header("Content-Type", "text/html; charset=utf-8")
			c.String(http.StatusOK, modified)
		}

		r.GET("/", func(c *gin.Context) {
			c.Redirect(302, "/app")
		})
		r.GET("/app", serveIndex)
		r.GET("/app/*path", serveIndex)
		r.GET("/login", serveIndex)
		r.GET("/public", serveIndex)
		r.GET("/public/*path", serveIndex)

		r.NoRoute(func(c *gin.Context) {
			path := c.Request.URL.Path
			basePath := publicService.GetPublicBasePath()
			if path == basePath || strings.HasPrefix(path, basePath+"/") {
				serveIndex(c)
				return
			}
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		})
	} else {
		r.NoRoute(func(c *gin.Context) {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		})
	}

	log.Printf("Starting ValeNote server on port %s", cfg.Server.Port)
	if err := r.Run(":" + cfg.Server.Port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}

func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE, PATCH")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	}
}
