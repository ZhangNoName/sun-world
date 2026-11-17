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
