# Frontend Theme System

本文档说明 Sun World 前端主题系统的架构、设计令牌（design tokens）命名规范以及如何添加新主题。

This document describes the Sun World frontend theme system architecture, design token naming conventions, and how to add a new theme.

## Overview

主题系统基于 CSS 自定义属性（CSS custom properties / CSS variables），通过 `<html>` 元素上的类名切换主题。

- 浅色主题：`<html class="sun-light">`
- 深色主题：`<html class="sun-dark">`

主题切换逻辑在 `apps/web/src/shared/design/theme.ts` 中管理，通过 Vue 的 `provide/inject` 将当前主题传递给子组件，同时将主题类名写入 `document.documentElement`。

## Figma Source

V1 视觉方向沉淀在 Figma：

[Sun World Design System v1](https://www.figma.com/design/6y7S8Pue0ykCD2trppB2QM)

该文件包含：

- 简洁主题封面与设计原则。
- 桌面首页和移动首页方向稿。
- 17 个 Figma 变量，覆盖 light/dark surface、text、border、brand、accent、danger。

当前 Figma 账号的变量集合仅支持单 mode，因此 v1 在 Figma 中采用 `color/light/...` 和 `color/dark/...` 两组变量表达主题；代码中仍然使用 `.sun-light` / `.sun-dark` 两个 class 切换同名语义 CSS 变量。

## Design Token Files

| 文件 | 用途 |
|------|------|
| `apps/web/src/styles/design-tokens.css` | 所有设计令牌的集中定义（颜色、排版、间距、圆角、阴影） |
| `apps/web/src/style.css` | 全局重置与布局样式，导入 `design-tokens.css` |
| `apps/web/src/text.css` | 排版工具类（`.text-large`, `.text-primary` 等） |

### 文件加载顺序

```
main.ts
  → style.css          (全局重置 + @import design-tokens.css)
  → text.css           (排版工具类)
  → App.vue            (应用根组件)
```

设计令牌在 `style.css` 顶部通过 `@import './styles/design-tokens.css'` 导入，确保所有组件都能访问令牌变量。

## Design Token Categories

### 排版 (Typography)

```css
/* 字体大小 (基于 rem) */
--font-size-xs:   0.625rem;   /* 10px */
--font-size-sm:   0.75rem;    /* 12px */
--font-size-md:   0.875rem;   /* 14px */
--font-size-lg:   1rem;       /* 16px */
--font-size-xl:   1.25rem;    /* 20px */
--font-size-2xl:  1.5rem;     /* 24px */
--font-size-3xl:  1.75rem;    /* 28px */

/* 行高 */
--line-height-tight:   1.2;   /* 紧凑 */
--line-height-normal:  1.5;   /* 常规 */
--line-height-relaxed: 1.6;   /* 宽松 */

/* 向后兼容别名 */
--font-large:  var(--font-size-lg);   /* 原 16px */
--font-medium: var(--font-size-md);   /* 原 14px */
--font-small:  var(--font-size-sm);   /* 原 12px */
--font-xsmall: var(--font-size-xs);   /* 原未定义, 现 0.625rem */
```

### 颜色 (Colors)

#### 语义颜色 (Semantic)

新组件和样式应优先使用这些语义令牌：

```css
/* 品牌色 */
--color-brand
--color-brand-light      /* 悬停态 */
--color-brand-muted      /* 禁用/浅色 */
--color-brand-bg         /* 品牌浅色背景 */
--color-accent           /* 青绿色功能点缀 */
--color-accent-bg        /* 青绿色浅背景 */

/* 状态色 */
--color-success
--color-warning
--color-danger

/* 文本色 */
--color-text-primary     /* 重要标题 */
--color-text-regular     /* 正文 */
--color-text-secondary   /* 辅助说明 */
--color-text-placeholder /* 占位符/禁用文字 */

/* 表面/背景色 */
--color-surface-page     /* 页面背景 */
--color-surface-card     /* 卡片/组件背景 */
--color-surface-muted    /* 填充/输入框背景 */
--color-surface-hover    /* 悬停背景 */
--color-surface-raised   /* 浮层/高层级表面 */
--color-overlay-backdrop /* Drawer / modal 遮罩 */

/* 边框色 */
--color-border-default   /* 默认边框 */
--color-border-subtle    /* 浅色分割线 */
--color-border-darker    /* 深色边框 */
--color-border-active    /* 激活边框 */
--color-focus-ring       /* focus-visible ring */
```

#### 兼容别名 (Legacy Aliases)

旧代码继续使用这些变量名，它们映射到新的语义令牌：

```css
--text-default     → --color-text-regular
--text-strong      → --color-text-primary
--text-secondary   → --color-text-secondary
--text-placeholder → --color-text-placeholder

--bg-page          → --color-surface-page
--bg-component     → --color-surface-card
--bg-fill          → --color-surface-muted
--bg-brand-light   → --color-brand-bg

--border-default   → --color-border-default
--border-lighter   → --color-border-subtle
```

### 间距 (Spacing)

```css
--space-1:  0.25rem;  /* 4px */
--space-2:  0.5rem;   /* 8px */
--space-3:  0.75rem;  /* 12px */
--space-4:  1rem;     /* 16px */
--space-5:  1.25rem;  /* 20px */
--space-6:  1.5rem;   /* 24px */
--space-8:  2rem;     /* 32px */
--space-10: 2.5rem;   /* 40px */
--space-12: 3rem;     /* 48px */
```

### 圆角 (Border Radius)

```css
--radius-sm:   0.25rem;  /* 4px */
--radius-md:   0.5rem;   /* 8px  (--border-radius 别名) */
--radius-lg:   0.75rem;  /* 12px */
--radius-xl:   1rem;     /* 16px */
--radius-full: 9999px;
```

### 阴影 (Box Shadow)

```css
--shadow-sm:  0px 1px 3px rgba(0, 0, 0, 0.1);
--shadow-md:  0px 2px 4px 0px rgba(0, 0, 0, 0.05);
--shadow-lg:  0px 8px 32px rgba(0, 0, 0, 0.1);
--shadow-focus
```

### 组件级令牌 (Component-Level)

```css
--btn-text-color
--btn-disabled-opacity
--btn-height-default / --btn-height-sm / --btn-height-lg / --btn-height-icon
--btn-padding-default / --btn-padding-sm / --btn-padding-lg
--btn-font-size-default / --btn-font-size-sm / --btn-font-size-lg

--card-bg
--card-bg-subtle
--card-border-color / --card-border-hover
--card-shadow-hover
--card-meta-color

--header-bg
--mobile-nav-bg / --mobile-nav-active-bg
--drawer-bg / --drawer-shadow
--scrollbar-thumb-bg / --scrollbar-thumb-hover / --scrollbar-track-bg
```

## Motion Rules

- Motion tokens live in `design-tokens.css`: `--motion-duration-*` and `--motion-ease-*`.
- Use motion for feedback only: route loading, skeleton shimmer, hover lift, drawer transition.
- Do not use decorative floating blobs, oversized gradients, or non-functional animation.
- `prefers-reduced-motion: reduce` is handled globally in `style.css` and token values are reduced in `design-tokens.css`.

## Element Plus 集成

在 `.sun-light` / `.sun-dark` 中映射了 Element Plus 的关键 CSS 变量：

```css
--el-color-primary      → --color-brand
--el-color-success      → --color-success
--el-color-warning      → --color-warning
--el-color-danger       → --color-danger
--el-text-color-primary → --color-text-primary
--el-text-color-regular → --color-text-regular
--el-text-color-secondary → --color-text-secondary
--el-border-color-base  → --color-border-default
--el-fill-color-blank   → --color-surface-page
--el-bg-color           → --color-surface-page
--el-bg-color-overlay   → --color-surface-card
```

## 添加新主题

在 `design-tokens.css` 中复制一份 `.sun-light` 或 `.sun-dark` 块即可：

```css
.sun-high-contrast {
  --color-brand:          #0055cc;
  --color-text-primary:   #000000;
  --color-text-regular:   #111111;
  --color-surface-page:   #ffffff;
  --color-surface-card:   #ffffff;
  /* ... 覆盖所有需要的变量 ... */
}
```

新主题只需覆盖需要改变的变量，未覆盖的会回退到 `:root` 或默认值。

然后在 `App.vue` 中添加新主题的选项即可。

## 排版工具类 (Text Utility Classes)

### 尺寸级

- `.text-xsmall` — `--font-size-xs`
- `.text-small` — `--font-size-sm`
- `.text-medium` — `--font-size-md`
- `.text-large` — `--font-size-lg`

### 语义色

- `.text-primary` — `--color-text-primary`
- `.text-regular` — `--color-text-regular`
- `.text-secondary` — `--color-text-secondary`
- `.text-muted` — `--color-text-placeholder`
- `.text-brand` — `--color-brand`
- `.text-success` / `.text-warning` / `.text-danger`

### 字重与对齐

- `.text-normal` / `.text-medium-w` / `.text-semibold` / `.text-bold`
- `.text-left` / `.text-center` / `.text-right`

## Rules for Future Component Styles

1. **使用语义令牌**：组件样式应使用 `--color-text-primary`、`--color-surface-card` 等语义变量，而不是直接写 `#333`、`#fff`。
2. **避免硬编码颜色和字号**：不要在 `<style scoped>` 中写 `color: #xxxxxx` 或 `font-size: 14px`。
3. **使用组件级令牌**：按钮样式使用 `--btn-*` 变量，卡片样式使用 `--card-*` 变量。
4. **保持向后兼容**：不要删除现有的 `--text-*`、`--bg-*`、`--border-*` 别名，它们映射到新的语义令牌。
5. **不要在此架构中引入 Tailwind**：当前基于 CSS 自定义属性的主题系统已经满足需求，引入 Tailwind 会增加构建链复杂度且无法解决当前的主题切换问题。
6. **移动端优先保护阅读体验**：小屏列表保持单列，底部导航和抽屉使用 `--mobile-*` / `--drawer-*` 令牌，并保留 safe-area。
7. **动效必须可降级**：新增动画必须有 `prefers-reduced-motion` 兜底。

## Why Not Tailwind?

Tailwind CSS 未被引入的原因：

- 项目已有基于 `sun-light` / `sun-dark` 类名和 CSS 自定义属性的主题机制。
- 项目使用 Vue SFC scoped styles、Element Plus 样式和现有 CSS 变量。
- 引入 Tailwind 需要额外的构建配置和迁移成本，而不解决即时的主题令牌需求。
- 基于 CSS 变量的设计令牌层风险更低，更适合当前代码库。

Tailwind 可在项目后续需要更广泛的 utility-first 重写或新设计系统包时重新评估。

## Related Docs

- [Project Architecture](project-architecture.md)
- [Engineering Conventions](../engineering-conventions.md)
- [Current State](../current-state.md)
