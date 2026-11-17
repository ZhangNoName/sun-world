# 管理变更的同事务审计

承接[9项近期认证入口](admin-recent-authentication.md)与[最后管理员保护](admin-recovery-invariant.md)。本轮只为这些HTTP维护的实际变更新增数据库审计，不替代细粒度授权、拒绝尝试记录、完整历史查询/导出或生产保留政策。

## 数据与来源

- 新增兼容表 `admin_change_audit`，由现有MYSQL_SCHEMA/migration管理，仅在owned临时库验证DDL。字段：BIGINT自增id、正整数actor_user_id、SHA256 session_ref、SHA256 request_ref、固定action、固定target_type、正整数target_id、非负affected_rows、UTC recorded_at。仅稳定引用/动作/结果，不存Cookie、token、sid、姓名/联系方式、密码、角色名称、资源路径、自由文本、原始请求或业务值。
- 9个action固定为user.create/user.disable、role.create/role.update/role.delete/role.bind_resources、resource.create/resource.update/resource.delete。target_type从action推导，不能由客户端指定。记录的是变更动作与引用，不声称保存完整授权前后快照或不可篡改取证。
- require_recent_admin继续返回原用户，同时只在服务端Request.state保存已验证的(user_id,sid)元组。新增require_admin_audit依赖它，核相同用户并构造不可变AdminAuditContext：actor ID、SHA256(user_id:sid)会话引用、既有request_id经SHA256的关联引用；没有request_id则生成随机服务端ID后hash。不使用原始Header/body作为操作者或审计文本。
- 所有9个handler显式取得此context并传给manager（用户创建经AuthManager）；schema门禁除40管理员/9近期，还检查9审计依赖。缺少/非法服务端context拒绝写入，不自行伪造actor。客户端无法通过payload.audit替代它。
- context只是可信应用代码的内部记录载体，不是新的服务层授权凭据；格式检查不证明任意内部调用者有管理能力。request_ref也只用于关联，不能把可能来自客户端的request_id当作不可伪造授权。服务层capability/可授予范围仍须另行迁移。

## 提交语义

- manager新增显式keyword-only `audit=None`，无context保留既有内部调用路径，未迁移的内部维护不冒称已审计。HTTP必须传context，不能因审计表不存在、SQL失败或配置缺失回退旧写路径。
- 提供context的写入使用同一个unit of work执行业务与审计INSERT，只有二者及原最后管理员检查都成功才commit。现有多SQL角色/资源关联变更与用户创建同样如此；不能事务外写文件、另借连接记录、静默丢审计或吞异常后提交。
- 显式audit事务在任何业务写入前，用当前连接核六张固定表（users、roles、user_roles、resources、role_resources、admin_change_audit）存在且都是InnoDB；缺表/非事务引擎固定503，不在不支持回滚的库里宣称原子性。不缓存该检查，不接受客户端表名；外部并发DDL/DB管理员篡改仍在本应用协议之外。
- audit插入必须实际产生正整数id，否则抛固定AdminAuditUnavailableError，由yield依赖将端点异常映射固定503/ADMIN_AUDIT_UNAVAILABLE（无驱动信息）。UserManager.create_user须让此typed错误传播，不能落原bool吞异常路径。失败回滚包含创建的账号/默认角色或关联，最后管理员409同样不留已提交审计。
- 上述回滚断言限于commit之前的确定失败。commit响应丢失时，数据库可能已经把业务和审计一起提交，只能报告结果未知、保留两者并待对账；不能声称已回滚、自动重试或只重放审计。测试须区分commit前失败与commit后抛异常，后者允许两者同时存在但不允许只有其一。
- 单行CRUD只在affected>0时记录；无实际变化/不存在的返回保持旧语义且不伪造变更记录。绑定替换整体事务完成后记录一次（即使列表为空，表示替换动作完成），affected_rows按已完成DELETE/INSERT数，不存ID列表。不承诺自增id连续或按commit先后严格排序。
- 角色/resource删除若仅清掉历史失联关联而主体DELETE为0，仍是实际变更，按所有DELETE受影响行总数记录；保留原主体不存在的返回值，不因HTTP状态推断是否写过。用户创建计账号与默认角色两次INSERT；其余单行变更计主表受影响行，绑定计整体DELETE/INSERT数。
- 目标ID必须归一为正整数。现有user字符串路径可保留ASCII数字含前导零的兼容，禁止MySQL把带字母/空白/Unicode的字符串隐式当作另一个账号。非法目标在写前422，不作为审计存储故障503；角色/resource的类型与其他公开接口保持既有契约。

