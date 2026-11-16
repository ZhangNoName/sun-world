# Linux 正式 API 与三库合成组合

2026-11-17，基点d73f3ac。上一轮仅固定网关+原SDK组件，本轮接同一Linux guest内的正式应用组合根、public/private routes、账户会话、MySQL/Redis/MongoDB与真实固定SDK。沿用原六个合成场景，不把Mac应用+Linux Worker拼接冒认为全Linux，也不以直接调用gateway或mock DB取代正式接口。供应商仍为受控合成响应，真实provider及生产准入单独待验收；官方key不入guest。

## 环境与来源

新显式stack profile才打包Linux arm64的Python及固定依赖、MySQL8.4、Redis、MongoDB8.0与所需动态库。优先保持既有实际版本（MySQL8.4.13/MongoDB8.0.38）；不可因下载方便改成SQLite/MariaDB/旧MySQL。资产来自官方固定URL/hash/来源清单；仅内存解析固定归档/白名单，不在宿主展开rootfs或执行Linux程序，无安装脚本、全局安装、业务配置或secret文件。Python依赖按项目锁定版本与wheel hash，只用兼容cp312/aarch64或纯Python wheel，不执行sdist构建。动态source选择必须显式固化，拒symlink parent/secret pattern/未知路径。

可预设2CPU/8GiB测试guest以容纳SDK、Python、三库归档解压及tmpfs数据，最终按实际资产大小有界确定；任务仍512MiB/64、不代表2GiB生产主机容量通过。原默认/containment/gateway profile保持各自资产与资源限制。新profile的准备/启动/整栈总运行期限必须明确，不把观察超时当进程停止；所有宿主子进程和VZ停止仍由原监督器独立确认。无NIC、磁盘或宿主目录分享；所有TCP仅guest控制器回环，任务仍只许固定UDS网关。

## 六场景与所有权

复用维护的sdk_stack：真实数据库/正式API/mTLS成功与刷新恢复、公开取消、实际TLS断流、Redis会话撤销、提交前撤文、Worker SIGKILL。Linux显式模式不得无条件替换Mac sandbox；Worker输入采用独立Linux fixture协议并由可信CLI选择，不从用户run/question选择隔离器/目标/cgroup。

Python父在每fixture启动前创建新的独占cgroup root、核inode/owner/0700并登记整棵子树的当次所有权，再交给Node使用原createLinuxLaunchSpec。不自动收养旧cgroup root/未知PID/旧锁；当次父仍活着的自有委派树与生产重启恢复不同。Node沿原同步注册/relay/stop/release，bootstrap在可信外层只记录实际host PID并fsync，再执行原executeLinuxLaunch，不能把PID命名空间内的1当宿主PGID。正常结束核所有cgroup、监听/连接/工作目录与原组消失；内核计数只输出固定有界schema，不复制任务任意JSON。

Worker崩溃情景必须在实际SDK已到模型等待点后冻结整任务cgroup，而非仅停原PG漏掉setsid后代；随后SIGKILL自有Worker Popen句柄。API先中断且保留未确认并发槽。父先对仍由自己持有的当次cgroup root停止整树、确认empty，再核PGID不存在、清理叶/根与自己的私有目录；不得因PID记录存在就无条件杀任意旧PGID。崩溃没有正常Worker ACK，不伪造ACK/并发释放。若任何存活/身份/关闭未知，保留root/证据并失败；VM销毁是最后外边界，不替代fixture回收证明。启动前任意相位崩溃、宿主SIGKILL/断电和生产持久离线回收仍独立待验收。

## 角色与验证

root负责官方资产/有界打包、Python父接线/VM profile/正式六场景及证据、博客和中文本地提交；coding负责Node fixture Linux适配及当次cgroup stdlib helper与窄测试；判官只读复审。任何协议差异先更新本文并广播，后续Claude Code/claude-ds先读本文件。禁止读/打印密钥、改现有3030/8032/3033或原80dirty、推送/部署/发布。

