# ValeNote 设计文档

## 项目概述

ValeNote 是一款云端笔记软件，核心理念是：
- **数据透明**：笔记以纯 Markdown 格式存储，用户完全掌控数据
- **云端访问**：部署后通过网页在任意设备访问，无需手动同步
- **Agent 友好**：提供 API/MCP 接口，方便 AI Agent 管理笔记
- **笔记本隔离**：支持多笔记本，通过 Agent 账号管理 AI 访问权限

---

## 技术选型

### 后端 (Go)

| 组件 | 选型 | 理由 |
|------|------|------|
| Web 框架 | **Gin** | 轻量、高性能、生态成熟 |
| 数据库 | **SQLite** + **GORM** | 轻量部署、单文件、足够个人/小团队使用 |
| 认证 | **JWT** | 无状态、多设备友好 |
| 文件监控 | **fsnotify** | 监控 Markdown 文件变化 |
| WebSocket | **gorilla/websocket** | 实时协作和通知 |
| 配置管理 | **Viper** | 支持多格式配置文件 |

### 前端 (React)

| 组件 | 选型 | 理由 |
|------|------|------|
| 框架 | **React 18** + **TypeScript** | 类型安全、生态丰富 |
| UI 库 | **Material UI v5** | 你的需求 + 组件丰富 |
| 状态管理 | **Zustand** | 轻量、简单、TypeScript 友好 |
| 路由 | **React Router v6** | 标准选择 |
| Markdown 编辑器 | **Milkdown** | 基于 ProseMirror，WYSIWYG + 源码模式，可扩展 |
| Markdown 渲染 | **react-markdown** + **remark-gfm** | 预览模式 |
| HTTP 客户端 | **Axios** | 拦截器、取消请求等 |
| 构建工具 | **Vite** | 快速、现代 |

### Agent 集成

| 方案 | 选型 | 理由 |
|------|------|------|
| 主要方案 | **MCP Server** | Claude Code 原生支持，结构化工具定义 |
| 备选方案 | **REST API** | 通用性强，任何 Agent 可调用 |

---

## 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         客户端层                                 │
├─────────────────┬─────────────────┬─────────────────────────────┤
│   Web Browser   │   AI Agent      │   CLI (future)              │
│   (React SPA)   │   (MCP/REST)    │                             │
└────────┬────────┴────────┬────────┴─────────────────────────────┘
         │                 │
         ▼                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                        API 网关层                                │
