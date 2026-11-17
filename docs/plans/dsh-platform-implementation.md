# DSH 平台分阶段实施计划

日期：2026-11-12。状态：用户于 2026-11-12 授权在 `zxy/dsh-platform-foundation` 开始阶段 A；其余阶段仍按下表逐项实施和验收。执行前读取[评审](../reviews/2026-11-12-dsh-architecture-review.md)、[实现规范](../architecture/dsh-implementation-standard.md)、[架构总纲](../architecture/agent-module-platform.md)和当前 handoff。实施时保留工作区其他任务修改，不把本文视为部署或生产发布授权。

## 本地验证入口（2026-11-12）

用户进一步授权继续开发到可本地验证。已提供 `corepack pnpm dev:blog-qa` 与 `/aigc/blog-qa` 页面，使用独立 loopback API、两名合成开发用户、三篇合成文章、SQLite 验证账本、真实固定 SDK 与真实模型。详见[本地说明](../../tools/dsh-blog-local/README.md)。此入口不导入生产应用/配置，不改生产数据库 schema，主 API 未开放 Agent 运行。

现已进一步接入正常站点的真实 Cookie/Redis 会话、账号与公开博客查询、全局模型目录，默认启动命令切为站点模式（3030/8032）；三篇合成数据使用 `dev:blog-qa:fixtures`。详见[站点验证说明](../development/blog-qa.md)。已用用户授权的现有管理员正常登录，完成真实博客问答、引用、令牌刷新、取消和退出验收；使用显式本地测试Qwen，旧目录DeepSeek的解密配置仍未提供。

这是供开发机验证 B/C/D 核心交互的独立切片，不代表正式阶段已整体通过：MySQL 账本、Redis 准入、真实会话授权、Linux 隔离、内部 TLS 与生产故障矩阵仍须完成。macOS 回环沙盒不能替代 Linux 地址与PID硬限制。

## 设计约束与阶段映射

2026-11-17补A的[旧适配公开边界](../development/adapter-public-boundary.md)：全src门禁200源、非组合根私有业务入边11→0，唯一组合根六私有装配边；identity/files新public、原类/归一化/存储身份保持，AI只读metrics getter不导出可变collector/仓储/router，惰性组合根返回原AI路由并保legacy→v1顺序，SQL兼容别名移除后检查归属repository。19源树775aa9b132c49053d048c7d2e0a1ce613449b552，API1059/71.057秒、native17/3.187、原24/16.953、Mac SDK三库六合成34.281秒、独立20/3/3及root41真树CLI通过；root-star静态假绿保红修拒，fresh JSON/Prettier误比仅修测试，原OpenAPI/catalog字节不变。见[实证](../evaluations/adapter-public-boundary-2026-11-17/README.md)。Linux236源/283payload十二生产变动绑定、原49/9/5/SDK6合成过supplier0/legacyfalse，原67资产与SDK封包不变无重封；新上传/装配HTTP在Mac而非guest。四可定位DB根/成功SDK根/VM回收，旧live/三失败根保留；原80/123/main210加1删/服务与UI/素材失败保持。博客03三段同题/原图/双尺寸明暗过未发布，无Web源变不重跑Web/Worker整套。仅中文本地保存，无push/deploy/pub/代理/付费；间接Auth/controller/type/任意反射、完整grant与原生产门槛未完成，A/P1/A–D继续待。

2026-11-17补A的[后端导入边界](../development/module-import-boundary.md)：全API198源盘点后，AST门禁自动扫九业务目录89+core25，四私有直接边与一组合根回流迁为公开facade及显式registry注入；SSE原对象/原两工具v1与OpenAPI/catalog字节保持。API1048/57.144秒、真实能力17/3.163、原stack24/17.240、Mac固定SDK三库mTLS六合成34.368秒、checker15/root27真树CLI及独立review过，见[实证](../evaluations/module-import-boundary-2026-11-17/README.md)。开发五类静态假绿均保红修绿；旧native patch工厂测试改正确注入并补真实HTTP503；首次SDK runtime误在HOME被原守卫拒，迁自有目录后通过，不改原失败ACK。Linux234源/281payload仅七生产文件变，原49/9/5/三库SDK6过supplier0/legacyfalse，67资产/SDK封包全同无需重封，新15/17不冒称guest。门禁只证明modules/core直接边，11适配私有及旧Auth/controller/type间接依赖仍待，非全仓或Python沙箱。博客03同题双尺寸明暗过未发布，7可定位DB根/自有SDK根/VM回收、旧根及新失败TLS证据根保留；原服务/80/123/main210加1删保持。无Web生产源/契约变化不重跑完整Web/Worker，原UI/素材失败不动；中文本地保存，无push/deploy/pub/代理/付费复跑，A/P1/A–D未完成。

2026-11-17补D的[当前会话能力投影](../development/capability-projection.md)：新增只读GET /auth/capabilities，真实会话/当前账号与角色、复用九维护policy；匿名仅公开read，坏Cookie401/依赖503不降级。十登记predicate/成对账号与family摘要、0..15秒受access及近期寿命限制，no-store，非写权限凭据。Provider按消费者/可见性启停，共享请求、账号/epoch/family隔离、请求开始单调TTL/同步过期裁剪、同值续查不重挂、失败撤销移除，公开导航保持。开发中匿名携管理predicate显示P2经DTO/client配对与子集约束修正、修前红修后绿，真实project不产此值且写服务仍独立拒绝。31源树d6f9a8a3b7fa95e6a8f6690ccd4405f5a9e727a8，API1032/Worker164、新native16及旧20/19/16/12/16/33/24通过；工作区Web337单元过但原两UI失败保持，干净非Git源码完整Web320/类型/构建/SSG/全部预算过，CSS49578/51200B。浏览器双尺寸12为真实Provider/Slot+合成GET/受限贡献，不称在线三库E2E。Linux234源/281payload/67资产绑定、原49/9/5/三库SDK6合成链过supplier0、legacy per_run=false；SDK离线重封38522成员仅catalog变，固定依赖不动，新16在Mac而非guest。见[实证](../evaluations/capability-projection-2026-11-17/README.md)。博客03同题修订六ID/十重点/原图末行深色对比修正、双尺寸明暗过未发布；17 owned DB根/VM/源码快照回收、原服务/80/123/main210加1删保持。中文本地保存，不push/deploy/pub/配置代理/付费复跑。无新Agent工具/受限产品入口或grant，生产/官方四题/细粒度授予/恢复等仍待，A/P1/A–D未整体完成。

