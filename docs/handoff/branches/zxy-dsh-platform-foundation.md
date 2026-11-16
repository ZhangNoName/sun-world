# DSH platform foundation

## Goal and scope

2026-11-12 用户授权拉分支开发。在当前工作区从 `main` 的 `6b14478` 新建 `zxy/dsh-platform-foundation`，未 fetch/pull、未建 worktree、未提交/推送/部署。开始实施计划 A 首批基础，不代表整个 A 或 A–D 验收完成。

起点 `main` 相对本地远端跟踪记录 ahead 3；工作区已有 AI 运营、评论、博客阅读、Markdown、写作 Skill 与稿件等大量未提交变更。保留这些变更。`apps/api/main.py` 和 `docs/agent-handoff.md` 原已修改，本轮仅增组合根和分支入口；不得整批暂存本工作区。

## Implemented

- `apps/api/src/core/module_registry.py`：显式静态模块声明；重复模块/能力/路由形状/工具映射、依赖版本/环、输入 schema 与身份字段检查。
- `apps/api/src/module_composition.py`、`main.py`：组合根登记 blog-content；没有公开工具执行端点或 Agent 运行开关。
- `apps/api/src/core/auth/`：只读策略默认拒绝未知能力、目标和服务主体；会话适配委托现有 AuthManager 重验 Redis/账户并恢复 sid 与当前角色，不替换旧登录或管理员写守卫。
- `apps/api/src/modules/blog/`：manifest、Pydantic schema、只读仓储、服务、公开接口与薄工具。旧 BlogManager 读取委托服务；旧 HTTP 响应、排序、页偏移与元数据 total 保持，缺正文不出卡片。total 表示候选元数据数量，不是跨库有效正文精确计数；稀疏页不无限补齐。读取无浏览量写入。
- 工具输入禁止额外字段/类型强制转换，搜索最多10候选，标题/摘要限制并标 truncated；正文 UTF-8 安全截断到16KiB，摘要绑定文章ID/完整标题/完整正文。累计64KiB/run、来源回执和提交重验尚待 C 实现；不能将基础适配器视为完整网关。
- `scripts/export-agent-contracts.py`、`packages/contracts/agent/tool-catalog.json`：单源生成、bundle hash、--check；API gate 接入漂移检查。生成物由 Python 格式化，`.prettierignore` 精确排除此文件，避免双格式器互改。
- `useBlogList.ts`、`BlogHomeFeed.tsx`：按候选分页窗口结束加载；加载结束重建 observer，支持连续稀疏页。修复独立审查发现的无限空页请求。

## Verification

- `corepack pnpm check:api`：通过，388 tests；包括新增注册/策略/共享公开查询、工具输入/截断与拒绝测试，无真实数据库访问。
- `corepack pnpm -F @sun-world/blog exec vitest run src/modules/blog/composables/useBlogList.test.tsx src/modules/blog/ui/BlogHomeFeed.test.tsx`：9 tests通过。
- `corepack pnpm -F @sun-world/blog typecheck`、`corepack pnpm test:contracts`（6 tests）、`corepack pnpm check:api:deploy-schema`：通过。
- `corepack pnpm check:web`：contracts 6、AI UI 25、Web 213 tests及typecheck/build/SSG/manifest通过；在build-summary的 `total-css-gzip` 预算失败，整体未通过。此轮未修改 CSS 或预算；共享工作区已有其他样式变更，未隔离重跑起点，不能把失败根因写成已证实。
- `corepack pnpm format:check`：仅报 `docs/content-sources/csdn-qq-42345136/manifest.json` 格式问题，此文件本轮未改。任务涉及的 TS/MJS 单独 prettier --check 通过；生成契约 --check 通过；`git diff --check` 通过。
- 判官独立审查后，修复稀疏分页；搜索摘要压缩并标记截断，新增序列化结果预算回归。没有真实 Worker、模型、Linux 隔离、迁移或生产验收。

## Remaining / next step

1. A 尚需现有角色/resource只读盘点、管理员基线与旧/新策略影子差异机制，未迁移旧写入口。当前只登记并启用公开读取能力；不把管理员角色自动转成 Agent 写权限。
2. B 验证固定SDK真实模型参数流/停止原因、Linux隔离与资源硬上限；确认部署位置和服务凭据。
3. C 再实现运行账本、白名单准入、实时撤销、累计预算、来源交付回执和终态事务；D 才接只读内测。
4. 合并前另处理全局Web预算/素材格式失败；不以定向通过代替根检查全绿。

## Writing / publication

使用 sun-world-blog → sun-world-write-design 局部更新 `docs/blog/2026-11-12-dsh-skill-boundaries.md`，分类「后端」，原标签「架构笔记 / Agent / DeepSeek Harness」。区分本地已实现注册/查询和待实现运行时；沿用现有关系示意，本批是基础落地状态补充，无新增图片，未网页预览、未发布。


## 2026-11-12 Continue to local validation

