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


## 2026-11-16 C3后续：派发控制、V2私有回调与TLS输运

### Goal / implementation

基点82f8f9c。继续按计划接线正式账本，保持旧SQLite/v1本地SDK与生产开关不变。本轮没有挂载公网HTTP、实现正式Worker服务/SDK v2执行端或部署；没有读取应用配置/凭据或连接业务库。

- coding新增dispatcher与17项真实SQLite/Gateway控制链测试，ledger增加限定绑定终结方法及root_request登记/比对。先claim提交再发单次start，ACK不明只inspect原execution一次，不盲目重派；completed ACK不能生成答案。取消、当前授权失效、外部终态和close先尽力持久终态再stop，DB未知仍UNCONFIRMED并尽力cancel；线程/RPC取消drain。容量槽涵盖在途与活跃执行，不在原dispatch退出前释放。
- 主线程实现固定HTTPS Worker client（禁代理/重定向/重试、校验证书/hostname、请求16KiB/响应8KiB/2秒），显式私有V2回调factory（需宿主可信ASGI TLS peer verifier，不信转发头、未挂main）；source UUID、分受众认证、根session/turn/request、同事务完成贯通原网关。新增nullable root_request_id中央schema，未升级业务库。
- rpc.py严格schema由export-agent-rpc.py导出packages/contracts/agent/rpc-v2.json；API gate新增--check，Python生成器负责该文件格式（沿用tool-catalog约定）。JSON拒绝重复key、非对象、NaN/Infinity及1e999溢出。错误不回显driver/Worker诊断或token。
- 说明：[派发控制与V2](../../development/agent-run-dispatch.md)。内部服务路径与schema是明确版本的实现契约，不能把v2交给现有整数来源/单token v1适配器。

### Review / verification

- 判官确认并复核解除：monitor看到外部终态漏cancel；owner cancel过早释放pending start槽可绕过max_active；科学计数1e999转inf绕过非有限数拒绝。对应回归已加，最终delta未发现新的确认阻塞。
- 定向：dispatcher17、ledger18、gateway20、private-router7、transport4通过。私有router测试使用实际ledger/gateway+临时SQLite和合成peer，覆盖未回执/错request拒绝、完成及幂等；不作为部署TLS/mTLS验收。
- test_agent_worker_tls使用自有loopback TLS监听器/临时openssl证书，信任成功、未知CA和SAN不符拒绝；所有临时socket/文件已回收，无真实服务身份/轮换演练。旧Worker协议3项、deploy-schema通过。
- 安全启动器的一次性MySQL现15项通过，新增原生root_request/内部终态与派发ACK不明不重放/取消前已落interrupted；fake Worker只作故障注入，真实MySQL数据/进程全部回收。
- 全仓format:check仍仅报原有docs/content-sources/csdn-qq-42345136/manifest.json；原CSS预算问题仍保留，不宣称root check全绿。

### Writing / next

继续sun-world-blog→sun-world-write-design修订架构笔记04，分类后端、标签架构笔记/Agent/DeepSeek Harness不变，补单次派发、确认丢失只查询、ACK不等于持久完成与外部终态回收。已有对照表足够解释本次增量，无新增图片、未发布。

沿用3030下独立正文预览，1280×900及390×844，7个稳定唯一ID、无溢出/首行缩进、无残留双星标记、11处strong；截图在ignored.tmp。该预览使用当前工作区未提交的渲染器/样式，不代表已提交前端或完整BlogDetailPage/TOC/auth/E2E验收。

下一步Worker v2服务/SDK根request关联、UUID来源与三受众桥、cancel tombstone，再接真实Redis准入与正式组合根；B的Linux/PID/地址/TLS服务身份和完整崩溃矩阵仍未完成。已发请求的cancel先到/start迟到必须由Worker tombstone拒绝，API侧关停drain不能替代这一网络故障保证。保留其他dirty文件，不推送/部署。

最终暂存树`7243fdfe72b39f227322a338cdc756e668761b15`独立导出后API **549项**、一次性MySQL **15项**、旧Worker3项与deploy-schema协议全部通过；API gate同时验证RPC生成物无漂移。临时快照、MySQL进程/datadir已回收；随后仅补交接证据。暂存空白及私钥/GitHub token模式扫描通过。本轮未推送部署。


## 2026-11-16 B/C3 Worker V2服务、SDK与持久取消

### Implemented / scope

基点530cbd6。主线程新增严格后端schema消费、GatewayClient、根receipt/turn投影、ProcessRunner、sdk-execution/tools与createSdkWorker显式组合；coding实现持久ExecutionService和mTLS HTTP factory。没有自动listen/生产入口、真实业务配置/凭据或业务库写入、推送部署。

- V2控制服务先fsync启动intent再runner.start；取消未见start也持久tombstone阻迟到启动，绑定/摘要冲突拒绝，重复POST不启动第二份。只落绑定/摘要/状态/截止/needs_reap，不复制问题/正文/凭据。目录/文件0700/0600、owner/symlink/独占O_EXCL锁检查；崩溃锁不自动抢占，重启未知running标interrupted但保占用。
- 活跃执行默认1、保留记录至多128；starting/stopping/needs_reap统一计占用；start/control各128pending硬界。HTTP 2秒不撤回已受理intent，只限制尚未进入service的请求/响应；API遇未知ACK只inspect/cancel。绝对deadline在fsync后及实际spawn前重验。停止/持久失败不给成功ACK，未确认进程保槽/锁。
- 固定HTTPS+mTLS peer/service身份，不信转发头或Promise peer，V2字段/JSON/大小严格；根check和CI common quality加入协议单测，protocol guards通过。
- GatewayClient验证完整工具digest、收到receipt delivered后才给模型UUID；model/tool/result分受众。SDK只持loopback短时桥token，服务身份/TLS留在可信父适配进程。SDK prompt的durable inbox messageId与根user/message/turn关联，序号/重复/错误会话/截断拒绝。
- ProcessRunner最小环境、独立POSIX group、私有home/tmp/cwd，TERM→KILL；done只在group不存在和workspace删除后结算，父进程退出遗留子进程仍回收。host必须提供已审查launchSpec，不默认裸跑；Linux硬隔离未证明。
- 产品Skill blog-qa@2独立hash/manifest并保留v1内容/导出首位，新catalog bundle hash变化须配套Worker资源；offline固定0.2.2-rc.1 SDK准备脚本不安装运行期依赖、不自动起服务。详见[Worker V2说明](../../development/agent-worker-v2.md)。

### Verification / review

- 完整Worker **43项**通过（核心20、持久service15、HTTP8）。真实mTLS/未知CA/peer拒绝、source摘要/回执、严格JSON/Python digest向量、实际TERM-ignore→KILL/父退出后子进程、slow launcher截止、pending槽/队列与journal fault均覆盖。
- 判官首轮19项、第二轮service15/HTTP8/ProcessRunner5独立复验，当前范围无剩余确认阻塞。确认并修复P2：fast done终态rename失败被尾队列吞错，使start仍ACK running；新回归修前稳定复现，修后start/inspect unavailable、close未确认保锁。coding自审同步修fsync后deadline、持久故障仍尽力stop、done先完成但stop仍在途不放槽等。
- 真实固定SDK+完整mTLS服务集成通过：重复HTTP start只执行一次，3个合成Messages响应、两实际工具、UUIDreceipt与根messageId/turn/result，另让第二份实际SDK等待模型时经mTLS cancel并确认owned group/home清理；未知cancel先落tombstone阻迟到start。不是fixture冒充SDK，也不是用合成响应宣称真实模型/业务DB/语义验收。
- 离线准备592缓存包、下载0，SDK资源只在本轮owned /private/tmp runtime；无全局安装/真实配置读取。后端API549、contracts及CI/root协议门禁通过；最终独立暂存快照另记。
- format:check仍仅失败于既有docs/content-sources/csdn-qq-42345136/manifest.json；CSS预算原问题保留，不宣称root check全绿。

