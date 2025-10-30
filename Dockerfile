# 使用官方的 Node.js 镜像
FROM node:22 AS build

# 设置工作目录
WORKDIR /app

# 复制项目文件
COPY . .

RUN npm config set registry https://registry.npmmirror.com/
RUN npm install -g pnpm@9.0.2
RUN pnpm install 
RUN pnpm build
# RUN pnpm build:blog


# 使用 Nginx 运行应用
FROM nginx:alpine
COPY --from=0 /app/packages/blog/dist /usr/share/nginx/html
# # 复制自定义的 Nginx 配置文件
# COPY nginx.conf /etc/nginx/conf.d/default.conf

# COPY sunworld.key /etc/nginx/ssl/key.pem
# COPY sunworld.pem /etc/nginx/ssl/cert.pem
EXPOSE 8081
CMD ["nginx", "-g", "daemon off;"]
