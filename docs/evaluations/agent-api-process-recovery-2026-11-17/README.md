# API 真实进程强杀与重启

2026-11-17，基点41839d6。最终Mac整栈三切点通过；不是仅在同进程重建应用对象，也不代表Linux相同切点、生产或断电验收通过。本轮没有供应商请求、推送、部署或博客发布。

## 拓扑与判据

维护入口为`scripts/test-agent-sdk-stack.py --api-process-recovery --report <新报告>`，仍需显式指定五项已有本地二进制/SDK路径；报告父目录必须当前用户所有、0700，新文件独占0600。脚本只创建一次性MySQL8.4.13、Redis7.2.17、MongoDB8.0.38，固定SDK0.2.2-rc.1/Node24.17.0；SDK准备使用项目pnpm10.15.1，592项缓存复用、下载0。

可信父持有Worker进程/stdin、三库及TLS监听socket。API在单独Python进程中运行原组合根与public/private routes，继承同一监听fd；重启沿用原HTTPS origin、证书、服务凭据、JWT签名secret、Redis会话和数据库。令牌由原AuthManager签发并在子API校验，未新增HTTP登录路由覆盖。配置和旧运行凭据只经私有管道、内存，不进入argv、报告或异常文本。API仍处于外层owned测试进程组，父只对自己持有的API句柄SIGKILL并wait。

模型和文章为原合成数据。原Gateway、预算、会话重验、派发、固定真实SDK、工具查询、来源交付及最终事务保留；没有用mock应用或假数据库替代。

## 实际结果

最终[native3报告](native-3.json)与[调用摘要](invocations.json)对应同一份304项源码，运行前后摘要一致，总耗时74.444秒。

| 切点 | 实际故障与恢复 | 持久结果 |
| --- | --- | --- |
| 受理已提交、尚未派发 | 原accept真实提交后有界门等待；SIGKILL/wait，独立Worker仍活，新API原配置启动 | 原45秒deadline后45563ms变failed；模型0→0，Worker启动0次；旧key409返回原run |
| 模型请求等待 | 实际SDK到原合成模型等待点后SIGKILL；原model token与DB哈希、服务凭据一致 | 重启后原运行/租约仍有效，剩8333ms时同mTLS请求严格403 ACTIVE_SESSION_REQUIRED；10806ms租约收敛interrupted，模型1→1 |
| 最终事务已提交 | 实际SSE完成、Redis槽已释放且Worker/SDK静止后SIGKILL，再原配置启动 | 原GET答案及来源完全一致，模型3→3；仅一run、两条消息，同key不重派、不再收费 |

三个切点均核同一Worker句柄存活、新API ready、幂等/预算/历史及最终fixture清理。总SDK启动0+1+1次，迟到回调没有额外启动。未完成两切点不提前释放旧Redis槽，分钟次数仍为1；已完成切点保持槽已释放。不适用检查明确为null，不能把它们算成执行成功。

预算逐项比较原run累计和真实agent_model_calls整行，另对ai_messages及agent_sources整行比较。调用中明确为1次、预占1024输出token/65536响应字节、输入字节为正、state reserved、usage和输入预占null，强杀后全部保持；最终完成为三条observed、每条合成输入/输出20。这里使用非计数合成代理，**只验证既有预占不丢失，不是官方输入token硬限的新验收**。

## 保留的失败

1. [native1](native-1.json)：6.205秒在prepare失败，未进入任何强杀切点；没有子阶段诊断，原因未知。Worker正常ACK，API异常退出触发保留fixture根；不反推为后续已定位原因。
2. [native2](native-2.json)：6.021秒同样未进入强杀；新增固定诊断明确listener/OSError/当轮host行218。独立本机TCP bind+listen调用SO_ACCEPTCONN亦返回errno42。修复用精确AF_INET/127.0.0.1/原port/SOCK_STREAM和非阻塞accept检查，仅BlockingIOError代表空监听；非监听、UDP、通配地址、错port均拒绝，已排队连接只在ready前接受并关闭。mTLS/pass_fds未改变。

两个早期失败没有业务矩阵credit，各自私有fixture证据目录按失败规则保留，不声称历史根全部删除。未从文件收养PID、猜测解锁或修改其他运行目录。成功native3三个fixture均确认关闭并移除；外层维护CLI正常退出，原owned数据库与测试组清理路径完成。[准备runtime清理](runtime-cleanup.json)另核原dev/ino、所有调用已终态、无打开文件后移除。

## 回归与范围

- `corepack pnpm check:api`最终923项/37.204秒通过；诊断前918/38.259秒也通过，不能代替最终源验证。
- `corepack pnpm test:agent-worker`164项/9.126647秒通过，Worker生产源码未改。
- 原Mac真实三库/mTLS/SDK六场景兼容34.449秒通过，299份原选择加新CLI测试共300份摘要稳定；新profile未改变默认启动。
- 新process模块14项和CLI4项窄测通过，包含真实自有Python句柄清理及本机socket阴阳验证；判官另独立复核诊断/报告/源码304项及最终结果，无确认阻断。
- 仅增加测试组合/显式CLI与默认兼容hooks，未挂载生产入口、改现有页面、模型目录或Clash配置。旧80项dirty与主handoff原修改保留。

原始日志、每轮完整摘要及本机路径仅存ignored `.tmp/api-process-recovery/`；安全报告不包含问题、答案、原文、登录/运行凭据或异常message。最终源码树与日志摘要见[验证清单](validation-manifest.json)。

Linux相同API进程切点、宿主死亡、生产旧锁/未知孤儿恢复、多API副本、目标库迁移/备份、人工语义/模型版本生产决策仍独立待验。既有Linux官方四题仍未通过，本轮没有付费复跑，P1/A–D没有整体完成。

博客04沿用后端分类、架构笔记/Agent/DeepSeek Harness标签，补查历史/恢复执行区别与Mac实测边界。原两透明关系图已足够，无新增图；1280/390实渲7稳定ID、无首行缩进或溢出、图片360/约342px，未发布。预览为`http://127.0.0.1:3033/.tmp/c3-draft-7jaqfvk4/index.html`，沿用当前dirty renderer/CSS，不将其加入提交。
