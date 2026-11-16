# 回收失败诊断

日期：2026-11-16；基点6afeb29。本轮已在隔离本机实现与初步验证；最终独立暂存快照结果记录在分支交接。历史失败见[回收观察](../evaluations/agent-model-2026-11-16/cleanup-observations.md)。

## 目标与边界

ProcessRunner第一次finalize失败可能被控制器后续stop覆盖；SDK fixture close又只有固定最终错误，无法区分探测权限、信号发送、组仍可见和目录删除等阶段。新增受限诊断用于保存首次失败及后续回收观察，不从缺失日志推断历史根因，不将后来的成功改判为当时已确认回收。

不改变ExecutionAck、公私API、持久execution journal格式或交付/准入语义；done仍只在组消失且workspace删除后结算，stop无法确认仍拒绝，服务保留占用。诊断不是授权，不允许以记录失败、sink异常或权限拒绝伪装进程消失。

## Worker内部接口

ProcessRunner显式接受可选宿主onCleanupDiagnostic回调，createSdkWorker透传；回调不接收原始异常或运行payload，仅接收冻结的固定schema。每个执行最多保留32条事件，首次失败不可被后续事件挤掉，溢出用饱和计数表示；正常执行不主动产生噪声。handle提供cleanupDiagnostics()快照，失败Error附相同安全摘要，后续成功清理仍保留此前失败的诊断。无默认stdout或文件输出，不把宿主钩子当已配置生产可观测性。

Worker事件exact字段为version=`sun-world-cleanup-diagnostics/1`、run_id、execution_id、generation、sequence、operation、stage、category。operation仅start/finalize/stop；stage仅group_probe/signal_term/signal_kill/group_present/workspace_remove/recovery_confirmed；category仅permission_denied/group_present/io_failed/unknown/none。snapshot含version、run_id、execution_id、generation、events、dropped_events；Error.cleanupDiagnostics附抛出时的相同安全快照。前31个失败保留，预留第32条给首次recovery_confirmed，发射总数也不超过32；sequence/dropped_events饱和INT32_MAX。恢复事件不替代控制器判断，不说明此前曾准时完成。

事件只包含版本、服务端生成的run/execution UUID、generation、顺序计数、操作、固定阶段与固定错误类别；没有PID、路径、时间字符串、自由字段名、异常message/stack/cause、问题、正文、模型回复、token或TLS材料。阶段覆盖组探测、TERM/KILL、组仍存在、workspace删除与恢复确认；类别仅白名单，如permission_denied、group_present、io_failed、unknown、none。Error.code也必须投影成固定类别，不能原样保存。回调抛错或返回拒绝Promise均不能中断/重排回收；发射与存储有界，不等待任意宿主Promise。

## 本地整栈证据

测试Worker将上述事件写入自己owned目录的独占0600文件并fsync，设置字节上限；sink失败记录固定状态，不打印原始异常。Python fixture在各清理步骤保留固定阶段/类别、继续独立清理其他资源，最多32条；读取Worker诊断必须校验私有文件身份、上限和事件schema，绝不打印未经验证的字段。失败输出及显式模型报告使用同一安全摘要，正常成功也保留已发生的瞬时失败及恢复记录。

本地诊断文件随已确认清理的fixture删除，报告/测试输出才是本次离线证据；不能宣称生产跨重启留存、宿主SIGKILL后必有完整记录或Linux隔离已验收。生产宿主sink/留存策略仍需独立配置和验证。

Python fixture使用独立`sun-world-fixture-cleanup/1`摘要：最多32条{sequence,stage,category}、dropped_count、cleanup_confirmed。保留最先32条，确认清理的状态独立标记；发生新的失败即撤销确认。stage为代码中固定清理步骤，类别仅permission_denied/group_present/io_failed/timeout/cancelled/invalid_observation/unknown/none。与Worker事件分开保存，不能把Python步骤状态当成Worker当时的进程观察。

