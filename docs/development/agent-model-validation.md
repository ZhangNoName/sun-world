# 模型预算与真实问答验证

日期：2026-11-16；基点0e26b90。此轮新增模型预占账本、严格结构化适配和显式真实模型评测。生产main未挂载Agent入口，旧SQLite/v1入口保留，不部署、不发布。总体放行仍按[实施计划](../plans/dsh-platform-implementation.md)。

后续增量：官方gpt-6.1-sol Responses路径已接入[完整输入计数与持久预算](agent-input-budget.md)，单次16384、累计32768输入token；正式Gateway与本地SQLite均有两阶段预占。下文Qwen整栈/探针的历史结果及三个false保持原义，不套用为官方路径的结论。

## 预占与观察分开

`agent_model_calls`以run/generation/服务器生成的call UUID唯一标识请求，保存请求摘要、输入字节、输出/响应预占、reserved/observed/unknown状态、可空实际用量和结果摘要。`agent_runs`新增七项累计计量；不另存提示词、正文、响应文本、凭据或推理内容。schema是集中声明的兼容增量，已有业务库升级和DDL部分成功恢复仍未验收。

Gateway在同一UOW锁run、实时授权、扣模型次数并写ModelJournal预占，提交确认后才创建provider task。提交后再次检查剩余期限；慢commit越过deadline不能启动模型。run_sync排空在途同步事务，撤销不能让尚未结束的数据库线程在后台继续后又重试。提交确认丢失不猜成功、不重放provider。并发请求共享run锁，每项余额不足使整个预占回滚。

| 项目 | 每请求 | 每run |
| --- | --- | --- |
| 模型次数 | 单次尝试，无自动retry | 4 |
| 输出token预占 | 1024 | 4096 |
| 响应字节预占 | 65536 | 262144 |
| Gateway canonical UTF8请求 | 131072 | 262144 |

限额由AI.public的冻结`STRUCTURED_MODEL_LIMITS`提供，Worker不能指定或缩减预占。Provider另检查转换后的实际canonical UTF8 wire request不超过131072字节、实际读入response不超过65536字节；累计Gateway输入字节不等于累计上游wire字节。持久observed response_bytes是适配后Gateway JSON大小，不冒称原始供应商响应字节。

合法响应必须有严格非负整数input/output usage，output不超过1024；缺失、bool、非法数、总数矛盾拒绝，不补零。观察与预占独立、不退款。同一call重复相同用量不二加，不同值冲突。超时、取消、格式错误或保存结果不明只尽力标unknown；保存本身失败时保留reserved，不凭未知数据构造usage。observed ACK丢失后不能改写unknown或再次加量。终态后可补诊断计量，但不改变终态或授予交付权限，迟到答案仍被拒绝。

**本节原Qwen兼容路径的输入token仅记录供应商观察值，尚无模型匹配且验证过的tokenizer和硬输入token总限。** 官方计数路径的后续预占机制见本文开头链接。输出token/字节预算不能替代此项，也不是实际账单或容量证明。

## 严格Messages与OpenAI适配

固定SDK 0.2.2-rc.1 profile显式thinking disabled、reasoningEffort off、maxTokens1024。代理只接受exact disabled控制，拒绝enabled/未知控制/output_config。验证角色、固定两工具、调用ID及结果顺序、严格JSON参数、唯一choice、模型身份、停止原因与usage；历史ID不能复用。有限字段兼容不表示通用供应商兼容。

实际Qwen返回中性annotations/audio/function_call空值及reasoning字符串；只接受明确定义的形状，reasoning/reasoning_content均非空时必须一致。推理内容被丢弃，不写入公开答案、工具参数或评测报告；profile关闭SDK推理控制不承诺供应商内部不推理。

沿既有OpenAiCompatibleProvider的host allowlist、DNS/IP pinning与SNI，trust_env false，无重定向/重试/压缩体。请求总deadline30秒且不越run deadline；client创建/进入/读响应异常和重复取消均等待独立shield的close排空。清理可能延长返回时间，30秒不是未确认清理仍能强行返回的保证。普通文本Provider未改。

## 显式真实模型评测

`scripts/probe-agent-model.py`先用owned Redis、内存AI目录/history和独立loopback AI V1 router执行维护CLI `ai models`/`ai ask`，证明调用路径可用，不加载应用lifespan或业务配置。真实模型由AI.public既有local-only、keyless验证factory固定选择qwen38_27b；不允许传个人URL/key，不访问生产AI接口。供应商未给出不可变权重版本，因此报告明确alias only。

整栈launcher在[真实三库与SDK验证](agent-sdk-stack-validation.md)基础上增加显式模式：

```bash
apps/api/.venv/bin/python scripts/test-agent-sdk-stack.py \
  --mysqld <verified-mysqld> --redis-server <verified-redis-server> \
  --mongod <verified-mongod> --sdk-runtime <new-prepared-runtime> \
  --node <project-node-24.17.0> --real-model --report <new-absolute-report.json>
```

生产runtime在创建owned fixture目录前拒绝；real模式必须指定新报告，不能和interrupt probe并用。报告O_EXCL/0600、正常每case后flush/fsync，诊断只投影固定字段/枚举/类型/有界数量（拒绝响应也不保存自由值或未知字段名），记录固定数据/摘要、源码/Skill/profile/bundle摘要、实际输出/来源/预算、合法适配响应、结构metadata及清理观察；不记录原始推理/headers/凭据。默认API gate不启动数据库/SDK或真实模型，默认SDK六情景仍为合成模型。报告采用原地更新，硬终止可能留下半份JSON；重复取消也可能在资源排空后中断最后一次保存。缺失/不可解析/running记录均属未完成，不能当通过或当成已确认的模型失败分类。

