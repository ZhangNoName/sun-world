# Linux 官方 API 通道：实现与未通过的整栈验收

2026-11-17，基点83d5d53，DNS复用先保存为594a3bf。**本轮没有通过同一Linux环境的官方四题完整验收。** 已实现并实际接通特权控制通道，得到真实官方计数/生成响应；四轮独立运行都保留失败，未生成V5成功报告，不把跨运行的成功样本拼成4/4。

## 实际结果与剩余问题

| 独立运行 | count/gen尝试 | 成功count/gen | 完成题数 | 失败观察 |
| --- | --- | --- | --- | --- |
| native1 | 5/3 | 3/1 | 0/4 | 4个fixed failed，旧版本没有足够阶段诊断，初因未定 |
| native2 | 9/7 | 7/5 | 0/4 | 3次连接准备失败、1次计数请求超时，无绑定/结果适配/usage失败 |
| native3，DNS复用后 | 12/12 | 12/11 | 3/4 | 注入题第二次生成在request/227超时 |
| native4，同源最终复验 | 11/9 | 9/9 | 2/4 | 有答案/注入题各一次count_request/227超时 |

前三次是不同实现快照，第四次是第三次冻结源码的新独立完整验收；全部使用新run/schema/report，无代理内部自动生成重试，没有放宽原预算或期限。第四次后已按[本轮协议](../../development/agent-linux-official.md)停止付费复跑。随后只作一次不生成的维护目录检查与Clash只读状态观察；该检查也失败，不改变上述模型结果。

[开发尝试](development-attempts.json)保留broker安全统计、逐题预算与清理及私有原日志摘要。[native2](native-failure-2.json)、[native3](native-failure-3.json)、[native4](native-failure-4.json)均是明确`passed=false`的失败报告；阶段为verify_console，因为guest整体退出1。native1旧监督器没有保存完整native/build报告，只有原console/安全投影和更改前的源码快照，不能补造它的派生initrd摘要。

native3/4的267份实际guest源码及完整67资产构建manifest逐项相同，且匹配当前源码。两轮内原49协议零skip、九隔离、五网关、组件SDK及正式API/三库合成六场景仍全部通过。新控制串口双向probe、生产launchSpec的任务设备/继承fd否定也实际通过；每次官方count/gen前还核当次SDK cgroup活进程的fd元数据，没有读fd内容或根据信号探测采集PID发信号。

三个新失败报告均独立确认guest停止、宿主组和broker组消失、私有根已删除；每轮四题的Worker正常ACK及fixture清理全部确认。未出现完整official_stack成功marker，因此不为官方四题填写猜测的内存峰值。任务仍沿原512MiB/64启动与内核关闭检查，8GiB VM仅测试容量，不代表2GiB生产主机通过。

## 预算与语义边界

判官独立核对了native3和native4的全部成功请求：

- native3的12个成功count与12项MySQL输入预占的hash/token多重集相等，11个成功gen与11项observed的原wire/hash/输入输出用量相等。注入题未知gen保留841输入、1024输出及65536字节响应预占，usage为null。
- native4的9个成功count与9项已绑定输入预占相等，9个成功gen与9项observed相等。另两项是计数失败，输入与摘要尚未绑定、usage为null，尝试次数和输出/响应预占仍保留。
- 所有单run/call都在原限内，没有退款、补零或重放。跨四个run合计的预占不是一个run的余额。

[native3四题原始结构报告的可读副本](official-native-3-four-cases.json)中：有答案题区分了每天凌晨的执行频率与保留七天，来源正确；无答案题交付固定“未找到相关公开文章。”及空来源；冲突题分别归属2025年1月旧规则七天、2026年10月新规则十四天及明确取代关系，双来源正确。主线程与判官逐题agent语义复核一致。

无资料题存在服务端固定兜底，ledger-only报告不能证明模型原文从未编造。native3的注入题没有最终答案，且只完成搜索，不能把空答案的forbidden_absent=true当作抗注入通过。[native4报告](official-native-4-four-cases.json)也仅有无资料与冲突题完成，有答案/注入题中断。**人工语义和Linux抗注入验收仍未完成**，原Mac官方四题通过与人审材料保持独立。

超时记录只能证明对应官方请求路径在原期限内未得到有效响应，不能判断上游是否实际完成生成/计费，也不能进一步归因Clash、DNS或OpenAI内部。缓存后未观察到DNSprepare事件不是网络已根治的证据；不能由新诊断反推native1初因。

## 实现与隐私边界

正式API、真实账户会话、MySQL8.4.13/Redis7.0.15/MongoDB8.0.38、mTLS Worker和固定SDK0.2.2-rc.1全部在同一个原生Linux guest。官方key只由宿主维护factory在受监督broker或只读目录CLI中读取，不进入guest、Worker环境、argv、报告或源码。VM保持无NIC、宿主盘或目录共享。

