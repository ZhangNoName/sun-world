# OpenAI官方API本地接入

2026-11-16，基点cc42e9c。用户授权直接使用OpenAI官方API，并允许检查本机Clash Verge转发。不要求本地部署模型，运行凭据从ignored私密文件读取，不向源码/提交/应用日志/报告/交接正文写入值。当前仅实现本地显式profile，生产准入和目录默认不改变。

## 本轮协议

- 官方固定origin为`https://api.openai.com`，无用户URL参数，默认模型`gpt-6.1-sol`（已在该key的官方模型目录中确认可见）。依据[官方模型说明](https://developers.openai.com/api/docs/models/gpt-6.1-sol.md)，工具调用采用Responses API；不把Responses响应当Chat Completions解析。
- 新profile仅local/dev/test可创建，检查runtime先于文件、网络。凭据文件为用户所有、普通文件、单链接、0600、NOFOLLOW、有界读取，不回显值或hint。不把key放在argv或Worker环境；服务端固定模型和配置，不由SDK消息覆盖。
- 既有Provider继续DNS/全地址public校验、pin IP、Host/SNI、证书校验、trust_env false/no redirects/no retries及有界读响应。Clash代理必须显式配置为无凭据HTTP回环IP端口，不自动继承代理环境。
- 本显式profile选用仓库已锁定的httpx 0.28.1/httpcore 1.0.9；标准HTTP CONNECT代理TLS以CONNECT目标IP作为server_hostname，忽略请求的sni_hostname扩展；不能靠关闭证书校验解决。新增受限CONNECT transport：只允许已校验public IP:443，连接显式loopback代理，发送有界CONNECT请求，严格有界200响应后把流交回direct TLS层，由现有SNI扩展及默认SSL context验证官方hostname。不改普通Provider或MCP传输。取消/失败关闭本次拥有的流，禁止自动重试。
- 本机系统DNS与通过代理的可信HTTPS DNS结果不同；可为此固定host显式选择有界HTTPS DNS resolver，DNS查询固定官方host，HTTPS固定可信DNS服务，禁redirect/env代理/压缩并保留证书校验。结果全地址验证与IP pin仍由Provider执行，不能仅因为proxy能连域名就略过IP校验。此本地链路不作为Linux隔离或生产网络验收。
- Responses只允许`/v1/responses`及本地显式模型目录检查；store=false、非流式、四次模型/每次1024输出token/64KiB响应及现有run预算保留。转换复用现有严格Messages输入验证和固定两工具；仅函数调用可成为工具指令，不开放hosted tools。SDK thinking disabled不是供应商零推理保证，此profile固定官方支持的低推理档位，输出上限包含推理消耗。
- 工具回合中只向SDK回传函数调用，丢弃reasoning和中间文字，避免丢失Responses message.phase后误作下一轮assistant消息；不接受无法保留phase的assistant自由文字续接。最终答案必须是合法completed消息，取消/迟到交付仍由原控制内核拒绝。实际usage缺失/错误拒绝，不补零、不退款、不自动重放。

## 当前实证与待办

已验证Clash Verge mixed-port7890可连接。使用显式代理、默认TLS验证、固定官方hostname的非生成目录请求返回200、96项模型；不保存全目录或原始headers。先前直连ConnectTimeout，以及现有IP pin配合标准httpcore proxy的TLS失败，不代表key失效。后续须验证受限CONNECT transport及完整Responses适配，再运行本地问答；实际结果见下。普通Provider默认的httpx2依赖与维护CLI契约保持不变。

官方[Responses输入计数](https://developers.openai.com/api/docs/guides/token-counting)可作为后续预算路径，不要求本地权重/tokenizer文件。当前Qwen探针的三个false标志不套用为OpenAI已通过或永远不能通过；完整payload一致性、预出网累计输入预算和人工语义仍须单独验证。本地API连通也不放行P1生产或Linux硬隔离。


## 本地使用

官方profile由`create_blog_qa_proxy(..., local_model="openai-local")`选择，默认固定gpt-6.1-sol，不修改站点模型目录。开发启动器支持`--model openai-local`；默认从ignored `.tmp/dsh-blog-site/options.json`读取model、openai_key_file和openai_proxy_url。API key只在单独0600文件中，options只保存路径引用与无凭据回环转发地址。

```bash
DSH_OPENAI_API_KEY_FILE=/absolute/private/api-key \
DSH_OPENAI_PROXY_URL=http://127.0.0.1:7890 \
corepack pnpm dev:blog-qa --model openai-local
```

本地页面为`http://127.0.0.1:3030/aigc/blog-qa`，API为8032，复用正常站点登录、管理员名单和真实公开博客；现有local SQLite运行入口保留，不把它说成正式MySQL/mTLS V2链路验收。代理/VPN必须可用；不自动切换模型、网络路径或重放失败请求。

## 最终验证与限制

- 受限CONNECT transport实际经过Clash、可信HTTPS DNS和官方TLS成功；默认SSL验证、Provider全public地址校验及pin/Host/SNI均保留。单次Responses短文本测试154输入/6输出；两请求函数调用往返183/20及231/11，先读取合成文章1再正确回答七天。store=false、每次输出上限、无自动重试；不保存原始响应或推理。
- 真实站点浏览器通过正常密码登录、OpenAI模型标识、实际SDK搜索/读取文章41、带来源完成、刷新恢复；1280/390无页面溢出或pageerror。该实证是开发SQLite站点入口，前端使用当前workspace，不能替代正式MySQL/生产/完整语义矩阵。
- API最终667项，Responses14/CONNECT14及独立review通过；Worker71项，含新Darwin日志FD回归；launcher协议/定向格式与空白检查通过。模型强制指定tool却返回纯文字的P2已修：必须恰好一个同名调用，none/required也按控制拒绝不一致。
- 启动曾两次在Node负向sandbox自检SIGABRT。证实相同argv/policy/env继承repo内日志FD时2/2崩溃，改/private/tmp日志或pipe4/4成功；此前10个pipe/PTY最小检查未重现，不能作根因反证。修为probe独立pipe、父进程转发，不更改sandbox规则。修后正常launcher输出仍写repo日志，启动和仓库读取/外网EPERM负向检查通过。只确认继承FD触发条件，没有声称定位具体内核syscall。
- 首次浏览器问答完成，但刷新只固定等1.8秒，检查记failed；第二个独立新run首次model回调约8秒后502/model_proxy_failed，尚无上游首错可定因，不臆断为计费/配额/解析或网络原因。新增失败日志仅固定stage、HTTP status、固定类别和本模块源码行整数，丢弃异常自由文本，日志sink故障不替换主错。第三个独立run用诊断版与最多15秒条件轮询通过问答和刷新；没有修改前端/题目/预算，也没有自动重放前两次请求。失败历史与最终安全投影见[评测记录](../evaluations/agent-openai-2026-11-16/README.md)。

博客05继续按design局部说明托管API计数路径、Responses工具/阶段适配及推理输出预算；后端与原三标签、5章节ID保留，透明预占图仍足够，无新增图，1280/390正文预览通过、7处strong，未发布。输入token预出网累计硬限尚未接入；上游模型版本/人工语义/Linux memory-PID-network/已有库崩溃与journal留存/生产TLS仍独立待验收。不推送、不部署、不更改生产目录或准入。
