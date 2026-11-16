# Linux 逐任务资源、文件与生命周期实证

2026-11-17，基点7b90679。协议与使用见[隔离说明](../../development/agent-linux-containment.md)，续接[Linux环境](../agent-linux-vm-2026-11-17/README.md)。本轮实际使用新Linux launchSpec、可信exec wrapper、原ProcessRunner与bubblewrap，没有用独立unshare探针代替任务路径。生产准入仍关闭，现有3030/8032开发SQLite页面保持。

## 最终原生结果

[native.json](native.json)来自第七次显式运行：真实Linux6.8.0-147/Node24.17 arm64，原49协议测试全部通过、零skip，另九个隔离情景通过；guest关机后host独立started/stopped/completed，owned组与私有运行根确认清理。37份明确guest payload与当前源码逐项一致，六资产固定SHA；原五资产/default31文件与49协议范围保持，只有显式`--containment`增加额外包/六源。没有业务凭据、宿主盘、宿主目录分享或NIC。

| 实际场景 | 观察与判据 |
| --- | --- |
| 私有根出现未知叶子 | fixture新建空叶子后工厂拒绝准备，不启动目标；只确认空后删除本fixture叶子 |
| 活跃树遇到新工厂 | 原任务仍活时新实例拒绝第二任务，未接管旧树；原实例继续回收 |
| 第一个活跃文件任务 | 自己可写、宿主sentinel不可见；实际7namespace身份与外部不同、PID视图受限 |
| 并行第二文件任务 | 第一个workspace不可见、固定runtime写入EROFS，自己目录可写；两任务7namespace均不同 |
| 整树内存超额 | memory.max512MiB、swap.max0，memory事件与OOM kill计数4，正常受控失败并回收 |
| 冷PID负向对照 | 同cgroup父收集子Node实际SIGABRT、pids事件2、OOM kill0；无stderr内容，内部abort栈未知 |
| 已准备PID设施 | 真实sleep子进程耗尽64项进程/线程预算，spawn EAGAIN、pids事件1，目标正确记录后退出 |
| 取消含setsid后代 | 实际独立会话后代已运行；cgroup整树stop与原POSIX组均确认静止，目录删除 |
| deadline含setsid后代 | 同一启动路径实际2秒deadline触发整树回收，done按失败结算 |

文件场景实际检查CapEff/CapPrm/CapBnd全0、NoNewPrivs=1、再建userns拒绝，不只检查argv里有参数。每个终态都核populated0、pids_current0，最后所有workspace与自有cgroup子树移除。数字512MiB/64暂为合成目标的本地选择，不能当真实SDK容量结论；cgroup PID限制计入线程。

## 审查修正与失败历史

[development-attempts.json](development-attempts.json)保留全部七次尝试的安全摘要/原console bundle SHA及阶段结果，未把中途成功快照当最终版本。

- 第一次在guest启动前失败：官方安全修订bubblewrap0.9.0-1ubuntu0.3的data.tar.zst不受Python3.12 tarfile支持。固定包不退旧版，复用现有锁定zstandard0.25.0单帧内存解码，先限制声明大小与窗口各2MiB，拒未知大小/截断/多帧/尾随，再交原有界tar。13项归档回归通过；默认路径无该导入，未安装新依赖。
- 第二次原49过、隔离目标AGENT_EXECUTION_FAILED，host正常关机；当时没有stage观察，不补造精确初因。第三次加phase文件写入后六情景通过，但不凭一次通过反证旧失败。
- 第四次只让PID目标跳过早期async phase写入，其余断言不改，明确在PID情景失败。第五次额外父Node诊断观察SIGABRT，但线程创建正则未匹配，旧过强分类断言使整体验收失败；没有把未匹配改写为已证明libuv错误。第六次七情景与原子proof版本完整通过，第七次再补两个真实未知树拒绝情景，最终九项通过。
- 冷对照额外父改变资源开销；最终采集stderr字节0，固定线程/资源/std::system_error分类均false。只证明该对照中PID事件与异常终止，内部C++栈与第二次失败仍未知。正向目标显式先准备async文件设施；未扩大64限制或吞掉内核错误。
- 判官确认P2：无效containment的stop/release晚到teardown才校验，合法command仍可能执行。现spawn前严格检查；null/缺方法三反例实际marker副作用0，保持pending与槽，合法修复后才清理。准备过程中同步registerContainment、跨deadline/执行文件缺失、release失败均有回归；ExecutionService真实journal确认needs_reap与并发槽保留。
- 判官独立复现另一个fixture P2：直接writeFile发布proof，observer可能读到空文件。现四处共享pending完整写入→原子rename；真实半写gate回归1项通过，正式proof在写完前始终ENOENT，不把完整坏JSON当“再等等”。此修复不冒充持久磁盘durability，也不解释PID场景失败。

## 验证范围与接续

最终API818项/31.119秒、Worker116项/9.318秒通过；新增Worker16项（launcher7、lifecycle8、proof1），原diagnostic反例随新保槽语义强化。新增四项Python回归包含于API：可选压缩、额外归档、严格隔离证明和安全诊断阶段；独立判官复审无剩余确认阻塞，分别复核lifecycle8、proof1、archive13、supervisor8、reader11与最终37源/九情景报告。见[源码与检查清单](validation-manifest.json)。API/Worker门禁不默认启动VM，普通Provider/目录未改。

Linux完整门槛仍false：本guest没有NIC，尚未验证允许合法网关同时拒绝任意外网；实际固定SDK/三库/官方API也尚未在该launcher中执行。旧macOS整栈证据不移植为Linux验收。cgroup空树拒绝不是自动恢复授权，不删除或接管未知旧树；生产部署、持久孤儿授权、目标库/备份、人工四题、版本生产策略和生产TLS继续独立待。

博客04按sun-world-blog→design局部补整树与进程组、准备失败也需保留所有权，分类后端/架构笔记、Agent、DeepSeek Harness保留。1280/390正文29重点/7稳定章节，无缩进/残留双星/横向溢出，原两透明图360/约342px已视觉检查。新增两段以文字即可解释，不新增重复图；预览用原dirty renderer/CSS，未发布。根format仍原内容manifest失败，未改它；原80项dirty与主handoff210加/1删保持，不推送部署。下一步限定网关通道及真实SDK在Linux的资源容量与取消验收。
