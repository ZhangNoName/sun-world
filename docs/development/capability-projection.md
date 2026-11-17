# 账号会话能力投影与页面贡献

2026-11-17，承接8cb6305，前一goal turn为progress（角色引用修复及1021/API/真实原生/版本保存）。本轮落实计划D明确列出的能力探测：现有AppPageContributions固定unknown，仅公开导航可用；增加后端权威当前快照与有界客户端展示投影，不新增业务写入/工具/授权授予，也不让Skill、菜单、persona或前端角色推导操作权限。

## 后端与契约

- 新GET /auth/capabilities为管理模块拥有的只读HTTP入口（现有identity-management manifest加此读声明及blog-content依赖）。原九写声明/action映射与40+9+9+9精确门禁保持，读声明单独精确核，不把守卫计数放宽。原两blog工具/schema/产品Skill不变，目录仅模块只读元数据及bundle摘要变化，不给Worker多工具。
- payload为固定sun-world app_id、当前account_id（canonical正十进制字符串或匿名null）、session_ref（当前user+family的server SHA256摘要或匿名null）、capabilities（已登记能力的唯一有序列表）、max_age_seconds（0至15的整数）。不返回roles、原sid/token、联系人、原审计/配置/模型等；session_ref仅用于客户端挂载隔离，非凭据/授权版本，不回传作为写入证明。
- 无access Cookie的匿名只可投影core PublicReadPolicy已允许的blog公开读取；不访问用户数据库。存在Cookie则必须使用原AuthManager/SessionAuthenticator+同一短READ COMMITTED UOW当前status=1/角色，失效或不可验证的Cookie401，依赖/配置故障固定503，不降级匿名。不接请求Principal、owner、roles或其他project作为证明；app固定sun-world。
- 当前管理九能力只从同一个ManagementPolicy actor/近期认证规则投影，避免另写一次admin判断。可把现有require中的共同actor检查抽成纯policy接口并由execute与projection共用；服务自身仍要求真实活动access。匿名/普通/陈旧用户不能得到九管理能力，scope层投影不保证任何具体目标存在或last-admin等业务条件通过。
- registry为能力登记源；新增轻量generated capability-keys.ts供Web运行时白名单和类型使用，export-agent-contracts生成/--check同步校验，不把全内部catalog/schema/Skill打入浏览器。投影schema支持集合须与registry已登记能力一致，未来模块新增能力必须明确投影策略，未知默认拒绝。
- server max_age_seconds不得超过15、access剩余寿命；有管理能力时还受近期认证剩余窗口约束（原int(now)判定边界保持，可保守截断）。0表示不能缓存放行，前端不得挂受限贡献。返回Cache-Control:no-store和Vary:Cookie。不写业务/audit、不触发模型或刷新登录；读取只是观察快照，角色/会话之后变化仍有显示窗口，实际API每次与提交前继续权威复验，绝非跨Redis/MySQL强一致授权租约。

## 客户端生命周期

- AppPageContributions使用真实typed API与投影控制器/hook。只有挂载页面贡献消费者时才启用探测，多个consumer共享一次投影/定时器（可在PageContributions上下文提供可选acquire回调，usePageContributions effect登记/幂等释放）；无消费者、SSR、auth unknown/restoring、隐藏页面停止请求并abort，公开requires=[]贡献保持。
- 作用域至少绑定固定项目、AuthStore当前user.id/status/sessionRevision。渲染时先比较捕获scope，旧ready不得在effect清理前短暂授给新账号。响应account_id须匹配当前账号（匿名须null）；同账号的新server session_ref也必须切换挂载session key，清旧子树/AbortSignal。未知字段/错误app/account/ref或超长/未知/重复capability、非法TTL都拒绝；account/ref同为null时能力仅可为公开read的子集（空集可保守拒绝），拒绝匿名携管理predicate这一不可能组合；后端DTO也核null配对和匿名子集，不通过客户端角色补fallback。
- 使用请求开始时的单调时间限定响应可用期，慢响应不能把旧快照的15秒从到达时间重新延长；显式到期计时器让旧ready立即失效，即使续查挂起。可在到期前续查并在旧快照尚有效时保留它；续查成功且scope/ref/grants不变应保留组件，撤销/失败/超时/到期即移除受限项。重新可见或focus先使旧投影失效再查；无无限即时重试，错误后等待有界重查/可见事件。
- 所有请求AbortSignal贯穿typed api，epoch/request generation拒绝忽略abort的旧响应；同scope并发不会旧覆盖新。探测GET设置suppressErrorToast/skipAuthPreflight/_authRetry以避免它自行触发会话刷新或登录流程，不改全局AuthStore认证规则。
- capabilities只影响可见/可挂载条件，前端未知/加载/失败时受限贡献不加载；public导航不因此消失。使用generated已知能力支持静态registry声明，未知requires构建仍拒绝。现有实质贡献仍是公开blog导航，不增加虚构受限管理入口；真实Provider/Slot用合成受限贡献验证行为，不能把合成入口称产品上线。

