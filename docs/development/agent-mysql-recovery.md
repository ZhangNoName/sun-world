# Agent MySQL 旧结构升级与进程崩溃验证

本轮目标是在已验证的本机 MySQL 8.4.13 上补齐可重复的旧结构升级和 mysqld 进程崩溃恢复证据。所有数据均为合成，实例必须由测试宿主新建、Unix socket only、校验 owner nonce/datadir/socket/skip_networking；不加载应用配置、业务库快照或凭据。不能据此声明生产已有库、跨版本升级、Linux 或断电恢复完成。

## 升级契约

从两个明确命名的合成旧结构出发：尚无 Agent 表的中央业务结构；已带运行和模型调用记录但缺新增预算列的 Agent 结构。通过正式 build_plan/apply_plan/validate_schema 验证加法升级、原记录保持、新列默认值和第二次空计划。模拟部分 DDL 已提交后重新 plan，必须收敛，不能用事务 rollback 声称撤销 MySQL DDL。不兼容列、缺索引或外键等仍拒绝自动修复；不要扩大迁移器到猜测性改写。

## 崩溃契约

宿主仅向自身仍持有的 Popen 句柄发 SIGKILL，wait 确认退出，然后以相同 binary、配置、私有 datadir 和 socket 重启；每次重新核对 server_uuid、路径、关闭 TCP 和 innodb_flush_log_at_trx_commit=1。禁止根据磁盘 PID 文件杀进程或接管未知实例。普通 CLI 不提供任意 socket、datadir 或进程 PID 参数。

覆盖未提交的 admission/history、completion/history 原子回滚；已确认提交及模拟 COMMIT 回执丢失后，实际 crash/restart 仍保留唯一结果；模型 attempt/input 预占在恢复后不能退款或重放。回执丢失注入只发生在真实 connection.commit 返回之后，须与实际 SIGKILL 区分说明。恢复用新 API 数据库管理器/授权绑定；失联旧连接不得自动重放写事务。过期 accepted/running 由既有 reconcile 收敛，不重新派 Worker，不访问上游模型。

信号与清理沿用共享 owned_interrupts/defer：进程登记、强杀/重启及最终关闭有保护；未确认退出保留私有目录，不删除可能仍被使用的数据。测试失败也需输出安全状态并完成有界回收。

完整 API 回归若涉及异步取消，应等待取消观察完成或监控任务退出，不能把 MemoryWorker.cancel 入口的请求登记当作其异步数据库读取已经结束。原测试曾在取消已发起、cancel_states 尚未追加时立即索引，产生一次 IndexError；修正只影响测试等待条件，不改生产派发/取消行为。另须固定八题集合、逐题一次真实 crash、总执行数八且零 skip，防止矩阵被误删后报告误绿。

## 分工与边界

主线程维护 owned MySQL controller、崩溃场景、原生验证和安全证据；coding 只维护合成旧结构升级测试，发现生产逻辑问题先报告；判官在实现后独立审查。三方不读密钥、业务配置或真实库，不推送部署发布，不改 Worker/模型接口/预算上限。Claude Code/claude-ds 接手必须读取本协议，不能把这些合成结构称为真实生产旧库快照。

## 2026-11-16 本地结果

正式迁移器与 ledger/Gateway 的生产源码未修改。`scripts/test-agent-mysql.py` 抽用共享 owned controller，默认 discover `test_agent_mysql*.py`，在新建私有实例中覆盖原十九项、八项合成旧结构升级/拒绝及两项离线构造检查，共二十九项通过、零 skip。新 recovery CLI 单独运行固定八题、逐题真实 SIGKILL 同数据目录重启，八项通过。模型请求与文章均合成，不使用供应商或业务账号。

独立原生信号 probe 在实际 mysqld 初始化期间 SIGTERM，以及最终关闭 wait 栅栏期间第二次 SIGTERM，均退出130，PID/进程组/私有目录消失，无备用回收接管。升级首轮一个空结果 tuple/list 的测试适配断言失败已修；恢复入口早期 skip 和旧连接清理错误、独立审查复现空矩阵 exit0、完整API旧异步等待竞态均如实保留在本轮交接，不能把中间失败写成最终通过。

运行方式（使用已验证的本机 binary，不自动下载）：

```bash
apps/api/.venv/bin/python scripts/test-agent-mysql.py --mysqld /absolute/path/to/mysqld
apps/api/.venv/bin/python scripts/test-agent-mysql-recovery.py --mysqld /absolute/path/to/mysqld --report /private/new-report.json
```

恢复后的验证显式新建 API 连接管理器，并验证新的会话授权器没有旧绑定；不是在线旧连接池无限自动修复验收。旧记录补出的0/NULL只代表新列默认值，不代表过去已经精确计数，也不授予旧运行继续执行的权限。目标部署仍须停旧准入、确认在途执行并核对真实旧库结构与恢复路径；本轮不执行这项业务操作。

安全结果、边界与源码摘要见[本轮实证](../evaluations/agent-mysql-recovery-2026-11-16/README.md)。主机断电/磁盘故障、跨 MySQL 版本、目标生产旧库、Linux、Worker未知孤儿/旧锁、API历史和账号删除政策、生产TLS及人工语义仍未验收，P1/A–D整体不放行。
