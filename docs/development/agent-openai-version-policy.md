# 官方模型版本核对

日期：2026-11-16；基点7c5ad03。当前官方本地 profile 仍固定 `gpt-6.1-sol`、官方 HTTPS origin 与 Responses 格式；生产不启用。此轮只读模型目录，不生成内容、不改站点模型目录，也不自动切换模型。

## 证据与结论

[官方模型页](https://developers.openai.com/api/docs/models/gpt-6.1-sol.md) 的 Default snapshot 及 Snapshots 列表目前都只有 `gpt-6.1-sol`，没有另列日期版本。[模型目录协议](https://developers.openai.com/api/reference/resources/models/methods/list.md) 只说明当前可用模型及标识、创建时间、所有者等基础信息，并未定义权重摘要或不可变性证明。

在本机 Clash loopback CONNECT 与原维护 transport 上，授权的 `GET https://api.openai.com/v1/models` 返回200；只投影当前固定模型及同名前缀的日期候选，结果只有 `gpt-6.1-sol`。这不是全平台不存在快照的证明：目录受当前凭据可见范围影响，日期命名也不是不可变性证明。本文称它为“固定模型标识”，不根据无日期名字擅自断言官方已保证它是可变 alias，也不把文档通用 Snapshots 介绍当成这个标识的独立版本承诺。

结论：本地开发继续原模型与计数预算；`immutable_model_revision_verified` 仍为 false。已有四题语义与计数对齐证据保留原时间和版本范围，不升级为永久语义保证或生产放行。

## 维护命令契约

新增 `scripts/inspect-agent-openai-model.py` 及仅验证使用的 integration helper：

- 无参数默认沿用本地 factory 的私有 key 文件与显式代理环境选项；可用 `--proxy-url http://127.0.0.1:7890` 指定现有 Clash。不能通过 argv 传 key，不能选择模型、origin 或任意路径。
- factory 首先拒绝非 local/dev/test 运行环境；通过原 `_connection_options`、public DNS 校验、pin、Host/SNI、默认 TLS 验证、受限 CONNECT、禁环境代理/重定向的 HTTP client。请求阶段总限15秒，连接3秒、读8秒、写3秒、池1秒，响应262144字节；只一次 GET，不生成、不计数、不重试。中断后的关闭沿用原清理排空逻辑，可能超过请求期限；只有关闭完成才输出成功。
- 严格解码 JSON，要求 list/data 及不超过2048条合法基础 model 记录；拒绝重复 ID。只输出固定模型的可见性与最多32个合法日期后缀候选；其他目录标识、时间、所有者、headers、原始响应、异常自由文本及 key 均不输出。候选仅供后续官方核对，不自动选用。格式错误、超限、非200和关闭失败都固定失败，不能输出成功报告。
- stdout 仅成功的安全 JSON，含检查 UTC 时间、当前 profile/model、可见性、日期候选、生成次数0和不可变验收 false。失败 stderr 仅固定错误，不回显参数、异常或供应商 body。中断传播并清理 client；不加载业务配置/lifespan、启动数据库或改业务目录。

本机执行：

```bash
apps/api/.venv/bin/python scripts/inspect-agent-openai-model.py --proxy-url http://127.0.0.1:7890
```

## 版本变更流程

若后续有官方明确说明的独立快照，先核对该标识对当前 key 可用、支持 Responses 工具及完整输入计数；在独立评测 profile 中显式绑定请求、计数、响应模型标识与评测记录，重新执行固定四题和预算/工具控制验证，经语义复核后再决定替换。只改默认模型字符串、自动挑最新日期、失败回退别的模型或放宽响应 model 校验，都不属于本策略。

若供应商只能提供当前标识，生产是否接受版本漂移需要单独作出可审查的产品决策，列明持续评测、撤回条件与更新职责；目前未作该决定。维护检查只补齐可见目录证据，不解锁 Linux、人工语义、生产 TLS、目标业务库/备份恢复或 P1/A–D 门槛。

后续 Claude Code / claude-ds 必须保留本节边界，不依据 created、owner、目录存在或日期格式把 immutable gate 改 true。博客05同题修订，分类后端，标签架构笔记/Agent/DeepSeek Harness；现有预算图已覆盖计数机制，此轮不加重复图片，未发布。