2026-11-17补A的[角色资源引用边界](../development/admin-binding-references.md)：真实owned基线确认旧管理员HTTP可写失联role/resource及0/负值、bool/string coercion，重复ID503。现strict资源INT32正整数/传入最多500/首次去重/空清空，server frozen tuple在原actor授权后同RC UOW锁读role及升序全部resources，任一缺失404且旧集合/audit不变，manager用同tuple；raw内部None和无FK限制明确保留。首次signed64 OpenAPI舍入经最小反例确认，按实际signed INT列改2147483647；真实边界成功/next值422，OpenAPI仅绑定bounds/description与TS注释改变，catalog/两工具/Skill/bundle逐字不变。最终12源树21f875c552028d7401b8cade5e8d8ae2aec19d49，API1021/新native20与旧19/16/12/16/33/24、contracts6及独立review通过；三种并发指定thread实际LOCK WAIT，真实中途INSERT/audit/final注销/过期回滚及commit未知不重放保持。Linux233源/280payload绑定、67资产及固定SDK与上轮完全相同，原49/9/5/三库SDK6过且supplier0、legacy per_run=false；新20在Mac owned库而非guest。见[实证](../evaluations/admin-binding-2026-11-17/README.md)。新引用案例四ID/一透明图/1280与390明暗过未发布，15可定位DB根与VM组/root清理、原80/123/main210加1删/服务保持。仅中文本地保存，不推送部署/配置Clash/恢复付费；完整grant可授予集合和生产恢复等仍待，A/P1/A–D未完成。

2026-11-17补A的[九项管理服务当前授权](../development/admin-management-service.md)：旧40/近期9/audit9守卫保留，九HTTP改调用真实access service，固定本站能力/类型，实际单连接RC锁角色目录→actor账号/绑定后重读当前授权，实际commit前再验Redis与认证时间；合法自降权及最后管理员409保持，内部raw None与Redis至commit窗口明确保留。精确40+9+9+9及execute实际注入receiver门禁、原两工具/Skill/schema不变，无Agent写权限。最终33源树faab9674b3c4c6e2e9020f7e6cdd5a43cfb7bac6、API1007/新owned19及旧16/12/16/33/24过；首次锁等待观测失败原因为未确证，宿主采样对齐原测试后19和三类各三次过，生产锁未改。Linux232源/279payload逐字绑定、原49/9/5/三库SDK6场景过且供应商0；新catalog使旧SDK封包正确拒绝，原配方离线重封且固定二进制/其余资产及旧缓存不变，legacy per_run=false。见[实证](../evaluations/admin-management-2026-11-17/README.md)。管理员案例七稳定ID/两原透明图双尺寸明暗过未发布，19可定位DB根及VM组/根回收、原80/123/main210加1删/服务保持。未推送部署/配置Clash或恢复付费评测；完整授权可授予范围/生产恢复等仍待，A/P1/A–D未完成。

2026-11-17补A的[9项管理变更同事务审计](../development/admin-transaction-audit.md)：新兼容表与server引用，六表InnoDB/DML前核验，业务/audit共同commit、插入失败九路回滚，commit未知不自动重试。内部None/拒绝/完整历史与保留仍未迁移，context不是新授权。最终API991、新原生审计16、近期12/原24/恢复16/原MySQL33、schema/deploy及OpenAPI无漂移过，见[实证](../evaluations/admin-audit-2026-11-17/README.md)。集成发现Linux源码白名单漏3auth，补为226及直接导入/initializer/转导出来源门禁；复审顺序与namespace/自证测试/检查器问题已修，最终archive13过。两次无official实际Linux49/9/5/组件SDK/正式三库六场景通过且供应商0、273payload/67资产一致；最终host gate另对同字节226源通过，不假称VM运行后来host代码，旧per_run=false不补真。原案例同题6ID10重点/新增透明审计关系图双尺寸明暗过未发布；原80/123状态/服务保持，仅中文本地保存。服务层capability/可授予范围/生产恢复与完整审计运营仍待，A/P1/A–D未完成；无代理/付费复跑。

2026-11-17补A的[9项管理写近期认证](../development/admin-recent-authentication.md)：用户2/角色4/resource3先旧require_admin再活动Cookie严格初次认证，默认600秒且复用identity既有配置；40+9精确schema门禁，读及其余31项未切换。复审P2旧refresh把null取now/str,float转int已修为无效proof归0，有效整数/陈旧时间原继承；真实owned两库/Auth/Cookie/HTTP12、旧stack24、最终API967与工作区Web310单元过，见[实证](../evaluations/admin-step-up-2026-11-17/README.md)。完整API首跑因新schema测试污染父模块失败，隔离子进程后通过，保留失败及旧refresh内存负对照6子例失败；新导出OpenAPI无漂移。原博客案例同题补第4节，5稳定ID/8strong、双尺寸明暗过未发布；原80/123dirty与main210/1/现有服务保持，仅中文本地保存。时间门槛不替代可授予集合/细粒度能力/完整审计或生产恢复，A/P1/A–D未整体完成；不配置Clash或恢复付费复跑。

2026-11-17补阶段A的[最后启用管理员事务保护](../development/admin-recovery-invariant.md)：统一用户status/delete/角色替换、角色code/delete，单连接RC和角色目录锁，最终归零则整笔回滚。原HEAD临时MySQL复现四类漏洞；最终完整API953、native16、原MySQL33及MySQL/Redis/认证HTTP24过，原13并发组保实际LOCK WAIT断言连续三次过。shadow40/旧管理员守卫保持，未新增用户维护HTTP/Agent写能力，见[实证](../evaluations/admin-recovery-2026-11-17/README.md)。案例稿与透明流程图双尺寸明暗过未发布；原80/123dirty/服务保留，仅中文本地提交。此处只保护启用角色不归零，近期认证、可授予集合、审计、生产目标盘点及真实恢复仍待，阶段A/P1/A–D未整体完成；Clash配置与官方付费复跑不在范围内。

2026-11-17解除本分支CSS预算问题，[协议与维护](../development/web-css-budget.md)/[实证](../evaluations/web-css-budget-2026-11-17/README.md)：原工作区52362B、独立HEAD51836B均超原51200B，并非仅dirty。10张内联PNG无损RGB合并保alpha/metadata/热点，Chrome两尺寸四底色与ImageIO逐像素、CSSOM12规则/库inline均过；工作区降50104B、最终源码49578B，18 CSS中17 SHA原样，未改预算/资产范围。新露UI门禁的2任务源改BaseUI；最终source-only树完整Web292/所有后续门禁通过，当前工作区309/预算过但原dirty UI2处仍失败，原素材format失败保持。新增前端案例与ECharts透明数据图双尺寸明暗过未发布；两自有源码快照安全清理，原80/123dirty/服务保持，仅中文本地保存。后续继续A恢复边界等剩余本地核对；生产/官方四题/人工等门槛不自动放行，不配置Clash/付费复跑。

