# 固定 SDK 与真实存储整栈验证

日期：2026-11-16；基点c9906df。此项是显式本地验证基础设施，不挂载生产main、不切换原SQLite页面。默认路径不读取业务配置或凭据，后续官方profile只从显式授权的私密文件读取模型key；默认合成结果不等于真实模型验收，任何本地结果均不等于Linux或生产上线验收。

## 验证链路与信任来源

`scripts/test-agent-sdk-stack.py`只接受已核对的mysqld、redis-server、mongod、prepared SDK runtime与项目Node绝对路径。SDK准备仍使用[Worker V2说明](agent-worker-v2.md)中的offline命令，固定0.2.2-rc.1、禁install scripts；本次准备592缓存包/下载0。运行期间不安装依赖。

| 环节 | 本次真实实现 | 合成或未覆盖的部分 |
| --- | --- | --- |
| 浏览器接口 | HTTPX实际HTTPS/SSE、正式public_router | 不渲染Web页面，不是完整前端E2E |
| 身份与准入 | AuthManager/JWT、真实Redis会话和Lua预占 | 临时账号/会话密钥，不使用业务身份 |
| 运行与历史 | 正式RunApplication/Dispatcher/Gateway、真实MySQL事务 | 新建中央schema；不是已有库升级或MySQL崩溃恢复 |
| 工具与来源 | module_composition工厂、博客public facade、MySQL元数据与真实MongoDB正文 | 文章明确标为合成数据 |
| 执行端 | 实际mTLS Worker HTTP、ExecutionService/ProcessRunner、固定SDK两工具、UUID回执/root/result | macOS sandbox-exec；不是Linux资源/PID/网络隔离 |
| 模型 | 正式模型代理与预算/撤权检查、实际SDK Messages流转换 | 本地可控Messages回复，不连接真实模型供应商 |

API测试host使用单个asyncio loop与Uvicorn0.52.4的H11Protocol测试子类。在真实SSL transport建立后，从要求CERT_REQUIRED的ssl_object读取实际peer certificate摘要，注入测试scope；私有router校验该摘要。请求header不能生成这份attestation。无客户端证书但伪造peer header的请求在TLS层失败，随后合法mTLS probe成功，排除单纯服务不可达。两个方向各有独立service credential，临时CA/证书只在owned700目录与stdin配置中使用，日志不输出token/PEM/问题正文。

该host仅用于验证。生产仍须分离公网/私有监听器及签发/轮换身份，不照搬自签同证书fixture或把HTTP header当peer identity。Uvicorn子类使用测试环境内部接口，依赖升级须重跑此显式suite，不作为生产server实现。

## 一次性MongoDB

`scripts/test-agent-mongo.py`提供owned_mongo/verified_client，导入不连接。传入已验证binary，启动私有dbpath与显式Unix socket，bind_ip为该socket路径、port0、显式unixSocketPrefix为owned root、所有socket0600、root700，WiredTiger cache256MiB、最多32连接；无安装或系统服务。nonce/marker权限与实际getCmdLineOpts（含unixDomainSocket.pathPrefix/filePermissions）、serverStatus.pid须一致，客户端使用该Unix socket、1秒连接/2秒读取、无读写retry。绝不回退到默认27017或业务配置。

