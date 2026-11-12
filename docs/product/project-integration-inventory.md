# 全项目接入台账

盘点日期：2026-11-12。范围：Codex 已登记的本地项目、`/Users/zxy/Documents/project` 可见根目录及 Stars 已有导航目标。只读取说明、manifest 和必要边界源码；不读取账户数据、环境文件、备份内容或客户业务数据。不是全部资产的穷尽审计，也没有验证各项目今日线上健康。

对接设计见[Stars 首页与全项目方案](../architecture/project-federation-plan.md)。本台账采用建议 project_id；除已有 Stars 项目星 ID 外，不表示各项目已登记这些 ID。公开性是本轮接入建议，不代表已获得跨组织公开授权。

各项目的身份/租户/资源授权以[专题矩阵](../architecture/federated-identity-and-isolation.md)为准：目录中的产品 ID 不等于帧集 workspace、零点门店或命运档案 owner；公开性登记不产生业务权限。

## 1. 产品与可用能力

| 建议 ID / 项目 | 事实来源与当前形态 | 建议接入 / 首期展示 | 深度接入前的阻塞 |
| --- | --- | --- | --- |
| `stars` / 群星 | `stars/index.html`、`src/observatory/main.ts`、`src/observatory/data/projects.ts`；完整观测站是 DOM/Canvas/Three.js 静态应用，已有博客与帧集项目星 | 统一公开首页与项目目录；保留独立构建 | 当前域名回源、旧路径、ICP、3D 失败的普通导航、部署归属验收 |
| `sun-world` / 博客与平台 | 本仓库 apps/web、apps/api、contracts；React/FastAPI、博客/账号/AIGC/后台 | 公开博客入口；管理页按业务权限；未来目录与工具契约管理 | 实时部署记录冲突；DSH 模块仍是设计/原型 |
| `metaphysics` / 命运 · 观象 | Codex 显示名「命运」对应 `chinese-metaphysics-skill`；根 README、`web/README.md`、`web/lib/server/http.ts`；Python 核心 + Next.js/SQLite 本地工作台 | 先公开产品介绍与本地使用状态；无可点击的托管 launch URL | 本机单用户守卫；多用户档案/照片/模型凭据隔离与托管身份未落实 |
| `frame-studio` / 帧集 | `ai-video/studio/README.md`；Cloudflare Web/Admin/API Workers、D1、私有 R2、Workflows；Stars 已有链接 | 独立创作产品入口；公开页面可展示经批准的样例 | API 仅 Service Binding；统一身份和外部能力需专用边界，不能公开整个内部 API |
| `swbot` / swBot | `swBot/README.md`、`openapi.yaml`；Telegram/Cloudflare/D1 + React 管理；已有 scoped 外部 API、限流和幂等 | 渠道入口按批准信息登记；后台为受限入口 | Telegram 身份绑定、会话归属与工具 scope 映射；不聚合私人聊天 |
| `lingdian` / 零点 | `LingDian/README.md`；NestJS、uniapp、Web/admin、Prisma/MySQL 点餐系统 | 独立产品登记，正式站点未核实前不写 launch URL | 商户/门店/订单身份与访问域；不是命运，不与其合并 |
| `clash-traffic` / Clash 流量簿 | `clash-traffic/README.md`；macOS Apple Silicon 本地流量应用 | 桌面产品介绍/批准下载或文档入口，不做 Web 挂载 | 本地统计不上传；统一门户不改变其数据边界 |
| `xiaohei` / 小黑 | `xiaohei-agent/README.md`；飞书机器人 + Node/lark-cli/Codex CLI、本地存储、Next.js 管理 | 私有工作台与渠道适配候选；不公开管理端 | 群/私聊权限映射；本机终端与 Codex 能力不能直接暴露给 DSH |

定位规则：`ai-video` 根是创作素材工作区，`ai-video/studio` 才是帧集产品。产品 ID 不随文件夹名机械推导；发现同仓库多个应用时，分别登记产品与管理入口，而不是对每个目录自动建立公开项目。

## 2. 素材与待确认工作区

