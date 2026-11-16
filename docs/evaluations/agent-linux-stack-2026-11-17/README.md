# Linux 正式 API、三库与真实 SDK：合成整栈验证

2026-11-17，基点d73f3ac。本轮把正式应用组合根、公开/私有路由、账户会话、MySQL、Redis、MongoDB、mTLS Worker 和固定SDK放进同一个原生Linux guest。复用原六个应用场景；没有用Mac API搭配Linux Worker，也没有把网关直连或mock数据库算作正式API组合。模型响应与文章数据为合成输入，官方API key未入guest，本轮真实供应商请求0。

## 最终实际结果

[最终报告](native-validation.json)来自第三次Apple VZ Linux arm64整栈运行，2CPU/8GiB测试内存，Linux6.8、Node24.17.0。Python3.12.13和36个锁定wheel实际加载，MySQL8.4.13、Redis7.0.15、MongoDB8.0.38实际启动并通过原应用接口。

| 范围 | 实际验证 |
| --- | --- |
| 原有Linux套件 | 原49协议零skip、九隔离情景、五网关情景、原组件SDK成功与取消均通过 |
| 正式六场景 | 成功后刷新恢复、公开取消、实际TLS断流、Redis会话撤销、提交前撤文、Worker SIGKILL后的中断与未知ACK保额 |
| 实际SDK与工具 | 固定0.2.2-rc.1，六次执行、十次合成模型请求、四次正式博客工具调用；五次正常Worker确认 |
| 每任务限额 | 512MiB、64项进程/线程、swap0；正式六场景最大memory.peak111472640字节，OOM和pids超限事件均0 |
| 崩溃回收 | 冻结同一任务树后杀Worker；原SDK先由父死亡保护结束；父新建的显式正对照仍活，再由自有树cgroup.kill及Popen.wait确认SIGKILL |
| 清理 | 转发监听/连接关闭，工作目录与cgroup根移除，三库Popen终止/数据根删除；host独立started/stopped/completed，自有宿主组及私有运行根确认回收 |
| 宿主回归 | API859项/32.978秒、Worker164项/9.414秒；原Mac正式六场景完整通过 |
| 独立复审 | adapter七项真实socket/进程/独立清理回归通过；最终严格V4重放、261源码SHA、67资产/36锁定wheel及来源合同核对通过 |

本profile的8GiB仅供固定归档、tmpfs及完整测试组合，不代表2GiB生产主机容量验收。guest无NIC、宿主盘或共享目录，数据库/正式API只在guest控制器回环监听；任务继续使用原隔离启动器及固定UDS通道，不获得任意外网。

`linux_formal_stack_synthetic_verified=true`仅标识上述组合；完整`linux_per_run_isolation_verified=false`保持。真实供应商跨Linux整条通道、人工语义验收、生产模型版本策略、目标库结构/数据/备份恢复、TLS运维及无人值守恢复等仍独立待验收，P1/A–D未整体完成。

## 父补偿与所有权

Python父先创建并登记当次私有cgroup根的inode/owner/0700，再让Node使用原createLinuxLaunchSpec。可信外层bootstrap只写自己的实际host PID，完整写入/fsync后执行原启动器，不能将PID namespace内的1当宿主PGID。正常Node结束先记录固定有界内核观察，再按原stop/release确认cgroup和relay均关闭；父独立检查自有树、原进程组及私有socket。

崩溃只用当次仍持有的Worker Popen发SIGKILL并wait。PID记录仅供检查原组是否消失，不据旧PID重新发杀信号；父操作的整树来自先前创建并仍核身份的自有cgroup。PID记录或文件诊断失败仍独立尝试已登记树的回收；任何结果未知均保根并失败，不把VM销毁替代fixture清理证明。

**SDK自动停止与父终止仍活的正对照是分别观测的两件事。** 正对照由仍活的父直接创建静态等待Popen，立即登记、核唯一SDK叶与成员后再冻结。Worker退出后先确认对照仍活，cgroup.kill成功且该句柄wait确认为SIGKILL才算补偿通过；直接句柄终止的兜底绝不计为cgroup正对照。它不是SDK替身，也没有关闭真实SDK的父死亡保护。未收到Worker确认的并发槽仍保留，不能用物理清理补写业务ACK。

已登记workspace消失同样不能视作监听器关闭。复审用自有活UDS重现：移走目录后旧路径不存在，移动后的listener仍可连接。现对已知inode的路径缺失明确拒绝，断链也拒绝；真实rename回归通过。最终native3重建绑定修后源码，native2只作为历史结果。

