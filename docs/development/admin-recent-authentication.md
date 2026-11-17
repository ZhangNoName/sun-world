# 管理写入的近期认证边界

本轮承接阶段A与[管理员事务保护](admin-recovery-invariant.md)，把已有身份关联使用的初次认证窗口接到9个账号/授权维护写入口。不是细粒度能力迁移、完整审计或新的登录系统；旧require_admin必须仍在有效依赖树内。

## 明确切换的入口

| 范围 | HTTP method + 模板 |
| --- | --- |
| 用户 | POST /user/；DELETE /user/{user_id} |
| 角色 | POST /role/；PUT /role/{role_id}；DELETE /role/{role_id}；POST /role/{role_id}/bind_resources |
| 资源元数据 | POST /resource/；PUT /resource/{resource_id}；DELETE /resource/{resource_id} |

管理读取、文章、上传、AI目录与其他已有管理操作保持原守卫。没有新增用户更新、角色分配或恢复HTTP入口，也没有Agent写工具。

## 实现契约

- require_recent_admin先依赖require_admin，随后仅用access Cookie及服务端AuthManager校验当前Redis中的活动access token和签名auth_time。近期结果用户ID必须与旧守卫验证用户一致。客户端时间、用户ID、Header和请求体不作认证证明。
- 复用 AUTH_STEP_UP_MAX_AGE_SECONDS，默认600，允许60–3600。抽出无HTTP依赖的共同配置读取供identity与admin复用；identity原状态码与行为不变。无效配置固定503，不回显配置内容。
- AuthManager.get_recent_session_context严格验证auth_time为正整数且非bool，sid为非空有界字符串，主体为规范ID；不把字符串/浮点值隐式转换成有效认证时间。时间边界保持既有语义：age<=窗口，未来最多60秒偏差。调用者max_age_seconds也须合法整数范围。
- 缺少/陈旧/形状无效的近期证明，已验证管理员返回403、AUTH_STEP_UP_REQUIRED及“此安全操作需要近期登录，请退出后重新登录再试。”。使用403使现有客户端不将它自动当作access过期刷新并重放写请求。匿名/非管理员仍由旧守卫先拒绝；依赖失败不得放行，不泄露token/数据库错误。
- 普通refresh继承原auth_time，不构成新认证；重新完成已有登录会建立新时间并可恢复敏感维护。不给老token伪造当前auth_time，不自动重试或回退弱校验。
- 复审已用实际AuthManager/内存Redis复现旧refresh对null/string/float认证时间的隐式转换。刷新必须先严格识别原正整数及未来偏差；缺失、null、bool、字符串、浮点、非正或超未来偏差值统一继承为0（无近期证明），继续允许普通会话刷新但不能变成新初次认证。有效旧整数原样继承，陈旧proof不续期；畸形access/refresh整轮前后都须拒敏感写入。
- schema-only门禁除原40项require_admin集合，还要严格比较上述9项近期守卫集合；漏挂、额外启用、重复注册或动态遮挡均失败。

## 验证与交接

基线先在owned MySQL/Redis与真实AuthManager/Cookie/HTTP复现旧auth_time仍能改角色；另记录字符串/浮点auth_time的隐式转换。实现后使用同类隔离库、合成用户与现有登录/刷新/注销流程验证9路陈旧拒绝/零业务写、近期放行、刷新不续期、重新登录恢复、注销/禁用/角色撤销、读取兼容、配置/Redis/MySQL失败及原最后管理员409。

离线窄测负责严格类型/边界与配置兼容；真实MySQL/Redis负责当前会话和无写入证据，不以替换get_current_user的测试当成真实登录。完整API、原MySQL/Redis链路、schema契约检查及只读复审通过后中文本地提交。更新同题博客、计划/交接与实证；不推送部署或发布。

本轮不读业务配置/密钥/账户、不调用模型，不配置Clash Verge或系统代理，不重启现有3030/8032/3033。生产目标盘点/真实恢复/细粒度可授予集合/审计仍独立待，阶段A与P1/A–D不因这9项迁移自动完成。Claude Code/claude-ds接手须保留这些切换时点及未迁移范围。

## 2026-11-17 本地结果

完整API967、真实owned两库/Cookie/Auth/HTTP12、原整栈24、工作区Web310单元通过；schema门禁40+9及新OpenAPI导出无漂移。复审P2刷新proof洗白已修，新整轮与旧函数独立内存负对照有真实库证据；新schema单测污染父模块导致首次967失败，改子进程隔离后完整通过，均保留失败。[实证](../evaluations/admin-step-up-2026-11-17/README.md)记录15源SHA/冻结树/执行边界与清理，判官无剩余确认阻断。原博客案例同题补近期认证章节及签名前提、双尺寸明暗预览通过未发布；未部署或更改生产认证策略。