固定数据位于`apps/api/tests/fixtures/agent-model-evaluation.json`，覆盖有答案、无答案、多文章冲突、正文提示注入。自动检查完成状态、来源集合、事实词组、禁用片段和预占上限，不能以这些检查代替人工语义判断。每个问题使用独立三库namespace/TLS/Worker与合成公开文章。主agent与判官的语义复核单列，`human_semantic_review`保留pending。

中间失败样本保留在[评测目录](../evaluations/agent-model-2026-11-16/README.md)：SDK默认推理字段在出网前被拒绝；中性响应字段不兼容；重复近义搜索耗尽四工具额度。未修改固定题/评分或放大额度，最后一项通过产品Skill明确连续子串搜索、优先单一辨识词、限制重搜并及时read修复。v2 Skill/hash和catalog bundle同步更新，prepared Worker必须重新打包，不能混用旧hash。v1 Skill正文和导出首位保留。

## 本地验证及未完成门槛

预算事务8项（含取消commit排空、慢commit过期不出网）、严格适配25项、清理9项进入默认gate；native MySQL新增并发8争4和提交后观察ACK丢失，共17项。完整计数、独立暂存快照和真实评测结果以[分支交接](../handoff/branches/zxy-dsh-platform-foundation.md)为准。

原Qwen路径的输入tokenizer/总输入token硬上限、不可变上游模型版本、人工语义验收、Linux memory/PID/network硬隔离、持久journal留存与离线回收、已有库升级/DB与宿主崩溃矩阵、生产TLS签发轮换仍是独立未完成门槛。本轮小样本不能放行P1或A–D整体。

最终暂存复跑额外修正一次性MongoDB的默认Unix socket前缀，新增双实例实际监听/独立数据回归；详见[SDK整栈说明](agent-sdk-stack-validation.md#unix-socket隔离修正2026-11-16)。修前四题不能作为修后socket隔离证据。

SDK fixture父reaper现把瞬时EPERM视为未确认、有界继续TERM/CONT/KILL，分别重试被拒信号；永久拒绝仍失败并保留私有证据。新增三个实际owned孤儿回归（含三个signal子情景）与独立兜底，不能把权限拒绝解释为ESRCH。历史两次原生失败仍缺首错，见[回收观察](../evaluations/agent-model-2026-11-16/cleanup-observations.md)。

## Tokenizer能力探针契约（2026-11-16）

下一切片只建设显式、无生成的能力探针，不改变模型代理、预算账本或运行准入。维护CLI现无tokenizer能力，因此使用既有local-only keyless factory和Provider网络策略；不能接收自定义URL、key、消息或模板。只允许GET `/v1/models`、`/version`、`/tokenizer_info`和POST `/tokenize`，顺序有界、不重试、不调用生成或detokenize。生产runtime在出网或创建报告前拒绝。

报告必须新建O_EXCL/NOFOLLOW/0600，写入有界投影并fsync；只保留固定状态/错误类别、已知字段的存在、版本安全字串、摘要和数值。不得保存未知字段名、原始模型根路径、token IDs/strings、模板、响应自由文本、headers或凭据；失败报告不能当成功。默认测试模拟网络，真实探针是独立显式命令，不进入常规CI的联网路径。

固定合成样本覆盖中文/英文与Unicode、固定两工具定义、工具调用与结果历史；Messages转换复用当前代理适配，计数请求包含完整消息与工具及明确的generation/special-token开关。报告标明这是tokenize协议投影，不是生成请求的逐字复本，不能推断两接口采用相同推理控制/模板。响应count须为严格整数、等于有界非负整数token数组长度；计数响应的未知字段、重复JSON字段、非法数、超大体或不匹配均拒绝。单请求8秒、全探针网络工作45秒，独立shield close排空沿用代理做法，清理可能延长返回时间；错误只投影固定枚举。每步保存安全观察前缀；硬终止导致running/半份JSON时只能算未完成。探针临时收窄进程级insecure-origin配置并最终恢复，不能并发嵌入业务应用。

即使探针成功，`tokenizer_verified`、`immutable_model_revision_verified`和`input_token_hard_limit_verified`仍固定false。模型别名、服务版本、root字串摘要、max_model_len与单次服务端计数均不能证明锁定了模型权重、tokenizer词表和chat模板。下一步必须获得可核对的不可变模型/分词器工件及实际生效模板，再比较完整wire输入的本地计数和供应商usage，最后将预出网计数与累计硬限接入同一预算事务。不得以字节换算、采样相等或仅有服务端count跳过此门槛。

显式运行入口：

```bash
apps/api/.venv/bin/python scripts/probe-agent-tokenizer.py \
  --probe --report /absolute/new-tokenizer-report.json
```

默认无参数及`--help`仅显示帮助，不联网；不接受自定义测试数据或服务地址。退出0仅表示此固定探针的响应协议通过，1表示失败，2为参数错误，130表示取消。只有退出0且报告可解析、status为ok，才算响应协议通过；落盘/关闭确认失败时即使文件中已有ok也不能算通过。三个验收门槛仍为false，不能只看退出码或单独看文件。当前协议依据[vLLM 0.28.0计数请求与响应声明](https://github.com/vllm-project/vllm/blob/v0.28.0/vllm/entrypoints/serve/tokenize/protocol.py)，并不据此推断测试端点锁定了该源码或任何模型工件。

用户后续选择直接接入OpenAI官方API，不要求本地部署模型。上面的工件/本地计数路径是当前Qwen别名的待验收方案；官方Responses另提供[完整请求输入计数接口](https://developers.openai.com/api/docs/guides/token-counting)，可作为新的供应商计数路径评估。是否覆盖实际生成payload、如何持久预占与验证仍需单独实现，不沿用本次Qwen探针放行结论。
