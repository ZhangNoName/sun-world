# Linux 固定网关与真实 SDK：本地组件验证

2026-11-17，基点495a365。本轮实现专用 Unix socket 到固定 IP/端口的透明转发，任务保持独立 netns，GatewayClient 维持固定 HTTPS origin 的 Host/SNI/证书身份及双向 TLS。先收完整 cgroup，再关闭 relay 监听与连接，确认后才释放资源。SDK 固定0.2.2-rc.1，供应商 API key 不进入 guest。

## 实际结果

[原生报告](native-validation.json)来自第六次自有 Apple VZ Linux arm64、Linux6.8.0-147、Node24.17.0、2 CPU/4GiB。原49协议零skip、原九隔离、五网关场景与真实 SDK 均通过。host 的独立 stderr 确认 started/stopped/completed，自有进程组及私有运行根确认回收。

| 证据 | 本轮实际范围 |
| --- | --- |
| 原九隔离 | 每任务512MiB/64task、OOMkill4、pids事件1；跨任务文件/只读运行依赖/权限/整树取消与deadline/未知资源拒接 |
| 固定网关五场景 | 合法mTLS、错误name/缺客户端证书拒绝；IPv4/IPv6/根回环/UDP DNS/另一run socket拒绝；自身回环可用；活动响应随取消关闭 |
| 原执行入口 SDK | 三次合成模型响应、两工具/UUID来源回执/根结果；重复启动一次、先取消后启动拒绝、活动SDK取消；目录删除EACCES保槽/503后重试恢复 |
| SDK资源 | 两执行最大memory.peak112623616字节，均OOM0/pids超限0；含一次重试的三次观察均active connections0/closed |
| 宿主回归 | API828/31.578秒，Worker151/9.221秒，全部通过；fresh macOS SDK同源完整成功/取消/回收验证通过 |
| 复审 | relay/UDS/launcher27、SDK archive6、codec3、collector10及最终47源/归档12源/4ELF摘要独立核对通过 |

原九隔离 fixture 的 gateway_allow_path_verified/sdk_stack_verified=false 是其自身无转发器场景的范围；新v3报告另有严格的 gateway/sdk独立证明。完整 linux_per_run_isolation_verified 仍false：正式应用 API、MySQL/Redis/MongoDB 与真实供应商在Linux中的组合尚未验收。现有 macOS/正式API/三库/官方四题证据不冒认为本轮Linux实证。人工语义、生产模型版本策略、目标库与备份、TLS运维等门槛保持。

## 资源与依赖来源

新profile显式4GiB，仅用于本测试：固定SDK依赖归档展开515584214字节，加原rootfs与guest tmpfs复制；最终总展开822583539、initrd243907809字节。每任务512MiB/64不变，不能据此放行2GiB生产主机。VM没有NIC、宿主盘或目录分享，临时mTLS身份仅在guest内生成。

基础六资产沿用[原隔离实证](../agent-linux-containment-2026-11-17/README.md)。新增Ubuntu noble-security OpenSSL3.0.13-0ubuntu3.16 arm64 CLI，固定SHA/985334字节，来源与索引链在[gateway-assets.json](../../../tools/agent-linux-vm/gateway-assets.json)；已有libssl/libcrypto由固定base提供。未独立声称发行版GPG验签。依赖只由新私有runtime按原frozen pnpm锁准备，禁安装脚本；缺11项时只从固定公开npm registry显式补齐，不带用户/全局npm认证，代理只能明确无凭据回环HTTP地址。

归档只含固定12源码/契约/Skill/锁文件与新node_modules，不含HOME、profiles、业务数据或任意workspace。实际Linux ELF与portable CLI link均核，最终归档SHA `0eb1a03d8bc2f3dc43c8748d7ffa70d046b3c9cfa908b4e14362fb4255f06323`、141382746字节；12源码与4个ELF由独立review核实际tar成员。归档不是独立签名供应链证明。Node/pnpm仍用仓库24.17.0/10.15.1；不安装宿主daemon、不在宿主执行Linux二进制或展开Linux rootfs。

## 失败与修正

[开发尝试](development-attempts.json)保留前五轮失败的安全投影和raw console摘要，raw日志仅在ignored私有文件。它们都不是最终成功报告：首轮fixture Buffer证书被JSON化，第二轮guest控制器缺localhost映射，第三/四轮SDK根结果未登记，第五轮临时wrapper确认wire22事件严格合法而应用collector仍失败。原49/九隔离均通过，第二轮起五网关均通过，不能补写成SDK早已通过。每轮guest host停止独立确认，原运行根已收尽。

固定SDK公开subscription class的同批五事件在旧collector被异步iterator和tryNext双消费者重排：严格projector拒绝、无root/finish。改为同步filter按wire顺序收集且不入队，单next仅监听失败，保2MiB/4096/原seq与根回执检查；同一确定性调度修后通过。最终native6移除临时诊断wrapper，用原sdk-execution入口成功，macOS同源复验也通过。临时诊断曾补bounded NOFOLLOW/exact schema投影，最终不再装入guest。

其他修正均有实际反例：relay上传half-close原响应0/262144，现分方向排空；IPv6 expanded/mapped-zero wildcard拒绝；ELF首核与归档二次读漂移、删除或变symlink拒绝；python-zstandard0.25 C后端窗口参数实际按bytes，未知大小路径还会忽略allow_extra_data，现先有界解压再对同一首frame核EOF/unused_data。未知大小OpenSSL只允许单8MiB窗口/输出，原bubblewrap已知2MiB限制保留。

Linux依赖第一次准备受ignore-workspace影响仍是Mac架构，第二次offline退出0却只有optional包空目录，两次均未计作Linux SDK通过；第三次实际验证原生包/ELF才封装。macOS首次将prepared runtime放HOME范围内，被原sandbox正常拒绝（0model/0backend）；改新owned /private/tmp目录后通过，未扩大HOME读取权限。

## 复核与边界

[验证清单](validation-manifest.json)记录65份源码的working/index SHA与暂存源码树，并绑定47份guest源、12份SDK源及四个实际ELF；文档后续暂存不改变这份源码树的含义。已核 Python AST4、shell语法、18个JS/JSON定向Prettier、root-script、scoped diff。根format依然只因原有素材manifest失败，不宣称root/Web全绿。本轮未改变现有站点业务模型目录、页面入口、数据库或生产配置，未推送/部署/发布。

博客04按sun-world-blog→design同题更新固定通道/TLS/业务授权及通知顺序，后端分类、架构笔记/Agent/DeepSeek Harness标签；保留两张透明关系图，新增线性通道边界用正文解释，不另加图。1280/390实际页面7稳定ID/30处重点、无缩进/横向溢出、两图360/~342正常，未发布。预览复用原dirty renderer/CSS，这些前端改动未纳入本轮提交。

维护命令：

```bash
apps/api/.venv/bin/python scripts/test-agent-linux-vm.py \
  --cache "$PWD/.tmp/linux-vm/assets" \
  --report "$PWD/.tmp/linux-gateway/native-6.json" --gateway
```

显式命令要求新report文件名，已存在则拒绝覆盖。SDK依赖另用维护的prepare-agent-worker及prepare-agent-linux-sdk脚本准备，cache资产须按固定contract提供；默认API/Worker门禁不启动VM。下一步先接正式API与一次性三库的Linux合成组合，再核真实供应商通道和剩余生产门槛。