## 资产来源与有界打包

新增[stack资产合同](../../../tools/agent-linux-vm/stack-assets.json)、[Python锁定wheel](../../../tools/agent-linux-vm/stack-python.json)、[显式源码白名单](../../../tools/agent-linux-vm/stack-sources.json)，链接原gateway资产合同。67资产含59个新增，261源码含14个真实空Python模块；只在显式stack profile允许这些空模块，默认profile仍拒空源。全部资产实际SHA/size独立复核；36wheel逐一匹配Poetry版本、文件名和hash，无sdist构建、安装脚本或宿主安装。

- MySQL使用官方固定8.4.13 aarch64归档823781920字节，SHA256 `6531bb50f64c986a2abdab6b647cbd553e8740b3e5d3867f5415e33568879fc9`，官方MD5亦匹配。首次300秒下载失败后保部分，只接受精确官方206范围续传并核完整字节。没有可用GPG工具，本轮不声称独立PGP验签，不将MD5当签名。
- CPython为Astral固定20260320发行的3.12.13 stripped ARM64 GNU包，SHA来自发行API；Mongo为官方8.0.38 ubuntu2404 ARM64包并核官方SHA；版本优先与原实测保持一致。
- Redis及动态库用Ubuntu固定ARM64包/索引SHA链。InRelease/Packages字节摘要已核，未独立GPG验签。MySQL需要旧libaio.so.1，使用官方Jammy同版本原包；官方包站SSL持续超时后，固定清华镜像7018字节与官方索引SHA匹配，无SONAME改名。来源与镜像明确记录在合同。

仅stack允许单文件512MiB、选中输出累计2GiB、全归档解压解析8GiB；未选内容也流式计量，不将整个MySQL payload读进内存。严格限制路径、符号链接、稀疏、重复文件和metadata。MySQL官方tar有九项完全相同的零字节目录header重复，仅该recipe允许；其他profile及不同目录属性/文件重复仍拒绝。Ubuntu元数据的多stream XZ读取与payload受限单frame规则分开。

最终解析2944563460字节、选中1799988004字节、49425个guest归档条目；派生initrd774605928字节，SHA256 `5d7655c40b013b010d00e8145aeb63f055c76590a03a2c89ac20a74b1209ba7c`。Linux程序仅在guest执行，不在宿主展开rootfs或运行其daemon。

## 开发失败、审查与保存

[开发尝试](development-attempts.json)保留失败及历史成功的安全投影和私有raw摘要。首个归档因上述相同目录header被拒而失败，未开VM；第二个预构建成功但不是最终源码。native1前五正式场景通过，最后因过强的“SDK必留活树”断言失败；native2加入明确父正对照后六场景通过；native3补已登记目录缺失guard后再次完整通过。没有把中间成功或故障注入写成最终通过。

[验证清单](validation-manifest.json)绑定287份源码的working/index SHA与仅暂存24个本轮源码文件的树，含261个guest源、12个SDK归档源及四个原生ELF。判官独立拆分HOST_STDERR后重放严格V4，最终控制/console SHA和所有返回字段逐项相等；native2到3仅预期源修复、派生归档与运行时peak变化。已核Python AST14、shell语法2、定向Prettier及diff。根format仅原有素材manifest失败，未修改该dirty；未跑Web全门禁，不称root/Web全绿。

博客04按sun-world-blog→design同题更新，分类后端，标签架构笔记/Agent/DeepSeek Harness。保留两张透明关系图，回收区别用正文说明，不额外堆图；1280/390实渲7稳定ID、31处重点、无首行缩进/横向溢出，两图360/~342正常并看图复核。预览复用原dirty renderer/CSS，未纳入本提交；草稿未发布。

维护命令（report必须新文件名，已有则拒覆盖）：

```bash
apps/api/.venv/bin/python scripts/test-agent-linux-vm.py \
  --cache "$PWD/.tmp/linux-stack/assets" \
  --report "$PWD/.tmp/linux-stack/native-3.json" --stack
```

本轮只作中文本地提交，不推送、部署或发布；原80项无关dirty及主handoff原210加/1删保留。现有3030/8032/3033、本地模型profile和业务配置未改。下一步可在保持此固定通道及密钥边界下验证真实供应商跨Linux组合，再逐项验收剩余生产条件。