用户继续授权开发到可本地验证。已交付 `corepack pnpm dev:blog-qa`，当前服务运行在 `http://127.0.0.1:3031/aigc/blog-qa` / API `127.0.0.1:8011`。本轮没有修改生产数据库 schema、部署或生产功能开关；不占用已有其他项目的8000端口。

### Delivery boundary

- `tools/dsh-blog-local/`：独立 loopback FastAPI、仅开发用合成账号、三篇合成文章、SQLite 运行/调用/来源账本。认证、精确 Origin/Host、归属、幂等、单并发、45秒、4模型请求/4工具/64KiB、来源回执、完成重验、取消/退出/断流撤销、重启中断、历史失效链接隐藏已实现。模型请求随取消中止，子进程组TERM/KILL和固定临时目录清理。
- `apps/agent-worker/src/`：固定0.2.2-rc.1真实SDK、独立home/cwd、只读两工具、可信loopback模型桥、root session/单turn/成功终态投影。无shell/MCP/文件工具。SDK DSL不接受Pydantic min/max等JSON Schema关键字，也不允许required:false；仅投影其支持的类型/默认/描述/required:true，API始终使用完整schema验证。实际空工具清单会被模型代理/启动检查拒绝，不降级继续。
- 博客模块的 `agent/skills/blog-qa/`：产品Skill原文及manifest；内容hash/工具版本纳入生成bundle，Worker重验。未装载开发或用户Skill。
- `scripts/dev-blog-qa.mjs`：独立临时目录锁定依赖安装、禁install scripts、SDK实际两工具登记检查、macOS文件/外网负向探测、前后端启动/关闭。`package.json`增加dev:blog-qa与test:agent-worker。运行过程不安装依赖。
- `apps/web/src/modules/ai/`：新增blog-qa-api、useBlogQa、BlogQaPage及其样式/测试，注册独立路由。页面明确本地验证、合成数据与真实模型；测试登录、发送/停止、恢复、纯文本答案、引用原文、退出状态。所有异步账户操作使用generation/account fence，防止退出后迟到响应显示旧回答。

### Verification evidence

- 最终 `corepack pnpm check:api` 通过，407 tests；本地控制16项、模型转换3项包含在内。
- Worker协议3项、AI模块8文件48tests、Web typecheck、定向Prettier、生成契约--check、git diff --check均通过。
- `corepack pnpm check:web`：contracts6、AI UI25、Web66文件219tests、typecheck、build/SSG/manifest通过；完整gate仍在build-summary的total-css-gzip失败（18 assets）。本轮新增一份blog-qa CSS，预算未调宽；之前17资产时该预算也失败，不将根因归属写成已独立证明。
- `corepack pnpm check`：根脚本/CI/deploy协议通过，在format gate因本轮未改的 `docs/content-sources/csdn-qq-42345136/manifest.json` 失败而停止。任务文件单独Prettier全部通过，未修改其他任务素材。
- 启动实际通过SDK两工具登记检查与macOS负向探测：项目文件读取、TEST-NET外网连接均EPERM；取消后运行目录残留0。
- 真实qwen38_27b与真实DSH端到端：问题「博客问答怎样核对参考来源？」约8秒完成，实际搜索/读取/回执后返回中文答案及文章1引用。另测无结果问题「量子纠缠实验的结论是什么？」固定无结果回答。没有用fixture响应伪装真实模型。
- 自动浏览器（临时Playwright+已安装Chrome headless）验证登录→真实提问→答案→点击原文→刷新恢复；另验停止→已取消、退出→旧结果清除。1280×900和390×844截图已检查，无横向溢出、pageerror为空。CUA连接两次超时后使用此fallback。截图位于受忽略 `.tmp/dsh-blog-local/{desktop,mobile}.png`，未加入Git。
- 判官独立审查并复核迟到响应修复通过。未连接生产数据库、导入模型凭据或进行Linux验收；常规SSG构建保留既有公开文章的只读获取。

### Next steps / limitations

本地验证入口可交给用户操作；重启命令与验收步骤见 `tools/dsh-blog-local/README.md`。真实模型调用的是既有公开keyless模型地址，出站使用项目固定地址校验，无凭据，不使用生产AI API。

这不是正式A–D整体完成。仍缺MySQL运行账本、Redis准入、真实账户白名单/角色影子盘点、生产AI会话事务、Linux容器/PID/网关地址隔离、TLS/服务凭据运维与完整故障/语义评测。macOS回环允许策略不等于生产端口白名单，SQLite/合成账户只用于本地验证，禁止作为生产迁移捷径。正式内测仍关闭。

写作沿用sun-world-blog → sun-world-write-design，局部更新架构笔记03，分类后端、原3标签不变；补本地真实链路与生产边界，不新增重复图片，不发布。未做文章网页排版预览。未提交、推送或部署；原有其他dirty文件仍保留。


## 2026-11-12 Existing-site account and blog integration

### Goal / delivery

