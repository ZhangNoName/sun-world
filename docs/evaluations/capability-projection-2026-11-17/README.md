# 当前会话能力投影：本地验收

2026-11-17，基点 `8cb63051e7ad28e28954fa7094e4fe15b251107b`，落实计划D的能力探测。新增只读 `GET /auth/capabilities`，让页面贡献按当前账号与会话获取最长15秒的显示快照；实际业务服务继续独立复验每次操作。未新增管理产品入口、Agent工具、授予API或生产放行。实施约束见[协议](../../development/capability-projection.md)。

## 行为与契约

[真实基线](before.json)中匿名及管理员请求均404，Provider固定unknown。现在匿名不访问Auth存储，只得到已登记公开read；Cookie存在则走真实AuthManager/SessionAuthenticator及当前账号status=1/角色，失效401、依赖或登记故障固定503，不降级匿名。九管理predicate复用写服务的actor/近期认证policy，目标存在、最后管理员等业务条件仍由实际操作判断。

返回固定app、canonical账号ID、当前family的server摘要、十个已登记predicate子集及0..15整数TTL；身份字段必须同为null或都有效，匿名只能带公开read子集。响应no-store/Vary Cookie，不返回原sid/token/角色或业务数据，不写业务/audit。TTL以存储读取完成后的服务器时间计算，并受access及近期认证剩余寿命约束；0不缓存放行。显示快照非凭据、非跨存储严格同步撤销租约。

客户端只在实际消费者存在且页面可见、认证状态可用时查询，多consumer共享请求；账号/认证epoch/服务端family共同隔离挂载，旧响应不能覆盖新scope。请求开始的单调deadline、同步getter裁剪及到期通知共同限制旧快照；正常同scope续查保持挂载，过期/撤销/失败移除受限部分，隐藏/无consumer停查并abort。零TTL新family仍更新隔离标识。探测不刷新登录、改AuthStore或弹错误toast，公开博客问答导航保持。

[OpenAPI对照](openapi-delta.json)只新增该GET和两个schema，所有旧paths/schema深比较原样，独立进程fresh导出相等。[目录对照](catalog-delta.json)只改identity-management依赖/只读声明及bundle摘要；blog模块、原两个工具/schema/产品Skill不变。导出器新增轻量capability-keys.ts，registry/DTO/Web十键一致，未把完整内部目录打入浏览器。原40+9+9+9门禁保持，新增读声明单独精确检查。

## 冻结及验证

[31源摘要](source-set.json)绑定代码冻结树 `d6f9a8a3b7fa95e6a8f6690ccd4405f5a9e727a8`；工作区、暂存树及独立review逐字核对。随后只改文档/博客与图。日志SHA/命令结果/清理见[results](results.json)，原日志保留于ignored `.tmp/capability-projection/`。

| 范围 | 最终结果 |
| --- | --- |
| 完整API | 1032 / 41.092秒，exit0 |
| 新owned MySQL8.4.13 / Redis7.2.17 / 真实Auth、Cookie、HTTP | 16 / 2.652秒，零skip |
| 旧binding / management / audit | 20 / 4.301秒；19 / 3.400秒；16 / 3.096秒 |
| 旧recent / recovery / 原MySQL / 原stack | 12 / 2.334秒；16 / .650秒；33 / 5.989秒；24 / 17.177秒 |
| Worker协议 | 164，零skip，9.948秒 |
| 当前工作区Web单元 | 75文件337项通过；原两dirty UI门禁失败保留 |
| 干净跟踪源码完整Web | 72文件320项、注册4/contracts6/AI UI25、类型/构建/SSG/包与Markdown/UI/chunk/全部预算，exit0 |
| 实际浏览器Provider/Hook/typed transport/Slot | 1280/390共12合成响应场景通过 |
| 独立review | backend11、Web27、旧service16、schema/catalog/十键及31摘要，未剩确认阻断 |

新原生16覆盖匿名不碰存储、fresh九管理与公开、普通/陈旧/伪claims、空坏Cookie/缺proof/注销、status0/2、真实依赖故障、请求伪subject无效、新family与普通refresh摘要、access/近期TTL、pool1、caller Principal拒绝、坏registry503。控制server clock在存储读取后推进验证重新采样；读取期间注销在expiry验证处拒绝。拿旧投影再撤角色或注销，真实写服务仍403/401且无业务/audit，不把显示TTL当写入授权。

