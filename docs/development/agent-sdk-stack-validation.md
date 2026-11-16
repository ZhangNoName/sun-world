# 固定 SDK 与真实存储整栈验证

日期：2026-11-16；基点c9906df。此项是显式本地验证基础设施，不挂载生产main、不切换原SQLite页面、不读取业务配置或凭据，不等于Linux/真实模型/生产上线验收。

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

`scripts/test-agent-mongo.py`提供owned_mongo/verified_client，导入不连接。传入已验证binary，启动私有dbpath与显式Unix socket，bind_ip仅该socket路径、port0、socket0600、root700，WiredTiger cache256MiB、最多32连接；无安装或系统服务。nonce/marker权限与实际getCmdLineOpts、serverStatus.pid须一致，客户端使用该Unix socket、1秒连接/2秒读取、无读写retry。绝不回退到默认27017或业务配置。

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
