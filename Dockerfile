# 使用官方的 Node.js 镜像
FROM node:24 AS build

# 设置工作目录
WORKDIR /app

# 复制项目文件
RUN npm config set registry https://registry.npmmirror.com/
RUN npm install -g pnpm@9.0.2
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/editor/package.json ./packages/editor/package.json
COPY packages/icons/package.json ./packages/icons/package.json
COPY packages/ui/package.json ./packages/ui/package.json
RUN pnpm install --frozen-lockfile
COPY . .
ARG VITE_BASE_URL=
ARG VITE_TELEMETRY_ENDPOINT=
ENV VITE_BASE_URL=$VITE_BASE_URL
ENV VITE_TELEMETRY_ENDPOINT=$VITE_TELEMETRY_ENDPOINT
RUN pnpm build
# RUN pnpm build:blog


# 使用 Nginx 运行应用
FROM nginx:alpine
COPY --from=0 /app/apps/web/dist /usr/share/nginx/html
COPY deploy/frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
