# 文件、格式与测试组织规范

日期：2026-11-12。适用于新增与本次触及文件；不要求全仓库一次改名、搬测试或格式化。总入口为[工程规范](engineering-conventions.md)，React 细则见[React 规范](react-development-guidelines.md)，模块接入见[扩展契约](architecture/module-extension-contract.md)。本文仅记录规则与待统一项，本轮没有修改格式化配置或测试发现配置。

## 1. 文件与目录命名

| 类型 | 规则 | 示例 |
| --- | --- | --- |
| JS/TS 应用与业务目录 | 小写 kebab-case；既有目录保持兼容 | `agent-worker/`、`blog-qa/` |
| Python 包与模块 | snake_case，包入口 `__init__.py` | `agent_runtime/`、`worker_client.py` |
| React 页面/组件 | PascalCase.tsx，使用具名组件导出 | `BlogQaPanel.tsx`、`DraftEditorPage.tsx` |
| React Hook | useXxx.ts；包含 JSX 才用 tsx；新增放 hooks | `hooks/useBlogQa.ts`；旧 composables 暂留 |
| TS 纯函数、客户端、协议 | kebab-case.ts | `run-events.ts`、`tool-gateway.ts` |
| JS 运维脚本 | 动词 + 对象，kebab-case.mjs | `check-module-contracts.mjs`（拟议） |
| Python 脚本 | 延续 scripts 既有命令文件风格；可导入模块仍 snake_case | 既有 `export-openapi.py`；不要为了统一批量改名 |
| 模块入口 | TS index.ts；Python public.py 暴露应用接口 | index 不导出内部仓储、凭据或全部页面 |
| 样式 | 组件作用域 PascalCase.module.css；共用样式 kebab-case.css | `BlogQaPanel.module.css`、`blog-experience.css` |
| 单元测试 | 与被测文件同名加 .test；Python test_ 前缀 | `run-events.test.ts`、`test_agent_runtime_service.py` |
| fixture | 具体场景 + 有意义扩展名 | `expired-run.json`、`forged-citation.json` |
| 长期设计文档 | kebab-case.md，无日期 | `module-extension-contract.md` |
| 评审、博客、阶段记录 | YYYY-MM-DD-主题.md | `2026-11-12-dsh-architecture-review.md` |
| 约定入口/生成物 | 保留工具要求的名称 | `AGENTS.md`、`SKILL.md`、`Dockerfile`、`generated-api-types.ts` |

不使用中文/空格文件名、final/v2-copy/new2 等临时后缀或仅大小写不同的同目录文件。HTTP API 的 v1 与稳定工具 version 是协议版本，不靠复制文件名表示。动态 `[id]` 等名称仅在框架真实要求时使用，当前 React Router 不需要模拟文件路由。

TS 变量/函数 camelCase，组件/类型 PascalCase，真常量 UPPER_SNAKE_CASE；Python 函数/变量 snake_case、类 PascalCase。布尔值表达判断，回调 onXxx、处理器 handleXxx，避免 getData/doAction 等模糊名称。数据库字段与服务端 JSON 字段默认 snake_case，前端 view model 可 camelCase，由 API adapter 明确转换；既有公共字段不因命名规范改义或破坏兼容。

## 2. 缩进与格式

### 当前生效状态与配置冲突

2026-11-12 使用本地已安装 Prettier 的 `resolveConfigFile/resolveConfig` 对 `apps/web/src/modules/types.ts` 核验：解析到根 `.prettierrc`。`scripts/format-changed.mjs` 没有显式 `--config`，因此当前检查使用自动解析结果；不能仅看 `.prettierrc.json` 就判断实际格式。

| 项目 | 当前解析到的 .prettierrc | 另一份 .prettierrc.json |
| --- | --- | --- |
| 缩进 | 2 空格，useTabs 未声明、遵循默认 | 2 空格、useTabs=false |
| 行宽 | 80 | 100 |
| JS/TS 分号 | 不加 | 加 |
| 字符串 | 优先单引号 | 优先单引号 |
| 尾逗号 | es5 | all |
| 换行 | 未显式声明 | lf |

当前项目代码按**实际解析配置**处理。本规范的统一目标为保留当前 2 空格、80 行宽、无分号、单引号、es5 尾逗号，并明确 useTabs=false、LF；未来单独提交配置收敛，固定唯一配置入口、校验编辑器与 CI 一致后移除冲突文件。本轮不执行该迁移，不把目标规则写成已生效。文档中的示意代码不作为现有 formatter 输出证明。

### 各语言约定

