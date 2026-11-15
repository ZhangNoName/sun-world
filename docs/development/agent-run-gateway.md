# C2 正式网关、工具回执与预算

日期：2026-11-15。基点3b24abe。本地库实现，尚未接HTTP/TLS、正式Worker或原SQLite入口；无真实DB DDL、模型/生产调用。C1见[生命周期账本](agent-run-ledger.md)，总体放行仍按[计划](../plans/dsh-platform-implementation.md)。

## 身份、配置与授权

`RunGateway`必须注入enabled、authorize、allow、固定registry/两工具handler、模型代理、bundle/model ID、规范HTTPS站点origin及高熵Worker服务凭据，不提供默认allow或从请求解析用户身份。只安装搜索/读取两工具版本1，schema从registry取得，输入规范化后计算参数摘要。

`claim`在同事务写execution、10秒租约与tool/model/result三份随机凭据摘要，返回的明文只交可信派发器，库不落盘；Worker服务凭据在构造时只保留SHA256。RunCredentials/RunCall的repr隐藏凭据。调用同时校验服务凭据和对应audience的随机token，再比对run/execution/generation、deadline/lease、当前Principal的owner/family、单项目/场景和固定版本/模型。根turn登记与heartbeat使用result audience；不能用tool token完成回答或调用模型。

每次调用及业务读取/结果提交前后都调用live hooks，错误与依赖不可用fail-closed。authorize显式接收`(uow,row)`，allow接收`(principal,row,uow)`，可以复用当前连接；不能在小池已被并发锁等待占用时再无限借连接。C3还必须定义真正“当前”的账户/角色读取方式与统一锁顺序：MySQL Repeatable Read普通一致性SELECT可能重用旧快照，不能作为撤销已实时生效的证明。当前测试只验证hook必需、失败关闭和连接复用，不证明真实MySQL撤销栅栏。

库不自行建立真实账号会话，服务身份检查也不等于网络/TLS隔离。C3必须绑定既有AuthManager/SessionAuthenticator和可信内存会话引用；API重启丢失引用时禁止凭账本family摘要重建登录身份。

## 工具与来源状态

`agent_tool_calls`唯一`(run_id,generation,call_id)`，只保存tool/version、规范化参数摘要、状态、结果摘要/字节数、固定错误码和时间。**不保存参数、结果JSON或正文**。新调用先持久化reserved并扣工具次数，再读业务。失败不退款；同ID同工具/版本/参数只返回原状态，不重复扣次或重读，不同则冲突。

工具完整响应规范为`{call_id,result,source_id,result_hash}`。摘要是SHA256(canonical UTF8 JSON `{call_id,result,source_id}`)，不含digest自身；字节预算计最终含result_hash的整个响应。read来源UUID预分配后一起进入摘要，不与文章整数ID混用。C3适配器必须按该规范核对完整响应再回执；**不能直接沿用原本地协议的结果摘要/整数来源ID解释**，需版本化握手和契约测试。

正文实际UTF8字节还必须与returned_bytes一致且不超过16KiB，不能靠伪造长度字段绕过。结果准备成功后，同一事务扣累计字节、把调用改prepared并写`agent_sources`。只有read产生来源，保存article ID/title、完整快照摘要、实际片段摘要、read_at和delivery标记；search不产生来源。完整响应只在有界内存cache保存（最多32项/128KiB，至run deadline）。cache丢失/驱逐后重复call明确不可重放，不重新读变化后的正文伪装原结果；未来编排层据错误收敛运行，不自动重试模型/工具。

回执匹配同run/代次/call与完整响应摘要，将调用和来源的delivered状态同事务更新；相同回执幂等，不同摘要拒绝。prepared、不存在、别的run/代次的来源或重复source ID都不能引用。

## 最终事务与模型预算

finish入口先检查服务/result凭据；C1的commit_answer改为必须提供受信任prepare回调，在锁定运行的同事务内重新授权、恢复已交付来源并调用模块读取当前公开性/完整快照/片段。来源变化或无法确认拒绝完成。链接由固定origin与当前article ID生成，标题显示限500字符并保留空标题回退；模型不能传URL。无来源时只用固定未找到回答。结果只生成text/plain与可信link，拒绝模型HTML/URL链接表现和超长/无效Unicode答案。

授权/来源检查后，最终消息与completed/结果摘要同事务提交；结束前再验时限。相同已完成回调仍验证当前身份和来源；不会再写消息。该检查仍是跨MySQL/Mongo观察边界，不承诺提交瞬间文章永不变化。

模型调用同事务预扣每run最多4次，失败、取消或回执不明不返还。body最多128KiB，拒绝凭据/地址/owner配置字段，模型名由服务器覆盖，max_tokens固定1024。代理使用既有受审查StructuredModelProxy；最多等30秒且不越过总deadline，等待中每0.1秒重验运行/身份；撤销后取消代理任务并等待清理。模型结果最多256KiB，限定已知stop_reason和固定model；未知结果失败。provider的网络固定/响应上限沿用AI模块，不从模型参数选择出站目标。

工具最多4次、完整工具响应累计64KiB；这些只是当前P1开发预算，不是容量或模型语义质量保证。总token、Linux内存/PID硬限制、TLS/网络规则仍按B验收，不因库单测通过就开放内测。

## 验证与继续工作

新工具journal13项、网关20项真实SQLite事务测试，加C1 16项覆盖：同call规范化幂等、完整响应摘要/字节、预算与回滚、回执/跨run来源、内容变化、cache丢失、双凭据/受众拒绝、模型失败计数、取消drain、实时hook失败和同连接复用。SQLite写锁更强，不代表InnoDB锁验收。未调用真实模型或修改配置数据库。

```bash
apps/api/.venv/bin/python -m unittest discover -s apps/api/tests -p test_agent_tool_journal.py
apps/api/.venv/bin/python -m unittest discover -s apps/api/tests -p test_agent_run_gateway.py
corepack pnpm check:api
corepack pnpm check:api:deploy-schema
```

C3继续补正式调度/路由、会话与准入、内外协议契约、API重启/丢失派发确认、SSE生命周期和端到端恢复；一次性MySQL实例验证迁移、真实锁/池/撤销，再完成B的Linux隔离。集中schema只新增两表与运行列；本轮仅静态check，不执行apply。旧SQLite入口原协议保持，本库不会自动替换它。当前没有TTL清理或删除幂等记录的逻辑，清理/账户删除策略投产前另验。