先本地配置拒绝/所有权单fault与Mac兼容，再原生Linux确认资产加载/三库身份，再六完整场景与Linux父整树回收。原49/九隔离/五网关及组件SDK报告保持范围，不用新的布尔值代替实际场景。新增linux_formal_stack_synthetic_verified只证明合成整栈；未做真实供应商与剩余运维验收前full per-run/P1/A–D仍false。

本轮按sun-world-blog→design更新博客04，主线解释Linux执行边界如何与历史/权限事务连接，后端分类与既有三个标签；配图按信息用途评估，1280/390实际渲染并记录未发布。

### Node/父内核观察接口

可信CLI严格为--linux-stack且process.platform=linux，独立配置sun-world-linux-sdk-stack-fixture/1，以cgroup_root替代原Mac read_paths。原ready/stopped/stdin-stop形状保持。Node将内核观察放私有controller根fixture-kernel-observations.json，固定version sun-world-linux-sdk-stack-kernel/1、executions（最多128个固定资源数字+既有relay固定计数对象）、cgroups_empty与relays_closed两bool，整个文件最多128KiB。完整写+file/dir fsync+原子rename，不是任务可写的proof；stop最终确认无cgroup子目录/relay根后才置两true。父仍需exact schema/类型/范围检查，拒未知值、路径或正文，不能把Node自报替代内核与Popen独立验证。Worker crash可尚未写release记录，父从自己当次owned root读取内核快照，不伪Node ACK或正常stopped frame。

### 本次资产测量与归档上限

实际官方MySQL8.4.13 aarch64归档823781920字节、mysqld449185696字节、完整归档常规文件1585493381字节；只选mysqld、初始化share和lib/private，不选mysqld-debug/其他CLI。Mongo8.0.38的mongod211922184字节；Python采用与当前测试相同的CPython3.12.13/20260320 stripped ARM64 GNU发行包，GitHub发行API提供SHA256；36个Linux兼容wheel按项目Poetry锁版本/hash下载，无sdist/脚本。静态ELF检查只读内存，不在宿主执行程序。

因此仅stack profile允许选中单文件512MiB、归档选中输出累计2GiB；解析官方完整MySQL归档时，未选内容也逐流有界读取，最多8GiB解压/131072 headers/PAX单项64KiB，不能把大未选文件读进内存。其余profile仍保原256MiB单文件/各自总量。guest初始root tmpfs固定4GiB、测试/tmp固定2GiB、RAM8GiB（仍2CPU），prepare监督300秒/VM300秒；任务512MiB/64保持，不声称生产容量通过。

MySQL首次下载到544210944字节时达到明确300秒传输期限并失败，完整已收部分保留；确认进程终止后只接受官方206精确Content-Range续传，最终完整官方MD5匹配并记录SHA256 6531bb50f64c986a2abdab6b647cbd553e8740b3e5d3867f5415e33568879fc9。官方提供MD5/asc，无可用GPG校验工具，本轮不声称PGP签名验真，来源信任为固定官方HTTPS与缓存SHA；没有把MD5当独立签名。Ubuntu元数据按InRelease中的SHA256核字节但未独立验GPG；Packages.xz实为主stream加32字节空XZ stream，使用有界多stream元数据读取，与受限payload单frame规则分开。

首个整栈归档在MySQL目录重复处失败，未启动VM；完整header审计确认9项均为相同mode/uid/gid的零字节目录重复，稀疏文件0。仅该固定MySQL recipe允许完全相同目录header重复，文件重复/目录元数据冲突/稀疏仍拒绝，原默认profile不改。第二次归档成功：67资产、261源码、解析2944555460字节、实际选中1799980004字节、initrd774605035字节。Python14个原本空模块只在显式stack源读取时允许0字节，以保原包布局；默认来源仍拒绝空文件。

