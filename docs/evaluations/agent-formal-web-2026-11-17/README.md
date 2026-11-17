# 正式问答前端消费与异步恢复实证

基点61608ea。按[协议](../../development/agent-formal-web.md)修复formal模式误走合成会话、可信绝对原文链接被过滤，以及旧认证/运行请求覆盖新状态。A的40项影子基线与本地权限聚合盘点已交付；本轮不重复盘点，不改业务配置、模型、代理、生产API/Worker入口或CSS预算。

## 验证结果

| 检查 | 结果与范围 |
| --- | --- |
| 真实合同生产 | 原正式API/AuthManager、独占MySQL/Redis/MongoDB、mTLS、固定SDK0.2.2-rc.1；成功/取消各1 SDK，合成模型3/1次，ACK与清理全过，9.263秒，供应商0 |
| 消费样本 | [checked-in fixture](../../../apps/web/src/modules/ai/fixtures/formal-contract.json)与实际导出JSON值相同，canonical来源在构造测试应用时固定，未事后改响应；生成的运行UUID仅为合成运行标识 |
| API完整门禁 | 938项，36.746秒通过；新增CLI拒绝路径3项包含在内 |
| Web工作区门禁 | contracts6、AI UI25、Web264、类型检查、构建/SSG/manifest通过；最终total-css-gzip（18 assets）失败，整个门禁不通过，未隔离证明根因 |
| 独立源码快照 | 从source-only Git树解包到非Git临时目录，64项与类型检查通过，排除原未提交源码。此后仅测试文件Prettier换行调整，16项复验通过；生产源码未变 |
| 浏览器合同回放 | 实际Page/Hook/AuthStore消费同一合同，1280/390各匿名、恢复、发送、取消，共8场景；来源/blog/1，无local请求/测试登录/内部诊断码/横向溢出 |
| 格式 | 首次root format还报告一份本轮测试格式，已修；最终只保留原素材manifest失败。任务范围Prettier与diff检查通过 |

根AuthStore的6项竞态修前均失败，修复后连同后加3项和旧登录/HTTP/会话适配测试共22项通过。同scope共享恢复/续期；退出或新登录后旧成功/失败不能写新用户、到期时间或清空新状态。实现者补充正式分流、来源与迟到操作用例，判官独立发现两项P2：旧cancel回执与旧restore回执覆盖同账号新问题。现已用每次发送立即生效的运行世代和操作身份约束；18项hook及判官五种交错复核通过，无剩余确认阻断。

## 证据和可重现边界

[validation-manifest.json](validation-manifest.json)记录最终318项源摘要与source-only树；其中producer308项在运行终态后核对一致，原306项未变，新增两份producer自调用起未改。没有把这个核对称为运行前快照。纯源码验证树与最终树差别仅为一份测试的格式换行。

实际导出的源样本及私有日志位于ignored `.tmp/formal-web/`，公开清单只收摘要。首次Auth补充测试曾有一个预期错误文本不符，调整测试为固定过期上下文提示后通过。首次浏览器前3场景通过，随后CDP观察器因返回DOM对象而报Object reference chain too long；仅修观察表达式为布尔值后重跑全部8场景，不改产品或重跑SDK。两次工作区Web均在最终CSS门禁失败，保留失败记录。

[browser-replay.json](browser-replay.json)明确 `live_api_e2e=false`：正常session port由合成状态替代，HTTP仅回放捕获的capabilities/SSE/GET/cancel，其他请求直接失败。这支持实际消费者兼容性和渲染，不能冒称浏览器在线三库全链路、生产HTTP密码登录或供应商模型验收。客户端状态隔离也不能撤回已发服务器Set-Cookie或替代服务器每次重新授权。

## 清理、写作与剩余

[cleanup.json](cleanup.json)记录自有SDK准备根与非Git源码快照按原inode/所有者及无打开文件核验后删除；3030/8032/3033均200。旧live runtime、两个失败证据根与67项Linux资产缓存保持，不回收未知进程。原80项dirty与main handoff原210加1删保持。

按sun-world-blog→design局部补[博客04](../../blog/2026-11-15-agent-run-history-transaction.md)两段，说明正确恢复会话/来源以及同账号新问题与迟到回执的边界。分类后端，标签架构笔记/Agent/DeepSeek Harness；7稳定ID、两透明图、33处重点保持。现有图已解释事务与历史边界，短段补充无需新增图。桌面1280与手机390实渲、无首行缩进/溢出，图360/342px，通过目视与DOM核对。预览沿既有本地dirty renderer/CSS，未发布。

D有限slot/contribution及卸载/错误隔离仍待；生产接线、目标库/备份/TLS、未知孤儿/旧锁恢复、宿主断电/多副本、官方Linux四题与人工/不可变版本策略仍独立待。没有付费重跑、再跑VM、推送、部署或发布，P1/A–D未整体验收。
