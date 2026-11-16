# Linux 逐任务隔离实施协议

2026-11-17，基点7b90679。接续[原生Linux环境](agent-linux-vm.md)，本轮从实际ProcessRunner实现每run资源/文件/PID边界，不以独立探针或VM总限制替代。本地实现与原生验证见文末；SDK/允许网关路径与生产准入仍未验收，生产保持关闭。

## 可信启动与资源所有权

由服务器固定配置的Linux launchSpec创建独占cgroup2叶子，先设置memory.max=536870912、memory.swap.max=0、memory.oom.group=1、pids.max=64并读回，SDK未受控执行前由可信wrapper将其自身加入该叶子。通过固定bubblewrap进入新user/mount/pid/net/ipc/uts/cgroup命名空间，禁止进一步userns、cap-drop ALL、new-session/die-with-parent，执行固定runtime中的入口；任何原语/权限/资源配置失败均拒绝，不退回普通spawn。运行请求不能指定命令、挂载、cgroup路径或限额。额度暂为本地合成实测值，不作真实SDK容量承诺。

只接受已由运维准备的私有、当前用户所有的cgroup2子树，检查realpath/文件系统类型/父目录与controller，不自动操作宿主根或任意现有group。叶子只用自己新建的随机目录，停止写其cgroup.kill=1，再有界等populated=0且procs为空，才允许rmdir；不根据旧文件PID发信号，不自动接管旧group。准备失败但尚未spawn也要清理自己的空叶子，未知保留，不能让主控制器误认已清理。

ProcessRunner的可信launchSpec可返回可选containment对象，必须有stop/release两个方法；旧调用方保持兼容。启动参数另提供同步registerContainment回调，launcher新建叶子即登记且后续返回同一对象，不能等全部写/readback完成才交回所有权。stop回收自己的完整cgroup，release核对空与记录有界计数后删除；done/stop在这些步骤成功且原owned POSIX组已gone之后，才删除workspace/放容量。包含逃离原POSIX组的setsid后代，不能仅凭原组不存在就认任务已静止。失败保留workspace和容量，stop可重试。spawn之前失败也须执行已登记的containment清理；不把未启动等同于零资源。已经取得containment而未spawn的清理失败必须返回可重试handle与未settle的done，不能直接throw让ExecutionService误按“无owned资源”放槽。trusted launcher在自身准备阶段抛错前负责确认未启动执行，并尽力清理空叶子；未知叶子保留并拒绝新的准备，不自动接管。工厂每次检查私有委托根的子目录必须全在本实例独立登记集合，重启后遗留任何未确认叶子都阻断新准备，不仅依赖内存blocked标志。

## 文件与能力边界

bubblewrap只只读挂载固定系统/usr（及合并usr symlink）与明确runtime到/runtime，读写挂载本次workspace到/work；/proc、/dev在新namespace内创建，HOME=/work/home、TMPDIR=/work/tmp、cwd=/work/cwd。不给宿主根、其他workspace、业务目录、cgroupfs或宿主proc；不继承任意env/fd。runtime与所有路径是可信部署配置，拒绝symlink替换/非所有者/不安全可写路径。测试必须同时验证允许自己的写入和拒绝其他任务/宿主sentinel/只读runtime写入，以及真实PID/capability视图和无法重新创建userns。

本轮初始netns无外部接口，仅用于拒绝路径验证；尚不能运行需要外部网关的真实SDK，不宣称网络策略完整。后续须提供限定gateway通道并同时测试合法API成功与任意地址失败；不得以全部断网完成B。官方API凭据保持代理侧，不加入VM/运行根。本轮不调用供应商、不改站点目录或现有页面。

## 实证与委派

使用官方Ubuntu修订bubblewrap包，按发布方HTTPS SHA核验，只读取明确bwrap成员进guest，不宿主安装/运行dpkg。保留固定原五资产合同，新增显式隔离suite的独立资产/固定源码清单；默认49协议验证保持原范围，隔离报告使用单独严格帧与版本，不能靠skip/部分probe通过。