2026-11-17完成D首个[有限页面贡献](../development/page-contributions.md)：blog静态声明原公开博客问答入口，AI宿主控制sidebar/rail、最小上下文与scope，应用根收集并做构建前真实注册检查；公开入口不授予运行权限，未知能力拒受限加载。注册22/挂载17、root29、纯源码快照113+typecheck过，真实页面双尺寸8个合成HTTP场景过；独立Suspense的3项修前失败/修后通过，判官复验无剩余确认阻断。完整Web309及类型/构建/SSG/manifest过，最后CSS预算整体失败/原素材格式失败保持，[实证](../evaluations/page-contributions-2026-11-17/README.md)记录22源/清理。其他slot/write action、显示能力服务与多项目仍按实际需求验收；生产/官方四题/人工等门槛未放行。博客03增边界与一透明图、双尺寸未发布；原80/123dirty保持，仅中文本地保存。用户确认只复用Clash Verge现有转发，不配置代理或调整节点，不再等另一代理资料，也不据此付费复跑。

2026-11-17补齐D的[正式问答前端消费](../development/agent-formal-web.md)：formal/site沿正常登录，SSE/GET/cancel共用可信原文链接归一化；认证世代及每次发送立即生效的运行世代拒绝旧恢复/刷新/取消覆盖新账号或同账号新题。真实固定SDK/三库原路由导出成功和取消安全合同（供应商0、9.263秒、ACK全过），实际组件桌面/手机8场景合同回放通过，明确不是浏览器在线三库全链路。API938、纯源码快照64项及类型检查通过，Web264等通过但CSS预算使整个gate仍失败；根素材格式问题保留。[实证](../evaluations/agent-formal-web-2026-11-17/README.md)记录源码与清理。A的影子基线/本地盘点已交付，不重复；下一步D有限slot/contribution与卸载/错误隔离仍待，生产、官方Linux四题及人工/模型版本策略等门槛保持。博客04同题补恢复边界、两透明图及双尺寸预览通过未发布，原80dirty保持，仅中文本地保存。

文件命名、缩进、测试布局以[工程文件规范](../repository-conventions.md)为准；模块权限、页面贡献及跨项目接入以[扩展契约](../architecture/module-extension-contract.md)为准。P0 是历史原型，A–D 对应 P1，E–F 对应 P2，G 对应 P3，不混用优先级 P1 与阶段编号。

阶段 A 首批已在本地实现模块注册、严格工具 schema、公开读取策略和 HTTP/工具共用查询；完整范围及验证见[分支交接](../handoff/branches/zxy-dsh-platform-foundation.md)。管理员入口源码盘点、40项显式基线及旧/新影子比较已在本地实现，见[迁移说明](../development/admin-policy-migration.md)；本地profile的真实角色/resource只读快照核对已完成（单启用管理员、resource目录为空，无重复/失联绑定），生产目标核对、恢复路径和逐入口能力迁移仍未完成，阶段 A 未整体验收；Worker/运行准入保持关闭。任务归属：A 增加模块权限和声明验证；D 按实际页面引入有限 slot/contribution，覆盖卸载、错误隔离和能力加载；G 在第二项目启用前完成项目隔离与 adapter 契约测试。格式配置统一作为独立维护任务，不与功能改造混做。

## 阶段C首批：生命周期与历史事务（2026-11-15）

本地新增MySQL agent_runs声明、接收/幂等/领取/租约/终态/对账仓储，以及AI模块同UOW历史接口。详见[账本说明](../development/agent-run-ledger.md)。普通聊天兼容旧AI表并隔离Agent会话；已修复重音等价ID绕过。未连接真实数据库执行DDL，未替换现有SQLite本地入口或开放生产准入。

C仍未整体验收：来源交付/工具账本、累计预算、正式网关会话重验、Worker接线和真实MySQL故障矩阵继续实现；本地SQLite事务测试不代替InnoDB行锁或迁移验收。B的Linux隔离也仍独立放行。

## C2 网关与来源预算（2026-11-15）

本地新增工具/来源持久化journal、4次工具/4次模型/64KiB完整响应预算、三受众摘要凭据、服务身份、live hooks与来源回执/提交重验，见[网关说明](../development/agent-run-gateway.md)。最终历史事务通过强制prepare回调连接这些检查；鉴权hook显式复用当前UOW，真实MySQL当前读/锁顺序仍待验。未注册新HTTP、派发Worker或修改现有SQLite协议，生产关闭。

C3继续正式会话/准入、路由与派发、版本化协议和真实MySQL故障矩阵；本库成功不代表阶段C或A–D整体验收，亦不替代B的隔离/token/资源验证。

## C3 首批：当前会话与真实MySQL（2026-11-15）

已落实正式UOW READ COMMITTED、同连接非锁定当前账户/角色查询、易失会话绑定/白名单，以及必须复用UOW的source_reader。一次性本机MySQL8.4.13通过13项真实数据库测试，默认API518项通过，见[验证说明](../development/agent-run-mysql-validation.md)。不更改旧业务默认隔离，不连接业务配置数据库，临时服务/数据已回收。

仍未组合正式HTTP/dispatcher/Worker协议，也未验真实Redis/模型/SDK端到端或数据库进程崩溃恢复。C3、B及A–D不得按首批通过整体验收，下一步继续这些实现与验证。

## C3 后续：派发控制与私有V2协议（2026-11-16）

新增single-attempt dispatcher、固定HTTPS Worker client与显式私有V2回调工厂，根request关联字段及后端生成内部schema；说明见[派发控制](../development/agent-run-dispatch.md)。只有确认领取事务提交才发start；未知确认只inspect原execution，不能确定则中断并尽力取消。账本终态不由Worker ACK自报决定。私有factory未挂公网应用，旧SQLite/v1入口保留。

新测试覆盖真实Ledger/Gateway回调、受众/根请求、确认丢失/取消顺序、并发与关停；自有loopback TLS验证信任/主机名拒绝，临时MySQL现15项通过。Worker v2服务/SDK适配/取消tombstone、真实Redis准入、部署TLS身份与Linux/崩溃矩阵仍未实现/验收，不能宣称已完成正式Worker接线或C3整体验收。

## B/C3 本地Worker V2服务与SDK执行（2026-11-16）