| 路径 / Codex 标签 | 已知边界 | 处理 |
| --- | --- | --- |
| `ai-video` / 视频 | 根 README 为创作资料，产品在 studio | 与帧集关联，不重复登记成第二个网站；素材只经主动发布展示 |
| `money` / 💲 | 有 work 与文档，未发现根应用说明；未深入内容 | 待确认用途，不假定已有财务产品，不索引私有文档 |
| `ai-view` / ai可视化 | 根为 money 子目录，无根应用说明 | 待确认，不生成可部署能力或财务看板假设 |
| `stickers` / 表情包 | 本轮未见非隐藏应用文件 | 占位工作区；未来产品单独登记 |
| `/Users/zxy/Documents/upup` / upup | 本轮未见根 README/manifest | 待确认，不按名称编造功能 |
| `学习` | Python 练习与示例 | 学习资料，可另行整理公开文章，不登记应用 |

## 3. 运维、依赖与组织项目

| 路径 / 项目 | 分类 / 已核对边界 | 接入规则 |
| --- | --- | --- |
| `sso` | Next.js 企业大屏 SSO 联调模拟器，根 README 明确模拟用途 | 内部开发工具；不是全项目生产 IdP |
| `deploy-platform` | 组织构建/环境部署平台，React/Vite + NestJS | 私有运维目录；先确认归属，只接只读状态起步，首页不能获得部署权 |
| `jenkins-scripts` | CI 脚本工程 | 内部基础设施，不直接作为 Agent 任意脚本入口 |
| `/Users/zxy/Documents/腾讯云` | 主机操作工作区候选，未深入连接资料 | 不公开路径或凭据；非独立产品 |
| `normal` | `使用说明.md`：Python 评测 CLI + 本地 HTML 工作台 | 内部评测工具；仅按需接脱敏汇总，不暴露题库/原始报告 |
| `askbi-acceptance` / open ai api | 根 README：AskBI Open API 本地联调验收客户端与可信代理 | 开发工具，不能作为生产 API 网关；以说明而非 Codex 标签判断用途 |
| `ask-bi`、`ask-bi-2`、`ask-bi-3`、`apple` | 组织业务目录或副本关系待核对，未深入 | 按仓库身份/部署环境去重；不按目录数创建四个公开产品 |
| `demand-supply-weekly-dashboard` / Apple Demo | 根 README 为内部 Demand & Supply 看板交付 | 组织产品，默认不进入公开目录；授权后按组织域接入 |
| `融通`、`华夏银行报告模板新增SQL输入需求文档`、`昆仑资本AI智能中心Demo_V2` | 名称与上下文为组织/客户资料，未读取正文 | 只登记待确认范围，不公开标题细节到首页或加入统一 AI 索引 |
| `ask-bi-env-backups` | 环境备份目录，未读内容 | 非产品，排除目录快照、内容索引与 AI 检索 |
| `json-render` | README 指向 Vercel Labs 上游框架 | 依赖工作副本，不作为自有业务项目；采用时固定版本与来源 |

Codex 中另有 `continuum`、`piece-and-post`、`idea-spark`、`diplus`、`edward`、`workspace`、`ask-bi`、`ask-bi-2`、`heyedwardchen.com`、`local` 等云端项目容器。本轮只知道容器名，未审阅内容，不能视为独立在线应用或确认其所有权；保留为范围缺口，由相同登记规则后续补齐。

## 4. 就绪状态与待补信息

- **可优先设计 L1：** Stars、Sun World、帧集。已有实际项目入口结构，仍需上线前验证地址、受众、回退与域名归属。
- **适合产品介绍后再接能力：** 命运、零点、Clash 流量簿。不能据此声称已具备托管入口。
- **适合受限渠道/工作台：** swBot、小黑。身份范围先于对话、文件或动作接入。
- **仅内部登记或暂不登记产品：** 运维、客户、备份、上游、素材与空工作区。

每个进入实施的项目须补：维护责任人、正式/测试地址、可公开字段、登录方式、资源归属、API 版本、部署与回滚负责人、当前测试证据。未确认 URL 允许为空；禁止填猜测子域名并标为在线。

Stars 当前导航中的帧集地址为 `https://frame-web.lookyourtop.workers.dev/`，博客为 `https://blog.sunworld.site/`；这是源码配置证据，未作为本轮健康检查结果。历史 Stars 发布证据见本地冷启动稿 `docs/blog/2026-11-10-stars-cold-start-brotli.md`（未随本次提交），不得用历史成功代替今日运行状态。
