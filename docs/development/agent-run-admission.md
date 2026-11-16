# 正式问答 API 与 Redis 准入

日期：2026-11-16；基点973776c。当前仅显式组合工厂与隔离本地验证，`main.py` 未挂载正式路由，旧开发入口未切换。生产开关、Linux 隔离、真实模型、TLS 身份签发与留存验收仍未完成。

## 组合与身份

`src/module_composition.py:create_blog_qa_application` 显式注入 MySQL、正文库、AuthManager、raw Redis、固定 Worker、模型代理、bundle/model、白名单和开关；不读环境或创建服务。Redis socket/connect timeout 必须均在(0,2]秒；拒绝自定义retry及retry_on_error/retry_on_timeout，避免客户端在未知EVAL回执后隐式重发。普通工具通过博客 `public.py`，最终来源重验通过当前运行 UOW 读取元数据，避免再次借 MySQL 池。

`public_router.create_public_run_router` 要求显式 canonical browser origins。宿主只能替换原同路径 router，不能同时挂载；独立私有 TLS host 使用原 `create_private_run_router`，公网不代理该路由。应用生命周期启动到期对账并在关闭时停止所拥有的任务。Worker新增认证的 `GET /internal/v2/readyz`，返回严格协议、bundle、model与是否可受理；活跃并发由准入控制，journal满、故障和关闭拒绝。探测不加入站点普通readyz。

每次入口重新验证真实 Cookie/Redis 会话及当前账户角色，默认白名单且管理员；角色检查与运行查询使用同一 READ COMMITTED UOW。运行时按服务端保存的会话绑定校验，family内刷新不延长期限；GET恢复可以在新应用实例使用当前有效Cookie重新校验，不依赖旧内存绑定。SSE断流通过响应 `finally` 取消原运行、等待清理，即使生成器尚未开始亦执行。

## 准入与未知结果

1. 先认证并在MySQL只读查询幂等记录。已有请求返回409和原run ID；不同问题冲突，新family看不到旧run。此时不探测Worker、不扣Redis额度。
2. 新请求先确认固定Worker可用，再用Lua一次检查/预占分钟与并发额度。默认每用户6次/分钟、全局10次/分钟、每用户并发1和全局并发1；这些是本地保守默认，尚非生产容量结论。分钟计数固定窗口60秒，从该计数第一次预占开始，边界不保证任意滑动60秒总量。
3. reservation120秒、并发槽60秒；运行绝对期限45秒。reservation绑定账户、family摘要、问题摘要和不可打印owner。并发槽不因迟到release误删新owner。Lua先检查全部key类型、值、TTL及配置指纹再写，不把Redis与MySQL宣称为同一事务。见[Redis脚本原子执行说明](https://redis.io/docs/latest/develop/programmability/eval-intro/)。
4. 同一reservation重复请求只返回pending，不交回owner、不追加分钟扣额。MySQL受理仍锁用户并依靠唯一约束重新检查；只有实际新建的一方能派发。每次模型/工具/结果授权还需原lease仍owned，Redis丢key后不能自行重新获得执行权。
5. Redis执行回执未知或MySQL commit回执未知均不重试、不猜测成功。MySQL未知时保守保留预占等待TTL；可确认尚未开始或未领取且已失败时才释放并发。分钟计数始终不退款。
6. 已持久化终态还不足以释放并发：必须Worker inspect确认同execution已completed/failed/cancelled，即进程组和工作目录已回收。interrupted、未知或无法查询保守等TTL；不能把数据库取消当成已确认停止。

这里的Lua与TTL不构成Redis故障切换后的严格分布式fencing。丢失的lease导致已有执行后续调用失败关闭；持久化、集群/故障切换和旧进程资源隔离仍需独立验收。

## 状态恢复与对账

GET在run行锁内调用AI模块公开历史接口，避免RC下“旧running状态+新提交答案”混合快照。问题与答案摘要须匹配账本，纯文本与链接结构有界；来源从已交付账本重查当前公开正文，撤回/变化/读取失败时隐藏链接。先前已经展示的纯文本不能追溯撤回。GET持锁期间来源读取仍须数据库客户端有界，不引入第二条MySQL连接。

SSE仅发run.started和一条message.completed或run.failed，序号由API分配，不透传SDK原始事件；运行ID用于刷新GET，不承诺事件回放。当前对账仅关闭过期accepted/running并尽力取消精确execution，不会重放非过期accepted，也不会批量中断其他API实例仍活跃的运行。API重启丢失会话/lease绑定后的活跃回调失败关闭，最终由截止/租约对账收敛。

## 隔离验证入口

`scripts/test-agent-redis.py --redis-server <verified-binary>` 只启动owned Unix socket实例，禁TCP/持久化，32MiB noeviction。测试进程核对nonce、owner、PID及实际CONFIG，退出/异常/SIGTERM均回收本实例。仅支持显式本地binary，不下载、不连接业务配置。

本轮本地Redis7.2.17来自[官方归档](https://download.redis.io/releases/redis-7.2.17.tar.gz)，SHA256 `07c679c013fd82513299733bddf91999bbbc830351ec9ea985a533b09a595d76` 与[官方摘要仓库](https://github.com/redis/redis-hashes)核对，libc/无TLS构建仅作私有socket验证。binary和源码缓存位于ignored `.tmp/redis-test-runtime`，未系统安装。组合MySQL+Redis入口及最终证据见分支handoff；合成Worker/模型只能证明API控制与存储组合，不替代真实SDK或模型的整栈验收。

组合命令（项目 `.venv` Python）：

```bash
apps/api/.venv/bin/python scripts/test-agent-stack.py \
  --mysqld <verified-mysqld-binary> \
  --redis-server <verified-redis-server-binary>
```

MySQL启动器原CLI不变，内部run可接显式测试命令及额外环境，但本次owned MySQL证明变量最后覆盖。两个服务均由启动器创建/回收；测试验证CONFIG/实际datadir/socket，不接受业务连接参数。redis-py5.3.1的 `Redis(unix_socket_path=...)` 会丢弃connect timeout，owned client改用显式UnixDomainSocketConnection池，测试借出实际连接检查connect=1秒/socket=2秒。导入启动器不启动进程。

本地证据：独立Redis15项（含32并发同key唯一lease、16并发额度、key污染无前段写、迟到release及配置冲突）；组合10项（真实AuthManager/JWT/Redis会话、完成SSE、幂等不二扣、白名单/撤角色/禁用、family刷新与新应用实例GET、wrong owner/family、分钟与并发、原生ASGI断流、Redis丢key、未知SQL受理回执、非静止Worker持槽、clean close排空未领取任务并释放槽而不退分钟）；原MySQL入口15项回归。恢复/完成竞争通过information_schema.innodb_trx按finish的实际connection ID确认LOCK WAIT，放开恢复后先读running/1条、再完成并读completed/2条。未知SQL回执为提交后的故障注入，应用重建为同进程新实例；未杀MySQL/Redis/API进程做崩溃或持久化故障切换实验。正常/合成异常/SIGTERM三种Redis启动器出口也实际核对owned PID和目录回收。

后续切片已接实际固定SDK、真实双向mTLS与MongoDB正文，覆盖真实连接断开及Worker崩溃，见[完整SDK整栈验证](agent-sdk-stack-validation.md)。本节原10项仍保留为可控Worker故障注入回归，不以它代替实际SDK证据；生产与真实模型边界仍未放行。
