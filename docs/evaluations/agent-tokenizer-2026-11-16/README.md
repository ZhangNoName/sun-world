# Tokenizer能力观察

2026-11-16，基点`569c187`，本地macOS ARM。此轮只新增显式能力探针，不修改模型代理、运行账本、预算或生产准入。维护CLI没有tokenizer元数据/计数命令，故复用既有local-only keyless factory及Provider网络策略；没有使用生产AI接口、业务配置、私钥或自定义服务地址。

## 实际观察

执行维护脚本`probe-agent-tokenizer.py --probe --report <new-absolute-path>`，退出0，完整报告status为ok。严格顺序发出三个GET metadata请求与三个POST `/tokenize`，无重试、无生成请求。格式化后的安全报告保留为[probe.json](probe.json)，源码与验证摘要见[validation-manifest.json](validation-manifest.json)。不保存原始响应、token IDs/strings、模板、模型根路径、headers或自由异常文本。

| 观察项 | 结果 |
| --- | --- |
| 模型目录 | 单一别名匹配qwen38_27b；报告max_model_len为262144 |
| 服务版本 | 返回0.28.0；不是不可变源码/工件证明 |
| tokenizer元数据 | 接口不可用（404），未提供可核对工件 |
| 中英Unicode消息 | count为69 |
| 同一消息加合成两工具定义 | count为378 |
| 工具定义加合成调用/结果历史 | count为434 |

计数响应均为有界严格JSON，count是非负整数且等于token数组长度。输入经过当前Messages适配后投影为tokenize协议；工具schema和文本为固定合成样本，并非实际SDK请求。投影没有生成协议的推理控制或采样参数，因此不能据此推断两条路径使用相同模板，也不能证明服务计入了所有输入。root字串摘要仅用于此次metadata关联，不是模型或tokenizer的内容摘要。

**tokenizer_verified、immutable_model_revision_verified、input_token_hard_limit_verified均为false。** 三个数字不能推广为输入硬上限、完整预算验收或生成路径等价结论。必须同时取得退出0和可解析status为ok才算此探针协议通过；最后报告关闭失败时，即使文件已含ok，非0退出仍不算通过。硬终止留下running或半份JSON同样不算完成。

## 验证

- 完整`corepack pnpm check:api`通过639项。新增15项离线测试使用真实Provider策略/hooks与MockTransport，覆盖固定路径/输入拒绝、响应/隐私/超时、取消、报告独占/权限与存储故障；独立判官最终复跑15项通过，无确认P1/P2。
- 初审修正成功响应后close期间取消被误归类、fstat失败漏关闭fd，以及最终close异常跳过进程级allowlist恢复。合法/非法响应均验证两次cancel后等待close gate释放，保持取消结果且不多发请求。
- 博客05按sun-world-blog→sun-world-write-design局部补完整计数、锁定版本和预出网扣额三条件。保留后端分类及架构笔记/Agent/DeepSeek Harness三标签；原透明预算图适用，不添重复图。1280/390正文预览检查5个稳定标题ID、6处strong、无首行缩进/页面溢出，图宽360/342px；使用当前dirty renderer/CSS，不能代表完整文章页或已提交前端验收。未发布。
- 本轮没有改Worker/DB/SDK路径，因此没有重复原生三库或真实生成评测；历史验证以原目录为准。没有运行或宣称root/Web全量门禁通过，原素材格式/CSS预算问题保留。

用户明确暂时没有独立Linux测试环境或模型工件资料，先推进可本地验证的部分。当前机器没有Docker/Podman/Lima等运行时或容器socket，未安装额外软件、未使用2GB生产宿主替代Linux隔离验收。用户随后授权直接接入OpenAI官方API，下一步先做官方API配置与有界联调，不要求本地部署模型；Linux memory/PID/network、可信模型工件/输入预算、人工语义验收及生产TLS仍保留独立门槛，不放行B/P1或A–D整体，不推送/部署/发布。
