# API 真实进程故障验证

2026-11-17，基点41839d6。本轮补实施计划中的API重启故障矩阵，只使用合成模型、固定真实SDK和当次独占MySQL/Redis/MongoDB。保留Linux官方四题未通过及已停止付费复跑的结论，不调用供应商或改变Clash。

## 拓扑与故障切点

可信测试父持有三个数据库、TLS监听socket和独立Node Worker的进程句柄与stdin。API在另一个Python子进程中运行原组合根、public/private routes、真实JWT/Redis会话校验及双向TLS。令牌由父侧原AuthManager签发，不新增HTTP登录路由覆盖。父只持有查询/fixture资源；不在父重建运行应用来冒充API重启。子进程通过私有管道接收当次合成凭据，不经argv/日志/业务配置取值；监听socket由父持有并传递，重启保持原HTTPS origin、JWT签名secret、Redis会话、数据库、服务凭据、证书和Worker进程不变。

分别验证已提交accepted但尚未派发、模型请求等待中、最终事务提交完成三个切点。只对父刚创建并仍持有的API Popen句柄发送SIGKILL并wait确认，再创建新API进程；同时确认独立Worker句柄仍存活。accepted切点可在测试适配器中于原ledger.accept返回后设置有界等待门，不能替换实际提交；模型门使用合成响应等待，不替换SDK或数据库。已完成切点必须先由实际HTTP结果与账本交叉确认。

## 不变量与实测边界

重启前后使用同一登录和幂等key，请求不得再派发或再次收费；已完成历史保持同一答案与来源，消息不能重复。未完成运行不凭旧内存绑定继续接受回调；在受控管道捕获的原回调凭据必须仍与原数据库哈希匹配，再用原mTLS发送，避免以假凭据或人为轮换造成拒绝。旧凭据只留进程内存，不进入输出。

按现有实现，accepted到原45秒deadline才failed，running租约过期变interrupted；测试等待真实时间，不修改数据库deadline或用假时钟冒充租约收敛。新API须显式ready，恢复只做原reconcile，不自动重派。未知用量保持原模型预算预占；重启没有旧Redis lease所有权，不提前释放并发槽，原TTL及分钟计数规则保持。Worker或SDK可能因断连自行退出，测试只承诺Worker服务独立存活与最终真实回收，不要求SDK必留活进程。

这组验证不代表宿主断电、Worker重启、旧journal自动解锁、多API副本一致性或生产部署通过。先完成Mac真实进程矩阵；Linux结果必须由显式原生测试提供，不能外推。

## 所有权、协作与验证

原六场景fixture通过可覆盖的API服务启动/组合钩子复用准备逻辑，默认行为不变。新fixture停止API后再调用原Worker/数据库清理；所有关闭分别尝试，任何未知保留证据并失败，不从文件中任意收养或杀PID。外层维护CLI负责数据库与整组关闭，报告必须逐项记录切点、SIGKILL/wait、Worker存活、状态/计数不变量及清理事实。失败不能输出成功标记。

root负责协议、CLI接线、验证/证据、博客及中文本地提交；coding负责有界测试fixture/子API和三场景；判官在实现后只读复审。实现差异先更新本文并同步。后续Claude Code/claude-ds先读本文和branch handoff。保留原80项dirty及主handoff原修改，不改3030/8032/3033，不推送、部署或发布。

验证顺序：测试适配器配置与关闭窄测、三场景真实进程故障、原Mac六场景兼容、API/Worker适当完整门禁、证据与源码摘要。按sun-world-blog→design评估同题博客04补充恢复边界，保留后端分类及架构笔记/Agent/DeepSeek Harness标签，评估现有两图是否足够并记录未发布。

## 本地 checkpoint

第三次真实Mac整栈通过三个切点，74.444秒、304份源摘要不变。accepted在45563ms按原45秒deadline失败；model hold旧token/原service/hash及有效租约核对后，同mTLS请求在剩8333ms时明确403，10806ms后interrupted，预占/调用行不变；completed原结果/来源/两条消息不变。三次实际SIGKILL/wait、新API及原Worker独立存活/正常清理均核。原六场景兼容34.449秒，API923/37.204秒、Worker164/9.126647秒，新process14+CLI4窄测及判官最终报告/304源复核通过。

前两轮只bootstrap失败，第一轮无子诊断，原因保留未知；第二轮fixed stage/typed error/当轮host行218定位本机不支持SO_ACCEPTCONN，实际临时socket复现errno42。改精确地址/type+nonblocking accept阳阴检查，不吞其他OSError，不改原mTLS/pass_fds。另修测试API脱离外层owned组、已确认kill句柄的清理、TERM拒绝后独立KILL/wait、report保存失败先于fixture分配。诊断只记录固定阶段/类型和本文件整数行号，首错不被cleanup覆盖。

失败的两份私有fixture证据根按失败规则保留，成功native3三个fixture清理确认；准备runtime经原inode/句柄终态/无打开文件核对移除，不声称历史根全0。见[完整实证](../evaluations/agent-api-process-recovery-2026-11-17/README.md)。标准旧accepted恢复描述同步为现实现，不引入自动重派。博客04同题补机制和Mac实测边界、原两透明图够用，1280/390预览通过未发布。