已新增持久启动/取消记录、mTLS控制服务工厂、固定SDK进程执行与三受众网关client，见[Worker V2说明](../development/agent-worker-v2.md)。真实0.2.2-rc.1 SDK在自有macOS loopback沙盒跑通Worker HTTP重复start去重、3次合成Messages、两工具、UUID回执与根messageId/turn结果，owned group/home清理；取消先到的迟到start被拒绝。产品Skill v2独立声明并保留v1兼容，根check/CI加入普通Worker协议测试。

这证明本地协议与进程控制，不是Linux隔离、真实模型语义、真实Redis/业务DB组合或无人值守崩溃恢复验收。持久记录容量有界且当前需离线核对清理，崩溃锁/未知孤儿失败关闭不重放；生产仍关闭，A–D未整体验收。下一步落实真实Redis准入与API组合、真实模型质量及B资源/服务身份/崩溃矩阵。

## B/C3：Linux 正式 API 与三库合成组合（2026-11-17）

显式stack profile已在同一原生Linux连接正式API/真实会话、MySQL/Redis/MongoDB、mTLS Worker与固定SDK，沿原六场景验证成功恢复、取消、TLS断流、会话撤销、撤文及Worker崩溃。见[协议](../development/agent-linux-stack.md)与[最终实证](../evaluations/agent-linux-stack-2026-11-17/README.md)。原49/九隔离/五网关保持，正式每任务512MiB/64、六SDK/十合成模型请求/四工具，父补偿用明确的自有活进程正对照证明，不把SDK自动停止算父实际杀活SDK；未知ACK仍保额。

本轮补Linux正式API/三库的合成组合缺口，不是生产或真实供应商Linux验收。8GiB测试VM不代表2GiB目标容量；人工语义、生产模型版本策略、目标库迁移/数据/备份恢复、TLS运维与无人值守回收继续待验。B/C3/P1/A–D仍未整体完成，不开放生产、不改现有页面模型profile。

## B/C3：Linux 官方通道实现与未通过验收（2026-11-17）

已实现同guest正式API/三库/SDK经特权串口到host官方proxy，原opaque计数/持久预占/原wire生成保持；任务不能见或继承控制设备，host key不入guest。详见[协议](../development/agent-linux-official.md)与[完整失败记录](../evaluations/agent-linux-official-2026-11-17/README.md)。本地DNS有界复用已保存594a3bf，API905/Worker164/Mac合成6及独立复审通过。

四次独立原生官方四题仍未整套通过，最好的一轮前三题完成、D生成超时；最后同源复验A/D计数超时，已停本轮付费复跑。不能跨run拼4/4、宣称抗注入或人工通过。未知请求保预占/null usage，所有Worker/fixture与VM/broker/group/root回收确认；外网间歇超时具体归因未定，不增加重试或放宽预算。稳定转发、完整四题/人审及原生产门槛继续待，B/C3/P1/A–D仍未整体验收；不改现有页面/模型/代理全局设置，不开放生产。

## 交付顺序

| 阶段 / 建议 PR | 修改边界 | 产物与放行条件 | 失败时处理 |
| --- | --- | --- | --- |
| A：模块与权限基础 | API core/auth、静态 registry、blog schemas/public service、contracts 导出 | 主体与能力声明；旧/新策略对照；HTTP 与工具共用公开查询；工具 JSON Schema 导出和目录检查 | 旧接口保持兼容，Agent 开关关闭 |
| B：Worker 协议与模型适配 | apps/agent-worker、ai/model_proxy、隔离测试部署 | Node SDK 版本固定；实际生效工具清单只有两项；真实模型工具选择/参数流/停止原因验证；Linux 进程、文件、出站隔离报告 | 保留 P0 与业务契约，修复适配或更换引擎，不退回无隔离执行 |
| C：持久化运行与网关 | agent_runtime、MySQL 兼容新增 schema、ai 历史公共事务接口 | 幂等、代次、租约、撤销、来源记录、终态提交、对账；Worker/API 契约集成测试 | 关闭准入；对账残留运行，保留新增表，旧聊天继续工作 |
| D：登录用户只读内测 | Web ai 模块、公开 blog-qa API、能力探测 | 三个 API、V1 SSE 最终答案/来源、状态恢复、白名单及配额；完整故障矩阵通过 | 关闭 Agent 能力并撤销运行；公开博客/普通聊天正常 |
| E：个人草稿 | blog draft 服务、作者映射、工作台 | owner 范围、幂等、版本冲突、草稿与公开数据隔离；工具仅 draft 能力 | 关闭草稿写工具，保留草稿供人工恢复 |
| F：受控发布（独立放行） | 版本集合、公开快照、outbox、全部旧读写入口与发布工具 | 迁移/停写/增量对账演练，确认消费、幂等、跨库故障、删除竞争和最低回滚版本通过 | 关闭写入，暂停消费者并对账；只能回滚兼容公开版本指针的 API |
| G：扩展 | 评论建议、只读运营、经审查 MCP | 每个模块独立权限/数据/负载验收 | 单模块停用，不影响博客读链路 |

A 与 B 可以独立实现，但 C 必须在接口与模型适配契约稳定后集成；D 依赖 A/B/C 全部通过。E 不依赖开放发布，F 不能借 E 完成而自动启用。每个 PR 更新规范中的“待实现”状态及准确证据链接，不删掉未完成的验收条件。

跨项目身份/业务接入另依赖[统一登录与隔离规范](../architecture/federated-identity-and-isolation.md)的 ID/AU/DT 矩阵；不能以本表的单项目测试替代双产品、双工作空间与用户委托验证。

## 必须通过的验收矩阵