用户要求接真实账号和博客，在现有站点流程验证。默认 `corepack pnpm dev:blog-qa` 已改为正常站点模式：Web `127.0.0.1:3030`，完整API `127.0.0.1:8032`，经同源 `/api` 代理。8030另有其他任务静态预览，未停止或覆盖。原合成验证3031/8011已停止，其显式入口保留 `dev:blog-qa:fixtures`。

- 只读检查当前local配置的MySQL/Mongo/Redis/PostgreSQL可达；账号6个，公开metadata31条。默认只读收集启用的admin ID（当前1个）成为本地名单，操作时仍重验admin角色；该管理员有非空密码配置。未读取或打印密码内容、未创建/修改账号或文章。
- 真实模式复用站点 Cookie、AuthManager、Redis与账户/角色，未增加登录旁路。外部旧Cookie严格拒绝；运行绑定owner/family，服务端有界短期凭据缓存（128/60s，不落盘/不下发Worker）。跨页refresh通过同设备/family的Redis当前snapshot接续，再完整验证当前access与账号/角色，deadline仍45秒。
- `agent_runtime` 共用单套控制内核；tools合成runtime/store变兼容导出。公开查询复用真实MySQL/Mongo，来源正常 `/blog/{id}`。Redis专用命名空间原子限流，未知/不可用failclosed，正式运行仍只允许local+flag+名单。
- SQLite仅本地运行账本 `.tmp/dsh-blog-site/ledger.sqlite3`，文件0600，未改业务数据库schema。本地启动跳过原Postgres checkpointer setup DDL，既有表只读预检确认存在。
- `ai/public.py` + `ai/model_proxy.py`公开模型适配接口，使用现有全局catalog默认，私有配置仅服务端解密；普通聊天文本流不改。默认模型配置在本地runtime创建时固定，更换后重启。
- main注册site router；公有接口ApiResponse/Pydantic输出+Cookie安全声明，内部接口loopback+双凭据且不进入OpenAPI；export脚本、类型与route/method/auth元数据已同步，原其他任务契约变更保留。
- `useBlogQa`复用AuthStore和shared sessionPort，401可走现有刷新后重试，stream start沿用同幂等key。站点模式无合成登录按钮，原登录页return_to回问答。AiWorkspace增加可选sidebarNavigation展示注入的应用链接；普通AI侧栏与收起导航都有问答入口，不在共享包写业务路由。
- 应用shut_down调用runtime.aclose，撤销模型/任务、await进程组清理、关闭SQLite；优雅退出1秒进入lifespan，launcher等待5秒。SSE pin/refcount防并发GET提前删凭据；撤销终态安全空question/sources与前端normalize防崩溃。
- 本地开发签名密钥由显式环境或启动器在受忽略`.tmp`生成0600文件，以支持重启后验证Cookie；不记入文档/日志，不提交。重启时未完成运行中断，不重放。

### Verification and current running state

- 最终 `corepack pnpm check:api`：422 tests通过；包括34个blog_qa控制/认证/模型转换/进程测试，及核心策略相关用例。判官两轮审查/最终复核通过。
- `corepack pnpm test:contracts` 6tests、`test:ai-ui`25tests、AI模块53tests、Web typecheck、生成契约检查通过。
- 完整 `corepack pnpm check:web`：67文件224tests、类型、包构建、Web构建/SSG/manifest通过；仍在total-css-gzip(18assets)预算失败，不调宽门槛。
- format:check仅失败于本轮未改的 `docs/content-sources/csdn-qq-42345136/manifest.json`；任务JS/TS/JSON单独格式检查与git diff --check通过。
- 真实操作系统进程故障测试 `test_blog_qa_shutdown_process.py` 启动不返回结果的Node子进程，通过实际Application.shut_down回收并确认PID不存在、workspace删除；不把此测试当SDK/模型验收。
- 实际停止旧站点launcher后3030/8032无监听、未见残留local-runner；重启加载最终代码，health200、Web200，Guest能力关闭原因active_session_required，未创建问答运行。
- 浏览器（临时Playwright/已安装Chrome headless）实测普通AI侧栏→博客问答→原登录页、return_to保留、无合成账号入口；打开真实文章41标题/详情正常，pageerror为空。公共API页返回当前真实文章，非三篇fixture。
- 当前本地认证method仅password enabled，QQ/短信等未配置；管理员密码有配置，但没有尝试或猜测凭据。已请用户在网页正常登录，尚未收到已登录回执；因此**真实账号登录→真实博客→真实模型的完整端到端尚待用户验收**。此前真实模型+fixture成功不能替代此项。

### Next suggested step

请用户打开 `http://127.0.0.1:3030/login?return_to=%2Faigc%2Fblog-qa` 使用已有管理员账号密码登录（无需发密码）。登录后提出真实文章相关问题，核对模型选择/读取/来源，再验退出/刷新/取消。普通账号用显式 `--user-ids`名单启动；QQ-only账号须先具备本地OAuth配置，不复制或读取禁止的生产secret文件。

开发说明：`docs/development/blog-qa.md`。仍缺正式MySQL运行账本、Linux隔离和生产部署放行；未宣称A–D全面完成。没有提交、推送、发布文章或部署。其他dirty业务改动保留。

