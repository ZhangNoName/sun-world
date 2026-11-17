# 管理服务的当前授权与提交边界

2026-11-17：九项本地实现与独立review完成，完整API1007、新原生19及原生Linux包/原SDK合成链路通过；[实证与失败边界](../evaluations/admin-management-2026-11-17/README.md)。未部署或开放Agent写入。

承接[近期认证](admin-recent-authentication.md)和[事务审计](admin-transaction-audit.md)，本轮迁移9个既有HTTP维护写入至统一管理服务。原require_admin/近期/audit守卫保持下界，管理读取与其余31项未迁移；不新增HTTP、授权授予API、Agent写工具或生产角色数据。

## 服务与能力

- 新`modules/management`拥有service/policy/manifest（普通包显式initializer）。注册`identity-management@1`，9个HTTP声明、6张维护表data owner，tools/skills为空。原博客两工具与输入/输出定义必须原样，不因模块capability登记获得Agent写权限。
- 固定9个操作对9个最小能力：user.create/user.disable、role.create/update/delete/bind_resources、resource.create/update/delete，对应`identity.`前缀的能力键。仅当前规范化admin角色映射这些既有能力；不是从resources菜单记录生成grant，也不是完成生产细粒度角色/可授予集合迁移。
- 公共服务接活动access凭据、操作、类型化业务参数/目标，不能接客户端Principal/roles/owner/authorization callback作为证明。scope严格sun-world及本操作user/role/resource类型，create无已有target，其他目标正整数。未知操作/能力/app/type默认拒绝且不探测目标是否存在。
- 使用现有AuthManager与SessionAuthenticator，构造当前Principal。首次短RC读取仅用于进入业务前鉴权，避免未授权调用触发注册查重/哈希等业务；随后实际写事务中再次复验。会话读依赖故障需区别于失效证明（可新增AuthorizationUnavailable作为AuthorizationDenied子类保持旧调用fail-closed），只返回固定401/403/503，禁止凭据/内部异常进入响应或日志。
- audit由服务端当前身份构造；若HTTP传入已有AdminAuditContext，必须与当前user/session_ref匹配，不能仅凭其类型/格式放行。可无上下文的内部公共服务调用也必须凭真实活动access鉴权并生成安全audit；raw manager的audit=None仍是未迁移受信任持久化路径，不能称无凭据内部调用已被全局禁绝。

## 数据库授权栅栏

- Service为每次调用生成私有授权hook，不暴露给请求；各manager/AuthManager注册路径新增可选keyword authorization并传到共同admin_audit_transaction。公共service总是同时提供audit+hook，raw持久化None旧路径保持。
- 实际UOW仍单连接RC、六表InnoDB检查。在业务DML前，hook先按roles主键顺序锁角色目录，再锁操作者users行及该用户现存user_roles（按role_id顺序），然后通过同一uow的当前auth_context复验活动session、status=1、角色、近期时间与能力/目标，核audit绑定。不借第二数据库连接、缓存allow或相信旧roles快照。
- 这些锁持有到commit，序列化参与的角色/账号撤权；锁住已有actor绑定也阻止外部SQL直接删除该已用授权。外部并发DDL、DB管理员篡改等仍不承诺受本应用约束。没有新增数据库授权版本表，也不宣称解决所有未来grant存储。
- DML/audit后、实际commit前再检查同一凭据仍在Redis活动、时间窗口/策略仍有效。数据库权限使用本事务已锁定并复验的前置快照：本次操作允许主动停用本人或移除本人的admin角色，只要原最后管理员保护留有其他恢复管理员；不能因为自己这笔合法降权而在提交前错误拒绝。
- Redis检查与MySQL commit没有分布式事务，检查之后才发生的注销仍有窗口；不宣称绝对先于所有并发提交。已在最终检查前完成的注销必须回滚业务与audit，不重试；commit确认未知沿用上轮503/待对账、不得自动重放。
- 保护型事务需让原admin_recovery在最终last-admin检查后、commit之前执行hook；不能在其已经commit后才做权限复验。非保护型事务也在同位置检查。AuthorizationDenied类型不得被通用audit错误改成成功或吞掉。

## HTTP、契约与验证

每个写handler通过对应get_*_management_service依赖调用service，保原URL、body/response、状态及审计/近期下界。schema-only门禁须核40旧/9近期/9审计/9服务接线，管理manifest9入口/能力与实际服务一致；导出catalog仅增无工具的管理模块，不改原两工具或暴露普通用户写能力。

先记录raw manager受信任内部直调仍可写且audit格式不授权的基线，不把它写成外部认证漏洞。新增离线纯policy/真实事务service测试与owned MySQL/Redis/Auth/Cookie/HTTP：九正常兼容、无HTTP直接service无凭据/普通用户/失效/陈旧/伪Principal或audit/未知操作与scope拒且零业务audit；角色/禁用在服务复验前可见则拒；在持锁后另一连接撤权实际LOCK WAIT，当前合法操作提交后撤权；业务后注销/时间过期回滚；有其他管理员时自停用/降权可提交、最后管理员仍409；pool1无嵌套；原审计失败/commit未知及三库SDK兼容。

新普通包及所有新增src文件须显式加入Linux source合同并更新其hash，最终gate与实际payload逐字绑定；真实无official合成guest验证不能由宿主API绿代替。完整API/契约/原native/只读review、博客与handoff后中文本地保存。不读业务配置/密钥或真实角色数据，不部署/发布/推送，不配置Clash或恢复付费评测；原80/123状态、main原210加1删和3030/8032/3033保持。Claude Code/claude-ds接手须带私有hook/单连接锁/自降权/Redis窗口/无写工具等约束。