### Writing / next

继续sun-world-blog→sun-world-write-design修订[架构笔记04](../../blog/2026-11-15-agent-run-history-transaction.md)，分类后端、标签架构笔记/Agent/DeepSeek Harness不变；解释根消息回执、取消先到和跨重启记录。已有失败对照表与两段机制足够本次增量，无新图、未发布。

原3030监听已实际不存在，本轮只建loopback Vite3033独立正文预览，URL为http://127.0.0.1:3033/.tmp/c3-draft-7jaqfvk4/index.html。1280×900/390×844截图与DOM复核：7个唯一稳定ID、12处strong、无残留双星/首行缩进/水平溢出。截图在ignored.tmp，预览用当前工作区未提交renderer/CSS，不代表已提交前端或完整BlogDetailPage/TOC/auth/E2E。

下一步真实Redis准入/API组合、真实模型质量集、在线留存/离线回收与自动崩溃恢复、Linux资源/PID/地址和生产身份签发轮换。当前journal保留128条后失败关闭，需离线核对释放，不能宣称无限持续准入；异常锁/未知孤儿不自动恢复。标准已补本地实现链接与root request语义，已向coding/判官同步；下一Claude-ds prompt必须读更新标准。生产仍关闭，其他dirty保留，不推送或发布。

最终暂存树`b79fa6fe982b69d650e4138cda3005d5d069e9b7`独立导出后API549项、Worker43项、root/CI/deploy/schema门禁及从该树offline打包的完整mTLS+真实固定SDK集成全部通过；v1实际工具注册仍严格两项。缓存安装下载0，快照和该次prepared runtime已清理；随后只补交接证据，无可执行源码变化。暂存空白/私钥/GitHub token模式扫描通过，未包含其他dirty前端、技能或素材。

## 2026-11-16 C3 Redis准入与正式API组合

### Implemented / scope

基点973776c。按计划实现显式正式API组合与Redis准入；仍未挂载main、切换旧开发页面、推送、部署或发布。两个owned数据库只用于本机私有socket，不读业务配置，不安装系统服务。详见[准入与验证说明](../../development/agent-run-admission.md)。

- RedisRunAdmission用单次Lua检查全部key类型/值/TTL/配置指纹，预占分钟与owner并发槽；默认用户6/全局10次每固定60秒、用户/全局并发1，45秒run/60秒槽/120秒reservation。重复pending不二扣，不交回owner；未知EVAL ACK不重试；分钟不退款；旧release不能删除新owner。每次gateway live授权检查owned，Redis丢key后拒绝调用。
- module_composition显式factory仅注入依赖，校验raw Redis pool的真实超时与禁retry配置；RunApplication连接真实AuthManager/session/allowlist、MySQL preflight/受理、Dispatcher/Gateway/固定Worker及到期reaper。MySQL未知commit保守等TTL不派发；只在新建run的一方派发。终态+Worker同execution静止才提前release，interrupted/未知不早释放。
- 正式public_router factory含Origin、16KiB请求、严格JSON、稳定错误/Retry-After、幂等409+原run、GET/cancel与SSE；响应finally负责断流回收，不仅依赖generator finally。新应用GET用当前cookie重验family/角色；活跃私有回调用原run绑定，丢失不重建；不回放运行或事件。
- AI模块拥有有界纯文本历史读取，恢复核对问题/答案摘要及当前公开来源，失效/变化/不可读链接隐藏。Worker新增同mTLS/service身份的readyz，严格匹配bundle/model；忙碌不误报故障，journal满/恢复受阻/关闭失败关闭。

### Review / evidence

- 判官确认并修复RC恢复竞态：旧running row+新提交第二消息会误报失败；GET现在锁run后读AI历史，与完成事务同锁顺序。native按finish真实connectionID观察INNODB_TRX LOCK WAIT，再放开恢复，证明先running/1条后completed/2条。
- 判官第二项：clean close在job首SQL阶段可能遗留accepted和槽。已补cancelled分支先持久取消再settle；不在同job的cleanup task内反向等待该job，保留未知DB结果等TTL的边界。新增实际栅栏回归通过：close等待首SQL排空，SQL已取消/无execution、并发槽释放/分钟不退款、Worker未start且各vault为空；判官独立复验后两项均解除，无剩余确认阻塞。
- redis-py5.3.1 Unix构造器丢弃connect timeout，owned fixture已改显式UnixDomainSocketConnection pool，借出实际连接核对connect1秒/socket2秒；factory拒绝无界/隐式retry误配。
- 当前API565项、Worker44项、contracts6项、CI/root协议/生成RPC通过。native Redis15、组合10及原MySQL15通过；组合使用真实MySQL8.4.13/Redis7.2.17/AuthManager，Worker/model/文章明确合成。SQL未知ACK为提交后注入，新应用为同进程新实例，不宣称进程崩溃/Redis failover或真实SDK整栈。
- Redis官方7.2.17归档SHA256核对后本地libc编译，缓存ignored；正常、异常、SIGTERM回收已实测。默认API gate不自动启动数据库。全仓format仍仅既有素材manifest失败，原Web CSS预算保留，无新增前端变更。

### Writing / next

沿用sun-world-blog→sun-world-write-design修订博客04，后端分类与架构笔记/Agent/DeepSeek Harness标签保留。新增预占与数据库确认边界、恢复锁机制及真实组合的合成范围；透明SVG梳理Redis/MySQL确认分支，桌面360px、手机约342px，7个唯一标题ID/13处strong，1280/390宽正文无缩进/溢出，图像加载和视觉检查通过。预览仍为3033独立正文URL，使用当前dirty renderer/CSS，不等于已提交前端或完整文章页验收；未发布。

下一步将完整Worker/真实固定SDK接入此真实Redis/MySQL组合，再做模型质量集、已有库升级/崩溃矩阵、持久journal留存与离线回收、Linux资源/PID/地址隔离及生产TLS签发轮换。对账不自动重放accepted；生产关闭，不能以本地切片宣称P1或A–D整体验收。其他dirty文件保留。

最终独立暂存树`1e5e50a7116a1ca8d159e099f458b36033a950e0`导出后API565、Worker44、真实Redis15、真实MySQL+Redis组合10及CI/root/deploy-schema/RPC漂移均通过；验证时只借用原项目Python依赖，源码来自暂存树。临时快照使用独立index供git ls-files检查，未建分支或worktree；最终仅再补本交接证据，无可执行源码变化。原MySQL15与contracts6已在当前工作区通过。

## 2026-11-16 固定SDK与真实三库整栈

### Implemented / scope

基点c9906df。下一计划项不再用合成Worker绕开正式链路：新增显式原生SDK整栈fixture，真实MySQL/Redis/MongoDB、实际public/private HTTPS与固定0.2.2-rc.1 SDK，模型和文章数据仍明确合成。生产main、旧SQLite页面、真实模型、部署均未改；没有业务config/env/凭据读取或共享服务连接。详见[整栈验证说明](../../development/agent-sdk-stack-validation.md)。

- scripts/test-agent-sdk-stack.py显式注入已验证三种binary、prepared runtime、项目Node；原MySQL launcher增加可选test_runner内部扩展，CLI默认保留。SDK资源offline准备592缓存包、下载0，运行期间不安装。新Mongo launcher只绑定private Unix socket，1秒connect/2秒read、禁retry；getCmdLineOpts/server PID/nonce证明，实际lsof无TCP LISTEN。官方8.0.38 ARM归档SHA256与codesign核对，缓存ignored，无全局安装。
- API测试host用一个asyncio loop/Uvicorn H11测试协议，从真实CERT_REQUIRED ssl_object产生peer摘要scope，不信header；module_composition直接接博客public facade，元数据MySQL与正文Mongo均真实查询。Node fixture严格两行stdin、无凭据stdout、macOS loopback sandbox/deny用户HOME，启动bootstrap先fsync PID再进实际SDK。
- 每情景独立新库/namespace/TLS/Worker：成功3模型/2工具/UUID/root/final、重复不二扣/同family刷新+新app GET/Mongo变化隐藏链接；实际模型等待中cancel；真实HTTPS断流；真实Redis会话撤销；MySQL提交前撤回文章；实际SDK组SIGSTOP再SIGKILL Worker、API中断且不早释放槽、测试父独立回收孤儿。完整六情景通过，不是把原native10合成Worker结果改称SDK。

