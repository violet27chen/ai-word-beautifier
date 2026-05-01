# AI Word 排版美化助手

这是一个基于 Next.js 的 Web 应用，面向两类核心场景：将已有内容快速排版美化为规范的 Word 文档，以及根据需求直接生成结构清晰、格式专业的 Word 文档。后端通过 OpenAI SDK 的兼容接口接入多家模型服务商，并支持可选的资料检索增强与图示生成。

## 适用场景

- 将已有内容快速整理为更符合中文公文/报告规范的 Word 文档（含标题、段落缩进、层级结构等）
- 根据“主题 + 要求”直接生成完整文档（方案、汇报、总结、说明书、制度文本等）
- 在生成过程中按需启用图片输入、多轮二次润色、参考资料编号与图示生成

## 功能特性

- **直接生成文档**：输入您的需求，AI 将为您编写并排版一份结构清晰、格式专业的 Word 文档。
- **文档美化润色**：支持上传 `.docx` 格式文件提取文本或直接粘贴已有内容，并让 AI 按照特定风格进行润色和重新排版。
- **二次润色与增量修改**：支持基于当前生成结果继续提出“后期优化/修改要求”，在尽量保持原意的前提下进行调整。
- **多模型支持**：内置智谱、DeepSeek、Moonshot/Kimi、小米 MiMo、豆包（Volcengine）、阿里云百炼（DashScope 兼容接口）等多种模型选项，并在缺少对应密钥或遇到图片输入时自动回退到可用的多模态模型。
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
3. 可选：上传图片（支持多张）；当存在图片时，前端会自动限制为可用的多模态模型选项。
4. 选择模型与高级选项（可选）：
   - 字数要求、文笔风格、受众/教育水平、写作水平设定
   - 错别字与“人类痕迹”模拟开关（用于生成更贴近人工写作的文本特征）
   - 资料检索增强、图示模式（思维导图/流程图）
   - 署名与日期落款（用于下载时生成右对齐签名区块）
5. 点击生成后，结果以流式方式输出为 Markdown，可直接预览。
6. 点击下载，将当前 Markdown（并将图示转换为图片）导出为 `.docx`。

## 模型与路由规则

服务端会根据 `model` 字段选择具体服务商与模型，并在无法使用时自动回退，规则要点如下：

- **默认模型**：若配置了 `DEEPSEEK_API_KEY`，默认使用 `deepseek-v4-flash`；否则默认使用 `glm-4.7`。
- **图片输入**：当请求包含图片且目标模型不支持多模态时，会回退到可用的多模态模型（通常为 `glm-5v-turbo` 或 Kimi 多模态模型）。
- **MiMo 模型**：当 `model` 以 `mimo-` 开头时，优先使用小米 MiMo 的兼容接口；若未配置 `MIMO_API_KEY` 或输入包含图片，则回退到智谱可用模型。
- **Moonshot/Kimi 模型**：当 `model` 以 `moonshot-v1-` 或 `kimi-` 开头时使用 Moonshot/Kimi；当包含图片但选择了纯文本 Moonshot 模型时，会自动切换到对应的 `-vision-preview` 或默认多模态模型。
- **豆包模型**：支持 `doubao-seed-1-6-flash-250828`，以及以 `ep-` 开头的 Volcengine Endpoint ID。
- **DashScope（百炼）**：当前内置 `qwen3.5-flash`（通过兼容接口接入）；当包含图片时回退到智谱多模态模型。

## API 说明

### POST /api/generate

用途：生成或润色 Markdown 文档，返回为流式文本（不是 JSON）。

请求体（JSON）字段：
- `prompt`：字符串，生成要求或二次修改要求（必填）
- `content`：字符串，原始内容（可选）
- `model`：字符串，模型标识（可选，不填则走默认模型策略）
- `images`：数组，可选，格式为 `{ id: string, base64: string }`（base64 为 data URL）
- `wordCount`：数字或字符串，可选，字数目标
- `writingStyle` / `eduLevel` / `perfLevel`：字符串，可选，用于风格与写作水平约束
- `addTypos` / `humanTrace`：布尔值，可选，用于模拟更接近人工写作的特征
- `enableEvidenceSupport`：布尔值，可选，是否启用资料检索增强
- `diagramMode`：字符串，可选，支持 `none` / `mindmap` / `flowchart`
- `enableSignatureDate`：布尔值，可选，是否启用落款
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

管理后台的统计数据由服务端写入 SQLite（`better-sqlite3`），用于展示：

- 生成与下载接口的请求总量、成功/失败与成功率
- PV/UV（以 `IP + UA` 拼接后截断作为访客键，属于估算指标）
- 最近请求事件列表（包含模型、是否包含图片、错误信息等）

数据文件位置：
- 默认：`.data/admin-metrics.sqlite`
- 自定义：通过 `ADMIN_DB_PATH` 指定路径（建议指向可持久化目录）

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

### 基础（建议至少配置）

```bash
ZHIPU_API_KEY=your_key
```

### 多模型（按需配置）

```bash
DEEPSEEK_API_KEY=your_key
MOONSHOT_API_KEY=your_key
MIMO_API_KEY=your_key
DOUBAO_API_KEY=your_key
ARK_API_KEY=your_key
DASHSCOPE_API_KEY=your_key
```

说明：
- 同时配置 `DOUBAO_API_KEY` 与 `ARK_API_KEY` 时，优先使用 `DOUBAO_API_KEY`。
- 当请求包含图片且目标模型不支持多模态时，服务端会自动切换到可用的多模态模型生成。

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
ADMIN_DB_PATH=.data/admin-metrics.sqlite
```

说明：
- 管理后台接口支持通过请求头 `x-admin-password` 或查询参数 `password` 进行认证；未配置时默认密码为 `admin123`。
- 指标数据默认写入 `.data/admin-metrics.sqlite`，可通过 `ADMIN_DB_PATH` 指定路径（支持相对路径与绝对路径）。

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

- 本项目依赖 `better-sqlite3` 存储管理后台指标数据，部署环境需要支持 Node.js 原生扩展编译或提供对应预编译产物。
- 如果部署在无持久化磁盘的环境（例如部分 Serverless 场景），管理后台统计数据可能会在实例重启后丢失；建议将 `ADMIN_DB_PATH` 指向可持久化的挂载目录或关闭相关路由的外部暴露。
- 如需对外提供管理后台，请务必配置 `ADMIN_PASSWORD` 并使用强密码。

## 常见问题

### 1) 安装依赖时 `better-sqlite3` 编译失败

通常需要系统具备编译工具链（例如 Linux 上的 Python、make、g++ 等）。在容器环境中请确保基础镜像包含构建依赖。

### 2) 生成接口返回 401/鉴权错误

这通常意味着所选模型对应的 API Key 未配置或无效。请检查 `.env.local` 中的 `ZHIPU_API_KEY` / `DEEPSEEK_API_KEY` / `MOONSHOT_API_KEY` / `MIMO_API_KEY` 等配置是否正确。

### 3) 前端提示浏览器不支持流式输出

生成接口使用 `ReadableStream` 进行流式返回，请升级到较新的 Chrome/Edge/Safari 版本。
