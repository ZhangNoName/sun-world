# Deployment Cutover Guide

部署切换指南：将后端生产运行时从旧路径切换到 monorepo 路径。
Guide for cutting over the backend production runtime from the old path to the monorepo path.

## 当前状态 / Current State

| 组件 / Component | 当前路径 / Current Path | 目标路径 / Target Path |
|---|---|---|
| 前端 / Frontend | (已切换) `/home/lighthouse/blog/sun-world` (main) | (done) `apps/web` |
| 后端 / Backend | `/home/lighthouse/blog/blog_end` | `/home/lighthouse/blog/sun-world/apps/api` |

## 前置条件 / Prerequisites

- [x] monorepo 分支 `monorepo-api-import` 已合并到 `main`
- [ ] monorepo 变更已审查批准 / Monorepo changes reviewed and approved
- [ ] 后端代码在 `apps/api` 下通过编译检查 / Backend code compiles under `apps/api`
- [ ] 新旧路径之间的最近差异已审查 / Recent diffs between old and new paths reviewed

## 切换步骤 / Cutover Steps

### 1. 在 `apps/api` 下重建虚拟环境 / Rebuild venv under `apps/api`

```bash
cd /home/lighthouse/blog/sun-world/apps/api
python3 -m venv .venv
source .venv/bin/activate
poetry install --no-root
```

### 2. 更新 systemd 服务 / Update systemd service

编辑 `/etc/systemd/system/blog-api.service`：

```ini
[Service]
WorkingDirectory=/home/lighthouse/blog/sun-world/apps/api
EnvironmentFile=/home/lighthouse/.config/blog_end/auth.env
ExecStart=/home/lighthouse/blog/sun-world/apps/api/.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
```

然后重载并重启：
Then reload and restart:

```bash
sudo systemctl daemon-reload
sudo systemctl restart blog-api.service
```

### 3. 验证健康检查 / Verify Health

```bash
# 本地检查 / Local check
curl -fsS http://127.0.0.1:8000/healthz

# 公开检查 / Public check
curl -fsS https://api.sunworld.site/healthz

# 前端是否仍正常加载 / Frontend still loads
curl -I https://sunworld.site
```

### 4. 保留旧路径作为回滚 / Keep Old Path for Rollback

旧路径 `/home/lighthouse/blog/blog_end` 在新路径稳定运行至少 **一周** 之前不得删除。
Do NOT delete `/home/lighthouse/blog/blog_end` until the new path has been stable for at least **one week**.

## 回滚 / Rollback

If the new path fails:

```bash
# 恢复旧配置 / Restore old config
sudo cp /home/lighthouse/blog/blog_end/blog-api.service.backup /etc/systemd/system/blog-api.service
sudo systemctl daemon-reload
sudo systemctl restart blog-api.service
```

## 注意事项 / Notes

- 密钥文件路径 `/home/lighthouse/.config/blog_end/auth.env` 不变，以减少密钥变更风险。
- 不要在此过程中修改 Nginx 配置。
- 不要修改 MySQL、MongoDB、Redis、PostgreSQL 的数据库连接配置。
- 不要在此阶段旋转或更改密钥。
- The secret file path `/home/lighthouse/.config/blog_end/auth.env` stays unchanged to minimize risk.
- Do not modify Nginx configuration during this process.
- Do not modify database connection settings for MySQL, MongoDB, Redis, or PostgreSQL.
- Do not rotate or change secrets in this phase.

## 风险 / Risks

| 风险 / Risk | 缓解 / Mitigation |
|---|---|
| 后端代码在旧路径和新路径之间发生漂移 | 在切换前 `diff -r` 两个 `src/` 目录 |
| 虚拟环境依赖不同 | 固定 `poetry.lock`，在旧路径和新路径间比较 |
| systemd 路径错误 | 先运行 `sudo systemd-analyze verify blog-api.service` |

---

This document is for planning only. Do NOT execute the cutover steps until Phase 2 is formally approved.
