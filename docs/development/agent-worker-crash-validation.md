# Worker 控制器崩溃与恢复边界

日期2026-11-16；基点c2459be。现有[Worker协议](agent-worker-v2.md)与[留存规则](agent-journal-retention.md)规定：控制器锁不能依据PID消失自动抢占，恢复到的running记录必须保持interrupted/needs_reap，不重派、不释放未知容量。本轮补真实本机进程故障证据，初始范围只新增测试与受限fixture，不设计自动接管、PID扫描或任意目录解锁命令。

已有[实际SDK整栈](agent-sdk-stack-validation.md)验证过活跃SDK组SIGSTOP、Worker SIGKILL、API不释放未确认槽及父宿主独立reaper，不能说此前没有真实Worker崩溃证据。此轮新增的是同一持久journal在取消前置、running与completed三个切点的锁保留/重启语义；原ExecutionService恢复单测直接构造v2 running记录，没有真实执行进程。两组证据互补，不用新合成子程序替代旧实际SDK范围。

## 三组实际进程故障

测试创建全新0700私有根、实际独立Node ExecutionService控制器，使用项目Node及最小环境，不加载业务配置/密钥/数据库/SDK/模型。running和completed使用实际ProcessRunner启动的合成Node程序。所有控制器与合成执行进程均由该fixture创建；控制器的ChildProcess句柄、fixture专属nonce与子程序标记用于登记本次测试资源，不能把journal中的PID当成信号授权。

1. **取消记录已提交、控制器空闲**：父测试确认cancel ACK与落盘记录，再对自己的控制器发送SIGKILL，确认实际exit signal和组消失。旧锁仍在，维护check/apply与新控制器都拒绝且记录不变。仅在fixture确认所有owned进程已消失后，测试代码移除自己目录中的锁以进入恢复分支；原取消身份仍拒绝迟到start，不出现runner执行。
2. **实际执行子进程正在运行**：先确认实际ProcessRunner创建的独立组和workspace，再只SIGKILL控制器，直接观察子组仍存活及workspace保留；维护和新控制器继续拒绝，不能把控制器死亡当回收确认。fixture独立回收已登记子组，确认组消失后旧锁仍不自动消失。测试仅对自己的私有目录移除锁，恢复读取running为interrupted/needs_reap；readiness.available=false、旧/新start拒绝、cancel/close无法确认，锁和占用继续保留，runner调用为0。
3. **实际执行已结束并持久完成**：实际ProcessRunner确认组/workspace回收，控制器inspect观察completed后才SIGKILL。旧锁仍阻止接管；fixture确认owned组全部消失并显式处理自己旧锁后，新控制器恢复原completed。相同请求返回原完成ACK而不重派，改deadline也不能复活原身份，新身份可再次受理。

第二、三组区分“控制器死了”“执行进程死了”“持久记录已确认回收”；测试中的已知fixture解锁仅用于进入现有恢复分支，不提供生产解锁授权、通用恢复工具或未知孤儿确认。读取到的journal与锁不作为测试kill目标；不得信号任何非本次创建的PID/组，不能探测或清理现有站点进程。

## 证据与清理

新矩阵放入默认Worker gate，helper位于tests/fixtures，测试进程通过有界IPC握手再选择切点；有界轮询真实状态，不用固定短sleep当完成。每组断言实际SIGKILL、旧锁字节/记录保持、维护固定错误无stdout、恢复结果及runner调用。安全诊断只含固定case/版本/信号、布尔观察与次数，不含PID、路径、UUID、问题、凭据或自由异常。

fixture先登记清理，再创建/启动资源；失败也按owned登记独立回收，先确认控制器和执行组消失再删除私有根。若不能确认，保留根并固定失败，不能为了TAP绿强删未知资源。安全proof仅在用例断言与最终清理都完成后发出。保留原site/API/预览和verified binary/必要SDK缓存；不启动业务库或供应商请求。

独立审查确认新测试宿主的一处P2（非生产Worker缺陷）：初版只用全局expectedExecution布尔和groups非空检查。第一执行已登记/结束后，第二个真实合成程序在nonce marker之前被控制性延迟、其控制器又遭SIGKILL时，cleanup会用旧组满足非空条件，误删根并返回成功，而第二组仍活。判官用仅本次fixture的Node preload与独立owned PID标记确定复现并独立回收，正常三切点此前仍通过，不能用正常通过反证失败路径。

修复契约：每次确定将进入真实runner的尝试（含恢复后的fresh identity）都在派发前增加独立预期登记数，不能只记“曾执行过”。清理时已验证唯一owned组的覆盖数不足即固定失败并保根，不发proof；不能用旧的dead组填补后续未知启动。补旧组已存在而第二登记缺失的回归，并用相同实际延迟/SIGKILL交错复核修复；不扩展生产PID扫描或恢复API。即使已知组都已消失，只要仍可能有未登记启动，也不声称整个根可删。

先运行新矩阵及原ExecutionService/journal/maintenance/ProcessRunner回归，再Worker全量；生产源若无变化不重复三库/SDK/官方语义。若发现生产缺陷，先补契约并同步coding/判官，再做限定修复和相关复验。报告区分macOS实际进程故障、合成子程序、测试专用锁处理和未完成的宿主恢复授权；本机SIGKILL不代表Linux cgroup、主机断电、生产孤儿或未知锁自动恢复验收。

本文先于实现并同步已有coding/判官；Claude Code/claude-ds后续接手须读取。博客04按sun-world-blog→design同题补控制器与执行进程的区别，后端分类、架构笔记/Agent/DeepSeek Harness标签保留，先评估图片是否增加信息，未授权发布。Linux、不可变模型/人工/生产TLS/目标库及备份等独立门槛仍保留，P1/A–D不整体放行。

## 已执行结果

新三切点加登记缺口回归4项、相关Service/journal/maintenance/ProcessRunner共49项通过；独立判官4项及原实际延迟/SIGKILL交错修后复验通过，测试宿主P2解除。最终Worker100项/9.240秒、零skip；root临时副本关闭覆盖判断后第四回归如期失败，未改真实源码或制造第二未知进程。29项source/index与执行树绑定、原始安全proof及修前后范围见[实证](../evaluations/agent-worker-crash-2026-11-16/README.md)。所有owned组/私有根确认清理，现有site/API/正文预览保留；无新API/生产Worker改动或供应商调用，不扩展重跑三库/SDK/语义。

博客04同题补恢复分界，原分类/标签、7章节ID、两张透明图保留；27处strong，1280/390视觉与DOM检查通过，0缩进/无双星/溢出，原图桌面360/手机约342px。两种恢复结果用相邻段落已可比较，不补重复状态图，未发布。下一步先只读核对本机是否已有可用Linux容器/VM，再选择实际隔离验证；不擅自把fixture解锁升级为生产恢复授权。
