# Worker journal留存与离线清理

2026-11-16，基点0d541a6。本轮实现Worker观察元数据的30天留存、已确认终态回收和显式离线check/apply；不清理API运行/历史/审计数据，不解除未知进程占用或自动处理崩溃控制器锁。生产仍关闭，真实保留政策与部署前演练独立验收。

## 必须保持的语义

- 现有每目录最多128项观察、活跃并发和start/control在途界限不变。保留期内满额仍拒绝，不为持续受理提前删除取消tombstone。readiness/start在同一串行队列内按需清理，不能跨正在start/stop/observer/清理的entry释放容量；无后台timer或新HTTP/RPC。
- 仅terminal且needs_reap=false、没有在途handle/slot/任务的记录可过期。留存基点取受信任控制器写入时间与原deadline的较晚值；cancel-before-start无deadline时额外保留45秒有效窗口，再加30天。running/interrupted+needs_reap、未确认关闭/孤儿均不删除，不发stop或信号来猜旧进程归属。
- 删除完整记录后仍必须永久拒绝相同run_id的再次启动，包括换execution_id、改question或改成未来deadline的请求；不能仅靠“原请求已过期”。API单次派发及终态账本继续保留原职责，不把Worker清理当作新执行许可。

## 有界重放屏障与时间

新增私有retirement index，固定schema/版本、时间下界、排序去重的SHA256 run身份摘要集合及整体校验摘要，不含原UUID/问题/正文/凭据。hash须有固定domain prefix，集合最多8192项、文件至多1MiB；不采用会误判新身份的近似过滤器。摘要只增不减，永不按TTL逐出，不提供reset/wipe开关。满时新准入失败关闭，inspect/cancel仍可用；命名空间退役/轮换是后续明确运维迁移，不能清空屏障继续用旧控制身份。

同一controller lock下先原子写入并fsync完整index（含本批待删run摘要和不回退的time floor），确认目录持久后才逐条unlink/fsync。内存entry只在该删除确认后释放。index提交不明、unlink/目录fsync失败，均失败关闭并保留独占锁，不能返回成功清理/ready或重放。崩溃在index提交后、删除前时，重启仍由摘要拒绝旧身份，已存在终态记录可随后继续安全删除，不二加摘要。

start/readiness/恢复检查受信任clock不得早于持久time floor；时间回退不清空索引或放宽期限。原请求和修改后的旧身份都不能复活。索引损坏、缺失（目录已有新格式记录）、重复摘要/未知字段/非整数时间/无效校验均拒绝，不能把坏文件当空集合。

## 格式与迁移

按自然职责抽出共享execution-journal模块，复用目录0700/文件0600/owner/NOFOLLOW/nlink/有界严格JSON、O_EXCL控制器锁和原子持久化。新观察格式v3带受信任留存时间；旧v2按真实内容严格读取，不用mtime猜年龄。首次Worker加载以当前时间建立迁移留存基点并持久化新格式，旧running仍转interrupted+needs_reap且不重派。离线工具不能靠旧mtime删除未迁移记录，只保留并报告legacy数。旧binary不能忽略新index/v3退回无屏障运行。

留存时间字段使用严格安全整数；原deadline保留既有RPC支持的时间形状和原字符串/请求摘要，不擅自要求JavaScript三位小数canonical形式。正式Python Dispatcher会发送六位小数ISO，合法wire不能因落journal而拒绝；零/三/六位小数的Z结尾请求须兼容。旧v2记录原已支持的UTC offset应能读取/迁移，但新start仍按既有RPC的Z结尾约束拒绝offset，不借留存改造放宽协议。

混合迁移状态（旧owner、新index与v3详情）也必须安全：apply删除任何v3详情前，要先将目录owner原子升级到“索引必须存在”的格式并fsync。即使删掉最后一份详情，索引丢失也不能退回legacy空集合；owner提交确认不明时不删详情并留锁。check不做这项升级。该顺序来自独立review已复现的索引丢失后旧身份再跑问题，须保留专门回归。

