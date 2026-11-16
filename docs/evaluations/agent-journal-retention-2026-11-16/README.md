# Worker留存与宿主中断实证

2026-11-16，基点0d541a6；协议见[Worker留存](../../development/agent-journal-retention.md)和[嵌套中断](../../development/agent-cleanup-diagnostics.md#嵌套宿主信号保护增量2026-11-16)。仅本地实现与验证，不清理真实journal、业务库或用户历史，不启用生产。报告只含固定状态、数量和源码摘要，不含身份原文、凭据、nonce、PEM、正文或本地原始日志。

## 本轮实现与边界

新execution-journal模块共享严格schema/文件IO/owner/O_EXCL锁。v3可信留存时间，旧v2不靠mtime猜年龄；30天后仅回收确认结束且无在途引用的详情，cancel-before-start额外保留45秒窗口。永久精确身份SHA256集合最多8192、文件最多1MiB，先确认index与必须存在index的owner，再删详情；原身份改未来deadline或执行标识仍拒绝。满额停止新准入，查询/取消保留，未知孤儿/旧锁不接管。此处不删除API账本或用户历史，也不提供清空屏障继续运行的开关。

显式CLI：`node scripts/prune-agent-worker-journal.mjs --directory /absolute/existing/private/journal --check|--apply`。仅已知私有目录；成功check不改详情/index，错误可能保留本次创建的锁，不能把它当作绝对无副作用。新工具无网络、业务配置或密钥读取，输出仅固定计数。真实owned控制器进程占锁时两模式均拒绝；close后check1/apply1，旧run改deadline拒绝、新UUID可启动。年龄来自注入clock，未修改机器时间或现实等待三十天。

## 回归与确认问题

最终API715项、Worker96项通过，判官独立Node40/Python5通过。初版Worker92项已绿仍被独立复核抓到两个问题，因此不以计数代替边界审查；安全记录见[回归投影](regressions.json)。

1. **mixed迁移的屏障丢失**：初版未提交实现中，旧owner+新index/v3详情经apply删末条后仍是旧owner。再丢index会重建空集合，旧run改deadline实际可启动。现index确认后先原子/fsync owner3，再unlink；新增最后详情/index丢失以及owner rename/目录sync ACK丢失零删除/留锁回归。
2. **跨语言deadline不兼容**：初版额外要求JavaScript三位小数canonical形式，正式Python六位小数wire虽通过RPC却无法持久。现保留原字符串/hash与finite解析；零/三/六位Z新start及v2 offset迁移/两次重启通过，offset新start仍按旧RPC拒绝。未改Python序列化、期限或RPC契约。
3. **嵌套第二次SIGTERM重入**：基点的真实Redis/Mongo context恢复外层旧handler后，第二次停止信号打断后续清理。忠实回归为单信号通过、重复信号失败；最早全部mock context遗漏handler的观察不作此复现依据。共享首次中断状态/defer修后，原单次、重复、首次正常清理期间、主错不覆盖/handler恢复以及未知资源目录保留5项通过。该窄测daemon/readiness/MySQL context与版本发现合成，平台guard按POSIX测试设置，实际进程组和Redis/Mongo context/CLI入口真实；不是SDK/三库实测。

MySQL临时目录改为显式归属，daemon未确认退出时保留目录与恢复证据；这一拒绝路径用受控predicate验证，不冒称已制造真实系统权限拒绝。正常清理与中断路径另有下述三库实证。

## 真实SDK与三库

新prepared runtime从592缓存包安装、下载0，固定SDK0.2.2-rc.1；17个Worker源与实际资源/current/index逐字相等。相同最终源码跑原六个SDK场景（成功/恢复、cancel、HTTPS断流、Redis撤会话、撤文章、Worker崩溃后父reaper），实际MySQL8.4.13/Redis7.2.17/Mongo8.0.38及双向mTLS，正常退出0、owned资源回收。

另启动原`--interrupt-probe`，实际SDK到模型等待点后向总启动器SIGTERM；在真实Redis.wait关闭栅栏再SIGTERM，确认仍等待该栅栏，释放后退出130。这里仅给Redis等待加栅栏，未替换daemon/readiness/数据库/SDK/证书。4个owned child PID与5组（API、SDK、三库）均ESRCH，4个fixture根删除，没有独立fallback代收；见[中断证明](native-shutdown.json)。监督driver源码摘要只关联本地观察；可维护的窄回归在[信号测试](../../../apps/api/tests/test_agent_sdk_launcher_signals.py)，原SDK启动器与资源context也已入库。新独立prepared runtime已在收尾删除；保留现有站点必要资源、verified DB缓存和3033正文预览。

模型/文章合成，本轮未调用真实供应商或重跑官方语义四题；[上一轮官方实证](../agent-official-stack-2026-11-16/README.md)保留原源版本范围。实际中断证明不能替代MySQL崩溃恢复、未知cgroup/旧锁回收或Linux硬隔离。

## 源码、写作与未完成门槛

执行源码树465bbe5b9357b6a85464654951808decb15ec868；最终仅补文档和安全证据，摘要见[验证清单](validation-manifest.json)。Python715验证最终Python源；Worker96与实际SDK验证两个Node P2修复后的源。没有把旧的92项通过或已丢弃的prepared runtime当最终验收。

博客04同题说明删详情不授予重跑、可信时间和嵌套信号，后端/架构笔记/Agent/DeepSeek Harness保留；7稳定ID/21处strong、1280/390正文和新增段落视觉/DOM检查通过，无首行缩进/残留双星/横向溢出。既有透明Redis图360/约342px保留；新增部分为少量顺序规则，列表足以表达，不加重复图，未发布。预览使用已有dirty renderer/CSS，不是完整文章页验收。

其他80项dirty与主handoff未提交内容保留，根素材格式及Web CSS预算的既有问题不在本轮修复，不声称root/Web全绿。未知孤儿/陈旧锁、API历史与账号删除策略、已有业务库升级/崩溃矩阵、Linux、人工语义、模型版本策略及生产TLS仍独立未完成；不以本轮通过放行P1/A–D。历史其他回收失败不因新信号问题而补认根因。未推送、部署或发布。
