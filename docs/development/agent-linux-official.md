# Linux 正式组合的官方 API 通道

2026-11-17范围补充：用户已回复只复用Clash Verge现有转发，不单独配置代理，代理配置不在开发范围。此前“询问稳定节点/其他回环代理”的资料项关闭，不再等待用户提供另一代理，也不调整节点/系统代理。保留原通道与失败证据；这不是网络已稳定或重新运行四题的证明，不因本次范围回复自动重做付费采样。后续接手先读[官方接入范围](agent-openai-validation.md)。

2026-11-17，基点83d5d53；继续用户授权的直接官方API，不部署本地模型。上一轮同guest正式API/三库/SDK六个合成故障场景已通过，本轮沿原四题模型评测，在同Linux组合使用真实官方计数/Responses；人工语义、不可变模型策略、生产运维与整体P1/A–D仍独立待。现有3030/8032/3033、业务模型目录、原80dirty不改，不推送/部署/发布；只中文本地提交。

## 通道与信任

不向guest复制官方key，不为guest加NIC/宿主盘/目录共享。只在新的显式official VM profile增加第二个Virtio串口，host通过自有匿名pipe对接独立受监督的官方broker进程；guest控制器只打开固定/dev/hvc1。原console仍hvc0，API往返与原始模型响应绝不进console。任务继续原bubblewrap /dev私有挂载，仅固定/gateway/socket，不挂宿主控制串口；串口首帧前显式设raw termios，禁行规、ECHO、ISIG、CRLF翻译和流控，真实PTY控制字节回归；fd设CLOEXEC/non-inheritable，任何Worker/SDK spawn均不pass此fd。实际任务内同时验证hvc1不可见/不可打开、/proc/self/fd无串口身份，不能只凭配置声称隔离。每次真实count/generate前还在当次已登记SDK叶cgroup核活PID及其fd元数据，确认无hvc1设备身份；不读fd内容、不根据信号探测采集PID发信号，结束仍由原所有权回收。

host broker只由现有create_local_openai_proxy读取原ignored 0600 key并通过显式Clash127.0.0.1:7890调用固定官方origin；工具不得读取或打印凭据。复用原官方HTTPS DNS/public IP pin/Host/SNI/默认TLS/无redirect-envproxy-retry与有界请求，不新增任意URL或CONNECT接口。broker仅收count/generate两个固定操作，及无需出网的probe、cancel与evaluation回传；只允许固定gpt-6.1-sol和原Responses控制/两工具。guest不构造可用供应商key，以显式测试适配继承原OpenAiResponsesProxy的prepare/opaque handle/generate预算与严格结果适配，只覆写原始_post通道；host收到的生成wire与guest持久账本摘要必须相等。guest仍先实际计数→MySQL预占提交→只发送原wire一次；不绕开正式网关和历史事务。

串口为特权测试控制面，非任意网络出口。guest内可信控制器/内核失陷不在此隔离声明内；host仍固定操作、模型、schema、请求/响应长度、全VM最多16计数及16生成，并有期限和单在途；host独立校验完整固定控制与两工具schema，并在count成功时按固定1024输出/storefalse/streamfalse算expected generation SHA，单次消费后只发送guest原wire，不重建替换，不因guest请求取消退款/重发。全部文章与题目为原四题合成公开资料，不发送业务内容。无真实副作用工具，输出仍经原公开状态/来源/终态事务检查。

## 固定 wire 与所有权

使用4字节network-order长度加UTF-8严格JSON，无重复键/NaN/任意对象，frame最多400000字节，raw payload最多262144字节、raw响应最多65536字节（count4096），base64严格解码后保原byte，不重建generation wire。请求字段恰为version/id/op/payload，version sun-world-linux-official-channel/1，id1..64且新request严格递增，payload为base64原wire，probe/cancel必须空；evaluation仅允许一次≤262144字节原四题报告，host完整写/fsync到预先指定的自有0600文件，再回复固定SHA确认，不将该报告当上游请求。cancel复用当前id，不重发请求。响应字段恰为version/id/status/payload，status ok/failed/cancelled；failed/cancelled payload空，不返回异常自由文本/HTTP headers。evaluation在无活动上游时独立保存，包括失败报告；只有外层再核四题/账本/host请求摘要后才判通过。probe只回固定ready JSON，不访问key网络；实际CLI创建官方proxy后接受请求。

单通道按顺序串行，每次count最长8秒、generate最长45秒，加有界pipe传输；关闭、取消或帧损坏不能留下异步读取者消费下一调用。guest取消要发当前id cancel并排空同id最终帧后才解锁；无法确认则毒化并关闭该channel，禁止后续请求。host读取与上游task并行接cancel，先取消/排空原http客户端，且每id最多一完整响应。EOF/SIGTERM都先取消活动请求并确认结束，再保存固定安全统计，退出；无自动重放。

父监督器在自有临时根内预登记broker Popen，原始pipe只pass_fds给自有Swift host；不传key值/环境。VM开始前或后任意失败仍独立关pipe、TERM/KILL并wait自有broker组，读取≤64KiB/0600/NOFOLLOW/owner/nlink1的固定统计，未知保runroot并失败。VM的started/stopped、broker组和宿主组/根由原监督器分别确认；超时不等于已经停止。Swift只接受明确official模式的两个不同有效pipe fd，不接受用户任务选择。official guest总时限明确上限，不修改旧profile默认期限。

