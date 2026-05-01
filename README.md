# AI Word 排版美化助手

这是一个基于 Next.js 和 智谱 AI 大模型的 Web 应用程序，专为快速排版美化 Word 文档以及根据要求自动生成高质量 Word 文档而设计。

## 功能特性

- **直接生成文档**：输入您的需求，AI 将为您编写并排版一份结构清晰、格式专业的 Word 文档。
- **文档美化润色**：支持上传 `.docx` 格式文件提取文本或直接粘贴已有内容，并让 AI 按照特定风格进行润色和重新排版。
- **多模型支持**：内置智谱 AI 最新系列的旗舰模型和各类高性能基座（如 GLM-5.1、GLM-5-Turbo、GLM-4.7 等），满足不同的速度和能力需求。
- **一键下载**：生成结果直接导出为标准的 `.docx` 格式文档，开箱即用。

## 技术栈

- 框架：Next.js (App Router) + React
- 样式：Tailwind CSS
- 图标：Lucide React
- AI 接口：Zhipu AI (OpenAI SDK 兼容接入)
- 文本处理：Mammoth.js (Word 读取)、Marked (Markdown 渲染)、html-to-docx (生成 Word 文档)

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
