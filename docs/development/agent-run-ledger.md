# 正式运行账本：C1 生命周期与同事务历史

日期：2026-11-15。状态：本地源码实现，未接入 HTTP、Worker 或生产准入；未连接真实数据库执行DDL。前置与后续见[分阶段计划](../plans/dsh-platform-implementation.md)。这不是整个阶段C验收完成。

## 数据与事务边界

`schema_migration.py`集中新增`agent_runs`，不改已有AI表字段。唯一键为`(user_id, scenario, idempotency_key)`，会话ID单独唯一；run、execution与摘要字段采用ASCII binary列排序，时间绑定UTC naive DATETIME(6)。版本、模型、引擎与会话family摘要保存在运行表；不保存访问/刷新令牌、原始family、Worker服务凭据或派发凭据。完整问题只在AI用户消息中保存，运行表保留规范化请求摘要。

`MySqlRunLedger.accept`锁定当前用户行（含账户启用检查）后，判断幂等键、创建AI会话/用户消息和accepted记录，只提交一次。请求摘要绑定规范化问题与固定场景，服务器配置变化不改变同一请求的幂等解释。不同参数返回独立冲突；不同账户可使用同一UUID键。不同family先返回不暴露运行存在性的not-found，再考虑参数差异。

`AgentHistoryTransactions`由AI模块拥有，经`ai.public`导出；接收同一个UOW，不另开连接、不commit。每个run独立`agent_conv_<hex>`会话，seq1是纯文本问题，seq2是纯文本答案与已校验来源链接。引擎/场景由run行关联记录，无需旧表新增列。普通聊天列表、读取、追加、编辑和反馈都排除该命名空间，不查询尚未部署的agent表，因此未迁移环境的旧聊天仍可工作。

旧AI表使用unicode_ci，不能仅检查请求ID前缀。普通仓储在SQL中过滤实际行的Agent前缀，再对返回的canonical ID复验；测试用重音折叠比较器复现并修复了重音别名绕过。比较器只是相关语义的本地近似，MySQL排序规则另按[官方命名说明](https://dev.mysql.com/doc/refman/8.0/en/charset-collation-names.html)理解，不把模拟结果视为MySQL实测。

## 状态与故障语义

| 操作 | 条件与效果 |
| --- | --- |
| claim | 只领取accepted、未派发、generation1且未到deadline；写execution与根session、10秒租约，再由未来dispatcher派发。再次claim返回空，不创建第二份执行 |
| 根turn登记 | 仅当前有效execution/generation/租约；首次写入，重复同值幂等，不允许换turn |
| heartbeat | 原租约和45秒deadline都必须仍有效；新租约最多延长到deadline，不复活已过期运行 |
| cancel | 当前owner/family的accepted或running变cancelled，终态保持；进程回收由未来编排接线负责 |
| commit_answer | 匹配execution、代次、根session/turn及活跃租约；锁会话/写seq2后再次检查时限，再把completed与结果摘要同事务提交 |
| 重复完成 | completed下同绑定同摘要只返回已保存结果，不再次写消息；不同摘要冲突；取消/中断后迟到成功不能写消息 |
| reconcile | 每批最多100条；accepted超时为failed，running过期/损坏租约为interrupted，不重派、不重放；未领取且未过期的accepted保留 |

创建和完成在数据库commit响应丢失时都不自动重试执行；调用方可用原幂等键/原执行绑定重新确认结果。事务提交失败时消息和run状态一起回滚。没有构造函数扫描/清空全表，也不在实例化时把其他进程运行中断。

时钟由服务器注入，拒绝无时区datetime；锁等待之后再取当前时刻。来源、实时授权和开关检查仍由下一步正式网关负责，不能直接把该内部存储方法暴露成HTTP/RPC授权入口。当前API仍使用既有仅本地SQLite适配，尚未切换为此MySQL实现。

## 验证、迁移与待完成项

```bash
apps/api/.venv/bin/python -m unittest discover -s apps/api/tests -p test_agent_run_ledger.py
apps/api/.venv/bin/python -m unittest discover -s apps/api/tests -p test_ai_agent_history.py
corepack pnpm check:api
corepack pnpm check:api:deploy-schema
```

本轮账本16项、AI历史9项、旧AI仓储20项通过；完整API gate 471tests通过。事务测试使用真实临时SQLite连接，覆盖并发接受/领取、取消完成竞争、消息写后状态失败rollback、写答案中跨deadline、提交回执丢失后的幂等恢复。适配器用BEGIN IMMEDIATE比InnoDB行锁更强地串行化写者，不能证明MySQL锁行为、SQL模式、故障恢复或实际迁移成功。本机未安装Docker/mysqld，没有为了测试向配置local目标写表。

后续C2必须补来源/工具调用回执、累计预算、网关实时会话重验、模型/执行凭据、正式服务接线与对账调度，再在一次性MySQL实例跑真实并发/崩溃矩阵。B的Linux隔离、资源硬上限和TLS另行验收；全部放行前生产开关保持关闭。

DDL仅新增表，复用仓库既有集中迁移工具；本轮只运行静态check，不执行apply或validate-live。回滚时保持新表与记录，回退未启用调用方；不用删除数据来回滚。当前没有清理/TTL入口，不会提前删除幂等记录允许复用旧键；投产前还需落实账户删除、历史删除及诊断/幂等保留策略和容量约束。


后续本地C2已实现[网关与来源预算](agent-run-gateway.md)：commit_answer现在必须提供同事务prepare回调，不再直接接受外部blocks；callback由正式网关做身份与来源重验。仍未接线到HTTP/Worker，不将内部存储方法当外部授权入口。
