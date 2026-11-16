# Agent 历史删除、去重保留与账号停用

基点5cffc24，macOS arm64，本轮仅操作新建owned MySQL8.4.13/Redis7.2.17和合成数据。正式public router/Application、JWT/Redis会话、当前MySQL账号角色真实运行；HTTP通过ASGI transport，Worker/文章/模型合成，无供应商调用或业务数据删除。新增接口未挂生产或现有SQLite/v1站点。

## 结果与边界

| 检查 | 最终结果 |
| --- | --- |
| `corepack pnpm check:api` | 733项，28.975秒，通过 |
| 新SQLite删除回归 | 12项，包含全终态、所有删除阶段失败回滚、ACK丢失、旧键/late callbacks、别名精确匹配；BLOB/NOCASE仅模拟MySQL语义 |
| 原生正式栈 | 19项，15.385秒，原10+新9，零skip；真实MySQL/Redis/Auth与ASGI HTTP |
| 原生中央迁移回归 | 29项，4.495秒，零skip；合成缺新marker结构补NULL并保持旧记录 |
| 既有原生崩溃矩阵复验 | 8项，10.057秒，8次SIGKILL同数据目录重启；仍为旧admission/completion/model预算场景 |
| 独立review | erasure/router/ledger/AI历史48项、Python AST10文件通过；原P2同一settle交错修前0/0、修后1/1；未独立启动真实DB |
| 静态与格式 | 变更Python13文件AST、root-script、api:deploy-schema、scoped diff和本轮JSON格式通过；根format仅既有内容manifest失败 |

## 九个原生删除场景

1. 本人删除completed：问答/标题/反馈/来源/tool/model详情移除；run终态、身份、累计预算保留，凭据与结果/root关联清空。真实unicode_ci下相等但字节不同的alias消息及其反馈保留，普通聊天也保留。重复删除成功，公开GET404，原键同/换问题均409且不收费、不启动、不调用模型，late结果/模型回调拒绝。
2. running删除409，不取消、不释放、无数据改变；显式取消后删除成功。
3. 他人/同user新family/未知run均404，响应不泄露原run，记录不变。
4. 实际UserManager.delete_user仅停用；旧会话GET/DELETE401、迟到完成拒绝，历史与marker不变。
5. 删除已执行AI清理后，另一连接提交账号停用；同UOW最终当前读拒绝，整段删除回滚。
6. AI清理后注入run marker写失败，所有内容/详情回滚；再在真实COMMIT成功后注入ACK丢失，HTTP503但删除已提交，重复DELETE成功，不重建历史。
7. 删除持有run锁时，公开读取与late完成进入两个真实InnoDB LOCK WAIT；删除提交后分别404与凭据拒绝，无内容重建。
8. 完成事务持锁时，删除与读取进入真实LOCK WAIT；完成提交后删除成功，读取只能见完整completed快照或404，最终无问答内容。
9. completed后将实际Application._settle暂停，删除200时真实Redis槽仍owned；放行后Worker.inspect观察到已删marker并确认终态，再释放真实槽，公开GET仍404。既有SSE可能已发出的内容不能收回。

## 发现、修复与来源

判官在临时SQLite+真实Application._settle栅栏中确认：初版get_owned也隐藏已删历史，导致Worker观察0、释放0却移除本地lease。现可信get_owned/cancel包含已删终态，公开_view默认_owned仍隐藏；同交错修后1/1，原生第九题又核真实Redis，不能用“GET404”替代资源已释放。主线程同时要求普通相等候选与BINARY精确约束并用，避免仅CAST条件丢失现有索引的候选范围。

首轮原生18项有一个fixture错误：alias消息与canonical相同sequence触发实际unicode_ci唯一键；改alias为sequence9，保留生产唯一约束，随后增加settle第九题并冻结源，最终19项通过。不将其记作生产缺陷。旧崩溃预算case的replacement warning仍保留在ignored原始日志，不宣称旧在线池自动恢复已完成。

- [原生正式栈安全投影](native-stack.json)：准确列出九题、真实/合成组件、两个LOCK WAIT和Redis回收范围。
- [既有崩溃矩阵安全投影](mysql-crash-regression.json)：本轮最终源复验，不新增erasure-specific crash结论。
- [最终检查与源码摘要](validation-manifest.json)：42项selected source SHA对应执行源树8c5ccf5078ab46eb064498c279ceef5c6cbca692。
- [开发与复跑契约](../../development/agent-history-erasure.md)。原始日志、浏览器截图及本地诊断留在ignored `.tmp/history-erasure`，未复制问题正文、凭据、env或原始数据库记录。

当前历史由当前owner/family显式删除，默认保留至删除；永久去重记录仍关联账户，不能称匿名化或完整账号数据抹除。没有全账号物理清理、自动历史TTL、备份/日志清除、跨family管理或用户删除UI；账号停用保留原行为。Linux/未知孤儿/旧锁、目标库迁移与备份恢复、断电/跨版本/旧在线池恢复、人工语义/上游版本策略/生产TLS仍独立未完成，持续goal与P1/A–D未整体完成。本轮不推送、部署或发布。
