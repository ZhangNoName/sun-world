# Frontend Deploy

前端通过 Docker 部署，容器名 `my-frontend`，宿主机端口 `8081`。
The frontend is deployed via Docker, container name `my-frontend`, host port `8081`.

## 手动部署 / Manual Deploy

```bash
cd /home/lighthouse/blog/sun-world
docker build --no-cache -t blog-front:latest .
docker rm -f my-frontend || true
docker run -d --restart unless-stopped --name my-frontend -p 8081:80 blog-front:latest
```

## 自动部署 / Auto Deploy

`sun-world-auto-deploy.timer` 每日 03:30 CST 从 `origin/main` 自动构建部署。
The systemd timer `sun-world-auto-deploy.timer` auto-builds from `origin/main` daily at 03:30 CST.

```bash
sudo systemctl status sun-world-auto-deploy.timer
sudo systemctl start sun-world-auto-deploy.service
sudo tail -100 /var/log/sun-world-auto-deploy.log
```

## 验证 / Verification

```bash
curl -I https://sunworld.site
curl -I https://www.sunworld.site
```

## Dockerfile

根目录的 `Dockerfile` 是构建来源。
The root `Dockerfile` is the build source.

构建流程 / Build flow:
1. 使用 Node 22 镜像安装 pnpm 并构建 `apps/web`
2. 将 `apps/web/dist` 复制到 Nginx Alpine 镜像中
3. Nginx 在 80 端口提供静态文件服务

1. Node 22 image installs pnpm and builds `apps/web`
2. `apps/web/dist` is copied into the Nginx Alpine image
3. Nginx serves static files on port 80
