# Sun World GitHub Actions 与 Docker 部署优化复盘

日期：2026-06-20

这次调整的目标很直接：把一次可能拖到 40 分钟的部署链路，改成可控、可回滚、可观察的发布流程，并让后端也像前端一样以常驻 Docker 容器运行。

## 背景

最开始的部署方式主要有两个问题。

第一，镜像拉取和推送路径不稳定。GitHub Actions 从国外网络推送或服务器从 GHCR 拉取时，经常出现重试、卡住、超时。一次部署在拉镜像阶段接近 40 分钟，这对个人站点也已经不可接受。

第二，前端已经容器化，但后端仍然依赖旧的 `blog-api.service`。这样会让部署模型割裂：前端是 Docker，后端是 systemd 运行旧目录，自动化发布时只能部分覆盖生产链路。

这次最后形成的方案是：

```text
GitHub Actions
  -> quality 检查
  -> 检测 web/api 哪一侧发生变化
  -> 前端在 GitHub 构建并推送到腾讯云 CCR
  -> 后端在 Lighthouse 服务器本地构建 Docker 镜像
  -> 部署作业统一在服务器切换服务
```

## 为什么不用 GHCR

GHCR 本身没有错，但它对当前服务器所在网络并不友好。实际部署时，服务器从 `ghcr.io` 拉取镜像频繁重试，日志里不断出现类似 `Retrying in ... seconds`，部署时间被网络吞掉。

后来切到腾讯云容器镜像服务个人版 CCR：

```text
ccr.ccs.tencentyun.com/sun-world/sun-world-frontend:<git-sha>
```

前端镜像由 GitHub Actions 推到 CCR，服务器再从 CCR 拉取。这个路径对腾讯云服务器更稳定，前端部署速度明显改善。

## 为什么后端不继续推 CCR

前端镜像推 CCR 很快，但后端镜像不同。后端 Python 镜像层比较重，曾经在 BuildKit 的 `exporting cache to registry` 或 `exporting to image` 阶段卡很久。

我们试过几种策略：

- API `cache-to: mode=max`
- API `cache-to: mode=min`
- 取消 API `cache-to`
- 只保留主镜像 push

结果说明瓶颈不只是 cache export，API 镜像从 GitHub 推到腾讯云 CCR 的路径本身也不够稳定。所以最终策略改成：

```text
API 镜像不从 GitHub 推 CCR
API 镜像在 Lighthouse 服务器本地 docker build
部署时直接使用服务器本地 sun-world-api:<git-sha>
```

这样后端镜像不再经过 GitHub 到腾讯云仓库的上传路径，速度和稳定性都更好。

## 变更检测与并发取消

现在 GitHub Actions 会先跑统一质量检查，然后检测哪些目录有变更：

- 只改前端：只构建和部署前端
- 只改后端：只构建和部署后端
- 两边都改：等两边镜像都准备好后，一次 server session 内切换
- 只改文档：不触发生产部署

生产流水线使用固定 concurrency group，并设置：

```yaml
cancel-in-progress: true
```

所以新的 main push 或手动生产运行会取消前一个仍在跑的生产流水线，避免多个部署同时争抢服务器状态。

## 后端常驻容器切换

后端现在运行在 Docker 容器：

```text
container: sun-world-api
image: sun-world-api:<git-sha>
network: host
port: 8000
```

部署流程不是直接替换生产容器，而是先做 candidate 验证：

```text
1. 在服务器本地构建 sun-world-api:<git-sha>
2. 从新镜像执行 MySQL schema_migration --mode apply
3. 启动 sun-world-api-candidate，监听 BLOG_PORT=18000
4. 检查 http://127.0.0.1:18000/healthz
5. candidate 通过后，停止并禁用 blog-api.service
6. 启动常驻 sun-world-api，监听 BLOG_PORT=8000
7. 检查本地 /healthz 和 https://api.sunworld.site/healthz
```

如果生产容器健康检查失败，流水线会尝试回滚到旧的 `blog-api.service`。

## 这次踩到的两个启动问题

第一个问题是 API 镜像缺少 bash。

后端镜像基于 `python:3.12-slim`，而 `apps/api/start.sh` 使用：

```bash
#!/usr/bin/env bash
```

不能假设 slim 镜像里一定有 bash，所以运行镜像现在明确安装：

```bash
apt-get install -y --no-install-recommends bash libpq5
```

第二个问题是 AI 模型在启动期 eager import。

candidate 容器第一次失败后，我们把部署脚本改成失败时输出：

```bash
docker inspect
docker logs --tail 120
```

这才看到真实错误：应用启动时 import `AiManager`，再 import `TestAgent`、`GemmaModel`，最终 OpenAI-compatible client 因缺少 provider key 直接让 uvicorn 退出。

这个不应该影响后端健康检查，也不应该让普通博客 API 挂掉。因此现在 `AiManager` 改成懒加载：

- API 启动时只创建 manager shell
- 第一次调用 AI 接口时才初始化 chat agent 或 image model
- 缺少 AI key 时，只影响 AI endpoint，不影响 `/healthz` 和普通业务接口

同时新增检查：

```bash
pnpm check:api
```

会运行 `scripts/check-ai-manager-lazy.py`，防止以后把 AI 模型又放回启动期 import。

## 当前线上链路

现在前后端不是 Docker 内部网络直连，而是继续沿用正式域名和 Nginx：

```text
用户浏览器
  -> https://sunworld.site
  -> Nginx
  -> my-frontend:8081
  -> 前端 JS 请求 https://api.sunworld.site
  -> Nginx
  -> 127.0.0.1:8000
  -> sun-world-api 容器
```

这个方案保留了现有 HTTPS、证书、域名和 Nginx 配置，切换面更小。

## 最终验证

最终成功的 GitHub Actions run 是：

```text
27865528022
```

结果：

- `quality` 成功
- 只构建 API，前端构建跳过
- `Build API image on Lighthouse` 约 22 秒完成
- `Deploy changed services on Lighthouse` 约 19 秒完成
- `https://api.sunworld.site/healthz` 返回 `{"status":"ok"}`
- `https://sunworld.site` 和 `https://www.sunworld.site` 返回 HTTP 200
- 服务器上 `sun-world-api` 常驻运行
- `blog-api.service` 已经是 `inactive / disabled`

服务器上的核心状态：

```text
sun-world-api  Up
my-frontend    Up
blog-api.service inactive / disabled
```

## 后续建议

短期内保持当前架构即可：

- 前端继续 GitHub build + CCR push
- 后端继续 Lighthouse 本地 build
- 生产切换继续走 candidate health check
- 文档变更继续不触发部署

以后如果要进一步收敛，可以再考虑：

- 把前后端统一纳入 Docker Compose 管理
- 为 AI endpoint 单独补齐 provider key 与错误返回
- 增加容器日志轮转和监控告警
- 做一个手动 rollback 文档，记录如何部署指定 commit SHA

这次最大的收获是：慢部署不一定只靠换镜像源解决。真正稳定的发布链路，需要同时处理构建位置、缓存策略、网络路径、健康检查、失败日志和回滚路径。