| 范围 | 场景 | 预期结果 / 验证方式 |
| --- | --- | --- |
| 模块 | 重复 ID、模型工具别名冲突、依赖环、缺能力、Skill hash 或 bundle 漂移 | 构建/启动检查拒绝；生成契约与源码一致 |
| 认证 | 匿名发起、失效 Cookie、注销、账户禁用、Redis 故障 | 新 run 或下一次调用拒绝；不降级访客 Agent；普通访客聊天另测兼容 |
| 授权 | A 读取/取消 B 的 run；绕开 HTTP 直接调用模块服务；伪造 owner | 拒绝且不泄露对象存在性；服务层确实检查资源范围 |
| 撤销 | 运行中撤角色、关工具、取消后延迟回调 | 下一次调用/结果提交拒绝；不能由 Worker 缓存权限继续完成 |
| 内部网关 | 只有 run token、只有 Worker 凭据、错误 audience、旧 generation | 均拒绝；模型参数不能指定执行身份 |
| 博客 | 软删除、缺正文、空搜索、搜索命中但未读取、过长正文、稀疏候选 | 无泄露，无无界扫描，返回截断信息，空来源由服务端固定回答 |
| 引用 | 伪造 ID、外部 URL、Markdown/HTML、读取后删除/修改文章 | 拒绝无效来源；答案纯文本；来源变化要求重试；链接来自服务端 |
| SDK | 斜杠问题、根/子会话混杂、重复终态、max-tokens、未知停止原因 | 纯 prompt 处理；只提交匹配根 turn 的成功且校验后的结果 |
| 模型 | 跨帧参数、非法 JSON、超大输出、错误工具 ID、隐藏额外调用 | schema/字节/调用预算生效，失败明确；真实模型和 fixture 分开报告 |
| 生命周期 | 总时限、取消、SIGTERM 无响应、Worker 崩溃、API 重启 | 先撤权再回收进程组；租约对账 interrupted；无残留进程/目录 |
| 派发恢复 | 请求已送达但确认丢失、API 重启失去凭据 | 不重复启动；查询原 execution 或 interrupted；新重试使用新 run |
| 来源回执 | prepared 未回执、重复回执、hash 不符 | 未 delivered 不可引用；幂等确认，摘要冲突拒绝 |
| 页面扩展 | slot 版本冲突、模块关闭、项目切换、加载失败 | 构建拒绝不兼容；卸载清理；错误仅影响单个贡献 |
| 跨项目 | 相同资源 ID、跨项目 token、缓存/回调/幂等键 | 默认拒绝并隔离；未完成迁移不得启用第二项目 |
| 发布传播 | API 已撤回但静态 HTML/CDN 尚存在 | 标记传播未完成并执行失效，验证直达页面 |
| 幂等 | 同用户同键重复、不同参数同键、不同用户同键、重复派发 | 原 run 409/独立冲突码/账户隔离；不重复模型执行 |
| 终态 | 完成与取消并发、提交后 SSE 丢失、存储提交失败 | 只有一个终态和最终消息；GET 可恢复已提交结果；失败不伪造成功 |
| 资源 | Redis/MySQL/模型/Worker 不可用，预算耗尽 | 有界失败；不放宽鉴权、配额；博客健康不依赖 Worker |
| 隔离 | 读取宿主/其他 run home、外网/DNS/重定向访问、启动未批准工具 | Linux 实际拒绝；不把 profile 白名单当网络隔离证明 |
| 兼容 | 普通聊天、用户 Skill/persona、MCP、博客分页、SSG/canonical、首页 ICP | 保持现有行为；blog-qa 会话拒绝普通聊天编辑路径 |
| P2 写入 | 跨用户草稿、过期/重放确认、参数变动、并发版本、消费者中断/重放 | 不越权、不重复发布，上一公开快照可读，失败可对账 |

真实模型评测集至少包含有答案、无答案、多文章冲突和正文提示注入；记录固定输入、期望来源、模型版本、预算、实际输出、失败样本和人工语义判定。不得用 fixture 成功率替代语义准确率。涉及公开性变化的答案提交仍有现实时间边界：提交后撤回文章需在历史展示时隐藏失效链接；已经交付的文本无法撤回，不能承诺持续保密。

## 验证命令与新增检查归属

现有命令如下，按改动范围执行。使用仓库指定 Node/Corepack，不使用 Codex 内置 pnpm；脚本内部调用 pnpm 时也要确保 PATH 正确。

```bash
# API / schema / 公开契约变化
corepack pnpm check:api
corepack pnpm -F @sun-world/contracts generate
corepack pnpm test:contracts
corepack pnpm check:api:deploy-schema
# Web / AI 展示变化
corepack pnpm -F @sun-world/blog typecheck
corepack pnpm test:ai-ui
corepack pnpm check:web
# 合并实施 PR 前按影响范围扩展
corepack pnpm format:check
git diff --check
```

P0 实验复跑用 `./tools/dsh-blog-p0/run-local.sh`，仅支持说明中的 macOS 条件，安装阶段需要包仓库；不是生产验收命令。A 增加模块依赖/声明/生成产物检查，B 增加 Worker 测试和 Linux 隔离验证，C 增加数据库集成及故障注入；对应命令在实际 package/script 添加后才写入根 `check`，本计划不捏造已存在脚本。

完整实现集成后运行 `corepack pnpm check`。需要部署时再检查当前 Git 状态、镜像与 schema、关停方案及生产首页/API；当前本地实现按影响范围运行检查，记录已有共享工作区门禁失败，不把定向测试通过写成全部通过。

2026-11-17本机Linux环境增量：原生VZ固定2CPU/2GiB、无NIC/disk/share，在实际Linux6.8.0-147/Node24.17观察cgroup2与四namespace，原49项协议零skip、正常停机/owned组/运行根回收通过；真实双SIGTERM目标130及清理通过。宿主归档/监督器18新回归、API814与独立18通过，前四次失败安全记录保留。见[协议](../development/agent-linux-vm.md)与[证据](../evaluations/agent-linux-vm-2026-11-17/README.md)。环境boot可验证不代表B逐run memory/PID/filesystem/合法API放行且任意网络拒绝已实现，后者为下一步；真实SDK未在本guest运行，人工四题pending、版本生产决策/TLS/目标库备份等仍独立待验收。博客04同题补边界并完成1280/390预览，未发布；保持原dirty与现有服务、不推送部署。

## 迁移与回滚清单

2026-11-17后续已补[逐run资源/文件/PID隔离](../development/agent-linux-containment.md)：固定cgroup2与bubblewrap、实际ProcessRunner新同步containment所有权、整树stop/原组gone/release后删workspace，预spawn清理失败保pending/并发槽。原生37源/六资产九情景与原49协议零skip通过，含真实512MiB OOM/64task EAGAIN、cross-run FS/7ns/capability、setsid cancel/deadline及未知叶子/新factory拒旧树。API818/31.119秒、Worker116/9.318秒及判官复审通过，P2无效handle晚校验/fixture半写可见已修，开发失败与cold SIGABRT不误作UV定因。[证据](../evaluations/agent-linux-containment-2026-11-17/README.md)绑定53源；下一步合法网关通道及真实固定SDK在Linux组合/容量验证，完整B仍false，无NIC不是允许策略。人工四题/版本生产策略/TLS/目标库备份等继续独立待验收，P1/A–D未完成；博客04同题更新/1280-390预览、未发布，其他80dirty/旧handoff与现有服务保留，不推送部署。