## 分工与验收

coding负责限定后端service/schema/GET适配、manifest/gate/exporter及新离线测试，和客户端API/轻量controller/hook/Provider接线、Scope session ref及相应行为测试；root拥有契约生成整合、真实owned MySQL/Redis/Auth/HTTP、浏览器实际Hook/Provider/Slot合成网络、构建/快照/预算、证据/博客/handoff/中文commit。判官实现后只读review，保一个coding/一个review，无新代理或运行时模型。

后端验收匿名不碰存储、fresh admin九+公开、普通/陈旧仅公开、伪claims/坏Cookie/注销/禁用/status2/依赖故障、同账号family摘要隔离、TTL边界、401不降级、no-store、零业务/audit；拿旧投影后再撤权/注销，真实写服务仍拒。客户端验收消费者计数、auth恢复/切换/同账号新epoch、忽略abort迟到、坏payload、隐藏/可见/focus、过期/慢续查/错误、相同投影不重挂与撤权卸载abort、StrictMode/SSR、公开导航与正常聊天守卫兼容；未知requires gate仍拒绝。

新src全部显式加入Linux source合同/hash；catalog新元数据需要原固定依赖离线SDK重封并核旧包+旧catalog/新包+新catalog绑定，不绕过门禁、不得执行宿主Linux ELF。实际guest原合成链路与新projection owned验收分范围报告。Web原两dirty UI/素材格式问题不改、不白名单绕过，必要非Git临时源码快照按自有inode/无打开文件证明清理，不建额外worktree。完整API、contracts、相关/完整Web可用门禁、真实原生及独立review后再保存。

按sun-world-blog修订模块/Skill边界稿的显示投影范围、配图取舍与双尺寸预览，记录未发布。保持原80/123/main210加1删、3030/8032/3033/旧缓存/指定失败根；仅复用Clash Verge，不配置代理、不碰业务配置/密钥/真实角色数据、不推送部署/发布或恢复官方付费四题。Claude Code/claude-ds必须带只读投影非凭据/同scope+server family隔离/单调TTL/原API最终授权/无新增工具等边界。

## review边界补强

判官纯离线证实旧validator及DTO接受匿名account/ref=null但带identity.role.create的组合，controller/registry会据此显示受限贡献；真实后端project并不生成它，实际写API仍拒绝。这是显示契约P2，修复需DTO与client匿名子集一致、controller/Slot坏payload不挂载回归，禁止写成已经存在服务写越权。

## 当前工作检查点

31源冻结树d6f9a8a3b7fa95e6a8f6690ccd4405f5a9e727a8。完整API1032/41.092秒、Worker164、新native16及旧20/19/16/12/16/33/24通过；判官独立backend11/Web27/旧service16/schema/catalog/十键/31摘要无剩余确认阻断。匿名不可能predicate P2双端修正并保修前后日志；真实project不生成该值、写API不据它授权。

工作区Web337单元过，原dirty两UI失败保持；排除原dirty的跟踪源码非Git快照完整Web320/类型/构建/SSG/全部门禁与原预算通过，快照核inode/无打开文件后已删。实际Provider/Hook/transport/Slot双尺寸12合成GET及受限贡献场景通过；Chrome会abort旧XHR，忽略abort迟到由单元证明，不称浏览器在线三库E2E。Linux234源/281payload/67资产逐字绑定，原49/9/5/正式三库SDK6合成链过supplier0、旧legacy per_run=false保持；新native16在Mac而非guest。SDK离线重封，38522成员仅catalog变化、固定依赖及其他66资产不变，旧包/新目录拒绝对照保持。

见[完整实证](../evaluations/capability-projection-2026-11-17/README.md)。博客03按design同题六稳定ID/十重点/原透明图双尺寸明暗过；深色末行对比不足补底框，未发布。17 owned DB根、VM组/root、Web快照已回收；3030/8032/3033和原80/123/main210加1删保持。仅中文本地保存，不推送部署发布、不改Clash或恢复付费四题，生产/完整授予及其他P1/A–D门槛未完成。后续Claude Code/claude-ds须保留上述显示/实际授权与跨平台验收边界。
