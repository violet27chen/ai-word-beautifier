# AI Word 排版美化助手

这是一个基于 Next.js 的 Web 应用，面向两类核心场景：将已有内容快速排版美化为规范的 Word 文档，以及根据需求直接生成结构清晰、格式专业的 Word 文档。后端通过 OpenAI SDK 的兼容接口接入多家模型服务商，并支持可选的资料检索增强与图示生成。

## 语言

- 前端支持中英文切换，默认英文，可在页面右上角切换语言偏好并持久化到浏览器本地存储。
- `/api/generate` 支持传入 `locale` 字段（`en`/`zh`）以控制系统提示词与约束说明语言，未传时默认按英文处理。

## 适用场景

- 将已有内容快速整理为更符合中文公文/报告规范的 Word 文档（含标题、段落缩进、层级结构等）
- 根据“主题 + 要求”直接生成完整文档（方案、汇报、总结、说明书、制度文本等）
- 在生成过程中按需启用图片输入、多轮二次润色、参考资料编号与图示生成

## 功能特性

- **直接生成文档**：输入您的需求，AI 将为您编写并排版一份结构清晰、格式专业的 Word 文档。
- **文档美化润色**：支持上传 `.docx` 格式文件提取文本或直接粘贴已有内容，并让 AI 按照特定风格进行润色和重新排版。
- **二次润色与增量修改**：支持基于当前生成结果继续提出“后期优化/修改要求”，在尽量保持原意的前提下进行调整。
- **单模型支持**：统一使用 DeepSeek-Flash，支持文本和图片输入，避免多供应商路由与回退造成的不确定性。
- **可选资料检索增强**：开启后可通过 MCP Search Endpoint 拉取最新资料条目并注入提示词，生成带参考资料编号的内容。
- **可选图示生成**：支持自动生成思维导图/流程图（Mermaid），并在前端渲染预览。
- **一键下载**：生成结果直接导出为标准的 `.docx` 格式文档，开箱即用。

## 技术栈

- 框架：Next.js (App Router) + React
- 样式：Tailwind CSS
- 图标：Lucide React
- AI 接口：OpenAI SDK（多服务商兼容 BaseURL）
- 文本处理：Mammoth.js（Word 读取）、Marked / markdown-to-jsx（Markdown 处理与渲染）、html-to-docx + docx（生成 Word 文档）
- 图示：Mermaid（可选）

## 使用指南（界面）

1. 在首页输入“排版/生成要求”（必填）。
2. 可选：上传 `.docx` 文档，系统会提取纯文本作为“原始内容”参与排版与改写。
3. 可选：上传图片（支持多张）。
4. 配置高级选项（可选）：
   - 字数要求、文笔风格、受众/教育水平、写作水平设定
   - 错别字与“人类痕迹”模拟开关（用于生成更贴近人工写作的文本特征）
   - 资料检索增强、图示模式（思维导图/流程图）
   - 署名与日期落款（默认关闭，用于下载时生成右对齐签名区块）
5. 点击生成后，结果以流式方式输出为 Markdown，可直接预览。
6. 点击下载，将当前 Markdown（并将图示转换为图片）导出为 `.docx`。

## 模型规则

服务端固定调用 DeepSeek 兼容接口，模型标识为 `deepseek-flash`。前端不再允许切换模型，图片通过 OpenAI 兼容的 `image_url` 内容块直接发送。当前只支持文本和图片，不再提供视频、音频上传入口。

## API 说明

### POST /api/generate

用途：生成或润色 Markdown 文档，返回为流式文本（不是 JSON）。

请求体（JSON）字段：
- `prompt`：字符串，生成要求或二次修改要求（必填）
- `content`：字符串，原始内容（可选）
- `model`：兼容旧客户端保留，服务端始终固定使用 `deepseek-flash`
- `images`：数组，可选，格式为 `{ id: string, base64: string }`（base64 为 data URL）
- `wordCount`：数字或字符串，可选，字数目标
- `writingStyle` / `eduLevel` / `perfLevel`：字符串，可选，用于风格与写作水平约束
- `addTypos` / `humanTrace`：布尔值，可选，用于模拟更接近人工写作的特征
- `enableEvidenceSupport`：布尔值，可选，是否启用资料检索增强
- `diagramMode`：字符串，可选，支持 `none` / `mindmap` / `flowchart`
- `enableSignatureDate`：布尔值，可选，是否启用落款（默认 false）
- `authorName` / `documentDate`：字符串，可选，落款作者与日期

响应：
- `200`：`text/plain; charset=utf-8`，流式输出 Markdown 文本
- 非 `200`：返回 JSON `{ error: string }`

### POST /api/download

用途：将 Markdown 转为 `.docx` 并下载。

请求体（JSON）字段：
- `markdown`：字符串（必填）
- `images`：数组，可选，格式为 `{ id: string, base64: string }`，用于把 `![...](img_id)` 形式的图片引用替换为实际 base64

响应：
- `200`：返回 `.docx` 二进制内容，并带 `Content-Disposition` 文件名

### POST /api/admin/visit

用途：记录页面访问，用于管理后台统计 PV/UV（按 `IP + UA` 估算）。

响应：
- `200`：JSON `{ ok: true }`

### GET /api/admin/overview

用途：管理后台数据聚合接口，返回运行状态、环境变量配置状态与最近事件记录。

鉴权方式（二选一）：
- 请求头：`x-admin-password: <password>`
- 查询参数：`?password=<password>`