本地Worker诊断文件上限65536字节，单记录2048字节；写入或fsync失败即停止该sink后续写入、关闭成功ACK，回收继续。读取用NOFOLLOW/NONBLOCK与fd身份检查拒绝symlink/hardlink/FIFO/非600文件；严格JSON拒绝重复字段、非法UTF8和非有限数。非法/截断后缀只保留此前合法事件并标记不完整。file complete与Worker是否ACK分开：无ACK的崩溃情景不能断言全部事件已落地。父stdin/TERM失败不能跳过KILL、其他资源关闭或原有未知状态。

文件保存的是有界事件；内存snapshot的dropped_events不自动写入这份事件流。文件完整/收到ACK只能说明已发射事件流的完整性，不能据此断言未发生被限额省略的观察，或从序号缺口还原精确丢失数量。诊断fd关闭成功后才发stopped；任何sink关闭错误都只发固定失败。

## 验证计划

注入探测EPERM、TERM/KILL拒绝、目录删除失败、sink异常与拒绝Promise；验证首次诊断不丢、后续回收成功不掩盖曾经失败、正常done/stop和容量规则不改变、非法日志/自由文本被拒、永久未知仍失败。只操作测试自己登记的进程组，失败时用独立兜底回收。

定向通过后执行默认API/Worker门禁、独立暂存源码验证、真实固定SDK六场景及中断回收。真实模型输出预算/适配本轮不改，不用重复语义样本冒充回收稳定性。结果、博客修订与提交状态写入分支交接；P1/A–D及输入tokenizer/模型版本、Linux、旧库与生产TLS门槛保留。

## 初步验证（当前工作区）

API624、Worker70通过；判官独立Node15/Python24项复核并解除不完整ACK与深层JSON两项P2。真实固定SDK的双向mTLS探针实际注入当前owned workspace目录删除EACCES：首cancel503、新run503保留占用，解除fault后原cancel重试200，回调记录首错与recovery，无模型重放或敏感文本。原生三库+固定SDK完整六情景亦通过。最终独立暂存与并行复跑已完成，证据见[验证记录](../evaluations/agent-cleanup-2026-11-16/README.md)；提交前仍逐字校对可执行源码。

独立SDK宿主还修正一条旧断言：strict parseJson产生null-prototype对象，原deepStrictEqual错误地把JS原型当作thinking JSON协议；现检查完整字段集合仅type且值disabled，仍拒绝额外字段。不修改生产Profile/适配/模型限制，也不把这个测试问题等同历史进程回收失败根因。

## 嵌套宿主信号保护增量（2026-11-16）

基点0d541a6，留存切片的父进程中断复验发现确定的新问题：Redis/Mongo owned context各自安装信号处理器，内层第一次SIGTERM设IGNORE并退出后，又恢复了外层旧处理器；在外层清理等待中第二次SIGTERM会重新抛KeyboardInterrupt，跳过剩余回收。真实CLI入口、真实两层资源context及实际owned进程组的受控回归中，单SIGTERM通过、第二次信号打断cleanup；数据库daemon/readiness为合成，不能当数据库崩溃证明。

本轮先补共享owned_interrupts状态与defer区域：嵌套上下文共享首次中断标志，后续信号不重入；进程登记与资源关闭临界区延期抛首次中断，退出安全区域后仍报告130，不把取消吞成成功。清理自身失败优先保留原错误。该保护覆盖总CLI入口、owned子进程、三库context及临时目录清理，不改变生产Worker RPC/进程控制或任何业务配置。增量先写本文再广播coding/判官，Claude Code/claude-ds接手同步。须验证重复信号、首次信号在正常清理期间、原单信号和实际SDK/三库中断；与历史未定因失败分开，不能反推旧故障根因。

最终纯回归5项和独立5项通过，增加MySQL退出未确认时保留临时目录；API715/Worker96通过。实际fixed SDK/三库六情景及晚Redis.wait栅栏二次SIGTERM通过，退出130、4 PID/5组/4根均确认回收，无独立fallback；详见[留存切片实证](../evaluations/agent-journal-retention-2026-11-16/README.md)。这补充此前只验证单次SIGTERM的范围，不否定旧单次通过记录，也不解释其他历史未知失败。