博客按sun-world-blog→design局部更新架构笔记03，后端分类及原标签不变；说明合成与真实站点模式、真实登录验收边界，无新增配图（现有关系示意足够），未做文章预览或发布。


## 2026-11-12 Admin end-to-end acceptance completed

用户授权使用现有管理员测试，并允许凭据存本地非Git文件。凭据已保存到被Git忽略的 `.tmp/dsh-blog-site/test-account.json`，权限0600；不在文档记录内容，也不放到源码/fixture。正常密码登录成功，没有改账号密码。

### Findings and fixes

- 实际登录首次加载能力时发现DB旧目录没有auth_mode和is_default，之前guest smoke与mock schema未覆盖。`MySqlAiRepository._read_catalog`新增窄只读兼容：仅已知1054字段错误触发SHOW COLUMNS和投影重写；缺auth_mode保持bearer；缺default时仅唯一enabled可作默认，多候选503拒猜；未知表/其他列错误照常失败。不ALTER或UPDATE模型目录。
- 当前只有既有DeepSeek目录项，但本地未配置密文解密key。未读取被禁止的生产secret文件；改为在ignored `.tmp/dsh-blog-site/options.json`显式选择qwen-public用于本机测试（文件0600）。launcher也支持--model，factory生产拒绝、仅固定keyless地址；页面明确“本地测试模型”，不伪称目录DeepSeek可用。线上配置未改。
- 兼容读取和本地模型覆盖增加6项单元测试；判官复核通过，无凭据读取/网络调用。

### Real acceptance evidence

- Chrome headless通过原网页登录→原return_to→blog-qa，capabilities authenticated/enabled均true。
- 真实DSH使用本地测试Qwen，实际搜索/读取真实公开文章，问题“博客里的 dsh 问答怎样拦下伪造引用？”完成，来源为正常 `/blog/41`。刷新恢复completed结果，点击来源后验证真实标题。
- 新运行先取消，页面状态已取消；再启动运行并通过站点原 `/auth/refresh_token`（200）轮换，同family运行继续完成。
- 退出后旧回答清除，`/user/me`返回401。浏览器pageerror为空。截图 `.tmp/dsh-blog-site/real-account-answer.png`受忽略，未加入Git。
- `corepack pnpm check:api`最终428 tests通过；新增legacy-read与override测试6项通过。此前Web224tests/构建结果仍适用（本轮无前端逻辑修改）；已知素材格式与CSS总预算失败仍保留，不改门槛。
- 测试账号文件和options均复核0600且git check-ignore成功；git diff --check通过。未提交、推送、部署或发布。

真实登录→真实博客→真实模型（显式本地测试模型）已验收，不再等待用户代登录。全局目录模型解密配置、正式MySQL运行账本、Linux隔离和生产放行仍未完成。当前服务仍在3030/8032运行；默认启动会读取本地options以复现测试模型选择。

按sun-world-blog→design局部更新架构笔记03的本地验收边界，原分类/标签保留，无新配图、未发布。截图仅用于开发验收，不混入公开稿。


## 2026-11-15 管理员权限基线与影子比较

### Goal / delivered

用户继续授权迭代，本轮补阶段 A 的管理员入口盘点与新旧策略比较，保留共享工作区已有变更；未提交、暂存、推送、迁移数据库或部署。

- `apps/api/src/core/auth/admin_shadow.py`：显式40项 method/路由模板基线，仅当前用户、正整数ID和admin角色可匹配；这是迁移候选，不登记为Agent能力。未知操作拒绝，公开读策略不扩权。
- `apps/api/src/routers/auth/auth.py`：原会话/管理员判断仍是唯一放行依据；影子使用本次验证上下文，不新增会话查询或allow缓存。差异、未映射和候选错误进入现有有界审计日志，不记录用户信息、原始路径、查询参数或异常文本。影子与记录失败不会改变旧判断。
- `scripts/check-admin-policy.py`、`scripts/export-openapi.py`、`scripts/run-api-check.mjs`：复用schema-only组合根读取有效依赖树，检查基线双向漂移并纳入API gate；覆盖继承守卫/前缀。独立审查发现重复路径可掩盖无守卫入口，已改为集合化之前拒绝包含guard的重复method/path，并补三种顺序回归。
- `apps/api/tests/test_admin_policy_shadow.py`：7项测试覆盖身份/未知操作、双向差异、候选异常、日志隐私/失败、HTTP旧鉴权不变、继承依赖/前缀和重复路由。
- [源码盘点与使用说明](../../development/admin-policy-migration.md)：记录roles/user_roles/resources/role_resources现有职责及40项操作分组。未查询实际数据库行，不将源码盘点表述为生产权限审计。

### Verification

