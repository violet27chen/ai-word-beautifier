# ---- Build Stage ----
FROM node:20-alpine AS builder

WORKDIR /app

# 先复制依赖文件，利用 Docker 缓存
COPY package.json package-lock.json ./
RUN npm ci

# 复制源码
COPY . .

# 构建 Next.js
RUN npm run build

# 清理构建缓存（生产运行不需要）
RUN rm -rf .next/cache .next/dev .next/trace .next/trace-build

# 清理 devDependencies
RUN npm prune --production

# ---- Production Stage ----
FROM node:20-alpine

WORKDIR /app

# 从 builder 复制构建产物
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/public ./public

# CloudBase 云托管默认端口
EXPOSE 80

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=80
ENV HOSTNAME=0.0.0.0

CMD ["npm", "start"]