1. 新增兼容 schema，单独记录真实结构检查与 DDL 部分成功恢复办法；不开功能、不收缩旧列。
2. 发布 API 的 registry、查询和运行控制代码，Worker 部署到隔离环境，报告协议和 bundle hash。
3. 本地只读显示能力探测已实现，不能据此开放Agent；模型与 Linux 正式验证通过后再独立启用指定账户；观测冷启动/峰值内存/公开博客延迟，不以 P0 单机样本作容量保证。
4. 关停演练先停止准入，拒绝新工具/模型请求，取消运行并回收 Worker；API 旧业务继续可用。
5. P2 发布前清点所有旧入口（管理页面、HTTP、SSG、CLI、开发发布 Skill）；任何绕过版本发布服务的入口未迁移，发布开关保持关闭。
6. 每次交接保存本阶段范围、变更、命令、实测结果、阻塞及下一步；Claude Code / `claude-ds` 接手必须读取本规范与本计划。

## 尚待实施中确定

- Linux Worker 的实际部署位置、内存/PID/token 硬上限与并发容量：由 B 的报告决定，作为未来 A/B 的输入，本分支先实现 A，B 仍须单独验证。
- 现有角色/resource 数据到 capability 的精确迁移：A 先做只读盘点和管理员基线，不猜测生产行内容。
- 内部 TLS/服务凭据签发与轮换、诊断保留期：D 开放前完成运维配置及演练；本地开发可用独立测试凭据，禁止导入生产密钥。
- 正文迁移总量、版本基线回填时长、最低回滚镜像：F 前实测；不能提前承诺无停写迁移。

## 2026-11-16 模型预算与真实评测增量

在真实固定SDK/三库整栈之后，已实现每run四次模型请求的持久输出token/响应字节预占、canonical输入字节累计和独立actual/unknown计量。真实keyless qwen38_27b固定四题覆盖有答案、无答案、冲突、正文注入；保留中间失败样本，未改题或扩大额度，独立agent语义复核不冒称人工签字。具体机制和显式命令见[模型验证说明](../development/agent-model-validation.md)，最终快照实证见分支交接。

B/P1与A–D仍未整体完成：缺已验证输入tokenizer/总输入token硬限、上游不可变模型版本、人工语义验收及Linux memory/PID/network硬隔离。留存与离线回收、旧库升级/真实崩溃恢复矩阵和生产TLS仍按原门槛推进，不挂main、不切旧页面、不以本地四题放行生产。

2026-11-16后续补充回收失败可定位性：新增固定阶段/错误类别、有界首错与恢复记录、测试宿主私有sink及安全prefix reader，生产控制/RPC/journal不改变。实际SDK目录EACCES探针检查未确认不放槽，细节见[回收诊断](../development/agent-cleanup-diagnostics.md)。旧失败定因与Linux/跨重启诊断留存仍未因此完成。