| 文件类型 | 缩进 / 格式 |
| --- | --- |
| JS/TS/TSX、CSS/SCSS | 2 空格，禁止 Tab；换行交给实际 Prettier 配置，JSX 属性不手工纵向补空格 |
| JSON | 2 空格、双引号；严格 JSON 无注释/尾逗号；生成文件由生成器负责 |
| YAML | 2 空格、禁止 Tab；容易歧义的字符串加引号，多行使用显式块 |
| Python | 4 空格、禁止混合缩进；设计目标行宽 100，优先同文件引号风格；未启用 Python formatter，不声称 Ruff/Black 已检查 |
| Shell/Dockerfile | Shell 块 2 空格；Docker 指令大写、续行清楚；无现有自动格式门禁，人工检查 |
| Markdown | 普通段落不手工缩进；列表标记后一个空格，嵌套按父项正文列对齐；代码块写语言，列表/表格前后空行 |
| Makefile 等特殊语法 | 工具规定优先，例如 recipe 的 Tab；不把禁止 Tab 机械用于语法必需场景 |

文本使用 UTF-8、LF，末尾保留一个换行，删除行尾空白；触及历史 BOM/CRLF 文件时避免顺带整文件改写。代码行宽是 formatter 的折行目标，不折坏长 URL、字符串或生成数据。Markdown 链接不硬折断，表格不为对齐填充大量空格；博客另遵循写作技能的标题 ID、元数据与中文段落规范。

import 按第三方、工作区包、应用别名、相对路径、样式分组并空行；类型使用 import type。Python 按标准库、第三方、本项目分组。当前没有证据表明 import 自动排序已启用，不将人工规则宣称为工具检查结果。

## 3. 测试存放与发现

| 测试类型 | 位置 / 命名 | 发现与依赖约束 |
| --- | --- | --- |
| Web 组件/Hook/纯函数 | 与源码同目录 `*.test.ts(x)` | 沿用 Vitest；共享 setup 在 `apps/web/src/test/setup.ts` |
| 共享 TS/React 包 | 同源码 `*.test.ts(x)`；已有 `.spec.ts` 保留 | 各包 test 脚本必须实际发现；不为规范批量改 spec |
| 第一方 CLI | 现有 `packages/cli/test/*.test.mjs` | 保留既有 Node 测试组织，不强制搬至 src |
| API 服务/路由/仓储单元测试 | 现有 `apps/api/tests/test_<module>_<subject>.py` | 保留 unittest discover 平铺结构；不要直接新建嵌套目录后假定能发现 |
| Worker 单元/协议测试（拟议） | `apps/agent-worker/tests/unit/`、`tests/protocol/`，`*.test.ts` | 实施时显式配置发现范围；默认无真实模型和数据库 |
| 数据库集成（拟议） | 所属 app 的 `tests/integration/` | 独立命令、临时数据实例；API 新目录启用前验证 discover/import，不混入默认无数据库单测 |
| Linux 隔离（拟议） | `apps/agent-worker/tests/isolation/` | 单独容器验收；记录平台；不能以 macOS 结果代替 |
| 跨应用 E2E（拟议） | `tests/e2e/` | 仅有真实跨应用用例时创建；独立脚本与浏览器环境，未配置前不标为现有测试 |
| 跨项目契约（拟议） | 调用方 `tests/contracts/<provider>/` | 固定版本 fixture，验证提供方兼容性，不依赖线上生产服务 |
| 真实模型评测（拟议） | Worker `tests/evaluations/` | 固定输入/期望来源；独立有预算运行；生成输出不作为普通 CI fixture |

fixture 优先就近放 `fixtures/`，通用 setup/helper 仅在确有多个消费者时共享。禁止生产 token、用户正文、完整模型诊断进入 fixture；需要构造测试数据时使用合成且可解释的样本。不得通过放入同名 skip 文件让测试看似被覆盖。

新建测试目录必须同时证明 runner 能发现预期测试数及运行入口；本轮只有规范，不新增目录或修改 runner。快照不代替授权/状态断言，时间、随机数和外网应可控制；测试关注行为、并发竞争及拒绝路径，不照抄实现。覆盖率数字不能代替安全与恢复场景。

## 4. 生成物、临时文件与检查

- OpenAPI、TS 类型、内部工具 schema 由声明源生成，不手工修补；生成器及输出一起评审。跨项目消费者固定发布版本。
- `dist/coverage/临时 home/测试数据库` 不进入业务源码；运行产物进入受忽略的输出目录，文档只保存必要脱敏证据。
- `corepack pnpm format:check` 当前覆盖变更中的 JS/MJS/CJS/TS/TSX/Vue/JSON/YAML/CSS/SCSS；`.prettierignore` 排除 Markdown 与 Python，因此本次文档不能靠该命令证明排版合格。
- 纯文档检查链接、代码围栏、示例与规范一致性及 `git diff --check`；新增自动检查属于后续开发任务。
- 格式、命名、模块边界和业务测试分别报告结果；不得把格式检查通过写成架构校验通过。