libaio.so.1按官方Jammy ARM64原包0.3.112-13build1提供（不把noble的t64 SONAME改名伪兼容）；官方索引SHA已核，原站该包SSL握手连续超时，改为固定清华镜像的同版本同7018字节包，SHA256 1bcb0d9c08aa35298741b1c68904844e9b71ebf64f15b3e05e6ec6f3fa01d93b与官方索引一致，来源记录在资产contract。不在宿主安装它，Jammy /lib payload在guest归档映射到已合并的/usr/lib，防CPIO通过父symlink写入。Redis使用Ubuntu7.0.15发行包，满足原GETDEL/Lua能力；只复制其实际server ELF，不带启动脚本/全局服务。

### 首轮原生结果与父补偿正对照

首轮原生stack已实际加载Python3.12.13/36锁定wheel与三个正确版本daemon，原49/九隔离/五网关/组件SDK全通过，正式六场景前五通过。第六场景原样保留SDK model-wait→freeze整个cg→SIGKILL Worker，随后已无活进程（had_processes=false、仍有1空叶可核），说明现有bubblewrap die-with-parent在该切点确实先结束了SDK。原测试强求“SDK必留活树”导致失败，不应为测试而关闭生产保护，也不能把空树观察说成父实际杀了活SDK。

因此在同一crash场景另加明确标识的父补偿正对照：当前仍活的Python父用自己持有的Popen新建一个静态等待进程，先登记handle，再放入当前唯一且身份已核的SDK leaf，和真实SDK一起受512MiB/64限制、在freeze前核成员。它由仍活父直接拥有，Worker死亡不会自动结束它；父必须在Worker已wait之后观察其仍活，执行当次自有root的cgroup.kill，wait这个已登记handle确认为SIGKILL，确认树empty并移除叶/根。不能从外部PID/路径创建或接管对照，不能把直接Popen.kill的兜底当作cgroup.kill成功。额外进程只是故障正对照，不是模型/SDK替身或跨隔离逃逸；真实SDK根结果/会话/来源和六场景检查全部保持。

输出单独parent_recovery_positive_control证据；SDK可能被原保护先结束与父杀剩余正对照是两项观察。未知Worker/CG身份仍尽力回收自己Popen但保root并失败。这个切点不覆盖生产启动前任意相位、父自身死亡/旧PID恢复或主机断电。

### 最终本地 checkpoint

第三次原生整栈完成：正式六场景/六SDK/十合成模型请求/四工具调用，原49协议零skip+九隔离+五网关+组件SDK通过；任务512MiB/64、正式peak111472640、OOM/pids超限0。Python3.12.13/36wheel及MySQL8.4.13、Redis7.0.15、Mongo8.0.38均真实运行；三库/自有group/root回收由外层独立核。最终67资产/261源，parsed2944563460、selected1799988004、initrd774605928；8GiB测试guest不代表2GiB生产容量。

复审P2：已登记workspace被移走，原path缺失不能表示UDS关闭；先lstat，已知identity缺失拒绝，断链拒绝，真实rename+仍活listener回归通过。native2是修前历史，native3重建修后源；判官严格V4/261SHA/不变67资产合同复验通过，无剩余确认阻断。API859/32.978秒、Worker164/9.414秒，Mac原六场景通过。未重跑已终态历史句柄。

固定失败投影、源/资产摘要、归档来源与限制、维护命令见[实证](../evaluations/agent-linux-stack-2026-11-17/README.md)。fullperrun/P1/A–D仍未完成，真实供应商跨Linux与生产/人工/模型策略/目标库及TLS运维待验；当次仍活父补偿不等于无人值守离线恢复。博客04同题、后端及原三标签、保两透明图，1280/390预览通过、未发布。保留现有服务/原80dirty，只本地中文提交，不推送部署。后续Claude Code/claude-ds先读本文及branch checkpoint。