### Review / evidence

- 判官两个P2均实际复现并独立复验解除：Worker已死但detached SDK存活时，Python父原先只看ACK而漏reap；测试leader先exit但同PGID子进程仍在时，总启动器原先只看poll而漏reap。现前者校验private600/nlink1 PID日志、父死后TERM/CONT/KILL并仅ESRCH认消失，后者无论leader状态均确认整个owned PGID；失败ACK/原exitcode保留，各资源独立继续清理。
- 实际总launcher SIGTERM在SDK模型等待点触发，曾出现signal0 PermissionError覆盖KeyboardInterrupt；已改“权限拒绝=未确认，继续有界poll”，不能当ESRCH。复验exit130、Worker/SDK组与三DB PID均消失，四个owned root删除。Mongo正常/合成异常/SIGTERM均确认PID与目录回收。不是生产自动抢锁/进程接管或整宿主SIGKILL/重启恢复。
- 新Worker坏stdin组合拒绝/脱敏7项及共享纯reader/完整JSON单fault独立9项（合法分块、第三行、bytes/EOF、duplicate/UTF8）加入普通协议gate；新API真实孤儿/防错杀/瞬时与永久EPERM5项加入默认gate，含失败时独立兜底。API570、Worker60、旧MySQL15通过；默认gate不启动SDK/native DB。原全仓format仍仅既有素材manifest问题、CSS预算保留。

### Writing / next

继续sun-world-blog→sun-world-write-design修订博客04，后端分类与原三标签不变：更新真实SDK/三库边界、父进程退出不等于组回收、剩余真实模型验收。既有透明预占图仍准确，此次正文只补验证依据与回收关系，无新增重复图；3033独立正文1280/390宽预览、7个唯一标题ID/13处strong、无缩进/水平溢出与配图加载复核通过，未发布；仍使用当前工作区dirty renderer/CSS，非已提交前端或完整文章页E2E。

下一步真实模型适配/质量集与token/output预算、Linux memory/PID/network硬隔离、持久journal留存及离线回收、已有库升级与DB/宿主崩溃矩阵、生产TLS签发轮换。此轮只完成真实本地协议/存储/控制实证，不足以放行P1生产内测。其他dirty保留，不推送/部署/发布。

最终独立暂存树`55a2dba7f26df38cd5fab807602a84e08c439f17`：API570、Worker60、CI/root/deploy-schema/RPC漂移通过；从该树重新offline准备固定SDK（592缓存包/下载0），实际三库+mTLS+固定SDK完整6情景及等候模型时总launcher SIGTERM均通过。SIGTERM保留130且四root/三DBPID/Worker与SDK组无遗留。独立快照及两份本轮prepared runtime已清理，原verified binary缓存保留；最终只补本交接证据，无可执行源码变化。

## 2026-11-16 模型预算与真实模型评测

### Implemented / scope

基点0e26b90。按B/C计划新增ModelJournal、agent_model_calls和run七项累计计量；Gateway事务先提交预占，再出网。每次1024输出token/64KiB响应，整run4096/256KiB；Gateway canonical输入每次128KiB/累计256KiB，不能当输入token硬限。actual/unknown独立、不退款、不重放，慢commit越deadline不启动provider，取消排空同步事务。详见[模型验证说明](../../development/agent-model-validation.md)。main未挂载，旧入口保留，不推送/部署/发布。

- coding严格Messages↔OpenAI适配：角色/ID关联/固定两工具/模型/停止原因/严格usage，缺失不补零；固定30秒请求deadline、128KiB wire request/64KiB response，沿原provider DNS pin/allowlist/禁代理继承/redirect/retry。client进入异常与重复取消均drain close，清理时限与请求deadline区分。普通文本Provider未改。
- 固定SDK profile显式disabled/off/1024；真实Qwen中性metadata和reasoning仅接受已定义形状，推理剥离、不入公开文本/工具/报告，不声称供应商内部无推理。v2 Skill改连续子串/单辨识词搜索、限制重搜、及时read，保留四模型/四工具；manifest/catalog/bundle更新，v1正文与导出首位保留，Worker须重打包。
- maintained CLI在owned Redis+内存目录/history+loopback AI V1成功models/ask；未加载业务config/keys或访问生产AI API。真实四题模式显式--real-model --report，仅local factory的keyless qwen38_27b；报告O_EXCL0600、每题fsync、无原始推理/headers/凭据。SDK0.2.2-rc.1固定；上游只有alias，无不可变权重版本。

### Review / evidence

- 默认API609、Worker60、CLI17、contracts6、AI接口/CLI/契约与root/CI/deploy-schema通过。预算8、严格适配25、cleanup9进入默认gate；native MySQL17通过（8并发4赢家及observe提交后ACK丢失不重放/不重复计量）。判官独立预算/Gateway/适配与reserve/observe真实post-commit ACK注入通过，无剩余确认阻塞。报告shape P2已修：原先converter前保存未经验证model/tool/finish/index与unknown key，现仅固定字段/枚举/type/数量，纯回归5项经判官独立通过。最终独立暂存快照结果另补。
- [固定四题与中间失败](../../evaluations/agent-model-2026-11-16/README.md)均真实保留：第一次因SDK默认控制在provider前拒绝；第二/三次实际返回metadata不兼容；第四次有答案/冲突题耗尽搜索额度；修profile/严格兼容/Skill后第五次四项结构通过。数据集/评分和预算未改；中间工作树记录缺最终源码hash，不追溯伪造。
- 第五次主agent与判官分别语义复核通过：七天、未知价格不编造、旧七天/新十四天及取代关系、正文注入不服从。每题3模型、预占3072；工具2/2/3/2。有答案样本实际报告202输出token。这是agent复核，human_semantic_review仍pending，input_tokenizer_verified false。最终快照须新报告补准确实现/Skill/profile/bundle hash并重新复核，不能把第五次报告当已带这些字段。

### Writing / next

按sun-world-blog→sun-world-write-design新增[架构笔记05](../../blog/2026-11-16-agent-model-budget.md)，分类后端、标签架构笔记/Agent/DeepSeek Harness，透明SVG说明先预占/observed或unknown均保留预占。已写实际三调用3072/202示例、bytes≠tokens与真实模型/人工验收边界；未发布。独立正文预览http://127.0.0.1:3033/.tmp/model-budget-draft-769mkzhw/index.html，1280/390宽、5唯一稳定ID、3处strong、无残留双星/首行缩进/水平溢出，图360/342px已实际视觉检查。预览使用当前dirty renderer/CSS，不代表已提交前端或完整文章页E2E。

下一步验证模型匹配的输入tokenizer/上下文模板及硬总限，再推进Linux memory/PID/network隔离、持久journal留存/离线回收、旧库升级/DB与宿主崩溃、生产TLS。人工语义签字与上游不可变版本仍缺，P1/A–D不整体放行。原素材manifest格式与Web CSS预算问题、其他dirty保留。所有本轮owned快照/SDK runtime需在结束前清理，验证二进制缓存保留。

