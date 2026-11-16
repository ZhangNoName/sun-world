# Agent 问答历史删除与账号停用边界

基点5cffc24。本轮在正式MySQL/V2 API增加当前会话本人对已结束运行的显式历史删除；只实现代码和owned合成数据验证，不调用现有站点或生产删除。用户数据默认保留至显式删除，不把Worker三十天诊断清理直接套用到用户历史。

## 行为与事务

- `DELETE /ai/v1/blog-qa/runs/{run_id}`使用既有cookie、Origin/CSRF边界、开关和allowlist；仅当前账户及原session family拥有的运行。重复删除成功，其他账户/其他family/未知运行均404，不泄露存在性。请求体只允许空或`{}`，不新增Worker工具或写能力。
- 只允许`completed/failed/cancelled/interrupted`终态。accepted/running明确409并要求先停止，删除本身不猜测Worker已退出、不释放并发槽、不退分钟次数或模型预算。
- 同一READ COMMITTED UOW持有run行锁，锁后重验当前会话/账户/角色。AI模块用同一连接移除该对话的反馈、消息和对话标题；Agent模块移除该run的工具/来源/模型调用详情，再设置新增nullable UTC `history_deleted_at`。任一失败全部回滚；提交确认丢失按原run重查/重复删除，不重放模型。
- 保留原run的身份、user/family/request摘要、幂等键、终态、执行身份和累计预算作为永久去重记录；撤销三个回调凭据摘要，删除结果/root文本关联。**这不是全账号物理抹除或匿名化**，保留字段仍与账户关联，备份/日志的清理另有政策。删除问答不能允许旧幂等键再次创建或让迟到回调重建内容。
- 删除后公开view为404；原幂等键在任何新准入前返回409 `AGENT_HISTORY_DELETED`，原请求及换问题都不能复用。可信控制路径仍能读取终态以确认回收，不把历史隐藏误解成运行从未存在。并发完成/删除/公开恢复按同一run锁串行；新读看不到半删除历史。

内部 `get_owned` 和 `cancel` 保持可信owner控制的终态读取（包括已删历史），公开恢复仍通过 `_view` 的默认 `_owned` 隐藏。不能将 `get_owned` 也改成404，否则删除恰好发生在已完成与settle之间会跳过Worker停稳检查和Redis release。删除清理同时保留可索引的会话/消息相等条件，再追加字节精确约束，避免为修排序规则而把清理改成全表扫描。

## 账号与旧聊天

现有admin DELETE user实际仅将`users.status`设0、返回“停用成功”，本轮保留。停用后现有JWT/Redis会话重验拒绝问答、历史删除及迟到回调；当前授权不能由缓存角色或已完成状态绕过。停用不是自动删历史，也不是跨系统账号物理清理；恢复账号/全账号删除、session批量撤销及保留期限选择仍需独立产品/运维决策。

普通聊天已有Agent命名空间隔离继续生效，不能借普通编辑/追加/反馈入口删改已验证问答。历史删除只作用于锁定run绑定的canonical对话；MySQL文本排序规则可能折叠大小写/重音，清理消息和反馈必须使用精确字节匹配或等价数据库约束，不扩大到别的对话。SQLite只验证事务路径，真实MySQL单独证明排序规则和锁竞争。

## 分工与验收

coding只修改中央schema、AI-owned历史事务、ledger/必要Gateway保护及其窄测试；主线程实现正式application/router、集成/native与证据/博客；判官实现后只读复核。先同步本协议再编码，不改变本地SQLite/v1站点，不读业务配置/密钥，不在业务库执行任何DDL或删除，不推送部署发布。Claude Code/claude-ds接手必须读本协议，区分删除历史、去重账本保留与账号停用。

## 2026-11-16 本地结果与运行

上述删除入口、nullable marker和同事务清理已实现，未挂main生产或当前SQLite/v1页面。`get_owned/cancel`保留可信终态读取；独立审查复现初版隐藏控制读取导致settle跳过Worker观察/Redis释放，同一确定性栅栏修前观察/释放均0、修后均1。另保留可索引相等候选+BINARY裁剪，不使用CAST-only全表条件。

完整API733通过，新增SQLite删除12项包含全终态、每个破坏阶段回滚、提交后ACK丢失及排序规则模拟；独立erasure/router/ledger/AI历史48项通过。真实MySQL8.4.13/Redis7.2.17、JWT/current account与ASGI正式HTTP路径19项通过（原10+新9、零skip）。两种交错均先确认实际InnoDB LOCK WAIT，再放行完成/删除；第九项在settle前删除，确认真实Redis占用保持至Worker状态确认，然后释放。真实unicode_ci下等值但字节不同的alias消息和反馈保留，普通聊天内容保留。

中央schema合成升级29项复验通过，旧Agent结构缺新增marker时自动补NULL，不删除原记录。先前八题mysqld实际SIGKILL矩阵也在最终源上复验通过；它们仍覆盖admission/completion/model预算，不冒称新删除操作的断电或专门crash验收。新删除自身的ACK丢失是connection.commit成功后确定性注入；前后边界与安全结果见[本轮实证](../evaluations/agent-history-erasure-2026-11-16/README.md)。

```bash
corepack pnpm check:api
apps/api/.venv/bin/python scripts/test-agent-stack.py --mysqld /absolute/path/to/mysqld --redis-server /absolute/path/to/redis-server
apps/api/.venv/bin/python scripts/test-agent-mysql.py --mysqld /absolute/path/to/mysqld
```

root-script与api:deploy-schema通过；根format:check仅既有`docs/content-sources/csdn-qq-42345136/manifest.json`失败，不自动修改其他dirty。博客04同题说明删除内容/去重记录/停用三者区别，新透明关系图通过1280/390预览，未发布。本轮不读取真实账户/业务库/凭据，不发送供应商请求；owned两库全部回收，既有本地站点继续保留。

全账号物理清理、跨会话family的历史管理、自动历史TTL与备份/日志期限尚无入口，不以本轮功能代替这些政策。目标业务库/备份恢复、在线旧池故障恢复、未知孤儿/cgroup/旧锁、Linux、人工语义、上游版本策略和生产TLS仍独立待验收，P1/A–D整体未完成。