- `corepack pnpm check:api`：最终435 tests通过，包含40条基线门禁；既有Pydantic弃用警告仍存在。判官独立审查发现的重复路由问题修复后复核通过，无剩余阻塞项。
- `apps/api/.venv/bin/python scripts/check-admin-policy.py`：40项匹配；新测试文件7项通过。
- OpenAPI导出至ignored `.tmp/dsh-admin-openapi.json`，JSON内容与当前 `packages/contracts/openapi.json` 一致，无需改公开契约。
- `corepack pnpm format:check`：仍仅失败于原有 `docs/content-sources/csdn-qq-42345136/manifest.json`；本轮MJS定向检查与 `git diff --check` 通过。未修改Web逻辑/样式，未重跑Web gate；先前CSS预算失败尚未处理。

### Remaining / writing

阶段A仍需在明确环境只读核对真实角色/resource行、失联绑定和恢复管理员，再逐入口迁移最小能力/近期认证/资源范围；当前影子基线不能用于业务放行。MySQL运行账本、Linux隔离和生产功能放行仍未完成。本轮未重启3030/8032服务，因此已有长驻进程不保证加载本轮代码。

使用sun-world-blog→sun-world-write-design局部更新架构笔记03，分类「后端」、原标签「架构笔记 / Agent / DeepSeek Harness」保留。说明先比较再切换的理由，无新增图片（这一权限迁移规则用段落即可解释），未做文章网页预览或发布。


## 2026-11-15 授权持续迭代与版本保存

用户授权按计划自主实现、review、验证、中文提交并同步写博客。未授权推送/部署，继续在当前工作区。

### 本次修复

- 判官复查新增发现：只按路由模板集合比较会漏检前置公开动态路由对受保护入口的遮挡。门禁现在按有效注册顺序做固定前缀的保守重叠拒绝；包含str/int/path转换器的回归通过。不是任意正则互斥证明，必要时将更具体的受保护路由提前。
- 完成态问答的并发GET/GET、GET/cancel会共用family引用，原release可提前删除其他请求仍用的凭据。改为CredentialVault同锁put+pin、请求finally unpin，SSE也采用原子获取。确定性HTTP并发测试确认两请求均200、已完成状态不变，结束后pins/entries为空。
- 版本保存范围：此前DSH基础、共用公开读取、独立本地Worker/账本/模型桥、真实站点适配与前端问答、管理员影子基线。40项基线及生成契约依赖现有评论与AI监控后端，所以保存必要后端依赖及测试；不混入未关联的后台UI、阅读器样式和写作Skill变更，不包含data/、.tmp或本地凭据。

### 验证与后续

管理员基线40项、影子策略8tests、真实会话适配15tests定向通过。接下来验证完整API、Worker协议和前端问答/类型；提交前从暂存树导出临时快照运行API检查，防止未暂存文件掩盖漏提交依赖。原素材清单格式和共享Web CSS预算失败仍保留，未调宽门槛。

下一步继续阶段A真实角色/resource只读核对，再推进C的正式持久化账本；B的Linux隔离仍单独放行。博客沿用sun-world-blog→design局部补充架构笔记03，分类后端、原三标签不变，无新增配图，未发布或网页预览。

### 提交前最终复核

- 复查第三项问题：SSE断流后AnyIO取消scope可能打断gather和unpin，留下运行/凭据。已使用屏蔽外层取消、独立清理任务与嵌套finally；重复运行取消幂等，模型和monitor回收后再移除映射。直接ASGI http.disconnect测试在暂存旧实现失败（pin残留），修复后确认runner/proxy清理、cancelled终态、pins/entries/active/tasks/model_tasks全空。判官复核通过，无本次范围内剩余阻塞。
- 从暂存tree `a332af9ca403cc5a2be1eb519653e0e81cae0b38` 导出独立临时快照，未拷贝.git、.tmp、data或本地override，运行 `node scripts/run-api-check.mjs`，完整API gate **438 tests通过**。使用项目venv作为依赖解释器，不借用工作区未暂存Python源码。
- Worker协议3tests、前端AI模块及博客分页定向11文件62tests、Web typecheck、contracts6tests、deploy-schema静态检查通过。暂存JS/TS/CSS/JSON定向Prettier和私钥/token模式检查通过，未暂存本地配置/凭据/运行数据。
- 共享工作区format素材与Web CSS预算问题仍是未完成项；没有声称root check全部通过。博客已补影子对照、动态遮挡与并发凭据机制；未做本次网页预览，不发布。


## 2026-11-15 阶段A实际权限数据只读盘点