下一步可在既有Linux合成整栈接相同独立API进程切点；本轮未运行该Linux模式，不把原Linux六场景中的同进程重建冒认为已覆盖。官方Linux四题失败结论及停止付费复跑保持，未知孤儿/旧锁生产恢复、多副本/断电、目标库/TLS/人工/版本策略等仍待；P1/A–D未完成。只中文本地保存，原dirty和现有服务保持，不推送部署。

## Linux 同切点实施约束

2026-11-17从54b3490继续。新VM显式--api-restart，互斥official/stack/gateway/containment，内部复用完整stack资产与原49/九隔离/五网关/组件SDK/六合成场景，再运行相同API三切点。只增三份已维护api_process源到明确payload合同，67资产保持；无第二特权串口、供应商连接、网卡/磁盘/共享目录或key。guest仍2CPU/8GiB，任务512MiB/64；该模式VM总限420秒、外层450秒，准备300秒，不改变旧模式时限。

SDK CLI为--api-process-recovery --linux-stack --report新私有路径，禁用real/official/interrupt。原--linux-stack单用仍原六场景。子API仅可信固定--linux-stack选择Linux启动，默认Mac必须仍拒Linux、Linux显式模式在Mac也拒，不由HTTP问题或环境自动切换。三库、原TLS监听与独立Worker、三个真实时间门/旧凭据/幂等/预算/历史oracle均原样保持。

LinuxFixture显式可信execution_count只允许0或1，旧调用默认1不变；accepted明确预期0 SDK/0模型/0工具/0peak，另两切点各1 SDK。正常ACK、空cgroup/closed relay/PGID不存在、私有root身份与移除都独立核验；有额外执行或不符预期即失败。包装器清理必须继续调用被包装fixture的失败屏障，并独立尝试所有已owned CG清理，不能用Linux覆盖掉API未确认关闭标志。

报告继续有界固定schema，按platform区分Mac与Linux，Linux只有三切点和所有物理观察完成后才能verified；每case保实际Worker ACK/start_count与Linux内核summary，accepted零执行不是缺失观察。guest成功后只发严格安全JSON SW_LINUX_API_PROCESS_RESULT，再由原外层CLI在三库/测试组确认关闭后发独立SW_LINUX_API_PROCESS_RESOURCES_RESULT。失败不发成功标志；宿主严格检查完整schema/类型、原三case/实际等待/剩余有效租约/0+1+1执行与0+1+3模型/0+0+2工具/限额峰值，旧模式遇到新标志拒绝，不能只信一个passed/verified布尔。guest最终退出、VZ独立停止与own组/root移除仍保留原监督器验证。

root负责VM/Swift/guest/SDK CLI、payload合同、宿主严格proof和故障测试、实际运行/证据/博客/交接与中文本地保存；coding只负责ProcessFixture/child/run_matrix Linux适配、LinuxFixture零执行与合作清理及对应窄测；判官在实现后只读复审。协议先写入后广播，后续Claude Code/claude-ds先读本段。任何未知保留证据并失败，不采用旧失败root/锁/PID；上一轮两份失败证据根及旧live runtime保持。生产、官方四题、人审/版本策略等其余未完成项不因此自动通过。

## Linux checkpoint

首轮原生V6完整通过：原49零skip/九隔离/五网关/组件SDK/正式六场景保持，新增三切点actual SIGKILL/wait及独立Worker存活/新APIready、真实三库与同TLS/认证配置重启均通过。accepted45481ms自然failed、0SDK/0model/0tool/0peak；hold旧token/service/DB hash及有效租约核对后余9592ms同mTLS精确403，10523ms后interrupted、1SDK/1model/peak81547264；complete1SDK/3model/2tool/peak114552832，历史/来源与调用行不重写，Worker ACK3/start0/1/1，所有fixture/CG/relay/PGID/root清理确认。VZ独立completed/stopped、外层own组gone/root移除及资源frame全真；VM销毁不替代内部证明。

306源及270 payload逐项等working/source-only暂存树31ad035f2d3791bb9d6d225b85230a683a238c2a，67资产完整metadata与旧native4相同，不推导官方成功。guest_build实际来源字段为payload_sha256，解析2944657482/选中1800082026/initrd774637659字节。新Mac三切点75.671秒/306源稳定再过，linux_verifiedfalse/observations null；API935/35.978秒、Worker164/9.15541秒，新26+宿主7+CLI4+archive5与判官最终源/console/V6复核通过。详见[Linux实证](../evaluations/agent-linux-api-process-2026-11-17/README.md)。

准备Mac runtime按原inode/所有调用终态/无打开文件核后移除，owned VM roots0；旧两失败证据根/live runtime未改，67缓存资产保留。现有3030/8032/3033均200。博客04同题补Linux实测/零执行不能缺证，后端与原三标签/两透明图保持，1280/390预览通过未发布。生产、供应商、Clash配置不变，原80dirty与主handoff210/1保持，仅中文本地保存，不推送部署。

Linux同API切点已完成，不再作为阻塞；官方Linux四题仍失败且停止付费复跑，人工/版本生产决策、宿主死亡/断电/多副本、未知孤儿/旧锁生产恢复及目标库/备份/TLS等仍待，P1/A–D未完成。下一步继续按总计划核对剩余可本地实施项及A权限/资源盘点、影子差异缺口，不用完成的验证代替真实生产/人工决策。
