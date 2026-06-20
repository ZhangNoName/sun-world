# Deploy

部署文档和配置示例。这些文件仅用于文档用途，不会自动应用到生产环境。
Deployment documentation and configuration examples. These files are for documentation only and are not automatically applied to production.

## 目录 / Contents

```
deploy/
├── README.md          # 本文件 / This file
├── frontend/          # 前端部署 / Frontend deployment
│   └── README.md
└── backend/           # 后端部署 / Backend deployment
    ├── README.md
    └── blog-api.service.example   # systemd 服务示例 / Service unit example
```

## 当前生产环境 / Current Production

| 组件 / Component | 方式 / Method | 路径/名称 / Path/Name |
|---|---|---|
| Frontend | Docker 容器 | `my-frontend` (:8081) |
| Backend | systemd | `blog-api.service` (:8000) |
| HTTPS | Nginx | 反向代理 / Reverse proxy |

## 注意事项 / Notes

- 配置文件示例使用占位符值，不包含真实密钥。
- 部署切换前，请先阅读 `docs/architecture/deployment-cutover.md`。
- Example configs use placeholder values and contain no real secrets.
- Read `docs/architecture/deployment-cutover.md` before any deployment cutover.

## Monorepo Status

- Backend code lives in `apps/api`.
- Production backend traffic still uses the existing `blog-api.service` runtime
  until a deliberate cutover is approved.
- Docker Compose covers the frontend and API services. Frontend keeps the
  existing `my-frontend` container and `8081:80` mapping. API stays behind the
  explicit `api` profile and uses `127.0.0.1:18000` by default, so it can be
  rehearsed without changing Nginx or replacing `blog-api.service`.