- 当前版本基点：`4ec5d20`，此前DSH本地验证、管理员影子基线及并发/断流修复已提交。
- 本轮新增 `core/auth/permissions_inventory.py` 与 `scripts/audit-local-permissions.py`：聚合角色/resource及绑定数量、Python一致归一化的空码/重复码、重复/失联绑定、DISTINCT启用管理员数。只读事务强制、同连接一致快照、五表InnoDB检查、定义数量硬上限、成功失败rollback、关闭连接、配置/驱动异常脱敏。只读local两份配置，不读AI凭据或任意override，不输出账号ID/联系/凭据/主机/资源路径。没有迁移、写库或新增业务授权。
- 实际运行 `apps/api/.venv/bin/python scripts/audit-local-permissions.py --local` 返回0：users6、roles2、resources0、user_roles6、role_resources0、enabled_admin1；空/重复码与重复/失联绑定均0。保留单管理员提醒，恢复路径unverified。配置profile不等于物理本机或已核对生产环境。
- `apps/api/tests/test_permissions_inventory.py` 新增8项：真实SQLite查询验证（含Tab/Unicode角色码）、重复与孤儿、禁用/无admin、事务rollback和拒绝非InnoDB、配置范围与production拒绝、错误脱敏、异常聚合与超量拒绝。定向通过；完整 `corepack pnpm check:api` 446tests通过。
- 文档：[迁移说明](../../development/admin-policy-migration.md)补命令、退出码、汇总及边界；分阶段计划同步本地已核对，阶段A仍未宣称生产验收。博客按sun-world-blog→sun-world-write-design局部补架构笔记03的“只读盘点不直接授予权限”，后端分类/原三标签保留，不公开账号/角色目录细节，无新增图片、未网页预览或发布。
- 下一步：review并保存本轮版本，然后推进C正式MySQL账本与事务接口；B的Linux隔离、恢复管理员/生产权限核对仍单独验收。原有其他dirty文件保留，不推送或部署。

判官本轮独立审查与8项定向测试通过；另用Mock验证退出码0/2/1/1及rollback/close路径，未发现本轮范围阻塞。

最终format:check仍仅报原有content-sources素材manifest格式；本轮Python/Markdown不受Prettier检查，文档链接与git diff --check通过。


## 2026-11-15 C1 正式生命周期账本与历史事务

### Delivered / scope

基点`9a601e4`。本轮按计划开始C首批，生产/现有SQLite入口未切换、没有连接真实DB写入或执行迁移，没有推送部署。

- `schema_migration.py`集中新增agent_runs，含单项目/场景、owner、UUID幂等键/请求摘要、会话关联、family摘要、固定引擎/bundle/model、execution/generation、根会话/回合、deadline/lease和终态。标识/摘要ASCII binary，幂等与会话唯一键；不存Cookie、原始family或Worker凭据。
- `agent_runtime/ledger.py`实现同事务accept+AI会话/seq1问题；owner锁串行同用户键、差异参数冲突、family先验证。单次claim、根turn登记、heartbeat不复活到期租约；cancel/complete锁竞争、seq2答案与completed同事务，写后再验时限，重复同摘要完成幂等；最多100条对账终态，不盲目重派/重放。commit ACK丢失后通过原键/绑定查询恢复。需在工作线程调用，未接线到HTTP。
- `ai/agent_history.py`由AI模块拥有并从public导出，复用传入UOW，不开连接/commit；Agent专用命名空间兼容旧AI schema，普通MySQL聊天所有读写/反馈路径隔离。引擎/场景由run关联，不新增旧AI表列。
- `core/error_codes.py`登记实际使用的AGENT内部错误码；公开HTTP映射与前端码跟随C2正式接线，不伪造已存在端点。
- coding实现AI接口与旧聊天隔离，判官独立发现unicode_ci重音别名可绕过输入前缀。已在get/append/edit查询实际行过滤，并复验canonical ID；模拟重音比较器确认修复前可读写、修复后404且消息不增加。模拟不是MySQL实测。复核通过，本轮范围无剩余阻塞。

### Verification

- 账本16tests、AI历史9tests、旧仓储20tests通过；真实SQLite连接覆盖事务rollback、两个writer的接受/领取/终态竞争、写答案途中超时、提交回执丢失后幂等恢复。SQLite BEGIN IMMEDIATE更强串行化，不能证明InnoDB锁行为。
- `corepack pnpm check:api`完整471tests通过；schema静态contract 26tables/208columns通过。未运行真实DDL或修改配置目标的业务数据。
- 本机Docker/mysqld/mariadbd均不可用，未安装/启动或为验收向共享数据库建表。真实MySQL并发/崩溃/迁移矩阵待后续一次性实例完成。
- 开发说明见[agent-run-ledger](../../development/agent-run-ledger.md)，包含事务边界、命令、保留幂等键、迁移/回滚与未完成项。

### Writing / next

使用sun-world-blog→sun-world-write-design新增[架构笔记04](../../blog/2026-11-15-agent-run-history-transaction.md)，分类后端，标签架构笔记/Agent/DeepSeek Harness，stage本地验证。围绕同事务保存、幂等/终态与聊天隔离展开，用失败对照表说明回滚，不增加重复图片；MySQL排序规则就近链接官方说明，明确本地模拟边界。未网页预览或发布。

下一步C2实现工具/来源交付账本、累计预算与正式网关，接入实时会话重验/授权及Worker。C、B尚未整体验收，不能直接将存储接口作为授权入口。既有素材格式和CSS预算失败仍保留。

