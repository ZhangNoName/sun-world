# Worker V2 服务与固定 SDK 执行端

日期：2026-11-16；基点530cbd6。已实现私有HTTPS控制器、持久启动/取消记录、分受众API客户端、真实固定SDK执行和POSIX进程组清理。当前仍为本地验证，未挂载公共应用、未部署Worker，旧SQLite/macOS v1入口保留。配套[API派发说明](agent-run-dispatch.md)。

## 服务与持久记录

ExecutionService显式配置bundle/model、runner、独立私有journal目录和容量，ready成功后才能监听。默认活跃并发1，最多128；所有保留记录（含终态）也最多128，满时拒绝新身份，不自动逐出tombstone。目录0700、文件0600、禁止symlink/错误owner，单目录O_EXCL控制器锁防止两个实例同时启动。

start先验证V2 schema、固定配置与45秒以内的未过期deadline，原子写文件并fsync后才调用runner。记录只含绑定、请求摘要、状态/截止时间与回收标志，不存问题、正文或凭据。相同绑定与启动摘要返回原观察；不同参数或execution冲突拒绝。Worker completed仅为进程观察，仍不能代替API答案事务。

cancel即使尚未见过start也先持久保存cancelled tombstone，再确认；迟到启动不能创建进程。已启动取消先记录回收中，再stop；停止或存储失败不伪装清理成功、不释放未确认占用。inflight start/stop均占容量，close阻新启动并drain；启动确认丢失时API只查询原execution，见前述派发说明。

正常close释放控制器锁。崩溃遗留锁不靠PID检测自动抢占；需宿主先核对并强制回收旧cgroup/进程，再离线处理。独占打开后发现running记录标为interrupted并保留needs_reap/容量，不能假装孤儿已退出。当前未实现自动崩溃恢复、在线留存清理或无限持续准入；生产前须完成保留策略与回收演练。

createExecutionServer只返回node:https.Server，不读取env/证书、不自动listen。强制client certificate验证、显式同步peer证书策略、独立服务凭据和V2头，拒绝重复身份头、压缩体、重复JSON key、非有限数、非法UTF-8与schema未知字段。请求16KiB、响应8KiB，握手/HTTP响应有界；错误只给固定码。2秒HTTP时限不会回滚已进入service的持久启动操作，确认丢失时API只查询/取消原execution；尚在收包/认证且未调用service的超时请求不能新受理。service内部start/control各有128个在途硬界，避免慢fsync与超时重连无界积累；执行自身仍受绝对deadline约束。控制路径与API client兼容：start、无body的GET原execution、cancel。

正式组合新增同身份保护的无body `GET /internal/v2/readyz`，生成WorkerReadiness schema约束protocol/bundle/model/available。journal故障、恢复受阻、保留记录满或关闭时不可受理；仅活跃忙碌仍可ready，由Redis全局槽返回限额，不把并发忙碌误作版本/运行环境不可用。API探测严格匹配bundle/model，不重试；不纳入普通站点readyz。组合和本地实测边界见[准入说明](agent-run-admission.md)。

## SDK与网关

GatewayClient使用Node HTTPS固定origin、强制证书/hostname校验，不继承环境代理、不重定向或自动重试。工具/model/result分别使用本次run的三受众凭据，服务身份在外层头。核对完整工具响应digest和call/source绑定后才发receipt；收到delivered才向SDK暴露source_id。模型不能把数字文章ID当引用UUID。

产品Skill新增blog-qa@2，保留v1内容与导出顺序供原本地SDK入口使用。两版本均由模块声明、hash和显式生成器校验，新bundle hash须与Worker一致。V2选定自己的Skill，不把开发协作Skill、用户Skill、shell、MCP或文件工具装入profile。

固定0.2.2-rc.1 SDK的prompt返回durable inbox messageId。root-result将此回执与根session内的user/message、单个turn/start/end及最终助手消息核对；事件序号递增、截断/重复/外来turn/错误session/未知终态拒绝。最终只接受answer与UUID sourceIds，登记根请求后调用API结果网关。SDK调用使用纯prompt，斜杠文本不走命令路由。