2026-11-16输入token前置核对：显式无生成探针只观察固定测试模型的metadata和三组合成tokenize响应，不提供通用URL/输入入口；[探针契约](../development/agent-model-validation.md#tokenizer能力探针契约2026-11-16)要求三个验收flag始终false。该Qwen别名的服务端count不能替代锁定版本与模板的验证；托管API可另评估供应商完整请求计数路径，不要求本地部署模型。实际生成路径一致性与持久输入预算仍须验证，不能据此放行B/P1。本机尚无可用Linux容器环境，真实memory/PID/network隔离验收仍缺。

2026-11-16按用户授权接入OpenAI官方API：独立local-only gpt-6.1-sol Responses profile、私密key文件引用、显式Clash回环CONNECT及可信HTTPS DNS，保持Provider public全校验/IPpin/Host/SNI/证书与原预算。实际生成、两次函数调用往返及开发站点真实博客问答/刷新通过，见[接入与实证](../development/agent-openai-validation.md)。修强制工具空调用漏检和sandbox继承repo日志FD的启动崩溃；API667/Worker71通过。一次历史模型代理失败尚未定因，保留失败样本与安全阶段诊断。该站点仍是原SQLite本地入口，不冒称正式MySQL/mTLS V2 OpenAI整栈、完整语义或生产放行；下一步可本地推进官方完整输入计数/持久预算及留存/故障矩阵，Linux/人工与生产门槛不变。

2026-11-16继续完成[官方输入计数与持久预算](../development/agent-input-budget.md)：固定完整wire、单次计数许可、attempt和input两次预占提交，单次16384/累计32768，正式MySQL Gateway与当前SQLite入口均接入；计数失败、确认丢失或实际usage漂移不退款/不重放。API696/一次性MySQL19和独立复核通过，修最终授权线程退出栅栏；官方三组合成计数匹配usage，开发站点三次模型累计3162、文章来源/刷新通过。[证据](../evaluations/agent-input-budget-2026-11-16/README.md)分别标明MySQL模拟上游和SQLite真实模型，未合并为正式V2真实模型整栈结论。原Qwen路径的tokenizer与三个false不变；Linux/人工语义/上游版本策略/已有业务库升级与崩溃/留存回收/生产TLS仍独立未完成。下一步优先补正式V2+官方模型显式验证与留存/故障矩阵，不能以本轮局部验收开放生产。博客05同题更新、预览通过，未发布。

2026-11-16进一步补齐[正式V2+官方模型组合](../evaluations/agent-official-stack-2026-11-16/README.md)：新显式profile保持四题/评分/Skill/45秒/4模型4工具不变，真实三库、mTLS Worker与固定SDK调用官方模型，13次call全部observed、输入累计12142，逐项计数/预占/usage和run累计一致。原六个合成SDK场景、API710及独立43项回归通过，四题端到端语义由主线程与判官分别复核，人工仍pending。修报告input bytes累计漏核导致误绿；官方原实例直接注入，失败预算只记关闭前快照。三库/4组SDK与临时根确认回收，现有SQLite页面保持。Linux、上游版本策略、已有业务库升级/崩溃、journal留存与生产TLS等仍未完成，P1/A–D不整体放行；下一步继续本地留存/故障矩阵，外部Linux与人工资料有条件再验收。博客05局部更新、未发布，其他dirty保留，不推送部署。

2026-11-16继续完成[Worker确认终态留存](../development/agent-journal-retention.md)：30天详情、永久有界精确身份摘要、clock floor及owner3索引存在标记，readiness/start串行清理与显式offline check/apply；不回收needs_reap、不偷旧锁、不删API历史。修mixed迁移索引丢失可重跑与Python六位时间戳不兼容，保留期/容量和RPC不放宽。测试宿主共享中断状态/defer修复嵌套第二次SIGTERM重入，MySQL未确认退出时保留目录。API715/Worker96、独立Node40/Python5、实际SDK/三库六情景及晚Redis关闭栅栏二次SIGTERM均通过，范围见[安全实证](../evaluations/agent-journal-retention-2026-11-16/README.md)。未知孤儿/cgroup/陈旧锁恢复、API历史及账号删除策略、已有业务库升级/崩溃、Linux和生产TLS仍独立未完成，不将本轮视为P1/A–D完成。下一步本地推进已有库升级与实际数据库崩溃矩阵；博客04同题更新未发布，其他dirty保留，不推送部署。

2026-11-16补齐[合成旧结构升级与真实MySQL进程崩溃矩阵](../development/agent-mysql-recovery.md)：两类中央schema裁剪、旧记录/默认值/幂等、部分DDL失败后fresh plan收敛及五种不兼容拒绝；正式29项原生通过。新owned controller登记初始化进程，固定八题逐题SIGKILL同datadir/socket/UUID重启，提交前原子回滚、提交后ACK丢失唯一结果、模型attempt/input/observation预占不退不重放及会话/租约收敛均通过。实际初始化中断与晚关闭重复SIGTERM均130且PID/组/目录消失。修空矩阵报告误绿和两项旧dispatcher测试等待入口而非观察的竞态；API719、独立离线11/dispatcher17及延迟注入2通过，[安全证据](../evaluations/agent-mysql-recovery-2026-11-16/README.md)明确合成旧结构、mock上游、ACK注入与真实进程崩溃各自范围。不是业务旧库快照、在线旧池自动恢复、断电、跨版本或Linux验收；目标库/备份恢复、未知孤儿/旧锁、API历史及账号删除策略、人工语义、上游版本策略与生产TLS仍待，P1/A–D未整体完成。下一步先推进可本地验证的API历史与账号删除边界；博客04同题补充并1280/390预览通过，未发布；其他80项dirty保留，不推送部署。

2026-11-16继续实现[正式API历史删除与账号停用边界](../development/agent-history-erasure.md)：owner/family终态DELETE同事务清理AI问答/反馈/标题与Agent工具/来源/模型详情，新增nullable marker；累计预算/终态/身份摘要和原幂等键永久保留，公开GET404、重复DELETE成功、旧键409不收费不重跑、late回调拒绝。停用账号保留原status0语义并拒绝旧会话，不等同完整账号物理抹除。修初版将可信get_owned一并隐藏导致settle跳过Worker检查与Redis释放的P2；公开隐藏和可信终态控制分离，精确BINARY清理保留可索引候选。API733、原生MySQL/Redis/Auth/ASGI19（新9+原10、含两个实际LOCK WAIT与删除先于settle的真实Redis释放）、迁移29/旧崩溃8复验和独立48通过；[证据](../evaluations/agent-history-erasure-2026-11-16/README.md)区分真实数据库、合成Worker/模型及ACK注入，不冒称新删除的断电验收。历史默认保留至显式删除，自动TTL、跨family管理、全账号/备份/日志清理与UI仍待；Linux/未知孤儿/旧锁、目标库/旧在线池恢复、人工/版本策略/生产TLS仍独立未验收，P1/A–D未完成。下一步本地核验既有连接池在数据库短暂不可用后的恢复，继续追踪旧replacement warning，不预先定因。博客04补删除边界与透明关系图、1280/390预览通过未发布；其他80项dirty保留，不推送部署。

2026-11-16完成[同MySQL连接池失联恢复](../development/mysql-pool-recovery.md)：纯离线及真实SIGKILL均确认旧补建失败丢位置、DB重启后同manager永久等待；现固定空位/PendingClose/同步登记，SQL前一次受控factory、无隐式重连、已发SQL/COMMIT不重放，close拒新但不夺已借UOW。修三个清理中断P2并保未知handle归属/位置；原lifecycle首轮1项unknown结算失败保留oracle，通过预SQL修复后八题全过。最终API758、原生同池4/5kill+原生命周期8/8kill、MySQL29、Auth/HTTP栈19、fresh SDK/真实三库/mTLS六合成情景及独立35+6通过，[实证](../evaluations/mysql-pool-recovery-2026-11-16/README.md)区分原生与offline close faults，不反推历史warning初因。67项source/index摘要，owned资源回收，当前页面/供应商/业务配置不变。下一步核对账本长期容量与永久去重保留上限；Linux/未知孤儿/旧锁、目标库/备份/断电跨版本、账号/备份日志政策、人工/模型版本与生产TLS仍待，P1/A–D未完成。博客04同题补边界、1280/390预览通过未发布；根format仍仅既有manifest失败，其他80项dirty保留，不推送部署。

2026-11-16补齐[账本持久容量](../development/agent-ledger-capacity.md)：固定8192身份（含已删历史）、中央单例X锁/版本校验/bounded8193初始化，预占与AI历史/run同事务，删除/终态不退永久位置；满额不清旧key，原view/cancel/erase/已running保持。新请求Redis前预检，真正跨user争最后位只一方成功；明确FULL竞争释放并发但分钟不退，未知ACK保持TTL/原键不重扣。API774、MySQL33（实际8191/8192/8193及LOCK WAIT）、真实Auth/Redis/ASGI24（含双user实际预检/reserve/accept交错）、容量2/2kill+旧8/8kill+pool4/5kill、fresh真实SDK/三库/mTLS六合成情景及独立51/8/2通过，[证据](../evaluations/agent-ledger-capacity-2026-11-16/README.md)与72项source摘要分清真实/模拟范围。8192是本地保守值，不代生产字节/存储测量；旧writer须停写，Linux/孤儿/旧锁、目标库/备份/断电跨版本、账号/日志政策、人工/模型版本/生产TLS仍待，P1/A–D未完成。下一步核对官方模型快照与版本策略，不把alias或created时间当不可变权重证明；仅用官方资料/已授权只读接口，不改业务模型目录。博客04补总量边界、1280/390预览通过未发布；现有站点及其他80项dirty保留，不推送部署。

2026-11-16完成[官方模型版本证据核对](../development/agent-openai-version-policy.md)：官方文档与当前凭据目录均仅gpt-6.1-sol，无独立日期候选；不由目录、created或日期命名推断不可变权重，immutable gate保持false。新增固定只读GET维护CLI，复用原受限TLS/CONNECT、严格有界目录与安全投影，关闭后才report；API787、相关41、独立13及真实命令200/0生成通过，[证据](../evaluations/agent-openai-version-2026-11-16/README.md)绑定17项source。原模型/业务目录/计数预算/历史报告保持；生产是否接受不能独立固定版本的服务尚未决定，不自动换/回退。博客05同题补版本依据，1280/390预览通过未发布。下一步本地运行恢复与未知孤儿/旧锁诊断，Linux/人工/版本生产决策/TLS/目标库备份等仍独立待，P1/A–D未完成；其他80dirty保留，不推送部署。

2026-11-16补[Worker控制器同journal崩溃矩阵](../development/agent-worker-crash-validation.md)：三切点实际SIGKILL、running独立合成组仍活/旧锁不接管、fixture全owned组gone后仅处理自有锁进入恢复；unknown保needs_reap/availablefalse/runner0，terminal不重派、新身份可执行。新测试宿主P2经真实第二程序pre-marker延迟/强杀复现，修每派发预期登记计数，覆盖不足保根拒解锁；原交错修后、第四回归和移除保护的负向控制通过。最终Worker100/9.240秒、相关49/独立4，[实证](../evaluations/agent-worker-crash-2026-11-16/README.md)绑定29源并区分旧SDK与新合成程序范围。生产/API源未改，README旧状态已修，博客04恢复分界及1280/390预览通过未发布。下一步只读核对本机Linux容器/VM条件，未知孤儿生产恢复授权/Linux/人工/模型版本生产决策/TLS/目标库备份等仍独立待，P1/A–D未完成；其他80dirty保留，不推送部署。

2026-11-17跨日补[固定官方四题人工材料](../development/agent-human-semantic-review.md)：固定原报告/数据集双SHA，生成原文/问题/实际API答案/判据四卡，剔除run身份/失效URL/trace，HTML纯文本+CSP/无JS，pending不自动升级。API796、导出新9/判官9、1280/390四卡16字段/无溢出/脚本表单anchor0及HTTP原bytes匹配，[证据](../evaluations/agent-human-review-2026-11-16/README.md)绑定6源；原报告/模型/目录不改、无新供应商调用。用户已收到具体材料，但截至checkpoint无人审结论，材料不是人工通过。PATH/8常见安装位/5socket未发现可用Linux入口，仅检查范围，不启动VM；后续核对本机虚拟化能力/资源与ignored目录自有验证条件，不能以窄测试替Linux。博客05同题说明材料对照，预览通过未发布；人工/Linux/版本生产决策/TLS/目标库备份等仍待，P1/A–D未完成，其他80dirty保留、不推送部署。

2026-11-17补齐[Linux固定网关与SDK组件](../development/agent-linux-gateway.md)：自有VZ gateway显式2CPU/4GiB，task仍512MiB/64，47源/8资产/原49零skip+九隔离+五网关+原SDK入口合成成功/来源/重复/取消/EACCES保槽重试通过，SDKpeak112623616/OOM0/PID0、监听/连接/cgroup/工作目录/host资源收尽。SDK通知双consumer顺序竞态改同步收集并保严格校验，确定性修前/后及Mac fresh复验通过；archive drift、unknown zstd尾随、half-close/IPv6 wildcard已修。API828/Worker151、65源index与SDK12源/4ELF及strict proof独立复核，[实证](../evaluations/agent-linux-gateway-2026-11-17/README.md)保开发失败与限制。正式API/三库/供应商Linux组合未完成，fullperrun/P1/A–D仍false；下一步先做正式API+一次性三库Linux合成组合，后续供应商固定通道/人工/模型版本策略/目标库备份/TLS运维。官方key不入guest，不改当前站点配置，不推送部署；博客04同题与1280/390预览通过、未发布。

2026-11-17补齐[Mac独立API进程故障矩阵](../development/agent-api-process-recovery.md)：父持有三库/Worker/stdin/TLS监听，子API原组合根/routes/真实JWT与Redis，三切点实际SIGKILL/wait后以同fd/origin/证书/服务与JWTsecret重启。最终native3 74.444秒：受理未派发45563ms failed/model0→0；模型等待旧真token在余8333ms租约内严格403后10806ms interrupted/model1→1；已提交答案/来源/两消息不变/model3→3。同key不重派/不收费，真实calls与累计/历史逐行不变，未完成旧槽保TTL。API923/Worker164、原Mac六场景兼容、新14+CLI4及判官304源复核通过，[实证](../evaluations/agent-api-process-recovery-2026-11-17/README.md)保前两bootstrap失败：首轮未定因，次轮本机SO_ACCEPTCONN errno42后改严格portable listener检查；两个失败fixture证据根保留，成功fixture/准备runtime清理确认。不改生产源码入口、不触供应商或Clash，标准旧accepted恢复表述与现实现统一不重派。博客04同题补边界/原两透明图、1280/390预览通过未发布。下一步Linux同API进程切点仍待，原Linux官方四题未通过且停止付费复跑；未知孤儿/旧锁生产恢复、断电/多副本、目标库/备份/TLS、人工/版本策略等仍待，P1/A–D未完成；原80dirty保留，仅中文本地提交不推送部署。

2026-11-17完成[原生Linux独立API进程三切点](../development/agent-api-process-recovery.md)：新--api-restart保原49零skip/九隔离/五网关/组件SDK/正式六场景，再原三库/samefd/TLS/登录会话/Worker独立Popen实际SIGKILL/wait重启。首轮accepted45481ms failed/0执行0调用0peak；hold旧真token/service/hash且余9592ms合法租约窗口严格403、10523ms interrupted；完成历史与引用/两消息不变；SDK0/1/1、model0/1/3、tool0/0/2，原预算调用行/幂等及ACK/relay/CG/PGID/roots全核。零执行核实际空kernel与groups/SQL、合作close不吞APIunknown，typed proof+独立resources和VZ completed/stopped/组/根删除均过。306源/270payload/67原资产及判官严格V6复验，API935/Worker164/新Mac3cut75.671秒兼容、26+7+4+5窄测通过，[实证](../evaluations/agent-linux-api-process-2026-11-17/README.md)保8GiB测试guest/512MiB64每task及scope。无供应商请求/生产或Clash修改，官方Linux四题仍失败且停止paid；未知孤儿/旧锁生产恢复、宿主断电/多副本、目标库/备份/TLS、人工/版本策略仍待，P1/A–D未完成。博客04同题补Linux实测与零执行缺证边界、原两透明图/1280-390预览未发布；原80dirty和现有服务保持，仅中文本地保存不推送部署。下一步核对A权限/资源盘点与影子差异等剩余本地可做项。
