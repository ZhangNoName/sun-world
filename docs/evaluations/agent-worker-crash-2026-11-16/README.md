# Worker 控制器崩溃与同 journal 恢复实证

日期2026-11-16；基点c2459be。协议见[控制器故障矩阵](../../development/agent-worker-crash-validation.md)。本轮新增默认Worker测试与私有fixture，修正Worker README的旧状态说明，生产执行源/API/SDK均未改；现有站点与其他dirty保留，不推送、部署或发布。

## 三个实际切点

最终`corepack pnpm test:agent-worker` **100项/9.240秒通过，零skip**。该次gate中的三个切点分别对实际Node ExecutionService控制器SIGKILL：取消已持久、实际ProcessRunner正在运行、实际执行已完成。切点前合成执行次数0/1/1；完成后恢复新身份另执行1次，合计三切点内3次合成执行。完整Worker gate中的其他测试及第四个登记回归另有自有进程，不能把这3次说成整轮所有进程启动总数。

- 三组均确认实际exit signal为SIGKILL、控制器组消失、旧锁仍在；check/apply及新控制器拒绝，原锁与记录字节不变。
- running组直接观察控制器已死而独立合成执行组仍活、workspace仍在。fixture独立回收自己登记的组后，旧锁仍不自动消失；仅对自己目录显式处理锁，进入原恢复分支。新控制器将running保留为interrupted/needs_reap，available=false、旧/新start拒绝、cancel/close未确认、runner0，锁和workspace保留。
- cancelled恢复仍拒绝迟到start；completed恢复对原完整请求返回旧ACK、改deadline冲突而不重派，新身份实际执行并完成。测试专用解锁不构成生产未知锁/孤儿的恢复授权。

安全投影见[native-crash.json](native-crash.json)。三份正常proof仅在全部断言、owned组确认消失及私有根删除后发出，不含PID、路径、UUID、问题、凭据或自由异常。root在所有run结束后另确认该fixture前缀私有根为0；生产站点必要资源与缓存保留。

## 新测试宿主的失败与修复

正常三组首次通过后，独立判官确认P2：第一实际执行已登记且结束，第二实际ProcessRunner子程序在写nonce marker前控制性延迟10秒，拿到running ACK后强杀自己的控制器；原helper仅检查“曾有执行”和组集合非空，cleanup误返回成功并删根，而第二组仍活。判官用本次preload独立登记的owned PID回收该组，未读取业务journal PID或信号现有进程。修前99项正常gate不能反证这条失败路径。

现每次可能进入真实runner的派发都先累计独立预期，包括恢复后的fresh身份；已验证唯一组数不足时固定失败、保根、不解锁、不发proof。新增第四个回归以旧真实dead组和第二潜在派发缺口验证拒绝，再用第二个实际执行补足并确认全部ESRCH后才允许删除，不伪造marker。coding新4/相关49通过，独立判官最终4项通过，无剩余确认阻塞。

判官用原10秒延迟/实际SIGKILL交错复验：cleanup拒绝、根保留、gone=false、解锁拒绝；等该实际子程序完成真实登记并独立回收组后，cleanup才成功。修前/修后固定布尔投影及修前3文件SHA均保留。这个preload driver经Node stdin临时执行，没有保存路径/SHA；不把源码摘要当作完整可重放驱动。已入库第四个回归提供稳定维护覆盖。

root另在临时副本关闭两处登记覆盖判断，仅运行第四个回归，按预期exit1/fail1；其初始已知执行已清理，预期断言失败前不会创建第二个未知进程。实际仓库源码未改，临时副本已删。此负向控制证明新回归会发现保护被移除，而非只验证正常结果；ignored driver仅以SHA关联本次观察，不承诺长期归档。

## 源码、写作与范围

最终执行源树`9bfc1f1df5e0f7e9624d1368d851b611d545e57f`，29项source/index摘要见[验证清单](validation-manifest.json)。三个新MJS语法与定向格式、root-script、scoped diff通过；根format仍仅既有内容manifest失败，未改该dirty，不称root/Web全绿。生产Worker/API源无改动，不重复三库/SDK/官方模型生成；原API787与SDK证据仍保留各自历史源范围，不冒充本轮重跑。

博客04同题补控制器/执行进程/持久回收确认的区别，后端分类与原三标签、7章节ID保留；27处重点，1280/390视觉/DOM无缩进/双星/溢出，原两张透明图360/约342px。新增的两种恢复结果在相邻正文中已能清楚比较，无需第三张重复状态图；未发布，预览继续复用dirty renderer/CSS，不是整页验收。

这是macOS实际进程故障与合成Node子程序，不是主机断电、Linux cgroup或生产未知进程恢复验收。已有实际SDK活跃强杀与父reaper证据保持独立，本轮补同一持久journal在三个切点的重启语义。Linux隔离、人工语义、模型版本生产决策、生产TLS、目标业务库/备份与账号日志政策仍待，P1/A–D未整体完成。
