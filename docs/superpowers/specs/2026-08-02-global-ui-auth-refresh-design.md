# Global UI, shadcn Theme, Auth, Login, and Manage Refresh Design

## Goal

统一 Sun World 前端与 `@sun-world/ui` 的 shadcn 语义颜色变量，复现 shadcn 的浅色/深色/系统主题切换；将登录页改为接近 `login-04` 的双栏认证体验；将 Manage 改为接近 `sidebar-07` 的可折叠侧栏工作台；同时修复认证状态不持久化、token 刷新缺失、请求失败后的状态和多处服务点击不可靠的问题。

## Decisions

- 主题维度只保留 `light`、`dark`、`system`，不再把 Apple/Sun World 作为运行时切换选项。
- Sun World 继续使用蓝色品牌色和现有圆角/动效基调，但颜色的唯一公共接口改为 shadcn 语义变量：`background`、`foreground`、`card`、`popover`、`primary`、`secondary`、`muted`、`accent`、`destructive`、`border`、`input`、`ring` 及对应 foreground。
- 旧的 `--color-*`、`--bg-*`、`--text-*`、`--border-*` 变量保留为兼容别名，值只从 shadcn 语义变量派生，新增 UI 不再直接定义另一套颜色。
- `ThemeProvider` 负责把主题偏好持久化到 `localStorage`，在 `<html>` 上设置 `data-color-mode` 和 `color-scheme`；ThemeSwitch 直接切换 `light/dark/system`。
- auth 以 HttpOnly access/refresh cookie 为安全凭证。前端只持久化非敏感的 session 元数据和恢复状态，不保存 token 到 localStorage。
- API 客户端在 access token 临近过期或收到 401 时，通过单飞 refresh 请求轮换 cookie，再重放一次原请求；refresh 失败才清理本地用户并返回认证错误。
- 登录页使用全高 muted 背景、左侧品牌/视觉区域、右侧无阴影表单卡片；移动端隐藏品牌侧栏但保留完整可用表单。
- Manage 使用独立的 SidebarProvider/Sidebar/SidebarInset shell，桌面支持展开/图标折叠/隐藏，移动端使用抽屉；Manage 内容占满可用宽度。
- 只有 blog 相关页面由 blog module 的容器规则限制最大宽度并保留两侧留白；登录、Manage、AI、编辑器、工具、个人中心等页面不套用 blog 容器。

## Architecture

### Theme and UI tokens

`apps/web/src/styles/design-tokens.css` 提供应用主题源变量，`packages/ui/src/styles/base.css` 只提供无应用上下文时的 fallback。两者使用完全相同的 shadcn 变量名和映射关系；应用侧通过 `[data-color-mode='light']` / `[data-color-mode='dark']` 赋值，避免 `.sun-light`、`.sun-dark` 和 data 属性产生分叉。

### Auth state and request lifecycle

`useAuthStore` 维护 `user`、`status`、过期时间和恢复 promise。AppProviders 在应用启动时调用一次 `restoreSession`；路由布局只消费已经恢复的状态，不在每次路径变化时盲目重复请求。`service/http.ts` 维护一个 refresh promise，认证请求本身跳过 refresh，其他请求在 401 或临近过期时尝试恢复并最多重放一次。所有手动登出和 refresh 失败都清理状态。

服务端 cookie 设置根据真实请求是否为 HTTPS 和跨站请求推导，明确配置不能让本地 HTTP 环境发出无效的 `Secure` cookie；生产环境仍使用 HTTPS + `SameSite=None` 的跨 origin 配置。device id 在客户端和 cookie 两侧都稳定保存。

### Layout boundaries

`AppLayout` 只负责 shell 和 route meta，不再给所有页面施加同一个 max-width。blog 页面在自身模块样式中声明 `.blog-content-container`；全局 `.content` 和 `.main-container` 使用 `width: 100%`，页面组件通过自己的 grid/padding 负责内部节奏。

## Error handling

- 请求的业务 envelope 错误继续统一转为 `ApiError`。
- `401` 先走 refresh；refresh 成功不向用户弹错误 toast；refresh 失败只在当前动作需要时显示“登录已过期”，并清理用户状态。
- `getCurrentUser` 的恢复请求使用 `suppressErrorToast`，避免首次匿名访问在全局弹出错误。
- 登录、注册、登出和关键 Manage mutation 保留页面级错误或成功反馈，避免同一错误同时出现全局 toast 和表单错误。
- 失败的按钮必须恢复可点击状态；异步动作统一使用 loading/disabled 和 finally 清理。

## Verification criteria

- 主题测试证明浅色、深色、系统模式、跨 tab 同步和旧偏好迁移；渲染后的 shadcn 变量在两种模式都有值。
- auth 测试证明启动恢复、稳定 device id、单飞 refresh、401 重放、refresh 失败清理和登出清理。
- 登录测试证明输入校验、loading、失败反馈、成功导航和移动/桌面结构。
- Manage 测试证明导航、折叠、移动抽屉、语言菜单、用户菜单和 guard 状态。
- 运行 Web typecheck、UI tests/build、Web tests/build、format check、UI boundary/shadcn structure checks。
- 用浏览器在桌面与窄屏复现 `/login`、`/manage`、至少一个 blog 路由和一个非 blog 路由，确认布局宽度、主题切换、按钮点击和刷新恢复行为。

