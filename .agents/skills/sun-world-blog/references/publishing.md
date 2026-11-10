# Sun World 博客 API 发布参考

生产 API 为 `https://api.sunworld.site`，公开文章链接为 `https://sunworld.site/blog/{id}`。以目标环境的 `/openapi.json` 和实际响应核对接口，部署版本可能落后于仓库。项目的入口在 `apps/api/src/routers/blog/blog.py` 和 `apps/api/src/routers/file/file.py`。

| 用途 | API | 处理 |
| --- | --- | --- |
| 分类和标签 | `GET /base/blog/category`、`GET /base/blog/tag` | 按名称查当前 ID。分类使用一个已有整数 ID，标签优先使用已有整数 ID。新标签使用 `{"name":"标签名"}`，发布前检查近义或同名项。 |
| 查重 | `GET /blogs/`，按支持情况带 `keyword` 和分页 | 用完整标题做精确比较。旧版本可能忽略 `keyword`，必要时检查返回分页。同题文章已有 ID 时先读详情，按需更新。 |
| 确认写权限 | `GET /user/me` | 仅使用经授权的正常登录方式或已有会话。检查应用响应与管理员角色。`401` 表示会话缺失或失效，`403` 表示权限不足。避免打印会话、Cookie 和登录响应。 |
| 上传正文图 | `POST /file/image/upload` | 以 `multipart/form-data` 的 `file` 字段发送 PNG、JPEG 或 WebP。仓库实现的上限为 10 MiB，SVG 先导出成 PNG。获取 `data.url` 后用匿名 GET 验证成功状态和图片类型，再替换发布载荷里的本地引用。 |
| 创建或修订文章 | `POST /blogs/` 或 `PUT /blogs/{id}` | 发送 JSON，检查 HTTP 状态和应用 envelope。更新前确认文章 ID 和目标标题。 |
| 公开验收 | `GET /blogs/{id}` 与 `https://sunworld.site/blog/{id}` | 匿名确认文章可读，检查标题、正文、分类、标签及 HTTPS 图片链接。可用浏览器时检查实际渲染和窄屏布局。 |

常见文章字段如下。分类和标签示例值仅用来说明类型。

```json
{
  "title": "文章标题",
  "abstract": "单独撰写的摘要",
  "content": "带 HTTPS 图片链接的 Markdown 正文",
  "author": "站内使用的作者名",
  "category": 2,
  "tag": [3, { "name": "Agent" }]
}
```

正文可以省掉与页面标题重复的一级标题。登录和写入沿用站点已有 Cookie 与可信来源要求。认证未通过时停止写入。上传成功后记录图片 URL，以便后续复用。创建请求超时或响应不明确时先按精确标题查重并回读，确认没有成功后再决定是否重试。稿件、记录和日志均不保存凭据。
