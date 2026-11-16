# 官方模型目录与版本证据

基点7c5ad03；日期2026-11-16。此轮只检查官方资料与当前授权凭据可见的模型目录，不发送生成或输入计数请求，不加载业务 lifespan、变更模型目录或切换现有本地站点。协议见[版本策略](../../development/agent-openai-version-policy.md)。

## 官方资料

- [GPT-6.1 Sol 模型说明](https://developers.openai.com/api/docs/models/gpt-6.1-sol.md)：本次查看时 Default snapshot 与 Snapshots 都仅列 `gpt-6.1-sol`；没有独立日期标识。文档把快照与别名放在同一列表中，本记录不从无日期名字自行判定其可变性承诺。
- [List models](https://developers.openai.com/api/reference/resources/models/methods/list.md)：列出当前可用模型的基础元数据；created 是创建时间，不是权重指纹。未根据 owner、创建时间或通用 Snapshots 说明给当前标识补上不可变权重证明。

官方资料和当前凭据目录各有范围，未观察到候选不等于整个供应商没有快照。日期后缀仅供官方核对，维护工具不能自行选用。

## 本机只读实证

先用 ignored 最小 driver 复用原本地 factory、受限 CONNECT/pinned HTTPS client，固定 GET `/v1/models` 返回200，仅投影 `gpt-6.1-sol`，生成0、不可变验收false；未保存全目录、响应头或原始异常。随后维护命令的安全报告见 [inventory.json](inventory.json)，不是原始供应商响应。

代理显式使用现有 Clash loopback7890；密钥由原0600/no-follow私有文件 loader 在进程内读取，不在 argv、源码或本报告中。原 factory 的运行环境检查、公网 DNS 验证、pin、Host/SNI、默认 TLS 验证和禁环境代理/重定向均沿用。测试期间未启动数据库或 SDK，也未修改现有服务。

## 验证范围

最终 API gate 787项/30.685秒通过；coding新13与原transport14/Responses14共41项通过，独立判官新13项及3个Python AST通过，无确认阻塞。root另用真实CLI进程检查production和未知参数均固定失败且stdout为空。安全投影和17项源码摘要记录在 [validation-manifest.json](validation-manifest.json)。离线测试覆盖坏目录、重复标识、记录/字节/候选上限、真日期、其他目录/元数据投影丢弃、固定GET及超时配置、关闭失败与中断、未知CLI参数不回显。真实目录请求只验证当前这一时点的认证/转发/目录协议，并不重复生成或语义评测。

root-script/api:deploy-schema通过；根format只报告既有`docs/content-sources/csdn-qq-42345136/manifest.json`，未修改该dirty文件。本轮没有生产运行时、数据库、Worker或现有生成适配改动，不扩展重跑原生数据库/SDK/四题生成矩阵，也不声称root/Web全绿。

博客05同题补充固定标识与版本证据的区别，分类后端，原三标签与5个稳定章节ID保留；现有预算图足以解释请求控制，不新增图片。1280/390正文预览通过，8处重点、首行缩进0、无残留双星或横向溢出，图片桌面360/手机342px；未发布。预览复用当前dirty renderer/CSS，不等同完整页面或全仓构建验收。

## 保留门槛

固定请求/计数/usage 对齐与当前模型标识仍是已实现的应用约束；供应商不可变权重、未来语义一致性、人工复核、Linux隔离、生产TLS与目标业务库/备份恢复各自独立。`immutable_model_revision_verified` 继续false，不改旧报告，不自动回退/重试/选新模型，P1/A–D不整体放行。下一步若无新供应商版本依据，继续可本地验证的运行恢复与隔离证据，不能通过重跑目录把未证实门槛变为通过。
