# C3 派发控制与私有 V2 回调

日期：2026-11-16；基点82f8f9c。本文描述本地实现的控制链，不代表已部署Worker或开放正式入口。原SQLite/macOS SDK适配仍使用v1，不能直接发送v2凭据或UUID来源给旧适配器。

## 派发与未知结果

RunDispatcher先核对账本中的问题摘要、引擎/bundle/model与当前授权，随后通过gateway.claim条件领取。只有确认execution/generation/租约和三受众凭据摘要已经提交，才调用Worker.start一次。claim提交确认不明时不发送RPC；等待已有租约/对账收敛，不重新领取或重放。

启动ACK必须严格匹配protocol/run/execution/generation/bundle。缺失、超时、非法ACK只查询原execution一次；不能确认则先将账本改为interrupted，再尽力cancel。Worker completed ACK只作为观察，只有通过结果网关及同事务历史提交才能产生completed。Worker失败只映射固定码，不保存远端诊断。

监控持续重验开关、当前会话、租约与终态。用户取消、外部控制链取消/对账、关停都需要回收原执行；终态不可逆，迟到回调不能重开。数据库失败导致终态提交不明时，保留AGENT_DISPATCH_UNCONFIRMED并尽力发送cancel，不能声称已证明持久撤权或进程退出。数据库依赖故障时网关本身失败关闭，恢复后仍需租约对账。

同步数据库操作在线程中运行；取消时drain已提交给线程的操作，避免取消协程后后台仍悄悄领取。RPC start/inspect/cancel各最多2秒，并受当时剩余deadline/lease约束。内存并发槽同时计入在途领取、启动和已登记运行；关闭时阻止新派发、取消并drain在途任务后回收已知执行。未来Worker必须持久保留取消tombstone，拒绝取消请求先于迟到start到达时重新启动；本轮未实现远端进程或该去重服务。

## HTTPS输运

WorkerHttpTransport只接收服务器配置的固定HTTPS origin，拒绝userinfo/path/query/fragment和不校验证书/主机名的TLS context。禁环境代理、重定向及自动重试；请求16KiB、响应8KiB且拒绝压缩响应；连接1秒、RPC总计2秒。服务凭据只在认证头，三类run凭据只在已验证TLS的启动体，均不进入repr、ACK或错误信息。

- `POST /internal/v2/executions`：启动一次，携带ExecutionStart。
- `GET /internal/v2/executions/{run_id}/{execution_id}`：只观察原执行，无GET body。
- `POST /internal/v2/executions/{run_id}/{execution_id}/cancel`：携带ExecutionBinding，幂等取消。

这只是API侧client，未实现Worker服务端或部署证书管理。loopback临时自签测试验证可信证书成功、未知CA/主机名不符拒绝，不代表双向TLS、生产peer签发/轮换或Linux网络隔离已验收。

## 私有回调工厂

create_private_run_router必须显式注入可信peer verifier，只允许ASGI scope中的HTTPS和受信任peer；不能仅凭转发头认定身份。宿主应使用独立受保护监听器及证书attestation。本工厂未被main或旧站点router挂载，不增加公网路由。内部路径不进入浏览器OpenAPI；仅include_in_schema=False不能代替网络隔离。

共同头：`x-agent-protocol: sun-world-agent/2`、`x-agent-execution`、`x-agent-generation: 1`、`x-worker-service`及分受众Bearer。run/execution为canonical UUID。请求最大128KiB，严格拒绝重复JSON key、NaN/Infinity、非对象和schema未知字段，错误不带driver/Worker诊断。

| 路径（前缀/internal/agent/v2/runs/{run_id}） | 受众 | 行为 |
| --- | --- | --- |
| /root | result | 同事务登记根turn与SDK request；不同绑定拒绝 |
| /heartbeat | result | 当前租约续期，不复活过期执行 |
| /tools/{tool_id} | tool | 原registry严格输入、当前授权和持久化预算 |
| /receipts | tool | hash正确才交付来源 |
| /model/messages | model | 原有固定模型代理与预算 |
| /result | result | 根session/turn/request、UUID来源和纯文本重验后事务提交 |

agent_runs新增兼容nullable root_request_id（ASCII binary）。既有库未升级；本轮仅自有临时新库DDL。旧库级调用可不传request，v2注册/结果强制传且不可覆盖或清除已绑定值。

后端rpc.py为内部契约源，运行`apps/api/.venv/bin/python scripts/export-agent-rpc.py`生成packages/contracts/agent/rpc-v2.json；API gate运行--check阻止漂移。与已有tool-catalog一样由Python生成器负责格式，不交给Prettier重写。

## 验证与下一步

私有ASGI测试接实际Ledger/Gateway、临时SQLite，覆盖读取→未回执拒绝→回执→根request错配拒绝→完成→幂等完成，以及受众/代次/会话/peer/JSON/大小/异常脱敏；合成peer不是网络身份验收。HTTPS mock测试覆盖坏ACK/重定向/响应上限/超时/取消/无重试，另有自有loopback真实TLS探测。

一次性MySQL现通过15项（原13项加根request/内部终态和派发未知结果），使用[既有安全启动器](agent-run-mysql-validation.md)，自有临时实例已停止并清理；假Worker只用于控制链故障注入，不代表SDK/模型实测。

下一步实现Worker v2服务、SDK根request/turn关联、UUID来源交付与分受众代理、取消tombstone、真实Redis准入及组合根，再完成进程崩溃/重启、TLS服务身份与Linux隔离矩阵。既有public/local入口与生产开关不变；不要用本轮库级成功宣称C3或A–D已完成。
