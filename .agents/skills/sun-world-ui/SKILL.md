---
name: sun-world-ui
description: 新增、修改或审查 Sun World 的 React 页面、交互和共享组件时使用。先查统一组件库，复用已有控件，缺少共享能力时基于 shadcn Base UI 在库内封装，再接入业务页面。
---

# Sun World UI 开发

改页面前，阅读 [React 开发规范](../../../docs/react-development-guidelines.md)和 [UI 组件库说明](../../../packages/ui/README.md)。

## 选择组件

1. 按组件名和交互用途搜索 `packages/ui/src/components`、`packages/ui/src/patterns` 和现有页面用例。通过 [UI 包导出](../../../packages/ui/package.json)确认公开子路径，再从 `@sun-world/ui/<组件>` 导入。用已有属性、插槽和组合方式满足页面需求。
2. 缺少共享能力时，先查 `packages/base-ui/src/components`。基于现有 shadcn Base UI 基础组件，在 `packages/ui` 扩展已有封装或新增组件。基础组件也缺失时，按 [Base UI 说明](../../../packages/base-ui/README.md)接入仓库的 Base Nova registry，再在 UI 包内封装站点需要的接口和样式。
3. 新增公开入口时，沿用组件目录的 `index.ts`，同步 UI 包的 `package.json`、`source-aliases.ts` 和 `vite.config.ts`。业务页面通过公开子路径复用组件，并负责页面布局、数据和业务行为。

页面中的交互控件使用仓库封装，避免临时原生控件、直引第三方基础组件和旧兼容包装。单选和多选都复用 `@sun-world/ui/sw-select` 的 `SwSelect`，可用 `size="sm"` 适配紧凑工具栏。样式沿用站点主题与设计令牌。改动图标时参考 [Sun World 图标 Skill](../adding-sun-world-icons/SKILL.md)。

## 验证

- 运行 `node scripts/check-web-ui-library.mjs`，并验证受影响页面的交互。可见改动按需检查明暗主题、窄屏、键盘操作和焦点。
- 改动共享组件时运行 `corepack pnpm test:ui`。新增公开入口时构建相关包并检查应用能通过公开路径导入。按影响范围运行页面测试，跨库改动可用 `corepack pnpm check:web` 验证。