## 验证与交接

先记录原库没有此表/9写无持久记录的基线。owned MySQL/Redis/AuthManager/Cookie/HTTP验证9个实际写与准确actor/action/target记录；陈旧/匿名/非admin/最后管理员拒绝零业务与审计写；伪造body/Header不能改引用；原GET兼容；将新表在owned库临时改名模拟不可用，九写都固定503且业务表逐字回滚，恢复后成功。补SQL中途失败、pool1/并发上下文隔离及旧库仅加新表的兼容迁移；native/内存事务职责分明。

新表没有应用层删改入口，无外键以保留已停用/删除对象的稳定引用；不宣称DB管理员不可改、不可删或已经实现独立审计账号、容量/归档/保留/去标识化/备份恢复政策。生产部署前仍须决策这些项目并先应用兼容DDL，旧代码回滚保留新表，禁止回滚删除审计数据。

仅保留新表不等于旧代码仍能审计。生产若要回滚到不支持此协议的版本，必须先停掉这9个写入口并核对在途事务，或限定最低回滚版本包含本审计实现；没有自动回退到未审计写入的分支。实际生产停写/恢复步骤仍须部署前另行核定。

完整API/schema/deploy检查、原两库链路与只读review后中文本地提交；博客同题修订、实证和handoff记录真实边界。不读业务配置/密钥/账户、不调用模型，不配置Clash、不动3030/8032/3033、旧live/failed roots与Linux缓存，不推送部署发布。Claude Code/claude-ds接手须保同连接提交、9个依赖、typed失败传播与未审计内部路径。

## Linux源码包兼容补验

集成核对发现显式stack-sources白名单缺少admin_recovery.py、recent.py、admin_audit.py，现Auth/User/Router导入它们，宿主API测试不能证明guest源码包完整。须显式加入这三文件并更新sources合同hash，保二进制资产/hash/SDK版本与禁止广泛工作区收集的规则；增加直接src/相对模块导入闭包检查并用缺文件回归证明会拒绝。保持真实Linux合成原生SDK链路可启动，不开放official付费评测、不配置网络；此项不能用Mac API绿或只检查JSON格式代替。

复审补P2：不能把任意有后代文件的目录都当合法namespace，也不能忽略`from . import name`的成员。普通src包的initializer须在声明中，namespace仅接受既有明确允许的四处；from本地包/模块的名称至少须有静态顶层绑定或已声明子模块，未知成员拒绝。补移除真实auth/__init__.py与relative未知成员的负例，不把不可能导入的namespace属性写成正例。此检查不执行源码，也不声称证明动态import/条件分支的全部Python运行语义。

导入语句声明的alias不能直接当作该同一导入的既有成员证据；本地re-export须解析到独立声明/已列子模块，并防无来源的自引用或相互引用空转。补initializer内`from . import missing`及空循环re-export负例；不靠宽松namespace或硬编码某个业务符号特批。

## 2026-11-17 本地结果

[实证](../evaluations/admin-audit-2026-11-17/README.md)绑定最终21源树2b3426264d34563a9ddfd7888e6a6c2c8e404989，API991、新native16、近期12/原24/恢复16/原MySQL33、schema/deploy及无OpenAPI漂移通过。表触发器/缺表/MyISAM/并发双actor/pool1/真实commit后注入确认异常/仅加新表DDL均由owned MySQL实际验。新离线测试顺序、Linux gate namespace/自证缺陷已修，判官无剩余确认阻断。

两次无official真实Linux合成报告通过，273 payload与67资产相同、226声明源逐字匹配最终代码；最终宿主gate与VM执行版本分开记录，不声称早先VM运行后来host代码。旧per_run flag=false、供应商0与回收事实保留。博客同题6章/10重点/两透明图双尺寸明暗过未发布；原dirty/服务保持，不推送部署或更改Clash。
