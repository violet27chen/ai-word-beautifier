# ---- Build Stage ----
FROM node:20-alpine AS builder

# better-sqlite3 需要编译工具
RUN apk add --no-cache python3 make g++

WORKDIR /app

# 先复制依赖文件，利用 Docker 缓存
COPY package.json package-lock.json ./
RUN npm ci

# 复制源码
COPY . .

# 构建 Next.js
RUN npm run build

# 清理 devDependencies
RUN npm prune --production

# ---- Production Stage ----
FROM node:20-alpine

# better-sqlite3 运行时需要
RUN apk add --no-cache libstdc++

WORKDIR /app

# 从 builder 复制构建产物
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/.data ./.data

# CloudBase 云托管默认端口
EXPOSE 80

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=80
ENV HOSTNAME=0.0.0.0

CMD ["npm", "start"]