响应：
- `200`：JSON（包含 `envStatus`、接口统计、访问统计、最近事件等）
- `401`：JSON `{ error: '管理后台认证失败' }`

## 页面与路由

- `/`：主界面（生成、上传、预览、下载）
- `/admin`：管理后台页面（需要管理密码）
- `/api/generate`：生成与润色接口（流式返回）
- `/api/download`：下载 `.docx` 接口
- `/api/admin/visit`：访问统计打点
- `/api/admin/overview`：管理后台数据聚合接口

## 指标与数据存储

管理后台的统计数据由服务端写入数据库，用于展示：

- 生成与下载接口的请求总量、成功/失败与成功率
- PV/UV（以 `IP + UA` 拼接后截断作为访客键，属于估算指标）
- 最近请求事件列表（包含模型、是否包含图片、错误信息等）

数据库后端按运行环境自动选择：

- Cloudflare Worker：优先使用绑定名为 `ADMIN_DB` 的 D1 数据库。
- 本地开发或普通 Node.js 部署：使用 MySQL，配置 `MYSQL_HOST`、`MYSQL_PORT`、`MYSQL_USER`、`MYSQL_PASSWORD`、`MYSQL_DATABASE`。

D1 表会在第一次写入统计数据时自动创建，无需手动执行建表 SQL。

## API 调用示例

生成（流式返回 Markdown）：

```bash
curl -N -X POST "http://localhost:3000/api/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "写一份项目周报，包含本周完成事项、问题与下周计划",
    "content": "",
    "model": "glm-4.7",
    "images": [],
    "enableEvidenceSupport": false,
    "diagramMode": "none",
    "enableSignatureDate": true,
    "authorName": "张三",
    "documentDate": "2026年5月1日"
  }'
```

下载（返回 docx 二进制，需自行保存文件）：

```bash
curl -X POST "http://localhost:3000/api/download" \
  -H "Content-Type: application/json" \
  -o output.docx \
  -d '{
    "markdown": "<div align=\"center\"><h1>示例文档</h1></div>\n\n　　这是正文第一段。",
    "images": []
  }'
```

查询管理后台数据（用请求头方式传递密码）：

```bash
curl "http://localhost:3000/api/admin/overview" \
  -H "x-admin-password: your_password"
```

## 环境变量

建议使用 `.env.local` 配置环境变量（不要提交包含密钥的文件到仓库）。

### AI 模型

```bash
DEEPSEEK_API_KEY=your_key
```

### 资料检索增强（可选）

```bash
MCP_SEARCH_ENDPOINT=https://your-endpoint
MCP_API_KEY=your_key
TAVILY_API_KEY=your_key
TAVILY_API_KEY_2=your_key
TAVILY_API_KEY_3=your_key
TAVILY_API_KEYS=your_key_4,your_key_5
```

说明：
- `MCP_SEARCH_ENDPOINT` 用于指定检索服务地址；若使用 Tavily 兼容接口，密钥可通过 `TAVILY_API_KEY*` 或 `TAVILY_API_KEYS` 配置并自动轮询。

### 管理后台（可选）

```bash
ADMIN_PASSWORD=your_password
# 本地开发/Node.js 部署时使用 MySQL
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_database_password
MYSQL_DATABASE=ai_word
```

说明：
- 管理后台接口支持通过请求头 `x-admin-password` 认证；未配置 `ADMIN_PASSWORD` 时后台禁用。
- 管理统计在 Worker 上写入 D1，在本地或普通 Node.js 部署上写入 MySQL；数据库不可用不会阻断生成和下载。

### Cloudflare Worker 部署

1. 创建 D1 数据库：

   ```bash
   npx wrangler d1 create ai-word-admin
   ```

2. 将命令返回的数据库 ID 填入 `wrangler.jsonc` 的 `ADMIN_DB` 绑定，保持绑定名为 `ADMIN_DB`。
3. 在 Cloudflare Worker 的运行时变量/密钥中配置 `ADMIN_PASSWORD`、`DEEPSEEK_API_KEY` 等环境变量。不要把密钥写入 `wrangler.jsonc`。
4. 使用现有 Workers Builds 配置部署。构建命令为 `npm run build`，部署命令为 `npx wrangler deploy`。

如果你不使用 Worker，则无需创建 D1，继续配置 MySQL 即可。

## 本地开发

1. 确保安装了 Node.js 18+ 环境。
2. 安装依赖：
   ```bash
   npm install
   ```
3. 启动开发服务器：
   ```bash
   npm run dev
   ```
4. 浏览器访问 `http://localhost:3000` 即可预览。

## 生产构建与启动

```bash
npm run build
npm run start
```

## 部署建议

- 管理后台支持 Cloudflare D1 与 MySQL 双后端：Worker 使用 D1，Node.js 使用 MySQL。
- 如果数据库不可用，主生成和下载流程仍会继续，但管理后台统计不会写入。
- 如需对外提供管理后台，请务必配置 `ADMIN_PASSWORD` 并使用强密码。

## 常见问题

### 1) 生成接口返回 401/鉴权错误

这通常意味着 `DEEPSEEK_API_KEY` 未配置或无效，请检查 `.env.local` 配置。

### 2) 前端提示浏览器不支持流式输出

生成接口使用 `ReadableStream` 进行流式返回，请升级到较新的 Chrome/Edge/Safari 版本。
