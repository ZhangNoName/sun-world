# 账本持久容量与保留去重身份

基点7e319bd，macOS arm64，所有数据与数据库均为新建owned合成实例。新增容量单例与运行/AI历史共用MySQL事务：固定8192，含active、terminal及history_deleted身份，满额不删除旧key、停止新受理；视图、停止、删除与已在执行的回调继续按原授权运行。本轮不操作业务库、当前SQLite/v1页面或供应商，也不部署生产。

## 最终检查

| 组合 | 结果与准确范围 |
| --- | --- |
| 完整API | 774项，29.976秒，通过 |
| 新SQLite容量回归 | 14项，固定8192，实际构造边界行；SQLite更强的写串行和方言转译不证明InnoDB锁 |
| MySQL默认suite | 33项，6.304秒，31原生+2构造；新增4容量题，实际8191/8192/8193身份、跨用户实际LOCK WAIT |
| MySQL/Redis/Auth/ASGI栈 | 24项，17.733秒，新增5题；真实预检/Redis/accept双用户交错，不mock预检结果 |
| 容量专门崩溃 | 固定2题/2次SIGKILL，同datadir/socket/UUID重启，2.455秒，零skip；[安全投影](native-capacity-crash.json) |
| 既有崩溃回归 | lifecycle8/8kill，10.478秒；pool4/5kill，6.641秒，均通过 |
| 实际固定SDK | 新prepared资源、真实MySQL/Redis/Mongo/mTLS默认六合成情景通过，未调用供应商 |
| 独立审查 | core/application51、launcher8、升级构造2通过；最终双用户交错只读审查/AST通过，无确认阻塞，未启动真实DB/SDK |

## 容量语义的实证

MySQL新四题使用真实8191条存量争最后位：一方持单例锁，第二用户的独立连接实际进入LOCK WAIT，放行后只能一条受理成功，另一条FULL，真实run总数与counter均8192；停止/删新问答后位置仍不退，旧原键仍能辨认。合成旧3条（含已删历史）且counter缺失时，只读预检不写数据；两个ledger同时初始化后counter5、run5。旧库8193时保持全部记录、拒绝新增且不遗留半初始化行。

同事务故障检查在AI历史已写后抛错，counter/run/history全回滚；真实COMMIT后抛ACK丢失，原键重查只见一个run/一次扣位。另专门两题真实SIGKILL分别发生在提交前与真实COMMIT返回后，恢复后相应为全零或唯一counter1/run1/history1，不能以进程内异常替代持久性证明。

ASGI五题覆盖已知full在Redis之前拒绝、不收费/不启动；full/corrupt仍可读删旧问答；running仍可执行模型及完成；未知ACK预占保留，应用重建不重扣。双用户竞态只暂停user1在真实reserve前的调度，user2真实SSE受理/完成耗最后位，user1随后真实reserve/accept FULL：其请求预占留存、并发槽释放，user1分钟1/全局2，used8192、实际run1/Worker1。初始counter状态受控且保守高于实际行数，实际行边界另由前述MySQL题证明；Worker/模型/文章仍为合成。

## 验证中的修正

last-slot题最初10ms频繁采样持续读取较早的RUNNING观察，诊断看到第二连接的早期users查询；改为150ms间隔后观察到实际LOCK WAIT，仍保留2秒上限、相同连接和真实状态断言，没有放宽oracle或改变生产容量算法。[MySQL对这些监测视图的一致性说明](https://dev.mysql.com/doc/refman/8.4/en/innodb-information-schema-internal-data.html)指出其快变数据可能不同步；本轮没有逐指令追踪该二进制的缓存刷新，因此不把间隔变化反推为业务锁实现问题。临时诊断已从测试源删除，原始日志只留ignored本地任务目录。

应用竞态早期版本以patch预检返回模拟失去最后位；最终已替换为上述真实双用户交错，只有调度栅栏，预检/Redis/事务均不绕过。最终结果只引用这个版本。所有中间日志保留，不覆盖为通过结果。

## 来源、资源与剩余门槛

[验证清单和72项selected source SHA](validation-manifest.json)对应执行源树a53f715791b15cbf6f1d478de0b63755d43cc377；[开发契约与命令](../../development/agent-ledger-capacity.md)记录server-only上限、no-op upsert X锁、bounded8193身份初始化及旧writer需停写的约束。计数表格式/上限/字段异常新准入失败关闭，不能把counter缺失或删除历史当成新namespace。

fresh SDK使用592缓存包/下载0，17项Worker资源/index逐字相同，prepared runtime与owned三库/SDK根均回收；现有3030/8032站点与3033正文预览保留。root-script、api:deploy-schema、13个变更Python AST、scoped diff及本轮JSON格式通过；根format仍仅既有`docs/content-sources/csdn-qq-42345136/manifest.json`失败，未改其他dirty，不称root/Web全绿。

博客04补容量、同事务扣位、旧库初始化与满额旧操作可用，后端分类与原标签保留；两张透明图足以连接去重/内容关系，新段落是有限计数规则，未添重复图。1280/390视觉/DOM通过，7稳定章节、26处strong、0px缩进、无残留双星或横向溢出，未发布；预览仍用dirty renderer/CSS，非整页验收。

8192是本地P1保守值，与Worker身份屏障同数量级，不是生产磁盘测量或全数据库字节上限。默认不轮换namespace/不清counter继续收请求；legacy writer不可绕过协议混跑。Linux/未知孤儿/旧锁、目标库/备份/断电跨版本、账号/自动TTL/备份日志政策、人工语义/模型版本与生产TLS仍独立未完成，P1/A–D及持续goal未整体完成。不推送部署发布。