├─────────────────────────────────────────────────────────────────┤
│  Gin Router                                                     │
│  ├── /api/v1/auth/*     认证相关                                │
│  ├── /api/v1/notes/*    笔记 CRUD                               │
│  ├── /api/v1/search/*   搜索                                    │
│  ├── /api/v1/files/*    附件管理                                │
│  ├── /ws                WebSocket (实时同步)                    │
│  └── /mcp               MCP Server 端点                         │
└────────┬────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                        服务层                                    │
├──────────────┬──────────────┬──────────────┬────────────────────┤
│ AuthService  │ NoteService  │ SearchService│ SyncService        │
│              │              │              │                    │
│ - 登录/注册  │ - CRUD       │ - 全文检索   │ - 冲突检测         │
│ - JWT 管理   │ - 元数据     │ - 标签索引   │ - 实时广播         │
│ - 权限验证   │ - 附件管理   │              │ - 版本管理         │
└──────────────┴──────────────┴──────────────┴────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                        数据层                                    │
├────────────────────────────┬────────────────────────────────────┤
│        SQLite              │         File System                │
│                            │                                    │
│  - users                   │  /notes                            │
│  - notebooks               │    ├── notebook1/                  │
│  - agents                  │    │   ├── note.md                 │
│  - agent_permissions       │    │   └── note/                   │
│  - note_metadata           │    │       └── attachments/        │
│  - note_versions           │    └── notebook2/                  │
│  - note_locks              │        └── ...                     │
└────────────────────────────┴────────────────────────────────────┘
```

---

## 数据模型

### SQLite Schema

```sql
-- 用户表
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 笔记本表 (一级目录 = 一个笔记本)
CREATE TABLE notebooks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,            -- 目录名，如 "work", "personal"
    display_name TEXT,                    -- 显示名称
    description TEXT,
    is_public BOOLEAN DEFAULT false,      -- 是否公开发布
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Agent 账号表
CREATE TABLE agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,            -- Agent 名称，如 "claude-code", "note-bot"
    description TEXT,                     -- 描述，如 "用于 Claude Code 管理笔记"
    api_key TEXT UNIQUE NOT NULL,         -- API Key (sha256 hash 存储)
    api_key_prefix TEXT NOT NULL,         -- Key 前缀用于显示，如 "vn_sk_abc..."
    enabled BOOLEAN DEFAULT true,
    last_used_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Agent 笔记本权限表 (多对多)
CREATE TABLE agent_notebook_permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id INTEGER REFERENCES agents(id) ON DELETE CASCADE,
    notebook_id INTEGER REFERENCES notebooks(id) ON DELETE CASCADE,
    access_level TEXT NOT NULL,           -- read | readwrite
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(agent_id, notebook_id)
);

-- 笔记元数据 (文件系统为 source of truth，这里做索引/缓存)
CREATE TABLE note_metadata (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    notebook_id INTEGER REFERENCES notebooks(id),
    path TEXT UNIQUE NOT NULL,            -- 相对于 notes 根目录的路径
    title TEXT,                           -- 从 frontmatter 或首行提取
    checksum TEXT NOT NULL,               -- 文件内容 hash，用于变更检测
    size INTEGER,
    tags TEXT,                            -- JSON 数组
    file_mtime DATETIME,                  -- 文件系统修改时间
    created_at DATETIME,
    updated_at DATETIME,
    indexed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 笔记版本历史 (元数据，内容存文件系统)
CREATE TABLE note_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    note_path TEXT NOT NULL,              -- 笔记相对路径
    version_file TEXT NOT NULL,           -- 版本文件路径 (相对于 versions 目录)
    size INTEGER,                         -- 文件大小
    checksum TEXT NOT NULL,               -- 内容 hash
    created_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_note_path (note_path),
    INDEX idx_created_at (created_at)
);

-- 版本保留策略配置
-- settings 表: version_retention_days = 30, version_max_count = 100

-- 编辑锁 (乐观锁 + 过期机制)
CREATE TABLE note_locks (
    note_path TEXT PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    session_id TEXT NOT NULL,             -- 区分同一用户不同设备
    locked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL          -- 锁自动过期时间
);

-- 全文搜索 (SQLite FTS5)
CREATE VIRTUAL TABLE notes_fts USING fts5(
    path,
    title,
    content,
    tags,
    content='note_metadata',
    content_rowid='id'
);

-- 系统设置表
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 版本管理

#### 存储结构

```
{DATA_ROOT}/
├── valenote.db              # 数据库
└── versions/                # 版本文件存储
    └── work/
        └── projects/
            └── valenote.md/
                ├── 1705312345-a1b2c3.md    # 时间戳-短hash.md
                ├── 1705312400-d4e5f6.md
                └── 1705398800-e7f8g9.md

{NOTES_ROOT}/                # 用户笔记目录，保持干净
├── work/
├── personal/
└── ...
```

版本文件命名：`{unix_timestamp}-{checksum前6位}.md`

#### 工作流程

```
每次保存触发版本记录:

1. 用户保存笔记 work/projects/valenote.md
2. 检查内容是否真的变化 (对比 checksum)
3. 如果变化:
   - 复制当前内容到 versions/work/projects/valenote.md/{timestamp}-{hash}.md
   - 插入 note_versions 记录
   - 更新笔记文件
4. 异步清理过期版本

版本清理策略 (可配置):
- 保留最近 N 个版本 (默认 100)
- 或保留最近 N 天 (默认 30 天)
- 两个条件取并集，满足任一即保留
```

#### 后端实现

```go
// 保存版本 (简化示意)
func (s *VersionService) SaveVersion(notePath string, content []byte, userID int64) error {
    checksum := sha256Short(content)
    
    // 检查是否与最新版本相同，相同则跳过
    if latest, _ := s.getLatestVersion(notePath); latest != nil && latest.Checksum == checksum {
        return nil
    }
    
    // 写入版本文件: {DATA_ROOT}/versions/{notePath}/{timestamp}-{hash}.md
    versionFile := fmt.Sprintf("%d-%s.md", time.Now().Unix(), checksum[:6])
    versionPath := filepath.Join(s.versionsDir, notePath, versionFile)
    os.MkdirAll(filepath.Dir(versionPath), 0755)
    os.WriteFile(versionPath, content, 0644)
    
    // 记录元数据
    s.db.Create(&NoteVersion{
        NotePath: notePath, VersionFile: filepath.Join(notePath, versionFile),
        Size: int64(len(content)), Checksum: checksum, CreatedBy: userID,
    })
    
    // 异步清理过期版本
    go s.cleanupOldVersions(notePath)
    return nil
}

// 恢复到指定版本
func (s *VersionService) RestoreVersion(versionID int64, userID int64) error {
    version, _ := s.getVersion(versionID)
    content, _ := os.ReadFile(filepath.Join(s.versionsDir, version.VersionFile))
    
    // 恢复前先保存当前版本
    currentContent, _ := os.ReadFile(filepath.Join(notesRoot, version.NotePath))
    s.SaveVersion(version.NotePath, currentContent, userID)
    
    // 写入恢复的内容
    return os.WriteFile(filepath.Join(notesRoot, version.NotePath), content, 0644)
}
```

#### REST API

```
GET    /api/v1/notes/:path/versions           # 获取版本列表
GET    /api/v1/notes/:path/versions/:id       # 获取版本内容
POST   /api/v1/notes/:path/versions/:id/restore  # 恢复到指定版本
GET    /api/v1/notes/:path/versions/:id/diff  # 与当前版本对比 (可选)
```

#### 前端界面

```
版本历史面板 (侧边栏或对话框):
┌─────────────────────────────────────────────────────────────────┐
│  版本历史: valenote.md                                    [关闭] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ● 当前版本                                                      │
│    2024-01-15 14:20:00                                          │
│                                                                 │
│  ○ 2024-01-15 14:15:00                      [预览] [恢复]        │
│    by anthony · 2.3 KB                                          │
│                                                                 │
│  ○ 2024-01-15 10:30:00                      [预览] [恢复]        │
│    by anthony · 2.1 KB                                          │
│                                                                 │
│  ○ 2024-01-14 16:45:00                      [预览] [恢复]        │
│    by anthony · 1.8 KB                                          │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│  显示更多 (共 23 个版本)                                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

预览对比视图:
┌─────────────────────────────────────────────────────────────────┐
│  对比: 2024-01-15 14:15:00 vs 当前版本                    [关闭] │
├────────────────────────────┬────────────────────────────────────┤
│  历史版本                   │  当前版本                          │
├────────────────────────────┼────────────────────────────────────┤
│  # ValeNote 设计           │  # ValeNote 设计                   │
│                            │                                    │
│  ## 概述                   │  ## 概述                           │
│ -这是一款笔记软件          │ +这是一款云端笔记软件               │
│                            │                                    │
│  ## 功能                   │  ## 功能                           │
│ -支持 Markdown            │ +支持 Markdown                     │
│                            │ +支持版本管理                       │
│                            │                                    │
├────────────────────────────┴────────────────────────────────────┤
│                                        [ 取消 ]  [ 恢复此版本 ]   │
└─────────────────────────────────────────────────────────────────┘
```

### 文件系统与数据库同步策略

**核心原则：文件系统是 Source of Truth，数据库是索引/缓存**

```
┌─────────────────────────────────────────────────────────────────┐
│                    同步策略 (Sync Strategy)                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. 启动时全量扫描 (Cold Start)                                  │
│     - 遍历所有 .md 文件                                          │
│     - 比对 file_mtime + checksum                                │
│     - 更新/删除/新增 索引记录                                    │
│     - 耗时操作，后台异步执行，不阻塞服务启动                      │
│                                                                 │
│  2. 运行时增量同步 (Hot Sync)                                    │
│     - fsnotify 监听文件变化                                      │
│     - 防抖处理 (debounce 500ms)，避免频繁触发                    │
│     - 变更事件触发单文件重新索引                                  │
│                                                                 │
│  3. 读取时校验 (Read-Through Validation)                         │
│     - API 读取笔记时，先检查 mtime 是否变化                       │
│     - 若变化，重新读取文件并更新索引                              │
│     - 保证用户始终看到最新内容                                    │
│                                                                 │
│  4. 定期全量校验 (Periodic Full Scan)                            │
│     - 每小时执行一次轻量级校验                                    │
│     - 检测 fsnotify 可能漏掉的变更                               │
│     - 清理孤立索引 (文件已删除但索引还在)                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

同步流程伪代码:

func SyncNote(path string) {
    file, err := os.Stat(path)
    if os.IsNotExist(err) {
        // 文件已删除，清理索引
        db.Delete(path)
        return
    }
    
    meta := db.FindByPath(path)
    if meta == nil {
        // 新文件，创建索引
        meta = indexFile(path)
        db.Create(meta)
        return
    }
    
    // 快速检查: mtime 未变则跳过
    if meta.FileMtime == file.ModTime() {
        return
    }
    
    // mtime 变了，计算 checksum 确认内容是否真的变化
    content := readFile(path)
    newChecksum := sha256(content)
    
    if meta.Checksum != newChecksum {
        // 内容确实变化，更新索引
        meta.Update(content, newChecksum, file.ModTime())
        db.Save(meta)
        
        // 更新全文搜索索引
        fts.Reindex(meta)
    } else {
        // 只是 mtime 变了 (如 touch)，更新 mtime
        meta.FileMtime = file.ModTime()
        db.Save(meta)
    }
}
```

**为什么这样设计？**

| 场景 | 处理方式 |
|------|----------|
| 用户通过 ValeNote 编辑 | 写文件 → 更新索引，天然同步 |
| 用户通过外部编辑器修改 | fsnotify 捕获 → 重新索引 |
| 用户通过 git pull 批量更新 | fsnotify 批量事件 + 定期扫描兜底 |
| ValeNote 重启 | 启动时全量扫描，恢复一致性 |
| 数据库损坏/丢失 | 从文件系统完全重建，零数据丢失 |

### 文件系统结构

```
{NOTES_ROOT}/
├── work/                        # 笔记本: work (一级目录 = 笔记本)
│   ├── projects/
│   │   ├── valenote.md
│   │   └── valenote/
│   │       └── attachments/
│   │           └── screenshot.png
│   └── meetings/
│       └── 2024-01-15.md
├── personal/                    # 笔记本: personal
│   ├── journal/
│   │   └── 2024-01-15.md
│   └── ideas.md
├── shared/                      # 笔记本: shared (可开放给 AI)
│   └── knowledge-base/
│       └── tech-notes.md
└── .valenote/                   # ValeNote 内部数据 (不是笔记本)
    └── index.json
```

### Markdown 笔记格式

```markdown
---
title: 笔记标题
tags: [tag1, tag2]
created: 2024-01-15T10:30:00Z
updated: 2024-01-15T14:20:00Z
---

# 笔记内容

正文...

![图片](attachments/screenshot.png)
[附件](attachments/document.pdf)
```

---

## 核心功能设计

### 1. 冲突处理方案

采用 **OT-lite (Operational Transform 简化版)** + **乐观锁** 方案：

```
方案: Last-Write-Wins + 自动版本保存 + 冲突通知

工作流程:
1. 用户 A 打开笔记
   - 服务器记录 A 的 session 和 checksum
   - 不锁定文件

2. 用户 B 同时打开同一笔记
   - 服务器通过 WebSocket 通知 A: "B 也在编辑此笔记"
   - 两人均可继续编辑

3. 用户 A 保存
   - 服务器保存版本到 note_versions
   - 更新文件和 checksum
   - 通过 WebSocket 通知 B: 笔记已更新

4. 用户 B 保存时发现冲突 (checksum 不匹配)
   - 服务器保存 B 的版本为新版本
   - 向 B 展示冲突对话框:
     ├── 查看差异
     ├── 保留我的版本
     ├── 使用服务器版本
     └── 手动合并

5. 版本历史
   - 保留最近 N 个版本 (默认 100)
   - 用户可随时查看/恢复历史版本
```

**为什么不用完全锁定？**
- 用户可能忘记关闭页面导致长期锁定
- 不同设备可能网络不稳定
- 查看笔记不应阻塞他人编辑

### 2. 实时同步 (WebSocket)

```go
// 消息类型
type WSMessage struct {
    Type    string      `json:"type"`
    Payload interface{} `json:"payload"`
}

// 消息类型枚举
const (
    MsgNoteUpdated    = "note.updated"     // 笔记被更新
    MsgNoteDeleted    = "note.deleted"     // 笔记被删除
    MsgEditorJoined   = "editor.joined"    // 有人开始编辑
    MsgEditorLeft     = "editor.left"      // 有人结束编辑
    MsgConflict       = "conflict"         // 检测到冲突
    MsgCursorPosition = "cursor.position"  // 光标位置 (可选的协作功能)
)
```

### 3. Agent 集成方案

推荐 **MCP + REST API 双轨方案**：

#### Agent 账号与权限模型

```
Agent 账号管理:
- 每个 Agent 有独立的 API Key
- 每个 Agent 可配置对不同笔记本的访问权限
- 支持创建多个 Agent，用于不同场景 (如 Claude Code、自动化脚本等)

权限级别:
┌─────────────────────────────────────────────────────────────────┐
│  无权限 (默认)                                                   │
│  - Agent 对未授权的笔记本完全不可见                              │
│  - list_notebooks 不返回                                        │
│  - 任何操作都拒绝                                                │
├─────────────────────────────────────────────────────────────────┤
│  read (只读)                                                    │
│  - Agent 可以: list, search, read                               │
│  - Agent 不能: create, update, delete                           │
│  - 适用于: 知识库、参考资料                                      │
├─────────────────────────────────────────────────────────────────┤
│  readwrite (读写)                                               │
│  - Agent 可以: 所有操作                                          │
│  - 适用于: 工作笔记、让 AI 帮忙整理的内容                        │
└─────────────────────────────────────────────────────────────────┘

认证方式:
- HTTP Header: Authorization: Bearer vn_sk_xxxxxx
- MCP 连接时传入 API Key
```

#### 权限检查中间件

```go
// Agent 认证中间件
func AgentAuthMiddleware() gin.HandlerFunc {
    return func(c *gin.Context) {
        apiKey := extractAPIKey(c) // 从 Authorization header 提取
        if apiKey == "" {
            c.AbortWithStatusJSON(401, gin.H{"error": "API key required"})
            return
        }
        
        // 验证 API Key (比对 hash)
        agent, err := validateAPIKey(apiKey)
        if err != nil || !agent.Enabled {
            c.AbortWithStatusJSON(401, gin.H{"error": "invalid API key"})
            return
        }
        
        // 更新最后使用时间
        go updateLastUsed(agent.ID)
        
        c.Set("agent", agent)
        c.Next()
    }
}

// 笔记本权限检查中间件
func CheckAgentAccess(requiredLevel string) gin.HandlerFunc {
    return func(c *gin.Context) {
        agent := c.MustGet("agent").(*Agent)
        notebook := extractNotebook(c.Param("path"))
        
        // 查询该 Agent 对此笔记本的权限
        permission := getAgentNotebookPermission(agent.ID, notebook)
        
        if permission == nil {
            c.AbortWithStatusJSON(403, gin.H{
                "error": "access denied: no permission for this notebook",
            })
            return
        }
        
        if requiredLevel == "readwrite" && permission.AccessLevel == "read" {
            c.AbortWithStatusJSON(403, gin.H{
                "error": "access denied: read-only permission",
            })
            return
        }
        
        c.Next()
    }
}
```

#### REST API - Agent 管理

```
# Agent 账号管理 (需要用户登录)
GET    /api/v1/agents                    # 列出所有 Agent
POST   /api/v1/agents                    # 创建 Agent (返回 API Key，仅显示一次)
GET    /api/v1/agents/:id                # 获取 Agent 详情
PUT    /api/v1/agents/:id                # 更新 Agent (名称、描述、启用状态)
DELETE /api/v1/agents/:id                # 删除 Agent
POST   /api/v1/agents/:id/regenerate-key # 重新生成 API Key

# Agent 权限管理
GET    /api/v1/agents/:id/permissions              # 获取 Agent 的所有权限
PUT    /api/v1/agents/:id/permissions              # 批量更新权限
PUT    /api/v1/agents/:id/permissions/:notebook    # 设置单个笔记本权限
DELETE /api/v1/agents/:id/permissions/:notebook    # 移除单个笔记本权限
```

#### 前端 Agent 管理界面

```
Agent 列表:
┌─────────────────────────────────────────────────────────────────┐
│  Agent 管理                                                      │
├─────────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ claude-code                                    [已启用]    │  │
│  │ API Key: vn_sk_abc...xyz    最后使用: 5 分钟前             │  │
│  │ 权限: work (读写), knowledge (只读)         [编辑] [删除]  │  │
│  └───────────────────────────────────────────────────────────┘  │
│  [ + 创建 Agent ]                                               │
└─────────────────────────────────────────────────────────────────┘

创建/编辑对话框 (含笔记本权限矩阵):
┌─────────────────────────────────────────────────────────────────┐
│  创建 Agent                                                      │
├─────────────────────────────────────────────────────────────────┤
│  名称:  [ claude-code ]     描述:  [ 用于 Claude Code ]         │
│  [x] 启用                                                        │
│  ─────────────── 笔记本权限 ───────────────                      │
│  │ work       │ ( ) 无  ( ) 只读  (•) 读写                      │
│  │ personal   │ (•) 无  ( ) 只读  ( ) 读写                      │
│  │ knowledge  │ ( ) 无  (•) 只读  ( ) 读写                      │
│                                        [ 取消 ]  [ 保存 ]        │
└─────────────────────────────────────────────────────────────────┘

创建成功后显示 API Key (仅一次，含 MCP 配置示例)
```

#### MCP Server 实现

```go
// MCP 工具定义
var MCPTools = []Tool{
    {
        Name: "list_notebooks",
        Description: "列出所有可访问的笔记本",
        InputSchema: ListNotebooksInput{},
    },
    {
        Name: "search_notes",
        Description: "搜索笔记内容、标题或标签",
        InputSchema: SearchInput{
            Notebook: "可选，限定搜索范围",
            Query:    "搜索关键词",
            Tags:     []string{"可选的标签过滤"},
            Limit:    10,
        },
    },
    {
        Name: "read_note",
        Description: "读取指定笔记的完整内容",
        InputSchema: ReadInput{
            Path: "笔记相对路径 (如 work/projects/valenote.md)",
        },
    },
    {
        Name: "create_note",
        Description: "创建新笔记",
        InputSchema: CreateInput{
            Path:    "笔记路径 (如 work/projects/new-idea.md)",
            Title:   "笔记标题",
            Content: "笔记内容 (Markdown)",
            Tags:    []string{"可选标签"},
        },
    },
    {
        Name: "update_note",
        Description: "更新已有笔记",
        InputSchema: UpdateInput{
            Path:    "笔记路径",
            Content: "新内容",
            Append:  false, // true 则追加而非覆盖
        },
    },
    {
        Name: "list_notes",
        Description: "列出指定笔记本或目录下的笔记",
        InputSchema: ListInput{
            Notebook:  "笔记本名称",
            Directory: "目录路径 (默认根目录)",
            Recursive: true,
        },
    },
    {
        Name: "get_daily_note",
        Description: "获取或创建今日的日记",
        InputSchema: DailyInput{
            Notebook: "笔记本名称",
            Date:     "可选日期 (默认今天)",
        },
    },
}
```

#### Claude Code Skill 示例

```yaml
# valenote-skill.yaml
name: valenote
description: Manage ValeNote notes via MCP
tools:
  - search_notes
  - read_note
  - create_note
  - update_note
```

#### REST API 端点

```
# 笔记本管理
GET    /api/v1/notebooks              # 列出笔记本
POST   /api/v1/notebooks              # 创建笔记本
GET    /api/v1/notebooks/:name        # 获取笔记本详情
PUT    /api/v1/notebooks/:name        # 更新笔记本设置
DELETE /api/v1/notebooks/:name        # 删除笔记本

# 笔记管理 (路径包含笔记本)
GET    /api/v1/notes                  # 列出笔记 (可按笔记本过滤)
GET    /api/v1/notes/:path            # 读取笔记 (path 如 work/projects/foo.md)
POST   /api/v1/notes                  # 创建笔记
PUT    /api/v1/notes/:path            # 更新笔记
DELETE /api/v1/notes/:path            # 删除笔记

# 其他
GET    /api/v1/search?q=keyword&notebook=work  # 搜索
GET    /api/v1/tags                   # 列出所有标签
POST   /api/v1/upload                 # 上传附件
```

### 4. 附件处理

```
粘贴/上传流程:
1. 用户粘贴图片或拖拽文件
2. 前端通过 API 上传到 /api/v1/upload
3. 后端:
   - 生成文件名: {timestamp}-{random}.{ext}
   - 保存到 {note_directory}/attachments/
   - 返回相对路径
4. 前端插入 Markdown 引用: ![](attachments/xxx.png)

目录结构:
/notes/projects/valenote.md
/notes/projects/valenote/attachments/
  ├── 1705312345-a1b2c3.png
  └── 1705312400-d4e5f6.pdf
```

### 5. 搜索方案

```
多级搜索策略:

1. 快速搜索 (标题/标签)
   - 使用 SQLite FTS5 索引
   - 毫秒级响应

2. 全文搜索
   - SQLite FTS5 支持中文需要分词器
   - 推荐: simple + 结巴分词 或 使用 SQLite ICU 扩展

3. 语义搜索 (可选，Phase 2)
   - 集成 Embedding API
   - 存储向量到 SQLite 或单独的向量数据库
```

### 6. 备份与同步

由于已有完整的版本管理，备份方案简化为 **手动导出** + **远程存储同步**。

#### 手动导出

```go
// 导出服务
type ExportService struct {
    notesRoot string
}

// 导出为 ZIP (生成临时文件供下载)
func (s *ExportService) Export() (string, error) {
    timestamp := time.Now().Format("2006-01-02-150405")
    filename := fmt.Sprintf("valenote-export-%s.zip", timestamp)
    tmpPath := filepath.Join(os.TempDir(), filename)
    
    if err := s.createZip(tmpPath); err != nil {
        return "", err
    }
    
    return tmpPath, nil
}
```

ZIP 内容:
```
valenote-export-2024-01-15-103000.zip
├── work/
│   ├── projects/
│   │   ├── valenote.md
│   │   └── valenote/
│   │       └── attachments/
│   │           └── screenshot.png
│   └── meetings/
│       └── 2024-01-15.md
├── personal/
│   └── journal/
│       └── 2024-01-15.md
└── manifest.json              # 元信息
```

#### REST API

```
# 导出
GET    /api/v1/export                    # 导出全部笔记为 ZIP 下载
```

#### 前端设置界面

```
┌─────────────────────────────────────────────────────────────────┐
│  导出笔记                                                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  将所有笔记导出为 ZIP 文件下载到本地                              │
│                                                                 │
│  [ 导出全部笔记 ]                                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 远程存储同步

##### 支持的存储类型

| 类型 | 协议 | Go 库 |
|------|------|-------|
| S3 兼容 | AWS S3 / MinIO / Cloudflare R2 等 | `aws-sdk-go-v2` |
| WebDAV | 坚果云 / Nextcloud / 自建等 | `studio-b12/gowebdav` |

##### 数据模型

```sql
-- 远程存储配置
CREATE TABLE remote_storage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,                    -- 配置名称，如 "我的 MinIO"
    type TEXT NOT NULL,                    -- s3 | webdav
    enabled BOOLEAN DEFAULT false,
    
    -- S3 配置
    s3_endpoint TEXT,                      -- 如 https://s3.amazonaws.com
    s3_region TEXT,
    s3_bucket TEXT,
    s3_access_key TEXT,
    s3_secret_key TEXT,                    -- 加密存储
    s3_prefix TEXT,                        -- 路径前缀，如 "valenote/"
    
    -- WebDAV 配置
    webdav_url TEXT,                       -- 如 https://dav.jianguoyun.com/dav/
    webdav_username TEXT,
    webdav_password TEXT,                  -- 加密存储
    webdav_path TEXT,                      -- 远程目录，如 "/ValeNote/"
    
    -- 同步设置
    sync_interval_minutes INTEGER DEFAULT 60,
    last_sync_at DATETIME,
    last_sync_status TEXT,                 -- success | failed
    last_sync_error TEXT,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 同步状态记录 (记录每个文件的同步状态)
CREATE TABLE sync_state (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    storage_id INTEGER REFERENCES remote_storage(id),
    file_path TEXT NOT NULL,               -- 相对路径
    local_checksum TEXT,                   -- 本地文件 hash
    remote_checksum TEXT,                  -- 已同步的 hash
    synced_at DATETIME,
    UNIQUE(storage_id, file_path)
);
```

##### 同步策略

```
同步模式: 单向同步 (本地 → 远程)

重要原则:
- 本地是 Source of Truth，远程只是备份副本
- 只允许本地覆盖远程，绝不允许远程覆盖本地
- 即使远程文件较新，也以本地为准
- 删除操作可配置：用户可选择是否将本地删除同步到远程

┌─────────────────────────────────────────────────────────────────┐
│                     增量同步流程                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. 扫描本地文件                                                 │
│     - 遍历 NOTES_ROOT 下所有文件                                 │
│     - 计算 checksum                                             │
│                                                                 │
│  2. 对比同步状态                                                 │
│     - 查询 sync_state 表                                        │
│     - 找出: 新增 / 修改 / 删除 的文件                            │
│                                                                 │
│  3. 执行同步                                                     │
│     - 新增/修改: 上传文件到远程                                   │
│     - 删除: 从远程删除 (可配置是否删除)                           │
│                                                                 │
│  4. 更新状态                                                     │
│     - 记录 synced_at 和 remote_checksum                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

文件变更检测:
- local_checksum != remote_checksum → 需要上传
- 本地存在，sync_state 无记录 → 新文件，需要上传
- sync_state 有记录，本地不存在 → 已删除，需要从远程删除
```

##### 后端实现

```go
// StorageAdapter 存储适配器接口
type StorageAdapter interface {
    Upload(localPath, remotePath string) error
    Delete(remotePath string) error
    TestConnection() error
}

// 执行同步 (简化示意)
func (s *RemoteSyncService) Sync(storageID int64) error {
    storage := s.getStorage(storageID)
    adapter := s.createAdapter(storage) // S3Adapter 或 WebDAVAdapter
    
    // 1. 测试连接
    if err := adapter.TestConnection(); err != nil {
        return err
    }
    
    // 2. 扫描本地文件，对比 sync_state，找出差异
    toUpload, toDelete := s.diff(s.scanLocalFiles(), s.getSyncStates(storageID))
    
    // 3. 执行上传
    for _, f := range toUpload {
        adapter.Upload(f.LocalPath, filepath.Join(storage.Prefix(), f.Path))
        s.updateSyncState(storageID, f.Path, f.Checksum)
    }
    
    // 4. 执行删除 (如果启用)
    if storage.DeleteRemote {
        for _, path := range toDelete {
            adapter.Delete(filepath.Join(storage.Prefix(), path))
            s.deleteSyncState(storageID, path)
        }
    }
    
    return nil
}
```

##### REST API

```
# 远程存储配置
GET    /api/v1/settings/remote-storage           # 列出所有配置
POST   /api/v1/settings/remote-storage           # 添加配置
PUT    /api/v1/settings/remote-storage/:id       # 更新配置
DELETE /api/v1/settings/remote-storage/:id       # 删除配置
POST   /api/v1/settings/remote-storage/:id/test  # 测试连接
POST   /api/v1/settings/remote-storage/:id/sync  # 立即同步
```

##### 前端设置界面

```
远程存储列表:
┌─────────────────────────────────────────────────────────────────┐
│  远程存储同步 (单向: 本地 → 远程)                                │
├─────────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ 我的 MinIO    S3    上次: 10:30   成功     [编辑] [同步]   │  │
│  └───────────────────────────────────────────────────────────┘  │
│  [ + 添加远程存储 ]                                              │
└─────────────────────────────────────────────────────────────────┘

添加/编辑对话框:
- 类型选择 (S3 / WebDAV)
- 连接配置 (Endpoint, Bucket/Path, 认证信息)
- 同步设置 (启用, 间隔, 是否同步删除)
- 测试连接按钮
```

### 7. 公开发布

支持将笔记本设置为公开，允许未登录用户访问。

#### 访问路径

```
公开基路径 (可配置):
默认: /public
用户可自定义: /blog, /posts, /notes, /wiki 等

系统保留路径 (不可用作公开基路径):
- /api          # API 接口
- /ws           # WebSocket
- /mcp          # MCP Server
- /auth         # 认证相关
- /app          # 前端 SPA
- /assets       # 静态资源
- /settings     # 设置页面
- /admin        # 管理后台

完整访问路径:
/{public_base_path}/:notebook/*path

示例 (假设配置为 /blog):
/blog/tech/2024/hello-world      → 访问 tech 笔记本下的 2024/hello-world.md
/blog/tech/                      → 访问 tech 笔记本的目录列表
/blog/docs/getting-started       → 访问 docs 笔记本下的 getting-started.md
```

#### 配置存储

公开路径配置存储在 `settings` 表中：

```sql
INSERT INTO settings (key, value) VALUES ('public_base_path', '/public');
```

#### 路由设计

```go
// 系统保留路径 (硬编码，优先注册)
var reservedPaths = map[string]bool{
    "api": true, "ws": true, "mcp": true, "auth": true,
    "app": true, "assets": true, "settings": true, "admin": true,
}

// 验证公开基路径
func ValidatePublicBasePath(path string) error {
    path = strings.Trim(path, "/")
    if path == "" || reservedPaths[path] {
        return errors.New("invalid path")
    }
    if !regexp.MustCompile(`^[a-z0-9-]+$`).MatchString(path) {
        return errors.New("path can only contain lowercase letters, numbers, and hyphens")
    }
    return nil
}

// 路由注册: 先注册保留路由，最后用 NoRoute 兜底处理公开笔记
func setupRoutes(r *gin.Engine) {
    r.Group("/api/v1").Use(authMiddleware()) // ...
    r.GET("/ws", handleWebSocket)
    r.Any("/mcp/*path", handleMCP)
    // ... 其他保留路由
    
    r.NoRoute(publicNoteHandler()) // 动态匹配配置的公开基路径
}

// 公开笔记处理器
func publicNoteHandler() gin.HandlerFunc {
    return func(c *gin.Context) {
        basePath := getPublicBasePath() // 从缓存读取，如 "/blog"
        path := c.Request.URL.Path
        
        if !strings.HasPrefix(path, basePath+"/") && path != basePath {
            c.JSON(404, gin.H{"error": "not found"})
            return
        }
        
        // 解析: /blog/tech/hello → notebook=tech, notePath=hello
        remaining := strings.TrimPrefix(path, basePath+"/")
        parts := strings.SplitN(remaining, "/", 2)
        notebook, notePath := parts[0], ""
        if len(parts) > 1 {
            notePath = parts[1]
        }
        
        if !isNotebookPublic(notebook) {
            c.JSON(404, gin.H{"error": "not found"})
            return
        }
        
        // 处理请求...
    }
}
```

**设计要点：**
- 保留路由先注册，优先级高
- `NoRoute` 兜底，动态判断公开基路径
- 公开基路径存内存缓存，修改后立即生效无需重启

#### 公开页面渲染

```
两种渲染模式:

1. API 模式 (默认)
   - /public/blog/hello-world 返回 JSON
   - 前端 SPA 渲染 Markdown
   - 适合嵌入其他系统

2. 渲染模式
   - /public/blog/hello-world?render=true 返回 HTML
   - 服务端渲染 Markdown 为 HTML
   - 简洁的阅读页面，带基础样式
   - 适合直接分享链接

服务端渲染示例:
┌─────────────────────────────────────────────────────────────────┐
│  ValeNote · blog                                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  # Hello World                                                  │
│                                                                 │
│  这是我的第一篇公开笔记...                                       │
│                                                                 │
│  ## 小节                                                        │
│                                                                 │
│  正文内容...                                                     │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  Published via ValeNote · 2024-01-15                            │
└─────────────────────────────────────────────────────────────────┘
```

#### 笔记本设置界面

```
┌─────────────────────────────────────────────────────────────────┐
│  笔记本设置: blog                                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  显示名称:  [ 我的博客 ]                                         │
│                                                                 │
│  描述:      [ 记录技术学习和生活 ]                               │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  [x] 公开发布                                                    │
│                                                                 │
│  公开后，任何人都可以通过以下链接访问:                            │
│  https://your-domain.com/public/blog/                           │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Agent 访问权限在 [Agent 管理] 中配置                            │
│                                                                 │
│                                              [ 取消 ] [ 保存 ]   │
└─────────────────────────────────────────────────────────────────┘
```

#### 扩展: 单篇笔记控制 (可选，Phase 2)

```markdown
---
title: 私密笔记
public: false    # 在公开笔记本中隐藏此笔记
---
```

---

## 安全考虑

### 认证与授权

```go
// JWT Claims
type Claims struct {
    UserID    int64  `json:"uid"`
    Username  string `json:"username"`
    SessionID string `json:"sid"` // 用于多设备管理
    jwt.RegisteredClaims
}

// 密码存储: bcrypt, cost=12
// HTTPS: 必须，考虑自动配置 Let's Encrypt
// CORS: 严格限制允许的 origin
// Rate Limiting: 登录接口限流，防暴力破解
```

### 文件系统安全

```go
// 路径验证，防止目录遍历攻击
func ValidatePath(userPath string) error {
    cleaned := filepath.Clean(userPath)
    if strings.Contains(cleaned, "..") {
        return ErrInvalidPath
    }
    // 确保在 NOTES_ROOT 内
    absPath := filepath.Join(NotesRoot, cleaned)
    if !strings.HasPrefix(absPath, NotesRoot) {
        return ErrPathEscape
    }
    return nil
}
```

---

## 部署方案

### Docker Compose (推荐)

```yaml
version: '3.8'
services:
  valenote:
    image: valenote:latest
    ports:
      - "8080:8080"
    volumes:
      - ./data:/data           # SQLite + 配置
      - ./notes:/notes         # Markdown 笔记
    environment:
      - VALENOTE_SECRET_KEY=${SECRET_KEY}
      - VALENOTE_NOTES_PATH=/notes
      - VALENOTE_DB_PATH=/data/valenote.db
```

### 单二进制部署

```bash
# 前端打包嵌入到 Go 二进制
go build -tags embed -o valenote ./cmd/server

# 运行
./valenote --config config.yaml
```

---

## 其他需要考虑的点

### 1. 离线支持 (PWA)
- Service Worker 缓存静态资源
- IndexedDB 存储最近查看的笔记
- 上线后同步本地修改

### 2. 导入导出
- 支持从 Obsidian vault 导入
- 支持导出为 ZIP/PDF

### 3. 笔记链接
- 支持 `[[wiki-link]]` 语法
- 自动生成反向链接

### 4. 快捷键
- Ctrl/Cmd + S 保存
- Ctrl/Cmd + K 插入链接
- Ctrl/Cmd + P 快速打开

### 5. 主题
- 深色/浅色模式
- 编辑器主题可自定义

### 6. 移动端适配
- 响应式设计
- 触摸友好的编辑器

### 7. 国际化
- i18n 支持 (中/英文)

---

## 施工计划

### Phase 1: MVP (2-3 周)

**Week 1: 基础架构**
- [x] 项目初始化 (Go module, React + Vite)
- [x] Go: Gin 框架 + 基础中间件
- [x] Go: SQLite + GORM 设置
- [x] Go: 用户认证 (注册/登录/JWT)
- [x] React: 项目结构 + MUI 主题

**Week 2: 核心功能**
- [x] Go: 笔记 CRUD API
- [x] Go: 文件系统读写 + 路径安全
- [x] React: 笔记列表/树形导航
- [x] React: Milkdown 编辑器集成
- [x] React: Markdown 预览

**Week 3: 完善 MVP**
- [x] Go: 附件上传 API
- [x] React: 图片粘贴/拖拽上传
- [x] Go: 基础搜索 (SQLite FTS)
- [x] React: 搜索 UI
- [x] Go: 版本管理服务
- [x] React: 版本历史面板
- [x] Go: 手动导出 ZIP
- [x] Docker 部署配置

### Phase 2: 实时协作 (1-2 周)

**Week 4-5:**
- [x] Go: WebSocket 服务
- [x] Go: 编辑状态广播
- [x] Go: 冲突检测通知
- [x] React: 实时通知 UI
- [x] React: 冲突解决对话框
- [x] React: 版本对比/恢复 UI

### Phase 3: Agent 集成 (1 周)

**Week 6:**
- [x] Go: MCP Server 实现
- [x] MCP 工具: search, read, create, update
- [ ] Claude Code skill 配置
- [ ] API 文档

### Phase 4: 公开发布 (1 周)

**Week 7:**
- [x] Go: 公开笔记路由 (NoRoute 动态匹配)
- [x] Go: 公开基路径配置 + 验证
- [x] Go: 服务端 Markdown 渲染
- [x] React: 公开笔记阅读页面
- [x] React: 笔记本公开设置 UI

### Phase 5: 增强功能 (2 周)

**Week 8:**
- [x] Wiki 链接支持
- [x] 反向链接
- [x] 标签管理

**Week 9:**
- [ ] PWA 离线支持
- [x] 深色模式
- [x] 快捷键系统
- [ ] 性能优化

### Phase 6: 远程存储同步 (1-2 周)

**Week 10-11:**
- [x] Go: 存储适配器接口设计
- [x] Go: S3 适配器实现
- [x] Go: WebDAV 适配器实现
- [x] Go: 增量同步逻辑 (单向: 本地 → 远程)
- [x] Go: 同步状态追踪
- [x] Go: 定时同步任务
- [x] React: 远程存储配置界面
- [x] React: 同步状态展示
- [x] 连接测试 + 手动同步触发

### Phase 7: 打磨 (持续)

- [ ] 移动端适配
- [x] 导入/导出
- [ ] 国际化
- [ ] 更多编辑器插件

---

## 目录结构建议

```
ValeNote/
├── cmd/
│   └── server/
│       └── main.go
├── internal/
│   ├── config/
│   ├── handler/          # HTTP handlers
│   ├── middleware/
│   ├── model/
│   ├── repository/
│   ├── service/
│   └── mcp/              # MCP server
├── pkg/
│   └── markdown/         # Markdown 处理工具
├── web/                  # React 前端
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── services/
│   │   └── stores/
│   ├── package.json
│   └── vite.config.ts
├── migrations/           # 数据库迁移
├── docker/
├── docs/
├── go.mod
├── go.sum
└── README.md
```

---

## 总结

ValeNote 的核心优势：
1. **数据透明** - 纯 Markdown，随时迁移
2. **云端便捷** - 部署一次，多端访问
3. **Agent 友好** - MCP 原生支持
4. **轻量部署** - 单二进制 + SQLite

建议从 Phase 1 MVP 开始，快速验证核心流程，再逐步迭代。
