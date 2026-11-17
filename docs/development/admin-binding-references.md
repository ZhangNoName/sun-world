# 角色资源替换的引用边界

本地实现、独立review与验证已完成：[实证](../evaluations/admin-binding-2026-11-17/README.md)。完整API1021、新原生20、contracts6及原SDK Linux合成链路通过；未部署/发布。

2026-11-17，本地承接管理服务8d72504。上一goal turn为progress：九管理服务、真实事务鉴权、review与1007/API及原生验证已本地保存。本轮核既有role.bind_resources的输入集合和引用完整性，不将菜单resources当成细粒度能力grant，不新增授予API/Agent写工具或生产角色数据。

## 实现约束

- 当前真实access服务仍须先鉴权，实际RC事务按原roles目录→actor账号/绑定锁定后再验身份/能力，随后才核本操作引用；不在未授权时查询目标存在性。现有audit、lastadmin、实际commit前Redis/时间检查保持。
- BindResourcesModel及management专用schema使用严格正整数资源ID（沿实际resources.id/role_resources.resource_id的signed INT上限2147483647，bool/浮点/字符串不能作为ID）；角色target继续沿统一既有signed64格式检查，再核对象存在；资源字段不可借审计BIGINT上限扩大。列表最多500，允许空列表清空，重复ID按首次出现去重，表达集合替换。不要影响其他User/Role/Resource schema或权限映射。
- 在实际同一UOW、任何绑定DELETE/INSERT之前，确认目标role存在，并以主键升序FOR UPDATE锁读全部唯一resource IDs。任何缺失即统一固定404，不泄SQL或ID细节、零业务变更/零audit；缺失role不能创建失联绑定，部分已存在资源不能导致部分替换。空列表仍要求role存在。
- reference验证由service生成的私有hook携带服务端规范化参数执行；客户端不能提供callback/Principal/owner当证明。参数在验证后不可被调用方突变改变目标集合；manager接收同一规范化值。data core不能import业务模块。
- 保持可信raw manager None路径兼容，不称已经新增数据库FK或阻止任意外部SQL。新九服务写同roles锁，正常参与的角色/资源删除应串行化；引用资源行锁也要在真实连接验证。外部DB管理员、绕协议DML/DDL的全局引用完整性不是此次保证。
- SQL故障、audit失败、final session/time失败都回滚完整替换；commit确认未知沿原503不重放。重复参数不再用MySQL唯一约束异常伪装存储不可用，旧audit测试用真实触发器/受控SQL失败保留中途回滚oracle。

## 契约与验收

保URL/正常body和response/空清空；正整数约束是明确输入收紧，重复ID现在幂等集合化，缺失对象返回404。按原schema-only工具重生成OpenAPI/TS，核只有绑定ID约束变化，不混入其他接口；原catalog/two tools/Skill/bundle必须逐字不变。40+9+9+9与receiver/action gate保持，新src普通文件显式入Linux source合同/hash。

先用owned MySQL/Redis/Auth/Cookie/HTTP复现当前已授权绑定可产生失联role/resource、0/负值及bool/字符串coercion，记录现状不是外部匿名越权。coding负责限定生产/离线补丁，判官只读review，root负责真实原生、跨连接LOCK WAIT和故障验收、契约/guest字节绑定、博客与handoff及中文本地commit。

验收至少包括：合法多项/去重/空替换、缺role（含空）/任一resource缺失整笔拒绝、非法ID类型/范围/500边界、未授权且缺对象仍先401/403、直接service一致、pool1、真实中途INSERT/audit/final注销回滚、提交确认未知不重放；两连接角色/资源删除与替换实际LOCK WAIT后结果无失联关联，直接SQL资源行锁等待只证明锁持有而不声称外部删除自动清理。旧audit/native管理19/近期/lastadmin/API及原SDK链路保持。新状态若必须改旧fixture，只改显式非法数据/故障机制，不降原失败回滚/身份oracle。

重用现有Clash不配置代理，不进行供应商/付费请求；不读业务配置/密钥/真实角色数据，不触碰3030/8032/3033和指定失败根。保原80/123/main210加1删；不推送部署/发布/新worktree。按sun-world-blog写作并区分新引用案例与旧最后管理员/审计主题，先依据真实证据决定修旧或新稿，记录分类/标签、配图取舍与发布状态。Claude Code/claude-ds接手必须携带以上锁顺序、引用检查时点、旧raw兼容和无新授予能力约束。

## 契约生成复核增量

根线程首次生成发现signed64最大值在FastAPI/OpenAPI数值转换后舍入成2^63，与运行时上限不完全一致；实际resources.id及role_resources.resource_id均signed INT。资源列表应以2147483647为上界，保持JSON/JS可精确表达并与物理列一致；角色target沿现有统一格式以免修改其他动作。此协议先更新并同步coding/判官后再收尾；仅绑定schema bounds/description与TS注释应变化。