首次新增suite在guest启动前的宿主构建阶段失败：固定安全修订deb实际为data.tar.zst，而Python3.12 tarfile不支持该压缩。不能退回旧未修订包；隔离路径显式复用项目现已锁定/安装的zstandard0.25.0，在内存解码已核SHA原件的单帧，先限制声明解压大小及窗口各2MiB，拒未知大小/截断/附加数据，再交给原有界tar成员解析器。默认五资产路径仍不导入该可选codec。此项不安装新依赖或执行归档程序，版本/格式不符固定失败；[codec契约](https://python-zstandard.readthedocs.io/en/0.25.0/decompressor.html)不能替代本项目边界测试。

coding负责Linux launcher/可信wrapper与纯离线拒绝测试；root负责ProcessRunner生命周期接入、guest suite/归档/真实Linux实证、博客与提交；判官只读独立复审全部集成。所有人先读本文；不启动全局daemon，不连接生产、不打印/读取凭据，不动原80dirty。协议变更先改本文再广播；后续Claude Code/claude-ds同样先读本协议。

实际验收至少覆盖每run真实OOM kill及memory事件、真实进程/线程上限EAGAIN与pids事件、成功/取消/超时/跨组后代回收、跨任务文件不可见/只读与自己可写。只在同一个实际launcher/ProcessRunner路径验证，不用mock伪造内核结果。完整SDK/网络、生产恢复授权、人工/版本/TLS等未通过项独立记录。

开发中新增冷启动PID对照：跳过首次异步phase文件写入的原目标，在真实pids饱和时失败；同cgroup内已准备的父Node另启动该cold子目标，最多采集16KiB stderr，只投影SIGABRT/固定文本类别布尔和字节数，不输出自由错误。只要求实际SIGABRT、pids超限事件及OOM kill为0，绝不能因线程正则未匹配而把未知原因改写为已证明的libuv初因；额外父Node改变资源开销，也不能反推此前未定位启动的精确栈。正向用例显式在耗尽任务数前完成异步文件设施准备。冷对照单列第七情景，真实异常退出也必须完成整树回收；生产SDK容量仍须后续实测。

fixture proof必须临时文件完整写好后同目录原子rename，observer只重试ENOENT、完整坏JSON仍立即失败。判官已独立复现直接writeFile的空文件可见竞态；新增离线回归实际暂停pending文件的半写状态，确认正式proof不可见，恢复后才读到完整JSON。它不模拟内核隔离，也不等同持久磁盘durability。

另补两个真实拒绝情景：fixture只在自己新委托根中创建一个空叶子，工厂拒绝准备且未启动目标，确认该fixture叶子无procs后才移除；第一实际任务仍活时，新的factory实例看到其未登记树必须拒绝另一任务，不接管它，由原实例继续回收。这两条与前七情景分别计数，完整隔离suite为九情景，正常49协议仍另计。

博客04沿用sun-world-blog→design局部解释cgroup整树与POSIX组的区别、允许与拒绝两侧；分类后端、架构笔记/Agent/DeepSeek Harness标签保留。已有两图继续评估信息量，验证后更新稿件与1280/390预览，不自动发布。

## 显式使用与当前结果

最终原生九情景与49协议通过，API818/31.119秒、Worker116/9.318秒，独立复审无确认阻塞；全部失败尝试与未定因边界见[本轮实证](../evaluations/agent-linux-containment-2026-11-17/README.md)。新工厂代码`apps/agent-worker/src/linux-launcher.mjs`返回兼容createSdkWorker的launchSpec；运维必须先提供真实cgroup2私有子树、启用memory/pids且目录0700、固定只读可部署runtime，以及受信/usr内Node/bwrap，绝不从run传配置。当前网络全隔离配置尚不能服务需要网关的SDK，禁止直接据此开放生产。

显式VM命令复用五资产缓存并增加[安全修订包合同](../../tools/agent-linux-vm/containment-assets.json)的bubblewrap.deb（0600普通单链接）。运行前按官方security arm64 Packages.xz核SHA/大小；本轮发布方HTTPS完整性已核，不称独立GPG验签。没有模型下载或主机软件安装。

```bash
apps/api/.venv/bin/python scripts/test-agent-linux-vm.py \
  --cache /absolute/private/assets \
  --report /absolute/private/new-containment.json \
  --containment
```

只有exit0且strict报告/host停止确认全部成立才通过。报告版本2把resource_filesystem组件true与完整per_run隔离false分开；不加flag仍仅原默认环境49协议，不读取额外包/codec。原生失败不自动重试/放宽限制；发现unknown委托叶子拒绝新任务，交独立运维恢复授权处理。[内核cgroup2文档](https://www.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html)规定整树kill与memory/pids语义；[bubblewrap选项](https://github.com/containers/bubblewrap/blob/v0.9.0/bwrap.xml)解释namespace/cap-drop边界，具体生效仍以本轮真实断言为证。