sdk-execution是受信任父适配进程：只有它持有网关服务身份与TLS材料；dsh子进程仅持短时loopback桥token，桥将模型和两项工具分别转发到对应受众。模型请求4次、工具4次、完整工具响应累计64KiB；API仍独立执行持久预算。心跳失败停止SDK，成功提交后停止心跳，避免终态后的心跳拒绝影响本地正常退出。

## 进程与组合根

ProcessRunner仅接收宿主提供的可信launchSpec，不从run构造命令、argv、环境或路径。它创建私有home/tmp/cwd，以最小环境、独立进程组启动；stdin传临时运行配置，stdout/stderr不保存转录或凭据。总deadline触发停止，TERM后仍存活则KILL；父进程退出但子进程仍在时同样回收整个owned group。

done只在owned group已不存在并删除workspace后结算。kill/rm无法确认时done不伪装完成，stop拒绝且可重试，服务继续保留容量。此POSIX管理不等于Linux PID/memory/network隔离；生产仍必须提供经验证的隔离launcher，不能以profile中没有shell工具替代OS限制。

createSdkWorker显式组合固定运行资源、ProcessRunner、ExecutionService与mTLS factory，必须注入launchSpec/peer policy/两方向身份/TLS。返回server/service/close，仍不自动监听。尚无生产CLI、镜像、服务签发或公网入口。

## 复跑与证据

```bash
corepack pnpm test:agent-worker
node scripts/prepare-agent-worker.mjs --output /private/tmp/new-sun-world-worker-runtime --offline
node apps/agent-worker/tests/integration/sdk-run.mjs /private/tmp/new-sun-world-worker-runtime
```

prepare命令只接受全新绝对目录，复制显式Worker源、生成契约与产品Skill，复用现有固定SDK包清单/锁文件；offline/frozen-lockfile/ignore-scripts/ignore-workspace，不运行服务、不读取业务配置。当前本机安装592个缓存包、下载0；运行期不安装依赖。完整SDK测试显式执行且要求macOS sandbox-exec，不混入普通CI协议单测。

实际集成已通过：mTLS Worker HTTP start重复请求只执行一次，固定SDK实际登记两工具，3次合成Messages依次搜索/读取/回答，经UUID摘要/receipt及根messageId/turn结果链返回；cancel先于start时迟到启动拒绝；另让第二份真实SDK停在模型响应等待中，通过mTLS取消并确认进程组/home回收。核对journal无问题/凭据明文，完成后owned group/home均清理。mTLS与文章/模型均为自有fixture，未使用真实模型、用户数据或业务数据库。

协议单测覆盖严格JSON与后端生成schema、Python独立digest向量、TLS信任/主机名/重定向/大小、交付前拒绝来源、根请求隔离、实际TERM-ignore/KILL及父进程退出后残留子进程。服务单测另覆盖持久tombstone、重启/冲突/容量/停止失败，HTTPS使用自有临时证书。根check和GitHub common quality已加入Worker协议测试；协议门禁通过不意味着已验证整个root check。

真实Redis准入/API组合及固定SDK+MySQL/Redis/MongoDB整栈已在隔离环境验证，详见[准入说明](agent-run-admission.md)与[整栈实证](agent-sdk-stack-validation.md)。真实模型四题已增加显式验证模式（见[模型预算与验证](agent-model-validation.md)），人工语义验收仍待完成；数据库/服务进程自动崩溃恢复、持久记录留存及离线回收、Linux资源/地址/PID隔离与生产TLS签发轮换仍待完成。现有素材format/CSS预算失败仍单独保留，不据本轮成功开放生产内测。

固定profile现显式关闭SDK thinking/reasoningEffort并限制maxTokens1024；供应商内部推理不因此视为关闭。blog-qa@2补充连续子串查询、单辨识词和四工具内优先读取的指导，catalog bundle随内容hash更新。新Worker资源须重新offline打包，不能复用旧bundle。v1正文与导出首位保留，模型预占仍由API独立执行。
