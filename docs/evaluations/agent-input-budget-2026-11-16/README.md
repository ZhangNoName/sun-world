# 官方输入预算本地实证

2026-11-16，基点36b2e0f。协议见[输入预算](../../development/agent-input-budget.md)，持续任务见[分支交接](../../handoff/branches/zxy-dsh-platform-foundation.md)。本目录只含数值、固定状态和摘要，不包含请求/响应正文、推理、headers、账户、凭据或原始本地日志。

## 三个不同范围

- [官方计数一致性](count-equivalence.json)：固定gpt-6.1-sol，通过用户授权的显式Clash链路，三组合成输入各1次计数和1次生成。Unicode177、工具定义184、工具历史219，均等于实际input usage，输出各6。使用同一canonical wire及计数投影，store=false、输出上限256，无重试。这不是任意模型版本/输入的一般计数证明。
- [正常站点浏览器](browser.json)与[只读SQLite投影](site-budget.json)：当前开发站点正常登录，真实SDK搜索/读取文章41，三次调用551/1935/676，均observed且与持久预占相等，run累计3162；答案/来源/刷新恢复、1280/390无溢出与pageerror。run标识只保存SHA。页面使用当前workspace前端及开发SQLite，不是正式MySQL/mTLS V2入口。
- 正式Gateway事务：默认离线测试9项，加owned MySQL 8.4.13共19项，包含4次计数争2份生成额度、input commit ACK丢失不生成。数据库真实、上游MockTransport；没有连接业务库或运行生产DDL。owned mysqld已停止，临时数据已清理。

## 回归、复核与源码

完整`corepack pnpm check:api`696项、AI边界检查通过。判官独立AI41、正式预算9、旧实时授权16通过；修开发Runtime最终授权线程未注册的P2，完整模型操作现由owned task覆盖，取消/关闭等待线程退出。最终本地预算7及旧授权16独立复验通过，无剩余确认阻塞。API696是在此修复之后运行；新旧测试均不要求真实API或Clash。Worker未改、本轮未重跑。

源码SHA、验证时暂存树及各报告摘要见[验证清单](validation-manifest.json)。选定可执行源文件current/index一致；随后仅补证据及交接文档。没有把其他未提交前端/技能/内容改动混入本次提交，也没有宣称root/Web所有门禁全绿：既有素材格式及CSS预算问题仍保留。

博客05继续按design解释两次预占、固定wire和usage漂移拒绝，后端/原三标签、5稳定标题ID/7处strong保留。正文1280/390与新增段落视觉检查通过，原透明预算图360/342px仍适用，无新增图；使用工作区既有未提交renderer/CSS，不等同完整文章页验收，未发布。

## 仍未完成

本轮局部输入预算通过不等于P1/A–D整体放行。正式V2+官方模型整栈、Linux memory/PID/network隔离、人工语义、上游版本策略、已有业务库升级/崩溃矩阵、journal留存回收和生产TLS仍待验证。原Qwen探针的三个false保持；上轮一次模型代理失败根因仍未知，[历史记录](../agent-openai-2026-11-16/README.md)不变，不用本轮成功反推它已修复。未推送、部署、发布或更改生产准入。
