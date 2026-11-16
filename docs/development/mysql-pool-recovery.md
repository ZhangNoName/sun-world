# MySQL 既有连接池的失联恢复

基点402b14d。上轮验证通过重建API管理器恢复；本轮核验同一个MySQLManager在数据库短暂不可用后能否恢复。仅新建owned Unix socket MySQL与合成数据，不加载业务配置、账号或凭据，不执行生产DDL/服务切换。

## 已确认问题

旧_borrow在失效连接丢弃后立即补建，补建失败只记warning、不归还可借位置。位置全部耗尽后，数据库即使恢复，下一次操作也只会等空queue，永远不再建连接。纯离线复现pool_size=1时factory只调用两次，预先安排的恢复连接永远没有被尝试；真实MySQL8.4.13确认SIGKILL后两条旧连接耗尽，queue0，同datadir/socket/UUID恢复后同manager仍失败。此证据不追认其他历史代理或清理故障根因，也不解释旧warning首次发生的原因。

## 恢复契约

- 池容量按固定可借位置计数，包含健康连接、当前借出/建连中的位置和待恢复空位。建连/探活/SQL/rollback失败、取消与超时不能悄悄丢掉位置，也不能额外铸造位置使连接数超过pool_size。
- 失效位置恢复为空位，后续独立checkout可以有界地新建一次连接。已有空闲连接在本次checkout的SQL尚未开始前探活失败，也可在确认旧handle关闭后受控新建一次。每个checkout最多一次factory；不得对已经发出的SQL、COMMIT或UOW自动重试/重放，数据库恢复不授予旧Worker任务重跑或退预算。
- 探活禁用驱动内部隐式reconnect，避免在事务中偷换物理会话或跳过受控连接登记。只有借出SQL之前可新建；已发出语句的失败原样传播，逻辑SQL错误rollback后可归还原健康连接。预探活修复不会重新进入调用方yield body，不重试调用方语句。
- 状态登记和发布受同步保护；网络连接/等待不占用全局状态锁。close是终态，禁止新借出或晚到连接入池；已创建但尚未发布的连接必须关闭。等待者不能在close后取得可用连接。
- close不强行切断已借出的UOW；旧handle在该UOW退出归还时关闭。close返回只表示拒绝新工作，不能据此宣布尚在执行的事务已排空；宿主仍须先drain持有者再关闭数据库fixture或进程。此选择避免普通关闭在另一线程中途破坏COMMIT边界。
- 显式connect/reconnect不能重复填满queue、泄漏部分成功的连接或破坏尚在执行的UOW。禁止在存在借出/等待/建连时重置队列；忙时明确拒绝。初始化/重连部分失败要有界清理；后续已存在池仍应保留待恢复位置。关闭后需要新管理器，不能被迟到的connect/reconnect复活。
- 清理批次必须保留首个BaseException、继续处理其他handle，并在独立finally完成状态收尾后再传播。若driver.close尚未确认，仍保留该handle的归属与位置（可用待关闭状态表示）；下一次只能先完成关闭，不能将其当空位创建第二份物理连接。close/reconnect可再次尝试未确认handle，不能因registry先清空而永久失去追踪。此要求来自离线确认的中断窗口，不声称实际MySQL经常抛此错误。
- 保留现有连接/读写超时、RC事务局部隔离和单连接UOW；不改会话认证、模型计数、准入或业务schema。测试factory hook只返回连接，登记由池集中负责；owned SocketManager测试子类按相同契约调整。

## 验证与分工

主线程先保存纯离线/真实daemon修前证据，再实现owned同池恢复/unknown commit及预算回归；coding只维护MySQLManager和纯并发/故障单测，判官实现后只读审查。必须覆盖多次失联/恢复、并发容量、close与晚建连、部分初始化/显式重连失败/忙时拒绝、逻辑SQL错误复用、未知COMMIT不重试、非autocommit事务回滚和连接归还。真实MySQL须确认SIGKILL退出、同datadir/socket/UUID重启且使用同manager/ledger，不以新管理器替代。

沿用显式`test-agent-mysql-recovery.py`，新增`--suite pool`固定四题：两轮耗尽/恢复/并发容量；admission提交前断开后的原子回滚；真实提交后ACK丢失的唯一运行；输入预算已提交后ACK丢失且持续停机的无生成/不退款。首题两次、其他各一次SIGKILL，共五次；逐题计数与完整场景集合/零skip/总执行数共同校验。默认lifecycle仍是原八题，不替换或缩小。恢复report须标注suite和真实/合成范围。停机期间unknown结算也可能失败，调用记录保留reserved不代表许可重放，恢复后只按原租约/状态收敛。

原八题首轮回归出现一次已提交attempt在数据库立即恢复后仍保留reserved，而原oracle要求unknown。原因是排队的旧idle连接探活失败，阻断了新的独立unknown结算事务。保留原oracle，增加上述SQL执行前的受控一次factory修复；不是放宽断言，也不是在旧事务中重发COMMIT。原生持续停机pool题仍允许结算不可用、明确验证reserved预算保留且无生成。

协议先写本文件再同步角色；Claude Code/claude-ds接手必须读取固定位置、不重放事务与close终态等增量。保持原80项dirty与当前SQLite站点，不推送部署发布。完整目标P1/A–D及Linux/目标业务库/生产TLS/人工等独立门槛未因此完成。

## 2026-11-16 最终结果

MySQLManager使用固定位置、None空位、明确的PendingClose和Condition状态登记；factory仅返回handle，集中登记。显式重连仅idle时执行，失败保留位置，关闭不复活；未确认close的handle仍占原位。三个中间版本driver.close抛BaseException的P2（批次漏后续handle、reset卡busy、borrow丢旧归属再补新）由判官离线确认并在最终源同路径复验通过；不将fake driver故障冒称原生出现频率。

完整API758项通过；独立MySQL离线35与launcher6通过。原生pool固定4题/5次SIGKILL、原lifecycle8题/8次SIGKILL均通过，未放宽旧unknown oracle；29项中央迁移/事务与19项MySQL/Redis/Auth/ASGI栈回归通过。另fresh固定SDK0.2.2-rc.1、真实MySQL/Redis/Mongo和双向mTLS六个合成场景通过，17项Worker资源/index逐字一致、592缓存包/下载0，prepared runtime和所有owned三库/SDK根已回收。详细安全结果及67项selected source SHA见[本轮实证](../evaluations/mysql-pool-recovery-2026-11-16/README.md)。

```bash
corepack pnpm check:api
apps/api/.venv/bin/python scripts/test-agent-mysql-recovery.py --suite pool --mysqld /absolute/path/to/mysqld --report /private/new-pool-report.json
apps/api/.venv/bin/python scripts/test-agent-mysql-recovery.py --mysqld /absolute/path/to/mysqld --report /private/new-lifecycle-report.json
```

本轮未调用供应商、未改业务schema/配置、未切现有SQLite页面或部署。root-script/api:deploy-schema通过；根format:check仅既有内容manifest格式失败。博客04同题补充连接恢复与事务重放的边界，原两张透明图保留，新内容为少量状态规则、无需增加重复图；1280/390预览通过未发布。Linux、断电/跨版本、目标业务库恢复、未知孤儿/旧锁、长期账本容量、人工/模型版本和生产TLS仍独立未完成。
