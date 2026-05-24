package main

import (
	"log"
	"os"
	"path/filepath"

	"github.com/anthropics/valenote/internal/config"
	"github.com/anthropics/valenote/internal/handler"
	"github.com/anthropics/valenote/internal/mcp"
	"github.com/anthropics/valenote/internal/middleware"
	"github.com/anthropics/valenote/internal/model"
	"github.com/anthropics/valenote/internal/service"
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

	hub := service.NewHub()
	go hub.Run()

	authService := service.NewAuthService(db, cfg)
	noteService := service.NewNoteService(db, cfg)
	attachmentService := service.NewAttachmentService(cfg)
	versionService := service.NewVersionService(db, cfg)
	exportService := service.NewExportService(cfg)
	searchService := service.NewSearchService(db)
	publicService := service.NewPublicService(db, cfg, noteService)
	linkService := service.NewLinkService(db, noteService)
	remoteSyncService := service.NewRemoteSyncService(db, cfg)
	remoteSyncService.StartScheduler()
	agentService := service.NewAgentService(db)
	userService := service.NewUserService(db)

	mcpServer := mcp.NewServer(noteService, searchService)

	authHandler := handler.NewAuthHandler(authService)
	noteHandler := handler.NewNoteHandler(noteService)
	attachmentHandler := handler.NewAttachmentHandler(attachmentService)
	versionHandler := handler.NewVersionHandler(versionService, noteService)
	exportHandler := handler.NewExportHandler(exportService)
	wsHandler := handler.NewWebSocketHandler(hub, authService)
	mcpHandler := handler.NewMCPHandler(mcpServer)
	publicHandler := handler.NewPublicHandler(publicService)
	linkHandler := handler.NewLinkHandler(linkService)
	remoteSyncHandler := handler.NewRemoteSyncHandler(remoteSyncService)
	tagHandler := handler.NewTagHandler(searchService)
	agentHandler := handler.NewAgentHandler(agentService)
	settingsHandler := handler.NewSettingsHandler(db)
	userHandler := handler.NewUserHandler(userService, authService)

	r := gin.Default()

	r.Use(corsMiddleware())

	r.GET("/ws", wsHandler.HandleWebSocket)

	r.GET("/mcp/sse", mcpHandler.HandleSSE)
	r.POST("/mcp", mcpHandler.HandleMCP)

	api := r.Group("/api/v1")
	{
		auth := api.Group("/auth")
		{
			auth.POST("/login", authHandler.Login)
		}

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
			protected.GET("/tags", tagHandler.ListTags)

			protected.POST("/upload", attachmentHandler.Upload)

			protected.GET("/versions/*path", versionHandler.ListVersions)
			protected.GET("/version/:id", versionHandler.GetVersionContent)
			protected.POST("/version/:id/restore", versionHandler.RestoreVersion)
			protected.GET("/version/:id/diff", versionHandler.DiffVersion)

			protected.GET("/attachments/*path", attachmentHandler.Serve)

			protected.GET("/export", exportHandler.Export)

			protected.GET("/editors", wsHandler.GetEditors)

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

			protected.GET("/settings/system", settingsHandler.GetSettings)
			protected.PUT("/settings/system", settingsHandler.UpdateSettings)

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
	}

	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	// Public API routes (no auth required)
	publicAPI := r.Group("/api/v1/public")
	{
		publicAPI.GET("/notebooks", publicHandler.ListPublicNotebooks)
		publicAPI.GET("/site-name", settingsHandler.GetSiteName)
		publicAPI.GET("/:notebook/tree", publicHandler.GetNotebookTree)
		publicAPI.GET("/:notebook/note/*path", publicHandler.GetPublicNote)
		publicAPI.GET("/:notebook/folder", publicHandler.GetFolderNotes)
		publicAPI.GET("/:notebook/folder/*path", publicHandler.GetFolderNotes)
	}

	// Serve static files for SPA
	webDistPath := filepath.Join("web", "dist")
	if _, err := os.Stat(webDistPath); err == nil {
		r.Static("/assets", filepath.Join(webDistPath, "assets"))
		r.StaticFile("/favicon.svg", filepath.Join(webDistPath, "favicon.svg"))

		serveIndex := func(c *gin.Context) {
			c.File(filepath.Join(webDistPath, "index.html"))
		}

		r.GET("/", func(c *gin.Context) {
			c.Redirect(302, "/app")
		})
		r.GET("/app", serveIndex)
		r.GET("/app/*path", serveIndex)
		r.GET("/login", serveIndex)
		r.GET("/public", serveIndex)
		r.GET("/public/*path", serveIndex)
	}

	r.NoRoute(publicHandler.HandlePublicNote)

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