[MongoDB 8.0官方参数文档](https://www.mongodb.com/docs/v8.0/reference/program/mongod/)支持显式Unix socket bind路径。实际lsof核对本实例无TCP LISTEN；正常、合成异常、SIGTERM三种出口均确认owned PID和目录消失。这个单机实例不模拟replica set、故障切换或备份恢复。

本地binary来自[官方8.0.38 ARM64归档](https://fastdl.mongodb.org/osx/mongodb-macos-arm64-8.0.38.tgz)，与[官方SHA256](https://fastdl.mongodb.org/osx/mongodb-macos-arm64-8.0.38.tgz.sha256)匹配：`5c372533187a7789b6b2f4d7856f0651557dfbed572dbe5f4c23f43578fc74df`，codesign --verify --strict通过。归档与binary仅在ignored `.tmp/mongo-test-runtime`缓存；不是全局安装。

## 复跑与场景

```bash
apps/api/.venv/bin/python scripts/test-agent-sdk-stack.py \
  --mysqld <verified-mysqld-binary> \
  --redis-server <verified-redis-server-binary> \
  --mongod <verified-mongod-binary> \
  --sdk-runtime /private/tmp/new-prepared-worker-runtime \
  --node <project-node-24.17.0>
```

六个场景使用新库、新namespace、新TLS/Worker与私有工作目录，实际跑固定SDK：

1. 成功经3个Messages响应、搜索/读取两工具、实际UUID交付与根请求完成；重复请求409且分钟仍1、无第二次SDK执行；同family刷新后重建应用GET恢复，真实Mongo正文变化时恢复隐藏引用。
2. SDK实际等待模型时，公开cancel先落终态，停止原执行；无最终答案，模型代理取消、Worker静止后释放并发。
3. 同一等待点主动关闭实际HTTPS事件流，触发ASGI断流finally、取消与进程组/home回收；没有直接调用application.abandon冒充断网。
4. Redis实际撤销会话，运行拒绝继续，GET401，SDK/模型取消，无答案落库。
5. 读取并交付后、提交答案前从真实MySQL撤回文章，已交付来源仍不能完成；保留单条问题而非错误答案。
6. 暂停实际SDK进程组后SIGKILL Worker，API中断原运行、不重派且保留未确认并发槽；Python测试宿主依据先前fsync的private PID日志独立TERM/CONT/KILL，确认组ESRCH。没有Worker成功停止ACK，不宣称生产控制器自动崩溃恢复。

## 异常回收与检查边界

Node fixture严格读取首行16KiB exact配置、第二行仅stop，拒绝重复JSON key/非法UTF8/多余行；stdout只给ready/stopped或固定error，不输出输入值。bootstrap先在owned600日志fsync PID，再import固定SDK入口。正常close检查所有组ESRCH、run-*为空及journal无问题/受众token/servicecredential。原七项仅证明组合坏stdin/脱敏，另补同一纯reader的合法分块/第三行/字节/EOF与完整JSON形状下单fault的重复键、非法UTF8回归；定向16项已加入普通Worker协议gate，无SDK/DB依赖，不把缺配置的拒绝误当作每个guard的独立证据。

Python父即使没收到ACK、Worker已退出，也重新校验PID日志并回收detached SDK组；ACK不明仍保留失败结果。各资源独立清理，前一步失败不能跳过server或数据库关闭；无法证明进程退出则保留私有证据并失败。总启动器回收整个owned测试PGID，不能只检查leader；信号检查PermissionError不是组消失，继续有界检查，只有ESRCH证明回收。

附加 `--interrupt-probe` 仅用于故障验证：等实际SDK进入模型等待后输出安全PID/root证明并等待终止，不运行常规suite。实际向总启动器发SIGTERM，确认退出130、Worker/SDK组与三数据库PID全部消失，四个owned root均删除。该测试仅证明优雅中断路径，SIGKILL整个宿主、系统重启和持久控制器离线处理仍未验收。

## 显式真实模型模式（2026-11-16）

默认六情景仍保留合成模型，新增`--real-model --report <new-file>`只在local runtime运行固定keyless验证模型，不加载业务配置/凭据。固定四题、预算账本、严格适配、报告追溯与失败样本见[模型预算与真实问答验证](agent-model-validation.md)。真实模式不等于生产上线或人工语义验收；SDK固定0.2.2-rc.1，模型只提供alias而未提供不可变权重版本。

### Unix socket隔离修正（2026-11-16）

本轮并行两个SDK启动器时发现：8.0.38即使显式bind_ip到私有socket，仍额外创建默认`/tmp/mongodb-0.sock`；先前仅证明无TCP监听，不能证明所有Unix socket都私有。现按[官方unixSocketPrefix参数](https://www.mongodb.com/docs/v8.0/reference/program/mongod/)把自动socket前缀也限定到owned root，并从实际getCmdLineOpts校验pathPrefix与严格整数0600权限。客户端仍只使用显式私有socket，不连接默认路径。

新增显式真实双实例回归（不进入默认unitgate）：

```bash
apps/api/.venv/bin/python apps/api/tests/integration/mongo_isolation.py --mongod <verified-mongod>
```

两个同时运行的实例写相同库名但读回各自不同数据；实际lsof检查每PID全部named Unix socket（显式mongo.sock和自动mongodb-0.sock）均在自己的root且0600、无TCP LISTEN，shared default socket状态未改变。退出后两个PID/root均消失。历史无TCP结论仍成立，历史“仅私有socket”的范围以本修正为准，未把修前真实模型结果冒称已带此隔离。

父reaper的EPERM处理亦已统一：探测拒绝视为未知存活，TERM与CONT独立尝试，有限窗口内仅重试被拒信号，随后尽力KILL；最终仍须ESRCH。实际owned孤儿瞬时/信号/永久拒绝三项回归加入默认API gate，永久拒绝仍保留root且独立测试兜底回收。另见[未定因失败记录](../evaluations/agent-model-2026-11-16/cleanup-observations.md)，不把修复独立缺陷等同已解释所有历史失败。

清理方法已按自然职责抽出到`tests/integration/fixture_cleanup.py`，固定阶段/类别摘要与Worker私有诊断事件按[回收诊断说明](agent-cleanup-diagnostics.md)接线。坏ACK或损坏诊断后缀不得跳过其余资源关闭；不回显未知字段/异常自由文本。诊断完整、Worker确认、实际回收是不同观察，不互相替代。

## 官方模型整栈增量契约（2026-11-16）

基点1a14ecb。本轮为现有显式真实四题评测增加`--real-model-profile openai-local`，必须同时指定`--real-model --report <new-file>`；默认仍为原qwen-public，不接受任意模型/URL。官方profile只使用AI维护的local-only factory、私密key文件与显式Clash配置，无本地模型部署、目录修改或生产准入。生产runtime须在创建fixture根、读取凭据或启动owned数据库之前拒绝。CLI错误或未显式real模式不得隐式联网。

正式Gateway必须直接接收真实OpenAiResponsesProxy实例，不能把fixture的async包装方法当作proxy，否则is_counted_model_proxy无法识别并遗漏持久累计预占。不修改AI识别规则为duck typing，不复制proxy或重建wire。官方模式不拦截/保存原始供应商响应，直接由正式预算journal提取固定数值、状态和摘要；旧Qwen的合成结果trace与历史报告保持原义。

四题数据、评分、Skill和每run四次模型/四工具/45秒期限保持不变；每题独立MySQL schema/Redis namespace/Mongo文章/TLS/Worker/SDK home，无重试或切模型。每次计数、生成及实际usage仍受[输入预算协议](agent-input-budget.md)约束。新增安全报告明确profile、计数契约与本地tokenizer的区别：官方供应商计数并不宣称本地分词器或不可变权重已经验证。

每题须保存agent_model_calls的受限投影（状态、预占/实际token、wire/count摘要），核对call数量等于run.model_count、逐项observed和输入相等、总预占等于run累计且不超32768、单次不超16384；保留原输出/响应/字节上限。失败仍保存已提交预算和unknown状态，计数/提交不明不重放。API最终答案/来源、合成数据与独立agent语义复核可保存，人工签字维持pending。任何清理不明立即停止后续题，先排空资源。

默认离线回归须检查官方实例原样注入、CLI组合/生产提前拒绝、报告拒绝自由值/未知字段与非法数/摘要，以及缺记录/usage漂移/未知记录不能误判成功。实际有界四题只有显式命令执行，不进入普通CI。此契约先写入再同步coding/判官；Claude Code/claude-ds后续接手须读取。正式整栈、人工语义、Linux及生产门槛分开报告，未验证前不写已通过。

### 已执行结果与复跑

```bash
DSH_OPENAI_API_KEY_FILE=/absolute/private/api-key \
DSH_OPENAI_PROXY_URL=http://127.0.0.1:7890 \
apps/api/.venv/bin/python scripts/test-agent-sdk-stack.py \
  --mysqld <verified-mysqld> --redis-server <verified-redis-server> \
  --mongod <verified-mongod> --sdk-runtime <new-prepared-runtime> \
  --node <project-node-24.17.0> --real-model \
  --real-model-profile openai-local --report /absolute/new-report.json
```

最终API710项、AI边界检查、判官独立43项及重复取消时预算线程栅栏注入通过。原六个合成SDK场景通过，再用同一新prepared runtime跑官方四题一次，未修改数据/评分/Skill/额度、无自动重试：模型/工具次数分别3/2、3/2、4/3、3/2，输入累计2707/2549/4080/2806，逐项input等于预占、账本累计完全一致且unknown0。四题端到端结构及独立agent语义复核通过；无资料题只证明服务端固定结果与空来源，不声称观察到模型原始末答。人工仍pending，local-tokenizer与immutable-model两个flag仍false。

修独立review复现的报告误绿：必须核对sum(call.input_bytes)等于run累计且不超262144，不能只检查run自报数。官方直接注入原代理、报告ledger-only；评测函数按自然职责抽到model_evaluation.py，旧入口保留转发。报告按case开始/run.started/结束及异常检查点flush/fsync，无周期ticker；失败预算标pre_cleanup，只表示关闭前快照，读取失败保留已读run数值，不能冒称关闭后最终状态。清理错误停止后续题，重复取消也排空采集线程并关闭fixture。

四组SDK进程均复查ESRCH，四类owned临时根恢复为空，三库已停；16项Worker源与实际prepared runtime/暂存树字节一致。安全报告、逐题语义及源码摘要见[官方整栈实证](../evaluations/agent-official-stack-2026-11-16/README.md)。原SQLite站点3030/8032与正文预览3033继续保留，不迁移页面、不修改业务配置或生产DDL。Linux、已有业务库升级/崩溃、留存回收及生产TLS等独立门槛仍未完成。

## Journal留存与嵌套中断增量（2026-11-16）

基点0d541a6后新增[Worker详情留存与永久屏障](agent-journal-retention.md)，并修[嵌套信号重入](agent-cleanup-diagnostics.md#嵌套宿主信号保护增量2026-11-16)。最终源树465bbe5b9357b6a85464654951808decb15ec868的API715/Worker96及fresh prepared SDK默认六情景通过。另真实SDK模型等待点对总启动器发SIGTERM，在实际Redis.wait关闭栅栏再发第二次：退出130、4个owned child PID/5组（API/SDK与三库）均消失、4个fixture根删除，无独立fallback代收。这里只给Redis等待加栅栏，不替换daemon/数据库/证书/SDK。纯信号回归的daemon/readiness/MySQL context为合成，二者分别记录，见[本轮实证](../evaluations/agent-journal-retention-2026-11-16/README.md)。

本轮模型/文章均为合成，AI/预算/Skill未改，没有重跑官方语义四题；上一节0d541a6的官方实证保持其原源版本范围。留存年龄边界使用注入clock的临时文件/真实CLI进程检查，不宣称现实等待三十天或系统clock被修改。未知孤儿、数据库崩溃与生产保留策略仍独立待验收。
