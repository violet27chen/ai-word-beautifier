# AI Word 排版美化助手

这是一个基于 Next.js 的 Web 应用，面向两类核心场景：将已有内容快速排版美化为规范的 Word 文档，以及根据需求直接生成结构清晰、格式专业的 Word 文档。后端通过 OpenAI SDK 的兼容接口接入多家模型服务商，并支持可选的资料检索增强与图示生成。

## 功能特性

- **直接生成文档**：输入您的需求，AI 将为您编写并排版一份结构清晰、格式专业的 Word 文档。
- **文档美化润色**：支持上传 `.docx` 格式文件提取文本或直接粘贴已有内容，并让 AI 按照特定风格进行润色和重新排版。
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
```

说明：
- 管理后台接口支持通过请求头 `x-admin-password` 或查询参数 `password` 进行认证；未配置时默认密码为 `admin123`。

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
