# 正式运行账本的持久容量与去重保留

基点7e319bd。既有Redis分钟/并发限额只限制速率，不能约束长时间累积的MySQL运行和问答记录。历史删除清内容但永久保留run身份，不能通过清空旧幂等键释放空间。本轮只开发/验证正式MySQL/V2 profile，不向业务库执行DDL或修改现有SQLite/v1站点。

## 范围与选择

当前固定sun-world/blog-qa profile采用8192条持久run准入上限，包含active、terminal和history_deleted记录。这个本地P1保守上限与Worker已有8192永久身份屏障保持同一数量级；不是生产磁盘容量测量，也不自动证明MySQL总字节、普通聊天或其他业务表有界。每run原有问题/答案/工具/模型预算继续独立生效。达到上限停止创建新run，不淘汰旧身份；生产放行前仍需结合目标主机存储评估此值。

上限由服务端固定协议控制，不接受用户/Worker请求值或随意env扩容。新增中央表`agent_ledger_capacity`持久单例行（id=1、format_version=1、capacity=8192、used_count、initialized），不在Redis缓存剩余额度。已有数据超过上限不删除或改写，只有新准入拒绝；既有view/cancel/reconcile/历史删除继续可用。没有自动轮换namespace或清空counter来继续接受新请求。

## 原子计数与初始化

1. accept继续先锁当前用户、验证启用状态并检查owner/family/idempotency。重复原请求返回原run，已删历史旧键仍409，其他family仍404；这些路径在满额时也可辨认，不扣容量。
2. 新请求才在同一个READ COMMITTED UOW内取得容量单例X锁。使用no-op upsert直接取得唯一行排他锁，再读取FOR UPDATE；不要以INSERT IGNORE的S锁再升级制造并发初始化死锁。
3. 首次初始化时只读取`agent_runs.id LIMIT 8193`，不复制问题内容、不无界COUNT或锁所有run。全表身份都计入，不将history_deleted排除。单例锁序列化所有新版本writer；目标旧库升级必须先停旧准入，不能与绕过此协议的旧writer混跑。
4. 初始化数与预占`used_count+1`、AI历史及run插入同事务提交。任何失败全部回滚；未知COMMIT结果不重试或退款，原键查询仍可恢复唯一run。counter缺失可在同锁下按现有永久run重新核对；不降低现有已初始化计数来释放位置。
5. capacity/version/initialized/used_count类型或范围不符即新准入失败关闭，不能猜0继续。超过已有上限只拒新，不删旧数据；新schema表为空时也不能把带旧run的库当全新空库。

## 应用与限额语义

只读容量预检在新请求Redis reserve之前执行，已知full返回503 `AGENT_LEDGER_FULL`、不启动Worker、不扣分钟/并发。capabilities可说明新准入不可用，不能把整个应用开关关掉而阻断旧历史/取消。预检不是授权或最终容量许可，accept持锁再次检查。

预检后若发生竞争、最终accept明确在COMMIT前因full拒绝，应用可释放这次未启动执行的并发槽；分钟次数按原准入规则不退。数据库异常或提交回执丢失仍按原未知结果保留预占至TTL，不从错误消息猜测是否成功。历史删除/终态/进程停止都不减少持久计数，也不改Worker/模型次数。

## 分工与验证

coding只实现中央schema、容量helper与ledger accept/check、error codes及纯离线测试/必要SQLite方言适配；主线程实现Application预检/已知拒绝回收、原生并发/迁移/crash及博客证据；判官实现后只读复核。先同步本协议再改代码，Claude Code/claude-ds接手必须读取。禁止读凭据/业务配置或触碰其他80项dirty，不推送部署发布。

验证必须包含：跨user并发争最后一位（实际InnoDB锁等待）、首次跨实例初始化、已有run与已删历史计入、旧键满额可查询但不能重跑、失败回滚和ACK丢失不重扣、重建应用保留计数、full不扣已知准入、竞争拒绝只释放并发不退分钟、corrupt满额时既有操作仍可用。测试可通过构造8191/8192条合成身份或受控counter状态检验边界，但不能让生产上限接受请求注入。所有旧schema/数据均合成，Linux/生产容量与其他门槛仍独立待验收。

显式recovery CLI新增`--suite capacity`固定两题、每题一次真实SIGKILL/同数据目录重启：容量预占与历史尚未提交时全部回滚；真实COMMIT后ACK丢失，恢复后原键唯一、used_count仍1不重扣。默认lifecycle八题和pool四题保持，不能用纯异常模拟代替此处daemon故障。应用/ledger库位保护与旧预算/授权的回归须分别标注。

## 2026-11-16 本地结果

上述helper/单例schema、ledger同事务预占、Application Redis前预检与明确FULL回收分支已实现。新增SQLite容量14项通过，独立core/application51、CLI门禁8与升级构造2通过，无剩余确认阻塞。完整API774项通过；测试不向helper注入小上限或修改生产常量。

原生MySQL33项通过（31个原生事务/迁移场景+2构造），新容量4题真实构造8191/8192/8193条身份，包含history_deleted；跨user抢最后位先确认独立连接的实际LOCK WAIT，最终恰好8192。旧schema切片缺capacity表、已有run保持，纯预检不创建counter，双ledger初始化后used_count等于旧3+新2。旧数据8193时保持记录拒新，初始化/预占/历史失败一起回滚，ACK丢失不重扣。

真实MySQL/Redis/JWT/ASGI栈24项通过（原19+新5）。双用户竞态仅暂停user1 reserve调度，两个真实预检/Redis/accept不替换：user2实际耗最后位并完成，user1随后FULL，用户1分钟1/全局2，user1并发槽已释放、counter8192/run1/Worker1。full/corrupt不阻断旧view/DELETE，已running仍能模型/完成；未知ACK保留Redis预占，重建应用不重扣counter。

容量专门crash两题/两次实际SIGKILL通过，原lifecycle8/pool4共13次SIGKILL回归通过；fresh固定SDK+真实三库/mTLS六个合成场景通过。17项Worker资源与index一致、592缓存包/下载0；owned三库/SDK及prepared runtime已回收，现有站点保留。详细安全结果、范围和72项源码摘要见[实证](../evaluations/agent-ledger-capacity-2026-11-16/README.md)。

```bash
corepack pnpm check:api
apps/api/.venv/bin/python scripts/test-agent-mysql.py --mysqld /absolute/path/to/mysqld
apps/api/.venv/bin/python scripts/test-agent-mysql-recovery.py --suite capacity --mysqld /absolute/path/to/mysqld --report /private/new-capacity-report.json
apps/api/.venv/bin/python scripts/test-agent-stack.py --mysqld /absolute/path/to/mysqld --redis-server /absolute/path/to/redis-server
```

root-script/api:deploy-schema、13个变更Python AST、scoped diff与本轮JSON格式通过；根format仅既有内容manifest失败。博客04同题补总量与删除不退位置，1280/390预览通过、原透明图保留未新增，未发布。8192只作为当前本地P1保守值，生产存储测量、旧writer停写迁移、Linux/未知孤儿/旧锁、真实模型版本策略、人工及生产TLS等仍独立待验收，P1/A–D未整体验收。