浏览器使用真实Provider/Hook/API transport/Slot与现有公开导航，但GET数据和受限贡献是合成fixture，其他API/外网全部阻断。12场景核同值续查不重挂、同账号新family重挂、撤权/401不刷新、账号切换/错账号拒绝、挂起续查后过期与迟到TTL、合成visibility事件/无consumer停止和重订阅、匿名异常管理predicate拒绝；未取消signal数量与当前受限DOM数量相等，已卸载signal均取消。Chrome实际会abort旧XHR，忽略abort的迟到响应由单元测试证明，不冒充浏览器在线真实库E2E。

## 开发中发现与修正

判官以纯离线反例确认初版DTO/client接受account/ref=null但带identity.role.create，可能挂载受限贡献。真实project从不生成这个组合，实际写服务不受它授权，因此这是开发中的显示契约P2，不是旧生产写越权。修复DTO与client null配对/匿名公开子集；修前DTO三subcase和client三项失败，修后backend11/client33通过，真实Slot不挂载。修前/修后日志SHA均保留。另修服务器clock采样时点、延迟计时器的同步到期裁剪和过期后同值ready通知。

首个浏览器harness误把/src/modules/ai静态文件当API阻断，初跑空白；仅收紧harness正则后通过，原失败日志保留。首次深色稿件预览末行无底框导致图中文字对比不足，只为该行补浅色底框后1280/390明暗重查通过，没有改产品样式。

## Web及Linux边界

干净源码是HEAD加31源的非Git临时目录，复用已安装依赖、无新worktree/联网安装。[快照元数据](web-clean-snapshot.json)、[构建摘要](clean-build-summary.json)及[清理](web-snapshot-cleanup.json)记录tree、归档SHA、inode/所有者与无打开文件证明；CSS49578B低于原51200B，18资产。当前工作区337只代表Web单元通过，仍有原BlogComments raw label与SunMarkdownPreview raw table两门禁失败；root format也只剩原素材manifest，未修改或豁免它们。

[完整原生V4报告](linux-native.json)保留原全部值，[源绑定](linux-payload-binding.json)核234声明源逐字对应281payload/67资产，旧233/缺projection拒绝。实际guest49协议/9资源文件系统/5网关、固定组件SDK和正式API/三库/mTLS原六合成场景通过，6 SDK/10合成模型/4工具、supplier0。legacy linux_per_run_isolation_verified=false原样保留；新projection16在macOS owned库跑，guest是原有合成链路与新源码包验证，不能冒称guest跑新16或P1全完成。

新catalog要求SDK按原固定配方离线重封。[重封记录](sdk-reseal.json)核四固定Linux二进制及其余66缓存资产原样，[三组对照](sdk-binding-controls.json)核旧包+当前目录拒绝、旧包+旧目录和新包+当前目录通过；[38522归档成员逐项比较](sdk-member-comparison.json)无增删，仅tool-catalog.json字节变动，未升级SDK/依赖、执行宿主Linux ELF或调用供应商。新cache独立于原67缓存。

## 稿件、清理与待办

按sun-world-blog→design修订[同题博客03](../../blog/2026-11-12-dsh-skill-boundaries.md)，分类后端，原标签架构笔记/Agent/DeepSeek Harness、六稳定ID/十重点保持；原透明装配图仍有信息作用，三项时序用正文说明，不加重复图，仅修深色末行对比。1280/390明暗查看、无缩进/溢出/裸星，DOM见[桌面](blog-desktop.json)/[手机](blog-mobile.json)/[深色](blog-dark.json)。预览 http://127.0.0.1:3033/.tmp/capability-projection-blog-l4xykzbh/index.html ，未发布。

17可定位owned DB根均删除且ps无引用，VM三库/组/root回收，临时源码快照移除；原3030/8032/3033均200、旧预览/指定失败根/缓存保持。原80/123及main210加1删保留，中文本地保存，不推送/部署/发布/配置Clash/恢复官方付费四题。

后续仍需细粒度grant/可授予集合、其他实际slot、生产目标/备份恢复/审计运营、官方完整四题/人工/模型版本与容量等独立验收。当前公开入口不需要显示predicate，未凭快照授予Agent运行资格，A/P1/A–D未整体完成。