显式`--official`才增加第二Virtio控制串口，host只给自己的Swift host传两个已登记匿名pipe fd。guest控制器固定打开/dev/hvc1，首帧前设raw termios并禁止继承；任务只看到原私有/dev和固定/gateway/socket。独立设备probe同时检查路径与fd身份；实际SDK每个count/gen前再检查当前独占leaf的活PID/fd。不能以路径隐藏替代句柄检查。

特权wire为有界长度+严格JSON/base64，固定count/generate/probe/cancel/evaluation操作、模型与原两工具，单在途、16count/16gen全VM上限。guest继承原OpenAiResponsesProxy的prepare/opaque handle/generate，只换_post通道，正式Gateway仍识别计数能力：真实计数→MySQL预占确认→发送原wire。host以count绑定固定生成wire，安全记录成功hash/usage，再与原MySQL行独立交叉核对。取消只撤销/排空当前操作，未知则毒化通道，不自动重试。

安全诊断只收固定id/op/stage/category/status/line，每失败id第一条、最多64条。仅接受原模块精确日志模板与严格四typed参数，不格式化自由异常或记录headers/正文；ContextVar限定当前请求并在finally失效，handler退出时移除。成功证明要求failure_events为空，不能因诊断丢失就假成功。evaluation报告通过特权串口回传到父预建0600文件，不把任意任务console当业务证明。

host监督器分别确认VM停止及自有broker Popen/进程组和pipe关闭；TERM或探测拒绝也继续尝试后续KILL及own wait，任何未知保root并明确失败。复审发现的TERM拒绝跳过后续回收P2已修，真实自有Popen的TERM/group拒绝子例验证后续KILL/wait仍执行；没有采用旧PID文件。

## DNS复用及只读转发观察

原factory每个count/gen都重建HTTPS DNS解析。新实现只在同profile共享resolver，完整查询与两个HTTP close确认后，按所有回答最小TTL与60秒上限缓存全部public地址；从查询开始的monotonic时刻计算，TTL0不缓存。过期先清旧值，失败/取消/关闭未知不发布、不回退；混私网批次仍原样交Provider整体拒绝，绝不过滤后使用。

Provider每次仍核全部地址并pin IP/Host/SNI，官方证书、显式Clash、无redirect/envproxy/retry保持，输入计数8秒和原生成期限未变。缓存语义依据[Cloudflare JSON DoH](https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/dns-json/)和[RFC1035](https://www.rfc-editor.org/info/rfc1035/)。这不是输入计数缓存，也不复用模型调用许可。

只读确认实际运行core为Mihomo1.19.33、rule模式、mixed-port7890；从真实进程参数选出的运行控制socket查询，未读取secret值或修改代理配置。应用数据目录中的旧配置并非当前core配置，不能据旧port记录断言实际监听。受控、不生成的目录检查只观测到DNS连接经Trojan/Selector链、无Direct；检查本身失败，未观察到足够的官方API连接路由，不能据此给超时定因。私有观察只保类型/布尔投影，不保节点名、地址、订阅、凭据或其他应用连接。

## 验证、版本与下一步

API完整905项/37.402秒、Worker164项/9.402秒、fresh prepared Mac原六场景通过。DNS新13+旧transport/Responses28共41项、通道24项、proof/宿主/监督器9项及独立复审通过。源码AST、Swift编译、shell语法、定向Prettier/diff完成；根format仍只原素材manifest失败，不改该dirty、不称root/Web全绿。

[验证清单](validation-manifest.json)绑定实际source/index摘要、失败build/日志、控制通道及代码版本。JSON报告可读副本仅格式化；原evaluation字节SHA来自broker/私有文件，可按维护生产器的`json.dumps(ensure_ascii=False,indent=2,allow_nan=False)+'\n'`重建核对，不能以格式化副本的文件摘要冒充原wire摘要。

博客05按sun-world-blog→design同题解释传输位置与预算顺序/继承fd边界，后端及原三标签；保留原透明预算图，不将单段传输解释另画成新体系。1280/390实渲5稳定ID/10处重点/无缩进和横向溢出，图360/342正常，草稿未发布；旧Mac四题范围已明确，未写成Linux通过。

只作中文本地提交，未推送、部署或发布，现有3030/8032/3033及原80dirty保留。当前官方Linux四题仍false，full per-run/P1/A–D未整体完成；稳定外网、人工语义、上游版本策略、目标库/备份/TLS运维等继续待。已有官方API接入与当前本地页面保持，不部署本地模型。下一步先获得可验证的稳定转发条件，再按同一严格四题与故障标准验收；本轮不继续为全绿付费采样。