cancel对已退役且无当前entry的run可返回绑定输入的cancelled静止ACK，依据是永久拒绝该run所有未来start的持久屏障；不新增记录、不修改API终态或伪造历史完成状态。若当前entry存在，必须走实际stop/同binding检查，不能因摘要命中跳过活跃进程。inspect可对已无详细记录的身份返回既有unknown，不虚构原完成结果。

## 离线入口与验证

`node scripts/prune-agent-worker-journal.mjs --directory /absolute/existing/private/journal --check|--apply`仅处理显式已有目录。check只预览，不改记录或index；apply显式执行同一安全算法，均使用同一O_EXCL控制器锁。现有锁即使PID看似消失也拒绝，不删除/接管旧锁，不启动服务或联网，不读取业务配置/密钥。未知文件、symlink/hardlink、权限/owner不符均拒绝。输出固定版本/模式/有界数量，无路径、原身份、正文或异常自由文本；出错非0且只有固定错误码。

校验/IO失败后无法确认时可保留本次创建的锁，check也不能称为完全无文件副作用；不把非0退出当作清理成功。未知锁与未知孤儿的恢复仍需专门的宿主确认流程，不由此工具自动完成。

默认测试覆盖30天边界、容量恢复/保留期满拒绝、active/inflight/needs_reap保留、旧格式迁移无mtime造假、重启/改deadline旧身份拒绝、退役cancel静止ACK、index满/损坏/时钟回退，以及floor提交确认丢失、删除/fsync故障和两控制器/维护并发。文件故障应保留安全状态而非仅比较实现细节。另用真实owned子进程证明在线Worker时CLI拒绝、正常close后check/apply生效；实际SDK六情景/父SIGTERM回收复核，默认不调用真实供应商。

协议先写本文再同步coding/判官，Claude Code/claude-ds后续接手须读取。博客04同题说明“删除详情不等于允许重跑”、时间与永久有界屏障，配图先评估既有图，无自动发布。MySQL/用户历史留存、账号删除、未知孤儿/cgroup恢复、Linux及生产TTL政策仍不因此完成。

## 已执行结果

- 最终API715项、Worker96项通过；判官独立Node40/Python5项通过，无剩余确认阻塞。Node包含真实CLI与另一个owned控制器进程竞争同一锁：在线check/apply均拒绝，close后check不改详情、apply清除已过期详情；重启后旧身份改未来deadline仍拒绝，新UUID恢复受理。留存年龄使用注入clock，未修改机器时间。
- 修独立复核确认的mixed owner问题：原先删末条v3后owner仍旧格式，随后index丢失可重建空屏障并使旧run再启动；现删除前确认owner3，index丢失/owner提交ACK不明均不放行。另修新实现对deadline的多余canonical限制，正式Python六位小数合法wire可持久、重启与迁移，不改RPC。
- 实际SDK/双向mTLS/三库默认六情景通过。另实际模型等待点先SIGTERM，在真实Redis关闭等待栅栏再SIGTERM，退出130且清理未被打断：4个owned child PID/5组均消失、4个fixture根删除，无独立fallback代收。模型/文章合成，本轮不调用真实供应商。
- 信号问题使用真实CLI和Redis/Mongo context先复现单信号通过、重复信号失败，数据库daemon/readiness/MySQL context在该窄测中合成；修共享状态与defer后，首次正常清理期间信号、重复信号、主错保留及未知资源目录保留共5项通过。真实三库中断另单列，不能混称同一范围。MySQL无退出确认时保留私有数据目录，不由临时目录析构偷偷删除。
- fresh runtime使用592缓存包/下载0，17项Worker源与运行资源/index逐字一致；源树465bbe5b9357b6a85464654951808decb15ec868，后续仅补文档/安全证据。源码摘要、失败与修复范围及清理证明见[本轮实证](../evaluations/agent-journal-retention-2026-11-16/README.md)。

博客04按design同题更新，后端及原三标签、7稳定ID/21处strong；1280/390正文与新增段落视觉/DOM检查通过，既有透明Redis关系图360/约342px保留，未新增图、未发布。源稿使用现有dirty renderer/CSS预览，不代表完整文章页验收；本轮未改或提交前端。生产保留政策与未知锁恢复等仍按前述边界，旧未定因故障不因新信号修复而补认根因。