中间b3dc835复跑API606/Worker60/MySQL17/native组合10及真实四题通过，但并行SDK合成suite启动失败；实际lsof发现Mongo还有/tmp/mongodb-0.sock。已修owned unixSocketPrefix与getCmdLineOpts prefix/strict0600验证，并新增显式真实双Mongo隔离回归，不进入默认unit gate。原“无TCP”证明仍有效，“所有Unix私有”须以修后新快照为准。最终结果将补；第六次报告独立保留，不冒充最终隔离。

补充父reaper具体缺陷与修复：首次SDK PGID探测EPERM原先短路全部TERM/KILL；独立实际孤儿复现后改未知继续、有界且TERM/CONT独立，拒绝信号才重试，最终仅ESRCH成功。cleanup9项通过（三个新增方法，signal含TERM/CONT/KILL子情景）；永久拒绝保留失败/root，独立safety finally确认回收。历史Worker并行59/60和SDK两次第6失败仍未定因，日志及随后串行Worker60/诊断包装六情景通过保留在评测目录，不用后来的成功改判过去。最终新树结果待补。


最终独立暂存树`9b2834faac73100432b1633c51291ba55b2fe8fc`串行通过：API609、Worker60、MySQL17、native API组合10、实际双Mongo named Unix全私有0600/无TCP/独立数据、v1实际两工具注册。由该树offline重新准备592缓存包/下载0的固定SDK，默认合成模型六情景与真实qwen38_27b四题均通过；每题3模型/unknown0，源码/固定数据/Skill/profile/bundle摘要与fresh runtime一致，判官独立核对API答和SDK最后答（含无价格、空来源），human pending/tokenizer false不变。数据和验证源码摘要见docs/evaluations的final-snapshot/validation-manifest；不是一般语义准确率或不可变权重证明。

同树实际SDK模型等待点总launcher SIGTERM复验exit130，Worker/SDK组、三DB PID及四root均消失。此前并行/串行失败证据保留且仍未定因，不能把后来的成功或独立EPERM修复当作原失败解释。下一步先增加固定清理阶段/错误类别诊断再定位本机回收观察，并继续输入tokenizer/模型版本、Linux硬隔离、留存/旧库与崩溃/生产TLS门槛。最终仅补文档与证据，无可执行源码再改；提交前对比验证清单、空白与密钥模式，清理本轮快照/prepared runtime，保留已核对binary缓存和3033正文预览。博客05桌面/手机最终预览复核通过、未发布；不推送部署，其他dirty与原格式/CSS预算问题保留。

收尾确认：本轮所有owned模型验证快照/prepared runtime和SDK fixture root已清理，数据库binary缓存保留。原预览服务在中断后停止，现已重新启动loopback3033并实际HTTP200/桌面手机正文复验通过；只保留此正文预览服务。最终staged55路径范围与33项验证源码SHA一致，空白与密钥/token模式扫描通过；format:check仍仅既有素材manifest失败。

## 2026-11-16 回收诊断

基点6afeb29。继续既定回收未定因问题，先写docs/development/agent-cleanup-diagnostics.md再同步coding；不改变RPC/持久journal或done/stop/槽语义。Worker新增固定schema/onCleanupDiagnostic、每执行31失败+1恢复事件、冻结Error/handle快照；Node测试host私有0600/64KiB sink逐事件fsync，失败不阻止回收且不能成功ACK。Python固定步骤/类别、32条前缀、strict ACK/文件读取，不复制异常自由文本。原SDK fixture三清理方法抽到fixture_cleanup.py，sdk_stack.py约690行，纯helper无业务配置或服务发现。

首轮review确认并复现两P2：不完整ACK在attempt外跳过后续关闭、深层JSON后缀触发RecursionError丢安全前缀。已改exact7字段安全投影/观测attempt及2048单行上限+递归拒绝；修后判官独立Python15纯组件+9实际owned清理、Node10诊断+5原runner均通过。真实SDK/mTLS目录删除EACCES探针同时验证首次503不放槽、原取消重试后200+恢复、无重派和敏感文本；未知仍失败，不把新诊断倒推旧故障。

最终暂存树`6eff1e721c9d71f320eeea6b9dfb4d257b6fc32b`独立导出后，API624、Worker70、root/CI/deploy-schema/RPC/catalog通过；同树offline准备固定SDK592缓存包/下载0，实际SDK mTLS目录EACCES探针验证首cancel503/新run503保槽、原cancel重试200+首错/恢复事件/无重放无敏感文本，原生三库+SDK完整6情景与v1两工具注册通过。最后复跑六任务同类并行（API/Worker/MySQL/nativeStack/双Mongo/SDK6），624/70/17/10/双实例/6均通过；只一轮，不含外部真实模型，不以此断言生产稳定性或反推旧故障。

同树模型等待点SIGTERM再验exit130、Worker/SDK组/三库PID/四root均不存在。判官独立Node15/Python24及11个可执行文件current/index/tree/snapshot/fresh runtime字节核对通过；P2坏ACK和深层JSON已解除。另实际SDK独立宿主旧断言因parseJson的null prototype而失败，受限阶段诊断定位后改成exact keys+disabled值，不放宽JSON形状；路径规范化对照未改善已撤回。历史回收失败仍未定因，原证据保留。详细结果与源码摘要在docs/evaluations/agent-cleanup-2026-11-16，未存本地原始日志。

博客04修订首错/后恢复与诊断边界，既有透明Redis关系图足够本轮增量，无新增图；1280/390正文及新增段落实际视觉/DOM复核：7稳定ID、17处strong、无首行缩进/残留双星/横向溢出，既有图360/约342px。预览为3033原C3正文URL，草稿相对05链接在预览层映射本地05地址；源稿仍为同目录MD链接，未发布。使用dirty renderer/CSS，不代表完整文章页/提交前端。最终只补文档证据，无可执行源码再改；临时snapshot/prepared runtime待收尾清理，原素材format及Web CSS预算问题与其他dirty保留，不推送部署。下一步回收旧故障继续带阶段证据复现，生产sink/留存、模型输入tokenizer/版本、Linux、旧库/崩溃和生产TLS门槛仍独立未完成。

收尾已确认：本轮两个prepared runtime和独立暂存快照已删除，SDK fixture root无遗留；保留verified DB binary缓存和3033正文预览。21个暂存路径与任务清单完全一致，11项可执行源码SHA与验证树一致；空白/密钥-token模式扫描通过。根format仍只既有CSDN素材manifest失败，无新增格式问题；本轮未运行/宣称整个Web/root build全绿。最终仅补文档，没有源码再改。


## 2026-11-16 Tokenizer能力探针与官方API后续

### 完成范围与验证