最终暂存树`5faea5e17599cb4cf421c0179e3a2f2296324837`独立导出后完整API471tests通过，临时快照已删除，避免共享工作区未暂存源码掩盖漏依赖。deploy-schema协议与暂存空白/本地路径/私钥模式检查通过。format:check仍仅失败于原有content-sources/manifest.json，本轮未修改该素材；Python/Markdown不由Prettier证明格式。新稿链接/5个稳定锚点检查通过，未网页预览。


## 2026-11-15 C2 工具/来源回执、预算与正式网关库

### Implemented

基点3b24abe。C2库未注册HTTP、没有接TLS/正式Worker或更换旧SQLite流程；没有调用真实模型、连接真实数据库写入或执行DDL，生产保持关闭。

- `journal.py`与集中schema：新增agent_tool_calls/agent_sources及run的tool/model/result_bytes计数和三受众token摘要。工具预扣4次、模型4次，失败/取消不退款；工具完整响应累计64KiB，含外层包装和digest。body实际字节必须与metadata一致，单正文16KiB。调用按run/gen/call键幂等，参数摘要冲突拒绝；prepared来源收到正确完整响应回执后同事务delivered，只有当前代次已交付来源才能引用。来源只存ID/title/hash/read/delivery metadata，不存完整正文或参数/结果JSON。
- `gateway.py`：固定两只读工具/registry schema、服务身份+分受众run token、run/execution/gen/lease/deadline/bundle/model/单项目比对；强制live enabled/authorize/allow callbacks。claim将执行绑定/租约/三个随机凭据摘要同事务提交，明文不落库且repr隐藏。工具读取前后/提交重验当前主体与策略；根turn登记和heartbeat同样验证result audience。
- 响应digest覆盖canonical `{call_id,result,source_id}`（排除digest自身），预算覆盖最终整个response；source UUID预分配并纳入digest。cache仅内存32条/128KiB到deadline，丢失不重读/重扣，明确不可重放；C3必须版本化适配，不能直接复用旧SQLite协议的digest/整数source ID。
- 最终事务：`ledger.commit_answer`现在必须prepare回调，在同run UOW内恢复delivered来源、重读公开文章/完整快照与片段摘要，再生成canonical站点link和text/plain，空来源用固定答复。取消/过期/当前会话或策略拒绝则不写答案。标题显示截500/空标题回退但hash仍绑定完整快照，非法Unicode稳定拒绝。
- 模型预留后最多30秒且不越总deadline，覆盖model/max_tokens固定值、禁止地址/凭据/owner覆写；等待中轮询状态/授权，撤销时取消并drain。结果上限256KiB且stop_reason/model必须已知；不把未知usage额度退款。token/内存/PID硬上限与Linux仍待B。
- 提取既有`finish_cleanup`到cleanup.py并保留runtime导出兼容，供正式代理同样抵抗重复取消。

### Review / evidence

coding实施journal/schema，主线程整合gateway/ledger/AI块工厂，判官独立review及delta复核无阻塞。根据review池等待提醒，authorize显式接收当前`(uow,row)`，allow接收`(principal,row,uow)`，测试证明无需嵌套借池。真实MySQL Repeatable Read当前读/锁顺序与撤销边界仍未验证，不能以普通快照SELECT代替实时撤销证明，C3接线前须解决。

- Journal13项、gateway20项、C1 ledger16项定向通过，真实临时SQLite事务覆盖身份/受众/旧代次、规范化幂等、回执冲突、来源变更/跨run、包装字节、缓存丢失、budget/存储rollback、模型失败不退款、取消清理、同连接授权等。SQLite BEGIN IMMEDIATE更强串行化，不代表InnoDB锁验收。
- API完整检查此前501项通过；最后增加标题/Unicode和真实正文长度防绕过回归后再做最终暂存树门禁。既有Pydantic/SQLite datetime适配弃用警告保留。
- 开发与协议说明见[agent-run-gateway](../../development/agent-run-gateway.md)；未安装数据库/修改业务表，未生产/真实模型验收。

### Writing / next

按sun-world-blog→sun-world-write-design修订[架构笔记04](../../blog/2026-11-15-agent-run-history-transaction.md)，新增“工具返回了正文，还要确认交付”章节，原history/verification稳定ID保留；分类后端、原三标签不变。解释prepared/交付、预算、临时cache丢失不重读与最终重验，保留跨存储/语义边界，无新增重复图片、未网页预览或发布。

下一步C3正式会话/准入与dispatcher/router、Worker私有协议版本化/SDK接线、重启/未知派发与SSE/恢复验收；使用一次性MySQL验证真实迁移/并发/撤销/池，B隔离单独放行。原素材格式与CSS预算未处理，不声称root check全绿，不推送或部署。

最终暂存树`f34f4770906d4a94fb20c6f2a3eb7128f0bf22e8`独立导出验证API **504tests通过**（包括20项网关测试），临时快照已清理。deploy-schema协议、最终diff空白和本地凭据路径/私钥模式扫描通过；判官最后复核标题/Unicode/真实正文长度三项delta，无剩余阻塞。全仓format:check仍仅报原有素材manifest格式；本文档/博客6个稳定锚点和链接检查通过，未网页预览。不把定向/后端通过表述为root check全绿。


