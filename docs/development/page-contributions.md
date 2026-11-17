# 首个静态页面贡献：AI 工作区入口

2026-11-17，基点dc32f26。继续计划D的实际页面插槽，不重建插件市场。第一宿主仅`ai.workspace.tools` v1，将现有博客问答入口从AigcPage手写链接改为blog模块拥有的静态贡献；侧栏与折叠rail两种展示仍由AI宿主决定。公开导航声明requires=[]，不伪造Agent运行授权，不向贡献交付对话、正文、令牌或其他模块store。原站点/API/模型/Clash不切换，无供应商/DB/VM操作、部署、推送或发布。

## 组装与边界

- `shared/extensions/`仅放不导入业务模块的类型、纯注册验证和React挂载生命周期。平台组合根显式收集AppModule.contributions，宿主提供slot schema。既有Web id（blog/ai）保留；后端blog-content不是自动等同的权限或项目身份。
- 静态注册验证未知slot、重复模块/贡献ID、module归属、版本、依赖缺失/环、slot最大数量、稳定排序和声明能力；未知/不兼容直接抛出，不静默跳过。校验不得执行lazy loader。`check:web`在构建前执行实际组合根的注册检查，不能只验证测试自建清单。
- 宿主上下文仅含scene与展示位置等有界数据，schema在边界验证；运行scope为project、account、session/revision。模块启用、项目匹配、能力投影分别检查，requires为全部满足。能力未知/加载中/失败时受限贡献不加载；public贡献不因此丢掉公开入口。本地已接[当前会话能力投影](capability-projection.md)，按消费者需求从服务端读取最多15秒的显示快照；不能从普通聊天persona/Skill加载状态推导Agent权限。真实贡献仍是公开导航，受限路径用合成贡献及HTTP响应验证，投影不作为任何实际API的授权凭据。
- 各贡献独立pending/error/retry与Suspense，错误UI只显示固定提示，不破坏工作区/其他贡献；这不保证React开发模式console不记录异常。lazy promise迟到不挂回旧scope。账户/项目/会话或上下文变化、贡献模块关闭、权限失效、宿主卸载均卸载子树并abort该挂载signal，后台请求必须使用此signal并检查原scope；不能宣称中止已发服务器动作或清空模块系统的代码缓存，也不把UI模块开关当后端停运。
- 不建立跨账户或跨项目业务数据缓存，重试创建新挂载与新lazy加载；同order以稳定ID排序。布局、键盘顺序和固定内容由宿主控制，ICP仍在首页固定位置。组件不可直接写其他模块store或监听无命名全局事件。

## 分工与验证

root负责协议、应用组合根/宿主/公开导航消费者、真实浏览器预览、构建前检查、适当完整门禁、证据/博客/交接与中文本地提交。coding只实现shared通用类型/注册/生命周期及对应行为测试；判官实现后只读审查。先广播本文，再实施；后续Claude Code/claude-ds先读本文与最新分支checkpoint。

验证必须覆盖未知slot/schema/version、重复/依赖/数量/排序、能力loading/缺失/撤销、模块关闭、同本地ID跨账号/项目切换、lazy迟到、独立错误与重试、请求abort及卸载、StrictMode、原AI对话入口/首页ICP和SSR。当前项目只有sun-world；合成第二scope测试清理不代表多租户隔离已上线。保原80/123dirty和主handoff原210加1删，不整批暂存；不改其他dirty页面/CSS/Markdown/Skill或素材。

实际宿主使用AuthStore新增只读sessionRevision镜像原认证epoch；clearTokens开始的退出/新登录即递增。同一账号退出后重新登录，即使React将中间状态批成一次render，也必须换挂载scope；仅用用户ID或到期时间都不能表达这条边界。普通token到期时间同步不会引起挂载重启，原认证与服务器会话规则不变。

博客按sun-world-blog→design同题修订模块/Skill边界稿，说明宿主布局与模块贡献分工、显示不授权、卸载和迟到响应边界；评估配图、双尺寸渲染并明确未发布。Web预算与原素材格式失败保持真实记录，不放宽门禁；D其余生产、官方Linux四题、人工/不可变版本/恢复/容量等门槛仍待，P1/A–D不因本轮自动完成。

## 2026-11-17 本地 checkpoint

首个slot/博客公开贡献与实际AI宿主、应用Provider、构建前真实注册检查已实现；Web id仍blog/ai。静态注册22项、挂载17项通过。root找出的独立Suspense缺口用3项真实React.lazy用例先证实失败再修：旁项不挂起、拒绝后新挂载重试、撤权后迟到结果不挂回；判官独立Slot17复验通过。其余实际组合根/宿主/AI页与Auth/HTTP定向29通过，判官先前独立45通过，无剩余确认阻断。

source-only树7db2ec81eaf77dac09f70b6182084e65476ba13b的非Git临时源码快照113项和类型检查通过；22项改动源摘要见[实证](../evaluations/page-contributions-2026-11-17/README.md)。完整Web新增实际注册4项检查，contracts6、AI UI25、Web309及类型/构建/SSG/manifest通过，最终CSS gzip18资产预算失败，整体不通过；根format仅原素材manifest失败。无CSS/预算/API/Worker或模型变更，不重跑SDK/三库/VM或供应商。

实际AigcPage/Hook/AuthStore与真实注册的桌面1280/手机390展开、折叠、UI贡献停用、失败重试8场景通过：手机折叠时入口由打开对话列表发现，不把被遮挡/屏外DOM算可见。只用合成GET provider响应，禁止其他HTTP，明确非在线API E2E。初始预览缺宿主尺寸、可见性/动画观察不足及博客根容器/SVG URL问题均保留为harness失败，不改产品CSS；最终截图与viewport命中核对通过。

博客03补页面扩展与权限边界，后端/原三标签、原5稳定ID保持并增1章节；新增透明装配图解释模块/宿主/应用/服务端职责。修正原稿粗体句末标点及本地/生产状态，桌面手机实渲通过未发布。源码快照核原inode/无打开文件后移除，原3030/8032/3033均200，原80/123dirty和主handoff原210加1删保持，仅中文本地保存。

用户最新确认只走Clash Verge现有转发，代理配置不在范围；不新增项目代理设置或调整节点/系统代理，不再等待另一代理资料，原官方Linux四题失败与停止付费复跑边界保持。后续Claude Code/claude-ds读本checkpoint及官方接入范围。其他候选slot/写action、细粒度授权、真正多项目数据隔离和生产/人工等仍独立待。

## 2026-11-17 能力探测增量

真实GET /auth/capabilities、十个已登记显示predicate和按消费者启停的Provider/controller/hook已本地实现；当前账号、认证epoch及server family摘要共同隔离scope，请求开始单调TTL/同步过期裁剪，失败/撤销/隐藏/无消费者收敛，当前实际操作仍由业务服务复验。正常续查若身份/能力不变不重挂，过期后续查恢复仍通知订阅，零TTL新family也更换挂载隔离。修复开发中匿名scope携管理predicate的显示契约P2（DTO与client共同拒），不称真实project或写API发生绕过。详见新协议及其最终实证。
