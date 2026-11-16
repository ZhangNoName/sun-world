# 本机自有 Linux 验证环境

2026-11-17，基点150c15e。PATH/常见容器入口缺失不代表本机无法运行Linux。本轮只在ignored私有目录准备自有验证环境，不安装全局Docker/虚拟机软件、不用生产服务器、不改现有站点或准入。人工四题仍待用户实际结论。

## 已观察能力

本机Darwin arm64、32GiB内存、10逻辑CPU，检查时可用盘约112GiB，kern.hv_support=1。用系统Swift编译并对自己的新可执行文件ad-hoc签名，只有com.apple.security.virtualization entitlement；VZVirtualMachine.isSupported与2CPU/2GiB配置validate均true，未启动guest。依据[Apple Linux示例](https://developer.apple.com/documentation/virtualization/running-linux-in-a-virtual-machine)与[entitlement说明](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.virtualization)，可以继续验证原生VZ路线，不能仅凭硬件标志宣称guest已运行。

## 第一阶段范围

准备固定arm64 Ubuntu Base24.04.5、Ubuntu cloud generic kernel/initrd和项目固定Node24.17.0。仅从Canonical/Node官方HTTPS来源获取，按发布方HTTPS SHA256清单钉住原bytes再使用，记录URL/hash/大小，不把内容hash误称独立发布签名。所有下载/缓存/编译文件在.tmp/linux-vm私有根；下载有单文件上限和超时，不带业务凭据，出错不换版本、不使用未验证partial。

guest PID1使用Canonical仓库的tini0.19.0-1 arm64包，只读取已钉SHA的deb中明确的usr/bin/tini-static成员，不运行dpkg/安装脚本。它作为guest PID1回收自有orphan；测试脚本位于其下，不能让新VM因无人reap而把僵尸组误当Linux进程控制缺陷。资产契约在tools/agent-linux-vm/assets.json，五对象均已通过HTTPS发布方清单/包页面SHA核对；Ubuntu Base首下载SSL timeout后只对同URL/hash重新取一次，未改版本或TLS设置。

原Ubuntu initrd后追加自己生成的gzip/newc archive；只有受控early /init位于原根，Ubuntu Base、固定Node、明确选择的Worker源码/契约/合成协议测试均置于独立sw-root前缀，不能用base文件覆盖原initrd工具。early init挂载设备/内核文件系统，在guest内创建tmpfs新根、cp-a该前缀及early busybox，move proc/sys/dev后switch_root执行tini。guest内复制不等于宿主解压，不将chroot或启动环境当逐run安全隔离。不在宿主展开rootfs树、不执行Linux归档程序、不根据归档内容写宿主绝对路径、创建device或跟随symlink。依据[Linux initramfs格式](https://www.kernel.org/doc/html/latest/driver-api/early-userspace/buffer-format.html)处理有界相对路径、链接类型、newc对齐/TRAILER、大小/条目上限，成员仅被写成guest archive；不得把.tar解压到宿主后再补防护。

guest使用2CPU/2GiB、RAM根，配置无网络设备、无宿主目录分享、无宿主disk/USB/GPU或密钥注入，只附加受控console。guest原件与导出payload均明确选择并校验，不能打包工作区根、.git、.env、业务data或key。guest最小PID1必须正确回收orphans，不能用宿主宽泛PID扫描替代。独立运行自己的合成Node检查/选定Worker协议测试，输出有界固定schema与kernel/Node/cgroup/namespace能力；观察真实Linux状态，不用macOS或mock报告替代。

host driver验证配置后start，guest关机后以VZ delegate/state确认停止；错误/超时由同一owned句柄stop并确认。Python监督器先登记自己创建的Popen/组和私有根，处理首次/重复中断，不杀来自任意旧文件的PID。只在host退出/guest停止和owned组消失得到确认后删除本次临时运行目录；未知保留根并固定失败，无成功证据。固定verified资产缓存可保留，未知partial不当可用cache。CLI不会默认daemonize或挂生产HTTP。

guest console与宿主控制凭证必须分通道：VZ串口只写宿主stdout，host delegate/state结果只写宿主stderr；监督器只从后者判断guest停止。guest即使打印同名标记也不能成为宿主停止证明。两通道都有字节上限并持续排空，超过限制拒绝成功；信号/超时先记录停止原因，正常关机竞争不能吞掉已观察中断。

控制凭证必须唯一整行、严格JSON对象，拒绝重复键、浮点/非finite与未知字段；cleanup允许已知interrupted/deadline等原因，但stopped必须明确bool true，完整验收还须started=true/reason=completed与49项零skip。独立审查纯离线确认初版默认json.loads会把stopped:false/stopped:true覆盖后误判为true；修严格解析后须保留反例，不用真实正常输出通过反证坏协议。

首次开发启动确实进入Linux6.8.0-147，但early init的mount -t异常、hvc0缺失而退出；host在deadline确认stopped，owned组/运行根已清理，保留原raw console。此轮不算原生通过；原initrd与Base根目录混合覆盖的原因需核验，先按独立前缀/newroot契约收敛，再保持原namespace/cgroup/49项门槛复跑。

静态核验确认原initrd的busybox、mount等共99路径共享同inode、Base有66条同路径覆盖，故不能原位叠加，不武断称最后必为mountpoint。独立前缀后补齐early /proc/sys/dev目录；第三次已实际运行固定Linux Node/四namespace probe与cgroup2，协议48通过/1失败，仍不放行。还需保留busybox原basename以使用multicall分派；kernel panic=0禁止意外自动重启，而不是用panic负值重复执行测试。无网络的RAM guest启动时从host boot参数显式获得一次测试时钟种子，在Node测试前设置并观察前后值，不修改原retention用例的31天假时钟或放宽原断言；不将这项测试seed称为生产RTC/NTP验收。

第四次实际观察seed前Unix秒为0，设置可信测试host种子后原49项零skip全部通过；但initrd裁剪版busybox没有poweroff applet，PID1退出会panic，仍因host deadline而整体失败，不用“49通过”掩盖停机失败。guest RAM根无任何host disk/分享，关机改为guest内先sync、以该guest的/proc/sysrq-trigger写单字符o，再保持PID1等待VZ停止回调；这是[内核定义的guest poweroff](https://docs.kernel.org/admin-guide/sysrq.html)，绝不在宿主执行该路径，最终仍必须host独立确认stopped。

显式中断验收另列命令：观察实际guest完整probe后给该测试宿主自身SIGTERM，进入维护监督器的真实finally清理，再在停止确认读取前给同一宿主第二次SIGTERM。仅以采集器调度观察/触发信号，不替换Popen/VZ/guest/清理判断或伪造控制数据；必须目标main返回130、host stderr明确interrupted/started/stopped、own组gone且本次根消失，命令最终仍退出130。它中断协议套件而非宣称第二次49通过；默认门禁不启动此实验。

## 验证与门槛

最终第五次原生启动成功：Linux6.8.0-147-generic、Node24.17.0 arm64，实际cgroup2具备memory/pids，四种namespace与PID1/单进程视图探针通过，原49项协议测试零skip通过；guest实际关机，host独立记录completed/started/stopped，owned组消失后临时根删除。另一次真实双SIGTERM中断实验目标exit130，host记录interrupted且started/stopped，组和根确认清理；不把中断套件记为49通过。API完整814项/30.560秒通过，归档/监督器新增18项包含其中。原始私密console留在ignored目录，提交安全投影、资产与源码摘要，见[本轮证据](../evaluations/agent-linux-vm-2026-11-17/README.md)。

## 显式运行

需要Apple Silicon/macOS、系统Swift与Virtualization entitlement支持、项目Python，以及已核验的五份资产。将[固定资产契约](../../tools/agent-linux-vm/assets.json)中各URL的内容按filename保存到当前用户所有的0700缓存目录；文件必须0600普通单链接，builder重新核验原bytes的SHA与大小。Ubuntu cloud release路径会更新；若不再匹配，停止并重新评审固定版本，不自动接受新hash或换版本。工具不下载模型，也不把主机凭据带入guest。

```bash
apps/api/.venv/bin/python scripts/test-agent-linux-vm.py \
  --cache /absolute/private/assets \
  --report /absolute/private/new-report.json

# 另一次真实中断实验；验证成功也按被中断语义退出130。
apps/api/.venv/bin/python scripts/test-agent-linux-vm-interrupt.py \
  --cache /absolute/private/assets \
  --report /absolute/private/new-interruption.json
```

report必须全新绝对路径且父目录存在；同名console也不能预先存在。正常命令exit0才表示完整环境/49项/停机清理通过；失败仅输出固定类别，console以0600保留到report旁。中断实验仅在打印AGENT_LINUX_VM_INTERRUPT_VALIDATED并写出严格proof后表示其预期130通过。每次最多一个2CPU/2GiB临时VM，无常驻服务；已核验缓存及Swift编译缓存保留。本轮当前本机Clash7890可连接，既有维护命令只读官方模型目录再次成功、生成0；这独立于无NIC的Linux实验。

第一阶段要实际boot、读kernel及Node版本、挂载/观察cgroup2和namespace支持，并真实运行明确选择的Node协议测试，再确认guest/host退出和临时根清理。此时只可标记linux_environment_boot_verified；per-run memory/PID/network/filesystem隔离、真实SDK整栈和生产恢复授权仍分别未验收。VM没有NIC不等于已实现允许合法API同时拒绝任意外网的Worker网络策略，也不等于多run文件/PID隔离。

写入工具前先同步coding/判官。归档构建单测只证明宿主打包边界，Swift编译/配置validate只证明宿主能力；实际guest输出另行保留源码/资产摘要与范围，失败不能改成skip后冒称原生通过。原API/Worker门禁不默认启动VM，Linux显式命令单列。后续Claude Code/claude-ds接手必须读取本协议，区分环境boot与真正B隔离门槛。

博客仍按sun-world-blog→design同题说明环境与逐run隔离的区别，后端分类/架构笔记/Agent/DeepSeek Harness标签保留，先判断图片信息量；不发布。本地已有3030/8032/3033、原80dirty及主handoff210加/1删保持，不推送、部署或改业务模型目录。