安全统计只含固定数字/bool、各成功请求的op/id/wire SHA/input-output token数字，不含原始输入/答案/响应ID/路径/headers/key。最终四题评测保留原实际答案/来源及MySQL预算投影用于语义审查，独立有界报告由受控frame输出或特权统计通道带回host，不把普通console伪JSON当可信结果；默认API/Worker门禁不调用模型。

## 角色与验收

root负责Swift/监督器/broker所有权、Linux fixture与四题评测接线、显式profile、原生验证、证据/博客/中文提交。coding负责独立串口codec、host异步broker服务、guest异步通道和窄测试；判官只读复审。接口变更先更新本文再广播，后续Claude Code/claude-ds先读本文及上一轮stack协议。

先验证实际pipe/短读/截断/超长/重复id/取消/迟到/EOF/上游关闭与计数wire绑定，再原生无出网probe及任务不可见hvc1，再完整官方四题。保留原49/九隔离/五网关/组件SDK与正式合成六情景的独立证据，不把真实模型四题等同故障矩阵或人工验收。未知结构/预算/清理必须保失败记录，不能补写成成功。博客按sun-world-blog→design修订同题，评估图用途，实际1280/390预览并记录未发布。

## 首轮失败与诊断增量

首轮原生完整启动，原49/九隔离/五网关/组件SDK/正式六合成场景通过，控制串口双向probe及任务device/fd否定通过；但官方四题均中断，3计数及1生成得到成功响应，broker累计5计数/3生成尝试、4失败，未自动重放。失败的计数不进入输入预占，未知生成用量不填零，四题Worker及fixture清理均确认，host completed/started/stopped及broker EOF/close确认。失败时没有V5成功报告，不把host正常停机当应用通过。

原broker错误全收敛fixed failed，缺少足够阶段证据，不能臆断网络/计费/模型格式初因。新增有界failure_events（≤64，fixed id/op/stage/category/status/line，仅原维护诊断结构或broker固定阶段；不保存任意异常文本/headers/内容），与成功请求摘要并列。官方成功验收要求事件为空；失败保留原投影。原始source hash快照已在更改前固定，后续不同源/不同run的独立验证不改写首轮失败。

后续监督器在失败时另写明确sun-world-linux-native-failure/1（passed=false），只含固定失败阶段、当次实际boundaries、若可用的独立host控制记录、guest_build源/资产摘要及私有根是否已移除。未开始的边界检查以阶段区别，不将初始化true理解成VM成功；失败报告不进入成功verify路径。首轮旧版没有该报告的事实保留，不补造旧句柄确认。

## 解析复用增量

第二轮仍未通过，实际3次失败在provider连接准备（源码222，即官方DNS/地址校验阶段）、一次count_request超时；没有binding/response_adapt/usage失败记录，不据此反推首轮初因。Native2明确passed=false，保267实载源/67资产构建摘要、VM/host组/broker组/根清理确认；API892/Worker164通过但不冒称原生四题成功。

本地官方profile原来每次count/gen都新建一次HTTPS DNS resolver与请求。接下来复用同profile resolver，且只缓存已完整校验的全部public地址：缓存期限取所有回答TTL的最小值与60秒上限，从查询开始的monotonic时刻算；TTL0不缓存，过期先清旧值，查询失败/取消/response或client关闭未知均不发布缓存，不回退过期或部分结果。每次Provider仍验证全部地址并pin IP/Host/SNI，官方TLS/显式Clash/无redirect-envproxy-retry不变。固定host/443在用缓存前也校验；仅同factory生命周期共享，非全局跨profile缓存。并发解析串行有界，锁等待和解析仍受原请求总期限约束，不增count8秒/生成期限、预算或模型重试。

TTL语义依据[Cloudflare JSON DoH](https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/dns-json/)与[RFC1035](https://www.rfc-editor.org/info/rfc1035/)；这是减少重复解析的实现，不是省略官方输入计数、复用计数许可或保证外网稳定。先以TTL/私网混入/expiry失败/取消关闭闸门/同factory复用离线验，再新独立原生运行；旧两失败原样保留。

第二轮总尝试9count/7gen，实际7count与5gen成功、4失败；该数字以broker原文件为准。随后一次不含key、不调用OpenAI的同固定Cloudflare resolver公有查询也在约3023ms发生ConnectTimeout，是额外样本，不代表每次连接都失败。更早临时探针把IPv4Address对象传给原str helper的AttributeError仅为探针类型错误，不计产品/DNS失败。

第三轮缓存后，前三题完整通过且官方用量/持久预占一致，第四题第二个生成在request/227超时；12count/12gen尝试，12count+11gen成功，一条AGENT_MODEL_TIMEOUT，无DNSprepare事件。没有把3/4记成整套通过，四题fixture/Worker均正常ACK清理，VM/组/broker/root全部confirmed。为补齐同源四题验收，再做至多一次新的独立完整运行（native4），使用全新run/schema/report，不重放任何旧run，不增加proxy重试或期限；若仍外部请求超时，保失败与未完成门槛，停止本轮付费复跑。
