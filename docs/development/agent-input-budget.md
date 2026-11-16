# 官方API输入token预占

2026-11-16，基点36b2e0f。已在gpt-6.1-sol Responses profile加入可信供应商输入计数，并在正式MySQL Gateway及正在使用的开发SQLite入口持久预占。无需本地模型/分词器，生产与普通聊天不变。接口依据[官方输入计数声明](https://developers.openai.com/api/reference/resources/responses/subresources/input_tokens/methods/count.md)和[计数指南](https://developers.openai.com/api/docs/guides/token-counting.md)；真实一致性及不同链路的验收范围见下文，不只凭文档放行。

## 固定流程与接口

1. 在任何计数出网之前，原model次数/输入字节/输出及响应预占先提交；同一run仍最多4次尝试，不给计数失败额外重试或退款。MySQL仍使用现有ModelJournal.reserve，SQLite新增同事务的model attempt记录，不能只靠内存锁。
2. AI.public暴露`is_counted_model_proxy(proxy)`、`MODEL_INPUT_LIMITS`以及只含计量/摘要的冻结`ModelInputMetadata`。OpenAiResponsesProxy提供`prepare(body)`、`input_metadata(handle)`、`generate(handle)`。prepare使用同一份已验证canonical Responses wire生成计数投影，固定POST `/v1/responses/input_tokens`，8秒/4KiB/单次、无retry；严格响应仅object=response.input_tokens与正整数input_tokens（至INT32）。truncation显式disabled。计数投影只去掉非输入字段max_output_tokens/store/stream，保留model/input/tools/tool_choice/parallel_tool_calls/reasoning/truncation，未来出现新输入字段必须显式评审。
3. prepare成功才返回不透明handle。wire只保留immutable bytes；proxy用每实例WeakKeyDictionary绑定handle和内部冻结metadata/原wire及单次消费状态。外部构造/复制/跨proxy/重复generate均在DNS前拒绝；计数后修改原body不能改变生成wire。metadata字段固定`input_tokens`、`wire_request_hash`、`count_request_hash`，不含正文/凭据。不得重建一次生成payload来冒充已计数请求。
4. Gateway在计数期间持续实时授权，随后重新锁run和call，检查live权限、截止时间与余额，在同一UOW写input预占和两个wire/count摘要，commit确认后才generate。单请求输入16384 token、累计32768/run，不接受Worker覆盖。任一预算失败回滚该input预占；原attempt预占保留。慢commit越过deadline或commit确认丢失均不生成，取消必须排空run_sync线程事务。不持DB锁等待网络。
5. generate再次检查issuer、单次消费及单请求上限；消费发生在任何DNS前，失败也不能再用handle。实际响应input usage必须与预占计数完全相同，不匹配拒绝、不退款、不重放，不能把模型观察值当新的许可。原output/response限制和交付重验不变。单次完整模型操作仍30秒工作deadline，计数与生成共享该期限；独立close排空可延长返回。

直接`proxy(body)`也做prepare+generate和每请求硬限，但没有run账本就不声称持久累计上限。正式和开发Runtime必须显式使用两阶段接口后才可声称run输入预占；原未计数的Qwen/合成proxy保留兼容路径，不伪造零计数，也不因此声称已通过输入硬限。

原64KiB/256KiB响应预算仍指生成响应；计数另有4KiB/次、最多16KiB/run元数据读取上限，由持久attempt最多4次且每attempt只计数一次约束。原Gateway累计输入bytes不是供应商累计wire bytes，两次网络请求都各有128KiB wire上限。prepare可返回1..INT32的合法计数供事务决定余额；generate独立拒绝超16384，即使调用者没有账本也不能超单次上限。

## 持久边界

MySQL增量字段：agent_runs.model_input_tokens_reserved，默认0；agent_model_calls.reserved_input_tokens、wire_request_hash、count_request_hash、input_reserved_at，可空以保留旧记录/未完成计数的含义。ModelJournal.reserve_input按当前run与call行锁判定，重复相同元数据不二扣、不同值冲突，终态/unknown不能追加新预占。observe对已计数call要求实际input_tokens严格等于预占值。state仍reserved/observed/unknown；count失败或确认不明保留原预占，不记录假usage。无业务库迁移或生产DDL授权，验证只用owned临时库。

SQLite runs增量input reserved计数及独立model attempt表，记录UUID、请求摘要、可空计数/摘要；begin attempt和次数同事务，input预占和attempt绑定同事务，提交后才能生成。失败/取消/重启保留已提交额度，不在每次创建Store时清零。现有未完成run重启中断语义不变，不把SQLite测试当InnoDB行锁验收。

## 验收与交接

默认测试全离线：计数/生成同源wire、完整工具历史、严格响应/控制/超限、opaque handle防替换与重复、超时/重复取消/close排空、计数前预占、并发余额、授权撤回、慢commit/确认丢失及重启保留。显式owned MySQL验证同run并发计数争用、ACK丢失与真实数据库事务中的token预占；上游为MockTransport。另用批准的官方key/Clash做有界合成输入计数→生成usage对比和真实本地问答，只保存安全投影，不记录原始响应/推理/headers/key。

博客05同题修订，解释两次预占、固定payload和usage不匹配拒绝；保留后端分类及原三标签，先评估现有预算图能否准确表达，不自动加图或发布。新增协议先存本文并广播coding/判官，下次Claude Code接手同步；其他dirty保留。Linux/人工语义/模型版本/旧库崩溃及生产TLS等原门槛独立保留。

## 已执行验证

- `corepack pnpm check:api`：696项通过；`corepack pnpm check:ai-interface`通过。未修改Worker，本轮没有重跑或增加其71项历史结果。
- `apps/api/.venv/bin/python scripts/test-agent-mysql.py --mysqld <verified-mysqld>`：一次性MySQL 8.4.13共19项通过，含4次计数争2份生成额度、input commit ACK丢失无生成；owned mysqld和数据目录已回收，没有访问业务库。
- 判官独立AI41项、正式预算9项和旧实时授权16项通过；发现开发Runtime最后一次授权线程游离于任务注册表的P2后，将完整模型操作放入owned task，新增最终授权等待时取消/关闭的栅栏回归。最终本地预算7项及旧授权16项独立复验通过，无剩余确认阻塞。原先直接wait_for重复取消导致的两项授权回归也已修复，696项是在最终修复后运行。
- 官方API固定三组合成数据：Unicode、两工具定义、工具历史分别计数177/184/219，与生成input usage逐项相等；每组只计数和生成一次，无重试。固定请求、控制和完整历史的协议范围通过，不等于任意未来模型版本或全部输入的一般证明。
- 当前开发站点正常登录、实际SDK三次模型和两次博客工具、文章41来源及刷新恢复通过。SQLite三项observed：551/1935/676，逐项等于预占且run累计3162；桌面1280/手机390无溢出或pageerror。该链路是当前workspace前端和开发SQLite，不冒称正式MySQL/mTLS V2连接官方模型整栈已验收。
- 博客05正文1280/390预览通过，5稳定标题ID、7处strong、透明图360/342px，未新增图，未发布；使用工作区既有未提交renderer/CSS，不代表完整文章页验收。

安全数值/摘要、源文件SHA及范围见[本轮实证](../evaluations/agent-input-budget-2026-11-16/README.md)。历史Qwen探针的三个false不变，历史一次官方模型代理失败根因仍未知；不得用本轮成功反推旧故障已修复。Linux硬隔离、人工语义、模型版本策略、已有业务库升级/崩溃、留存回收和生产TLS仍未完成，P1/A–D不整体放行。

后续已补正式MySQL/mTLS V2+官方模型完整组合：同一固定四题一次通过，13次模型调用全部observed，输入累计12142；每项计数/预占/usage及run累计相等，详见[官方整栈实证](../evaluations/agent-official-stack-2026-11-16/README.md)。这补齐此前组合缺口，仍不改变Linux/人工/生产等独立结论；原安全报告的false仅指当时版本，历史文件不改写。
