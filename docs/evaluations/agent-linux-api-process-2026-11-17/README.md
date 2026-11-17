# Linux 独立 API 进程故障三切点

2026-11-17，基点54b3490。[原生V6报告](native-validation.json)通过：同一个一次性Linux中保留原49零skip协议、九隔离、五网关、组件SDK及正式三库六场景，再执行三个独立API进程SIGKILL/restart切点。不是把Mac API与Linux Worker拼接，也不是仅重建应用对象。本轮供应商请求0，不改变此前Linux官方四题未通过结论；生产/P1整体仍未放行。

## 实际环境与来源

维护命令：`apps/api/.venv/bin/python scripts/test-agent-linux-vm.py --cache <绝对私有资产缓存> --report <新绝对报告路径> --api-restart`。它与official/stack/gateway/containment其他显式模式互斥，内部依然包含全部stack前置场景。API三切点的可信guest CLI为`--api-process-recovery --linux-stack --report`，禁止真实供应商/official/interrupt组合；Mac默认不能静默切到Linux，反向同样拒绝。

guest为Linux6.8.0-147 arm64、2CPU/8GiB、Node24.17.0/Python3.12.13、36锁定wheel及MySQL8.4.13/Redis7.0.15/MongoDB8.0.38。无NIC/磁盘/宿主分享，无第二特权串口或供应商key。67份资产与旧official native4的完整size/hash/kind metadata一致，不下载新资产。仅增三份已维护API进程源，payload从267变270；这只证明资产复用，不是官方模型通过。

本次解析2944657482字节、选中1800082026字节，initrd774637659字节。来源在`guest_build.payload_sha256`，不是`sources`；270项均匹配冻结的306源选择。源码暂存树为`31ad035f2d3791bb9d6d225b85230a683a238c2a`，摘要见[清单](validation-manifest.json)。新模式guest限420秒、外层450秒，准备仍300秒；旧模式时限不改。8GiB为测试guest，不是2GiB生产容量证明。

## 三切点及物理观察

可信Python父持有三库、独立Node Worker/stdin和TLS监听socket。API子进程运行原组合根、public/private routes、真实JWT/Redis重验和双向TLS；SIGKILL仅针对父持有的活API句柄并wait。重启不换fd/origin/证书/服务凭据/JWTsecret/Redis会话/库/Worker；不造父shadow应用。令牌由原AuthManager签发并校验，未新增HTTP登录路由覆盖。私有管道捕获的旧运行凭据只留内存，不进报告。

| 切点 | 实际结果 | SDK / 模型 / 工具 | 任务内存峰值 |
| --- | --- | --- | --- |
| 原accept已提交、尚未派发 | 原45秒deadline后45481ms failed，同key409返回原run，Worker原句柄仍活 | 0 / 0 / 0 | 0 |
| 原SDK合成模型等待 | 同token/service与DB哈希核对，原row仍running、租约余9592ms时同mTLS严格403 ACTIVE_SESSION_REQUIRED；10523ms后自然interrupted | 1 / 1 / 0 | 81547264字节 |
| 最终事务完成且Worker静止 | 新API GET原答案/来源完全相同，两条消息/单run不重写、不派发或扣额 | 1 / 3 / 2 | 114552832字节 |

三个切点均实际SIGKILL/wait、新API ready、原Worker独立存活；Worker真实ACK为3，start_count为0/1/1。原run累计与agent_model_calls整行、ai_messages和agent_sources整行前后一致。调用中仍为reserved、1024输出token/65536响应字节预占、usage及输入计数null，未完成旧Redis槽不提前释放，分钟次数保留1；已完成槽继续已释放。预算模式明确synthetic-reservation-only，不能把这一结果当成新的官方输入计数验收。

accepted的零执行是单独验证的正分支：真实Worker finalized kernel文件存在且executions空，原PID记录空、无父代偿/剩余叶，SQL模型/工具0，peak0，root/CG关闭均确认。不能因缺文件或遗漏执行记录就把空列表当成功。另两切点各一份原内核sample，原512MiB/64限制、gateway连接/转发字节及完整Kernel schema约束保持。

每case清理经过原Worker ACK、cgroup空/移除、relay监听与连接关闭、PGID不存在、私有fixture root移除；Linux包装继续调用API失败屏障，即使失败也独立尝试已owned CG停止/finish，不能吞api_close_failed。本次没有需要父代偿的新增API切点。原六场景的Worker SIGKILL及父cgroup活进程正对照仍保留，正式六场景最大peak127148032字节。

## 独立验证与兼容

成功时guest只发有界固定schema的API报告；数据库/测试组确认关闭后，原外层CLI再发独立资源frame。宿主检查完整类型/适用null/三cut次序、0+1+1执行、0+1+3模型、0+0+2工具、真实等待/有效剩余租约和内核观察；缺失、重复、未知或类型不符拒绝。旧模式遇到新marker也拒绝，不只信passed布尔。

保存console重新按当前严格V6 verifier复验，所有字段及console/control SHA相等；VZ独立host结果为started/stopped/completed，owned组gone与临时run root删除均true。VM销毁没有替代fixture逐项清理。见[清理与服务状态](cleanup-health.json)：owned VM root剩0；Mac准备runtime按原dev/ino、全部句柄终态和无打开文件核验后删除。旧两个失败证据根及旧live runtime未修改、未收养PID或处理旧锁。

- `corepack pnpm check:api`：935项/35.978秒通过。
- `corepack pnpm test:agent-worker`：164项/9.15541秒通过。
- 新Process/原Linux adapter窄测26项、宿主proof/CLI7、原Mac CLI4、archive5、AST及guest shell检查通过，均与原生验证范围分开。
- 新源下[Mac相同三切点](mac-validation.json)75.671秒通过、306源前后稳定；Worker count0/1/1，旧回调余8711ms被拒，Linux观察null、linux_verifiedfalse，没有扩大Mac结果范围。
- 判官独立离线27项及最终306源/270payload/67资产、严格console/V6、三cut与Mac报告复核通过，无确认阻断。离线synthetic frame测试不是原生证据。

生产源码、模型/Clash配置及现有3030/8032/3033未改；三个服务均200。原80dirty及主handoff原修改保留，仅中文本地保存，不推送、部署或发布。日志、完整本机调用路径与缓存位置只存ignored `.tmp/linux-api-process/`。根format检查仍单独记录原素材manifest问题，不能称仓库/Web全绿。

## 未完成范围与文章

Linux官方四题、人工语义、生产模型版本策略、宿主死亡/断电、多副本、未知孤儿/陈旧锁生产恢复、目标库迁移/备份及生产TLS仍独立待，full-per-run/P1/A–D未整体完成。此次没有重复官方模型采样或重新部署本地模型。

按sun-world-blog→design同题更新博客04，后端分类及架构笔记/Agent/DeepSeek Harness标签不变，补Linux实测与零执行不能缺证的边界。原两透明关系图足以解释机制，无新增图；1280/390实渲检查7稳定ID、无首行缩进/溢出、图片360/约342px，未发布。预览`http://127.0.0.1:3033/.tmp/c3-draft-7jaqfvk4/index.html`使用现有dirty renderer/CSS，未把它们纳入提交。