## 2026-11-15 C3首批：当前会话、同连接来源与真实MySQL

### Implemented

基点6bd6a44。本轮推进C3接线前的认证/数据库基础，不注册新HTTP，不派发正式Worker，不更换旧SQLite入口。未读取业务YAML/env/凭据、未连接共享数据库、未生产DDL或推送部署。

- MySQLUnitOfWork/Manager支持固定allowlist的单事务isolation_level；正式Ledger/Gateway统一经ledger.unit_of_work使用READ COMMITTED。旧业务默认不变；SET失败释放连接，复用对象重置commit状态。当前账户/角色通过同UOW一条非锁定LEFT JOIN读，只取id/status/code，不反向锁users，不额外借池。
- AuthManager/SessionAuthenticator可选uow分支保留现有JWT/Redis校验，普通默认调用不变；新增RunSessionAuthorizer易失run token/reference绑定（容量/TTL有界、同family刷新不延长、关闭/撤销/缓存过期/丢失拒绝、迟到查询不恢复已撤销binding）和只读RunAllowlistPolicy。原黑名单日志token前缀移除并回归。
- 发现来源重验同样存在二次借池风险，RunGateway新增强制source_reader(uow,principal,article_id)，blog.public.create_public_tools支持当前UOW读元数据与标签。旧业务工具的普通读在事务外仍可用原pool。
- scripts/test-agent-mysql.py只接受已验证本地mysqld binary，--no-defaults/独立私有datadir/Unix socket/禁TCP与mysqlx/最小环境；不下载或系统安装。nonce和实际@@datadir/socket/skip_networking验证后才在该实例建随机测试库，退出/失败/信号停止owned进程并删datadir。

### Evidence / review

主线程从官方8.4页面取得macOS15 ARM MySQL8.4.13归档，官方MD5匹配、记录SHA256、codesign严格验证通过；缓存仅ignored.tmp，无Homebrew安装/系统服务。详见[验证说明](../../development/agent-run-mysql-validation.md)。

- native MySQL **13项通过**：中央28表DDL、并发接受/领取、回执/JSON历史、终态竞争与rollback、真实unicode_ci别名隔离、RC当前读/旧RR恢复、真实AuthManager/JWT+合成Redis的刷新/撤角色、最终事务中途disable拒绝答案、内存丢失模拟与reconcile、真实INNODB_TRX LOCK WAIT中的2连接授权/来源同连接、真实公开工具facade不二次借池。
- Review建议补空RC UOW和首SQL前异常后的隔离hint恢复，使用pool_size1强制同一物理session复用，两种场景的后续普通RR均保持旧快照，native通过，不以普通session变量代替行为证明。
- 真实SIGTERM实验：server ready后停止launcher，exit130、owned server PID不存在、临时datadir不存在。所有实例已回收，下载binary缓存保留用于复跑（不提交）。
- 默认API gate518tests通过；新session10项、UOW7项（旧3+新4）、旧AuthManager26/核心策略3/网关20回归通过。MySQL独立目录显式discover，不混入默认无DB gate。
- coding实现会话适配；判官独立review与单测复跑未发现确认阻塞。只验证MySQL8.4.13/macOS单环境，Redis/Mongo为合成，未真实Redis/SDK/模型端到端；API重启为新authorizer模拟内存丢失，未杀API或MySQL做恢复实验。

### Writing / next

使用sun-world-blog→design修订架构笔记04，增加当前授权快照、同连接与2连接等待链说明，原稳定ID保留；官方隔离/SET作用域链接已核对，文章仍后端分类与原三标签。已有对照表和叙述足够，无新增重复图、未发布。已在现有3030服务用实际SunMarkdownPreview和当前工作区样式独立预览草稿：1280×900桌面和390×844手机，7个唯一稳定标题ID、正文无水平溢出、首行缩进0px。修复中文句末标点导致一处加粗原样显示的问题；DOM检查无残留双星标记、10个strong。截图保留于ignored.tmp/c3-blog-desktop.png与c3-blog-mobile.png。此项为独立正文渲染预览，使用了共享工作区未提交的渲染器/样式，不代表已提交前端或完整文章页、导航/登录/E2E验收。

下一步继续正式dispatcher/router、Worker版本化协议与SDK接线、真实Redis与完整故障矩阵；B的Linux/token/PID/TLS仍未放行。一次性新库建表不代表已有数据库迁移演练，不能把首批验证宣称C3/A–D全面完成。原共享素材格式和CSS预算问题保留。

最终暂存树`419a7850ef2cdd028a0cb9424b069f4f6db8a519`独立导出后API518项与真实MySQL13项均通过，快照和owned mysqld/datadir已清理；随后仅补充交接证据。暂存空白/私钥与GitHub token模式检查通过，未包含既有其他dirty源码/配置/素材。博客1280/390宽正文预览DOM与截图检查通过，无残留加粗标记；原素材format与CSS预算失败仍未处理。