基点569c187。新增显式本地无生成探针，固定三metadata GET与三合成POST/tokenize，无URL/输入/模板透传，复用Provider策略并有界保存0600安全报告。source/helper/test为3新增文件，见[探针契约](../../development/agent-model-validation.md#tokenizer能力探针契约2026-11-16)。未改代理、账本、准入或生产入口。

实际固定六请求退出0且报告ok：alias匹配qwen38_27b、服务0.28.0、tokenizer_info404，三个count为69/378/434，严格等于有界token数组长度；没有生成请求。三个tokenizer/不可变模型版本/输入硬限flags仍false，不能证明工具被完整计入或与generation wire相同。证据见[安全观察与清单](../../evaluations/agent-tokenizer-2026-11-16/README.md)。

完整check:api639项、新增15项离线测试与判官独立15项通过，无确认P1/P2。初审修成功响应close时取消误分类、fstat失败fd回收及close失败allowlist恢复；合法/非法响应重复取消均排空close。最后报告close失败即使文件有ok也必须按非0退出判失败。验证源树fdcc6309eeb45e26d0285b4a52f683f25d1109f3，11个选定可执行文件SHA与index一致；后补证据/交接文档，无源码再改。未重复未改的三库/Worker/SDK评测，不宣称root/Web全绿，旧格式/CSS预算问题保留。

博客05按sun-world-blog→design补完整计数、不可变版本和预出网扣额三个条件；后端/原三标签、5稳定标题ID、6处strong，既有透明图保留。1280/390正文无缩进/溢出，图宽360/342，使用dirty renderer/CSS，非完整文章页验收；3033正文预览保留，未发布。所有无关dirty保留，不推送部署。

### 当前转向与下一步

用户表示暂时没有Linux/模型工件资料，先推进本地可验证部分，随后明确授权使用OpenAI官方API key直接运行，不要求本地部署模型。本次提供的凭据仅提取到ignored私密目录0700/文件0600，不写源码、提交、报告、日志或handoff值/提示；无需用户重复发送。正式运行仍须按协议实现预算，不以此授权打开生产。

官方API初次直连在ConnectTimeout结束，未收到HTTP响应，不能认定key有效或无效。用户指示检查本机Clash Verge，系统代理和配置均7890，实际TCP确认可连接；先前lsof未显示root监听不能作无监听证据，已纠正。当前主线程通过显式回环代理、保持既有DNS/IPpin/Host/SNI与证书校验，做官方模型目录发现。后续只记录安全状态/固定模型标识，不记录原始错误或凭据。优先完成官方API可用模型/协议选择与本地接入；Responses输入计数可单独评估，不要求本地权重或tokenizer部署。Linux/已有库升级与崩溃矩阵/持久journal回收/人工语义/生产TLS依旧独立未完成。Claude Code后续接手须同步此增量，不得把“可API调用”当成原Qwen计数或Linux门槛已通过。


## 2026-11-16 OpenAI官方API本地接通

### 范围与结果

基点cc42e9c。用户明确官方key及本机Clash Verge，授权直接API运行，不要求本地模型。新增local-only gpt-6.1-sol Responses profile、严格Messages/工具/phase/usage适配、私密key文件读取与显式loopback CONNECT/可信HTTPS DNS；普通Provider/MCP、站点模型目录、生产准入不改。协议见[OpenAI接入](../../development/agent-openai-validation.md)。凭据值不入源码/index/报告/应用日志/SDK，文件ignored且0700目录/0600权限；不得在后续prompt里复制值或hint。

单次真实生成154in/6out；合成函数调用两次183/20与231/11，保留call_id并正确回答七天。官方模型目录200，gpt-6.1-sol可见。真实站点最终浏览器正常密码登录，actual SDK 3个model callback及search/read各一次，读取文章41、答案/来源/刷新恢复通过，1280/390无pageerror或overflow。此入口是已有开发SQLite+workspace前端，不冒称正式MySQL/mTLS V2 OpenAI整栈。当前服务3030/8032继续运行，入口`http://127.0.0.1:3030/aigc/blog-qa`，用户正常登录即可；ignored开发options默认openai-local、key路径引用和显式7890代理，未改全站目录。当前launcher输出在repo ignored日志中，SDK runtime根为其必要资源，停止launcher后清理。独立Chrome/诊断临时资源已回收。

### 修复、失败与验证

- 修复独立review复现的forced tool→零调用真空漏检，要求恰好一个同名调用；none/required/parallel/历史ID/实际usage上限保持拒绝路径，原预占不退款/不自动重放。
- 修复legacy启动probe继承repo日志FD导致Node InitializeOnce native abort：对照2/2 repo FD崩溃、private tmp/pipe4/4成功，早前10个pipe/PTY最小检查没有重现。只改probe pipe+父转发，SBPL不改，不能把触发条件等同定位具体syscall。新增Darwin实际launcher片段回归，root repo读取/外网EPERM保持；修后正常launcher+repo日志完整启动通过。
- UI首轮实际问答完成，但刷新固定1.8秒检查记failed；次轮独立run首模型callback约8s后generic502/model_proxy_failed，根因未知；没有原始上游首错，不猜测网络/配额/计费/解析。增加固定stage/status/known错误类别/本模块source line日志，不带自由值，sink错不替主错。第三独立run改最多15秒条件等待后问答/刷新均通过，未改前端/问题/预算或自动重放。三轮安全投影均保存于[实证](../../evaluations/agent-openai-2026-11-16/README.md)，不得用最终通过抹掉历史失败。
- 最终check:api667、Worker71、dev-launcher协议、定向格式/语法/diff检查通过；判官独立Python28（Responses14+CONNECT14）与Darwin1项通过，无剩余确认阻塞。诊断sink抛异常仍保留主错/只一次请求/关闭client的额外只读注入也通过。验证源树009982e8650b50a6f8d813510f7d49da905d9557，17项选定源文件摘要与index相同；后补证据/交接无可执行源码再改。

### 写作与下一步

按sun-world-blog→sun-world-write-design局部更新博客05：托管API计数可免本地模型部署、Responses函数/阶段往返和推理输出预算；后端/架构笔记/Agent/DeepSeek Harness原分类标签保留。5稳定ID/7处strong，1280/390正文预览、透明图360/342px、无缩进/溢出通过，新增段落与实际QA手机画面已视觉检查；原图够用，不添重复图。3033独立正文预览保留，仍用dirty renderer/CSS，未发布。

下一步本地可验证项优先官方Responses完整输入计数、固定payload摘要与Gateway同UOW持久累计输入预算；计数调用本身也须限次/超时/实时授权，不能把代理响应usage或bytes当预出网硬限。仍需独立人工语义、模型版本、Linux硬隔离、已有库升级/崩溃、journal留存回收及生产TLS，生产/P1/A–D未整体放行。此前一次代理失败仍待带首错复现；不对未知请求自动重放。其他dirty任务全部保留，不推送/部署/发布。Claude Code后续接手须同步固定官方profile/显式代理/日志FD修复与失败历史这些增量，不要求用户部署本地权重。

## 2026-11-16 官方完整输入计数与持久预占

### 当前目标、范围与实现

基点36b2e0f，继续本地可验证项。先写[输入预算协议](../../development/agent-input-budget.md)并广播coding/判官，再实现固定Responses input_tokens端点、opaque单次handle绑定原wire、冻结metadata和usage严格相等。原attempt预算提交后才能计数，同UOW持久输入预占确认后才能生成：单次16384、累计32768。计数8秒/4KiB、每attempt至多一次，仍最多4attempts；整个模型操作30秒/剩余run期限，不重放/不退款。schema集中声明run计数和call可空字段；正式Gateway+ModelJournal与实际开发SQLite+Runtime均接入，不运行业务库/生产DDL。原Qwen/合成兼容路径无计数，不伪造零或硬限结论。

重要源文件：AI的model_input/openai_responses/local_openai_transport/public，agent_runtime的model_budget/local_model_budget/gateway/store/runtime/ledger，以及MySQL schema和定向测试。metadata只含数值/两个摘要，持久账本不存提示词/响应/凭据。直接proxy只有单次上限，没有run就不声称累计持久预算。协议有改动须先同步文档，Claude Code/claude-ds接手须带上此增量。

### 验证与review

- `corepack pnpm check:api`最终696项通过，`corepack pnpm check:ai-interface`通过；未改Worker，本轮没有重跑其历史71项。
- `apps/api/.venv/bin/python scripts/test-agent-mysql.py --mysqld <verified-mysqld>`真实一次性MySQL 8.4.13共19项通过，含4次计数争2份额度与input commit ACK丢失不生成；上游MockTransport。owned mysqld停止、datadir删除，不访问业务库。
- 判官独立AI41/正式预算9/旧授权16通过。初期两项旧授权回归定位为wait_for直接重复取消，已改shield+单次取消排空；随后判官复现最终授权to_thread未在owned task内的P2，已将完整模型操作注册后才开始await。新增最终授权阻塞时request cancel/runtime.aclose均须等线程退出的回归；最终本地预算7+旧授权16独立复验通过，无剩余确认阻塞。全API696在此修复后运行，之后无可执行源码改动。
- 官方三组合成数据每组一次计数/一次生成，Unicode177、两工具184、工具历史219，均等于实际input usage，输出各6。通过授权key的显式Clash、TLS/DNS/IPpin链路，未记录自由响应/推理/headers/凭据，不要求本地模型。
- 当前新代码正常launcher启动并保留服务3030/8032。浏览器正常登录→实际SDK三次模型+search/read→文章41来源→刷新恢复通过，1280/390无溢出/pageerror。只读SQLite核对551/1935/676均observed且等于预占，run总额3162。该实证是开发SQLite+工作区前端，不冒称正式MySQL/mTLS V2+官方模型整栈。详细安全投影和源码SHA见[本轮实证](../../evaluations/agent-input-budget-2026-11-16/README.md)。

### 写作、资源与下一步

按sun-world-blog→design同题更新博客05，两次预占、固定payload/单次许可和usage漂移拒绝；后端/原三标签、5稳定ID/7处strong、透明预算图保留，正文1280/390及新增段落视觉检查通过，无新图、未发布。继续使用dirty renderer/CSS，不是完整文章页验收。3033原正文预览保留，运行站点入口为http://127.0.0.1:3030/aigc/blog-qa；SDK临时根是服务必要资源，停止launcher才清理。浏览器和本轮临时MySQL已回收；ignored凭据文件不入提交/报告/交接，后续不得复制值或hint。

下一步优先正式V2+官方模型显式验证与留存/故障矩阵。原Qwen探针三个false、上游版本策略/人工语义、Linux memory/PID/network、已有业务库升级/崩溃、journal回收及生产TLS仍独立待验收；历史一次官方模型代理失败仍未定因，不用新成功倒推修复。P1/A–D整体未完成。所有其他dirty及既有素材格式/Web CSS预算问题保留，未推送/部署/发布。本轮仅提交自有源文件、测试、文档与安全证据，主handoff只暂存新入口，保留其他未提交记录。

## 2026-11-16 正式V2与官方模型四题整栈

### 范围、实现与修复

基点1a14ecb，继续补此前正式MySQL/mTLS V2与真实官方模型的组合缺口。先在[SDK验证说明](../../development/agent-sdk-stack-validation.md)写增量契约并广播coding/判官；只改4个可执行文件：scripts/test-agent-sdk-stack.py、tests/integration/sdk_stack.py、新model_evaluation.py、新test_agent_official_model_evaluation.py。未改生产AI/Kernel/数据集/Skill/前端/配置，未跑业务库DDL或读取业务凭据。新增显式--real-model-profile openai-local，要求--real-model及新report；默认旧Qwen兼容。CLI/production在资源或key前拒绝，官方factory只读取已授权私密key文件，不需本地模型，不记录值/提示，不传Worker。

正式Gateway直接注入原OpenAiResponsesProxy，不能套fixture日志函数而跳过is_counted识别。官方报告ledger-only，不拦截原始供应商响应；固定journal投影和数值/双hash，模型版本与本地tokenizer仍独立。按自然职责抽出评测函数，旧入口保留转发；报告O_EXCL/NOFOLLOW/0600、case/run.started/结束或异常检查点fsync，无周期ticker。失败证据明确pre_cleanup，call查询后半失败保留已读run counters+固定错误，不冒称关闭后的最终未知状态；不替主错、不跳close。清理不明立即停止后续题。

判官复现一项评测误绿P2：四个合法call各131072输入bytes、run却报0，原只核run额度使检查全绿。已补sum(call.input_bytes)==run累计且<=262144，两单fault回归通过；这不是Kernel扣额绕过。另falsey profile不再静默退默认Qwen，trace请求键与错误做固定allowlist。判官独立新14+旧report5+诊断15+owned cleanup9共43项通过，追加预算读取线程栅栏连续cancel两次确认排空、fixture关闭、仅1题、报告interrupted；无剩余确认阻塞。

### 已执行验证和实证

- 最终`corepack pnpm check:api`710项、`check:ai-interface`通过，执行后源码冻结，current/index一致；验证暂存树3e644217610a0cd07851b247b284e968171376e1。根format:check仍仅既有CSDN素材manifest失败，新增证据JSON单独格式检查，不宣称root/Web全绿。
- 新prepared runtime offline安装592缓存包/下载0，固定SDK0.2.2-rc.1，16项Worker源与实际运行资源/index逐字匹配。原默认六个合成SDK场景先通过；随后同runtime官方四题只运行一次，无自动重试或更改数据/评分/Skill/4模型4工具/45秒期限。
- 实际正式public/private API+MySQL8.4.13/Redis7.2.17/Mongo8.0.38+双向mTLS Worker+固定SDK+官方gpt-6.1-sol。四题模型/工具分别3/2、3/2、4/3、3/2，输入2707/2549/4080/2806，共13call、12142输入，全部observed且unknown0。逐call计数=预占=usage，run的call数量/inputbytes/input/output/response累计均独立复算相等且在限额内。冲突题模型4次已达上限，不能记成全部3次。
- 主线程与判官分别逐题语义复核：7天保留与每天凌晨频率区分；无价格固定无资料且空来源；2025-01旧7天/2026-10新14天及取代关系清楚；注入题只答操作者/时间/变更摘要，无canary/外传URL。官方ledger-only不保存供应商原始末答，无资料题结论仅为端到端固定交付，不声称观察模型自主拒编。human pending/local-tokenizer false/immutable-model false保持，不推一般正确率。
- 四题Worker stopped/start1、home空/journal clean、0诊断且完整ACK、fixture cleanup confirmed；主线程额外逐组探测4个实际SDK PGID均ESRCH，四类owned根恢复为空，三库已停。独立prepared runtime已删除，现有站点必要SDK资源和3030/8032、正文3033保留。源码/固定数据/Skill/profile SHA和安全报告见[官方实证](../../evaluations/agent-official-stack-2026-11-16/README.md)，无原始本地日志/PEM/凭据入提交。

### 写作、保存与下一步

sun-world-blog→design同题更新博客05：评测接线不能绕过预算、四次模型上限与无资料最终结果的观察边界。后端/架构笔记/Agent/DeepSeek Harness、5稳定ID/7处strong保留；既有透明预算图足够表达整体关系，不添重复图。1280/390正文及新段落视觉/DOM检查通过，无首行缩进/残留双星/横向溢出，图360/342px，仍用dirty renderer/CSS，非完整文章页验收，未发布。

下一步推进可本地验证的journal留存/离线回收及已有库升级/崩溃矩阵。Linux memory/PID/network、人工语义、上游版本策略和生产TLS仍独立待资源或验收，P1/A–D未整体完成。历史一次官方代理失败根因仍未知，旧证据不改写。其他80项dirty及主handoff未提交记录保留，不推送/部署/发布。Claude Code/claude-ds接手须同步官方原实例直注入、ledger-only/pre_cleanup证据及误绿修复这些增量。

## 2026-11-16 Worker详情留存、永久屏障与嵌套中断

### 目标、实现与文件

基点0d541a6，推进本地留存与回收缺口；先写[留存契约](../../development/agent-journal-retention.md)再同步coding/判官。共享execution-journal抽出schema/IO/owner/O_EXCL锁，v3可信retained时间、v2迁移从当前时间起算、不信mtime；仅确认终态且无slot/start/stop/observer/inflight引用可在30天后回收，cancel无deadline额外45秒。保留期内详情最多128仍拒满，精确永久run SHA256屏障最多8192/1MiB，先index+owner确认后unlink。改未来deadline/换execution的旧身份仍拒绝，index满只停新准入；unknown orphan/旧锁不清理，API历史不删除。

Node主要文件：execution-service.mjs、新execution-journal.mjs、新journal-maintenance CLI及protocol tests；保留V2 RPC/contract/profile/Skill，源文件544/598行，自然职责拆分。CLI只处理显式已知私有目录，check/apply同锁，不接管既有锁，不联网或读业务配置/密钥，固定8字段数量；check失败不明可留本次锁，不能称绝对无副作用。用户当前站点仍是原SQLite入口，没有迁移或部署。

另确认测试宿主嵌套SIGTERM重入，先补[信号协议](../../development/agent-cleanup-diagnostics.md)再广播。新fixture_signals.py共享首次中断状态和defer，四个test-agent脚本保护总CLI/进程登记/三库关闭；首次在正常cleanup期间的信号延后到安全点仍报告130，已有cleanup错优先。MySQL不确认daemon退出则保留私有目录，不由TemporaryDirectory析构删掉恢复证据。只改测试宿主，不影响生产认证/模型代理/Kernel或业务配置。

### 确认问题、失败与修复

- 初版Worker92绿测后，判官复现mixed owner2+index/v3末条被删，再丢index可重建空屏障使旧run改deadline执行。现index确认后先atomic/fsync owner3再unlink；owner rename/目录sync ACK不明零删除/留锁，check和纯legacy无index不写owner。新增mixed最后详情→index丢失拒绝无重跑回归。
- 主线程发现新record loader多余canonical equality拒绝正式Python六位小数ISO：wire通过、journal报AGENT_JOURNAL_UNAVAILABLE/runner0。现只恢复原finite Date.parse，保存原串/hash；零/三/六位Z start及v2六位/offset迁移、二次重启通过。offset新start仍由原RPC Z-only拒绝，未改Python期限或合同。
- 信号忠实回归在真实__main__/Redis/Mongo context/实际owned组下，单SIGTERM通过、重复SIGTERM在恢复旧外层handler后打断cleanup。daemon/readiness/版本发现与MySQL context为合成；最早全mock context缺handler的失败不是有效复现，未将其计入新bug依据。修后原单次、重复、首次正常cleanup期间、主错/handler恢复及不明目录保留共5项通过，独立复验同样5项；历史未知回收问题不因此定因。
- coding最终37项（journal18/service19）、判官最终Node40（含真实CLI3）/Python5通过，无剩余确认阻塞。修复通知曾仅排消息未启动completed coding，主线程改followup后完成；最终来源与结果以文件为准，不把中间旧代码当已修。

### 最终验证、资源与写作

`corepack pnpm check:api`715、`corepack pnpm test:agent-worker`96通过。Python715覆盖最终Python源，Node96在两个Node P2修后运行；最终执行树465bbe5b9357b6a85464654951808decb15ec868，34项选定源SHA/index一致，之后仅补文档和安全证据。fresh SDK使用592缓存包/下载0，17项Worker资源逐字一致。原真实SDK/三库/mTLS六情景正常exit0；再实际SDK模型等待点SIGTERM，在真实Redis.wait关闭栅栏第二次SIGTERM，仍等待、释放后exit130，4个child PID/5组/4个fixture根均消失，无独立fallback代收。监督driver和原始日志只在ignored本地任务目录，安全投影/源码摘要见[本轮实证](../../evaluations/agent-journal-retention-2026-11-16/README.md)。本轮模型/文章合成，未调用供应商或重跑官方语义四题，上一轮实证保留原源范围。

首个未使用的prepared runtime因Node review修复而丢弃；最终fresh runtime已核对并删除，verified DB缓存与现有站点必要SDK资源保留。三库/临时根均回收，3030/8032本地问答和3033正文预览HTTP200。未访问真实journal/业务库/凭据，留存测试只注入clock，未改机器时间。根format/CSS历史问题保留，不据本轮宣称root/Web全绿；其他80项dirty与主handoff原210加/1删内容保留，不推送部署。

sun-world-blog→design同题更新博客04：删详情不授予重跑、时间与混合迁移、嵌套信号；保留后端/架构笔记/Agent/DeepSeek Harness及7稳定ID，21处strong。1280/390正文与新增段落视觉/DOM检查通过，无缩进/残留双星/横向溢出，既有透明Redis图360/约342px保留；新增为少量顺序规则，列表够用、不加重复图，未发布。预览仍用dirty renderer/CSS，非完整文章页验收。

下一步本地推进已有业务库升级与实际数据库崩溃矩阵；Worker未知孤儿/cgroup/陈旧锁恢复、API历史与账号删除政策、Linux、人工语义、模型版本策略和生产TLS仍独立未完成，P1/A–D与整个持续goal未完成。Claude Code/claude-ds接手必须读取永久屏障/index-owner顺序、保留时间与UTC兼容、共享信号和目录确认这些增量；不能清空索引或按PID猜旧锁安全。

## 2026-11-16 合成旧结构升级与真实MySQL进程崩溃

### 目标、实现与范围

基点89df5ce，继续本地已有结构升级/数据库故障缺口。先落[恢复契约](../../development/agent-mysql-recovery.md)，复用coding开发唯一upgrade测试文件，判官只读审查；主线程抽出fixture_mysql.py及正式test-agent-mysql薄启动器，新增显式recovery CLI与八题suite。初始化也登记Popen，强杀只用自身仍持有句柄，确认-9后同datadir/socket启动并核UUID、skip_networking与flush=1；共享中断/defer和未知退出保目录不放宽。默认launcher纳入test_agent_mysql*.py，不接收已有socket/data/PID，不读业务配置或供应商密钥。

升级使用中央schema深拷贝裁剪的两种合成结构，既有用户/字典FK/历史/Agent run与observed+unknown call原列保持，新增八个run预算列0、四个call元数据NULL，幂等空plan；正式DDL第一条成功、下一条非法SQL失败后rollback不撤销前缀，freshconnection重新plan收敛。五种列/索引/FK不兼容通过正式run_database_mode阻止其余待建表动作、实际DDL/记录均不变。未发现需修改的生产迁移器或ledger源码；没有真实业务快照，不称目标生产旧库验收，旧默认0/NULL不能当历史计数或继续执行许可。

八题实际SIGKILL覆盖admission/completion提交前原子回滚、真实COMMIT后ACK丢失唯一结果、模型attempt/input/observation预占保留且不重放、重建授权器拒旧绑定与租约收敛。ACK丢失在真实connection.commit返回后注入，进程崩溃是真的；模型/文章合成，未调用官方模型。恢复显式创建新API管理器，不承诺旧在线池无限自动恢复。输入case出现一次replacement连接拒绝warning后断言通过，保留观察、不扩称已解决生产故障。

### 发现、修复与审查

- 初版recovery import早于owned env，八项skip且入口exit1；移入env后实际执行。首轮有效运行清理仍复用已关闭的旧admin/重复close，改为drop独立owned新连接、由原cleanup关闭原连接。attempt提交后Gateway可settle为unknown，测试不再误期待reserved。
- 升级首轮原生29项有1个空fetchall tuple/list断言失败，coding统一rows为list，第二次29项全过；不称生产缺陷。
- 判官复现空矩阵0test/0crash仍exit0的P2误绿。固定八题精确集合、testsRun=8/零skip/8次crash，每题tearDown恰好一次；实际CLI空/缺题/skip/零执行四项回归通过。
- full API719曾触发旧dispatcher测试在cancel入口登记后立即索引尚未完成的异步观察，IndexError；四处wait统一等待cancel_states完成，生产取消逻辑未变。判官再用原相同0.25秒延迟注入，两个受影响用例修后均过，最终17项dispatcher通过。
- 独立离线signals5、入口4、升级构造2共11项通过，最终dispatcher17及延迟注入2通过；判官未独立启动真实DB，无剩余确认阻塞。过程中用followup启动completed角色，没有以send_message排队冒充在运行。

### 最终验证、证据、资源与文章

`corepack pnpm check:api`最终719/27.817秒通过（最后四处测试等待源）；正式原生29/3.989秒通过（19旧+8升级+2构造、零skip），显式恢复8/9.997秒、8次SIGKILL/零skip通过。实际mysqld初始化期间SIGTERM，以及最终关闭wait栅栏第二次SIGTERM，两probe均130、PID/组/目录消失，无fallback接管。恢复与原生实例均回收，私有MySQL根恢复0；verified binary缓存保留，不清现有站点必要资源。

执行源树b3dfe93984439a5161203f141210ec47acc5bc26，34项selected source/index摘要核对；七个变更Python AST、root-script、api:deploy-schema与scoped diff通过。[安全实证](../../evaluations/agent-mysql-recovery-2026-11-16/README.md)包括原生恢复/信号投影与最终检查/source SHA；原始日志/监督driver只在ignored .tmp/mysql-recovery。未重跑供应商四题、Worker96或真实SDK全栈；根format/CSS既有问题保留，不宣称root/Web全绿。

按sun-world-blog→design同题补博客04的崩溃、提交回执与部分DDL边界。分类后端、标签架构笔记/Agent/DeepSeek Harness保留；1280/390正文及新增段落视觉/DOM检查通过，7稳定ID、22处strong、0px缩进、无残留双星/横向溢出。已有透明Redis预占图360/约342px保留；新内容为三个提交边界和少量顺序规则，邻近段落/已有比较表足以说明，不加重复图。未发布，正文预览仍用dirty renderer/CSS，非整篇文章页验收；3030/8032既有SQLite问答与3033正文预览保留。

下一步本地推进API历史/账号删除边界。目标业务库结构及备份恢复、断电/跨版本、未知孤儿/cgroup/陈旧锁、Linux、人工语义、模型版本策略和生产TLS仍独立未完成，P1/A–D与持续goal未完成。其他80项dirty及主handoff原210加/1删保留，不推送部署发布。Claude Code/claude-ds接手须同步owned初始化登记/同目录重启、合成升级来源、固定八题报告门槛和等待取消观察这些协议增量，不把本轮当生产故障全验收。

## 2026-11-16 正式问答历史删除与账号停用

### 目标与实现

基点5cffc24，按[历史删除协议](../../development/agent-history-erasure.md)先落契约再同步coding/判官，继续本地历史/账号边界。正式public router新增owner/family终态DELETE，Cookie/Origin/空body/开关/allowlist和锁后当前授权；AI模块同UOW删反馈/消息/对话，Agent清来源/tool/model详情、三凭据/result/root关联，新增nullable UTC history_deleted_at。账本原键/请求与family摘要/终态/执行身份/累计预算保留；公开view404、重复DELETE成功、旧键同/换问题409且不收费不重跑，late回调拒绝。active409要求先停止，不猜Worker退出或提前释放/退额度。

账号admin DELETE仍是UserManager.status0停用，不自动删历史；实际旧JWT/Redis会话不能GET/DELETE或再完成。历史默认保留至显式删除；永久去重账本仍关联账户，不称匿名化、全账号物理抹除或备份/日志清除。未实现跨family管理、自动历史TTL或用户删除UI，当前3030/8032 SQLite/v1页面未切换，也没在业务库执行DDL/删除或读取真实账号/凭据。

主要源：schema_migration.py、core/error_codes.py、ai/agent_history.py、agent_runtime/{ledger,gateway,application,public_router}.py；新SQLite erasure12与原生history stack9、public router5、共享SQLite fixture和合成upgrade marker NULL增量；stack launcher默认test_agent_*stack.py，load_tests只选新类自己的history方法避免重复继承原十题。所有SQL只用绑定参数；BINARY精确匹配有索引友好相等候选，不用CAST-only扫描条件，SQLite只作BLOB/NOCASE模拟。

### 确认问题与修复

- 初版默认_owned隐藏也传到trusted get_owned/cancel，判官真实临时SQLite/Application._settle栅栏复现：删除先提交，Worker观察0/Redis释放0但本地lease被pop。先补协议再修，可信get_owned/cancel包含deleted终态，公开_view仍用默认隐藏；同交错修后1/1。实际MySQL/Redis第九题再停在settle前，确认删除200时Redis仍owned，放行后Worker inspect读已删marker并释放真实slot，公开GET404。不把隐藏历史等同资源已释放。
- 主线程要求精确字节裁剪同时保留conversation/message索引候选；AI反馈先可索引message_id候选再BINARY收敛，消息/对话同样双条件，避免跨大小写/重音别名扩大删除。新native刻意插入折叠相等、字节不同的孤儿alias消息/反馈，并保留普通聊天。
- 首轮原生18项有1个合成构造错：alias沿用sequence1撞实际unicode_ci UNIQUE(conv,sequence)，不是生产缺陷；改alias9，未放宽生产约束。增加可信settle第九题后最终冻结源复验19项全过。
- coding新删除12项及相关旧回归共144项通过；判官独立erasure/router/ledger/AI历史48与10文件AST通过，未运行真实DB/SDK，无剩余确认阻塞。角色用followup复用，协议增量同步先于实现，未新建agent或worktree。

### 最终验证与证据

完整`corepack pnpm check:api`733/28.975秒通过；真实owned MySQL8.4.13/Redis7.2.17/Auth/ASGI HTTP stack19/15.385秒、零skip（原10+新9）通过。两方向完成/删除/公开读取竞争先确认实际InnoDB LOCK WAIT再释放栅栏；最终当前读拒绝处理中被另一连接停用的账号并整体回滚，真实COMMIT后ACK丢失503但重复DELETE成功。Worker/文章/模型均合成，没有供应商/TLS/真实SDK新验收。

正式MySQL29/4.495秒复验通过（缺新marker合成结构补NULL、原记录保持）；旧八题真实SIGKILL矩阵8/10.057秒复验通过，仍是admission/completion/model预算，不称新删除专门crash或断电验收。其输入case旧replacement warning保留，不预先定因或宣称旧在线池已自动恢复。MySQL/Redis owned临时根均恢复0、对应context确认停止；verified binary缓存与原站点必要SDK资源保留。

执行源树8c5ccf5078ab46eb064498c279ceef5c6cbca692，42项selected source/index SHA核对，13个变更Python AST通过；root-script/api:deploy-schema、scoped diff及本轮JSON格式通过。根format:check只报既有docs/content-sources/csdn-qq-42345136/manifest.json，未改该dirty、不宣称root/Web全绿。[本轮安全实证](../../evaluations/agent-history-erasure-2026-11-16/README.md)含正式栈投影、旧crash复验与源码清单，原始日志/浏览器截图仅留ignored .tmp/history-erasure。

### 博客与后续

按sun-world-blog→design同题更新博客04第五节：删内容/保留去重/停用账号三者边界，回滚、旧键及迟到回调；后端分类、架构笔记/Agent/DeepSeek Harness标签保留。新增透明SVG agent-history-erasure-boundary.svg把内容与去重记录的分支关系画清，沿用旧图字体/配色/线宽；桌面360px、手机342px、原Redis图360/约342px均可读，未加图下小字。1280/390视觉/DOM检查通过，7稳定ID、24处strong、0px缩进、无残留双星或横向溢出。未发布；预览仍用dirty renderer/CSS，非完整文章页验收，既有问答与3033正文预览保留。

下一步本地核验数据库短暂不可用后的既有连接池恢复，追踪旧replacement warning但不替历史故障补定因。全账号/备份/日志/自动TTL/跨family管理、未知孤儿/cgroup/旧锁、Linux、目标业务库与备份恢复、人工语义、上游版本策略、生产TLS仍独立未完成，P1/A–D与持续goal未完成。其他80项dirty和主handoff原210加/1删保留，不推送部署发布。Claude Code/claude-ds接手必须读取历史删除协议及可信/公开读取分离、索引候选+BINARY和同锁竞争这些增量，不能物理删去重行后允许旧请求重跑。
