# Backend Deploy

后端通过 systemd 服务 `blog-api.service` 运行，监听端口 `8000`。
The backend runs via systemd service `blog-api.service` on port `8000`.

## 当前生产配置 / Current Production

- **工作目录 / Working Directory:** `/home/lighthouse/blog/blog_end`
- **服务名 / Service:** `blog-api.service`
- **命令 / Command:** `uvicorn main:app --host 127.0.0.1 --port 8000`
- **密钥文件 / Secrets:** `/home/lighthouse/.config/blog_end/auth.env`

## 未来切换 / Future Cutover

切换至 monorepo 路径时，需要更新：
When cutting over to the monorepo path, update:

1. `blog-api.service` 的 `WorkingDirectory` 改为 `/home/lighthouse/blog/sun-world/apps/api`
2. 在 `apps/api` 下重建 `.venv` 或配置运行时虚拟环境
3. 保持密钥文件路径不变以减少变更范围
4. 重启服务并验证

详见 `docs/architecture/deployment-cutover.md`。
See `docs/architecture/deployment-cutover.md` for details.

## 验证 / Verification

```bash
curl -fsS http://127.0.0.1:8000/healthz
curl -fsS https://api.sunworld.site/healthz
```

## 示例文件 / Example File

`blog-api.service.example` 提供了未来 monorepo 路径的服务单元示例。
The example service unit shows the planned monorepo path.
