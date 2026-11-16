# 本机原生 Linux 环境与协议实证

2026-11-17，基点150c15e。显式原生Apple Virtualization VM，2CPU/2GiB，无NIC、disk或宿主目录分享；固定Ubuntu Base/kernel/initrd、Node与tini，全部资产钉SHA，不安装全局虚拟机程序。协议与复跑见[环境说明](../../development/agent-linux-vm.md)。当前页仍使用原开发SQLite入口，不迁移页面、不开放生产。

## 实际成功与清理

[native.json](native.json)是第五次真实运行的安全报告：Linux6.8.0-147-generic、Node24.17.0 arm64；cgroup2实际挂载且有memory/pids控制器。实际unshare用户/挂载/网络/PID四种namespace，子Node观察PID1、proc只有1及不同namespace身份；guest只见loopback。五个原有协议文件49项全部通过、零skip，原断言和31天retention假时钟未放宽。guest时钟初值0，由测试host启动参数显式设置一次种子，报告不能当生产RTC/NTP验收。

guest-only procfs SysRq poweroff后，宿主delegate独立确认started/stopped与completed；owned组消失且运行根删除，CLI exit0。完整串口与宿主stderr留在ignored私密console，两通道分别解析，不能靠guest伪造停止标记；安全报告保存两通道SHA。[interruption.json](interruption.json)另记录实际guest probe之后的双SIGTERM：只信号测试Python自身，第一次进入真实finally，第二次发生在清理确认前；目标130、宿主interrupted/started/stopped、组gone、根删除。中断实验只证明清理，未跑完协议套件，不记第二次49通过。

## 开发失败保留

[development-attempts.json](development-attempts.json)保留前四次失败的console摘要和观察，不修改旧失败为成功。

1. 第一次进入内核，但原initrd/Base原位叠加使early工具失效。静态核验原busybox、mount等共99路径共享inode，Base覆盖其中66路径；不声称最后覆盖者必为mountpoint。改独立sw-root前缀，在guest内复制至tmpfs并switch_root，宿主从未展开Linux根。
2. 第二次暴露原initrd缺/proc等early挂载目录；补明确mkdir。两次均由host deadline停止，未通过协议验收。
3. 第三次已能执行真实四namespace/cgroup与固定Node；48/49，旧文件测试受启动时钟0影响。panic负值还导致立即重启，实际出现28份probe、27份48通过footer；监督器拒绝重复帧/多套footer，没有记作正常完成。保留busybox原basename、panic=0及测试时钟seed，原测试不改。
4. 第四次49项零skip，但裁剪busybox无poweroff applet，PID1退出panic，host deadline才结束；整体仍失败。改为guest内SysRq单字符o关机并让PID1等待宿主回调，第五次才完整成功。所有失败原始日志保留在ignored目录，不提交内核地址或自由异常。

前四次部分旧源摘要另存于记录中，仅是当时捕获的五文件SHA，不声称包含完整旧builder或可重放旧树。当前[验证清单](validation-manifest.json)绑定最终源码及原31文件guest payload；source-only index树在执行后按相同bytes建立，再单独加入文档/证据，不冒称从最终含证据commit运行。API814项/30.560秒通过，新增宿主归档11及监督器7项。归档路径/大小/链接/同bytes验证、实际自有子进程超时清理、严格JSON重复键/未知字段/float拒绝均有回归。独立判官初审发现重复键可能覆盖stopped false，已修并保留反例，最终复审另记清单。

## 仍待验收

环境boot通过不等于逐run隔离：没有证明每run memory/PID硬上限、跨run文件/PID不可见性或允许可信API且拒绝任意外网的策略；guest没有NIC不能替代这条双向网络验收。实际SDK/官方模型/三库未在本guest运行，旧macOS整栈证据保持独立；VM实验供应商调用0。回应用户Clash线索，另以原安全profile只读官方模型目录成功，[proxy-check.json](proxy-check.json)生成0、固定模型可见、不可变版本仍false；不带入guest，也不保存全目录/凭据。

本轮博客04按sun-world-blog→design补环境边界与任务边界，后端分类/架构笔记、Agent、DeepSeek Harness标签保留；7稳定章节/28处strong，1280/390正文和原两图视觉检查通过、无首行缩进/双星残留/横向溢出，图宽360/约342px。两段机制说明已足够，无新增重复图片。预览复用现有dirty renderer/CSS，未发布。根format仍仅已有内容manifest失败，未改它，不称根/Web全绿。

原80项dirty和主handoff210加/1删保留。没有推送、部署、改业务模型目录或生产服务。人工四题仍pending；模型版本生产决策、生产TLS、目标业务库结构与备份等继续独立验收，P1/A–D未整体完成。下一步在自有Linux环境实现并验证逐run资源/文件/网络边界。
