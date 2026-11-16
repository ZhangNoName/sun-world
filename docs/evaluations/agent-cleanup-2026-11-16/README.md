# 回收诊断验证记录（2026-11-16）

基点6afeb29；验证树`6eff1e721c9d71f320eeea6b9dfb4d257b6fc32b`。详见[源码与结果清单](validation-manifest.json)和[实现说明](../../development/agent-cleanup-diagnostics.md)。清单只保存固定结果与源码摘要，没有业务配置、凭据、TLS材料或异常自由文本；本地原始日志不入库。

- 同树串行API624、Worker70、CI/root/schema/RPC/catalog门禁通过。Offline重打固定SDK0.2.2-rc.1（592缓存包，下载0），v1实际注册仍严格两工具。
- 实际双向mTLS+固定SDK故障探针：只对已登记执行的owned workspace删除注入EACCES，原cancel503、新执行503占用保留，解除故障后原cancel重试200，实际收到workspace_remove/permission_denied与恢复事件，无重派或敏感文本。工具和模型/文章回应合成，不是质量评测。
- 真实MySQL/Redis/MongoDB+固定SDK六情景通过，新的私有诊断文件、严格ACK与安全reader参与真实链路；目录删除故障的核心钩子通过独立SDK探针验证，不能把无故障的空事件文件当成每种磁盘故障的证明。
- 一轮六任务并行（API、Worker/门禁、MySQL、API组合、双Mongo隔离、SDK六情景）全部通过；本机内存32GiB，未调用外部真实模型。它与历史负载同类，但不是完全受控压力基准或生产容量证明。
- 模型等待点向总launcher发送SIGTERM，保留130；Worker/SDK组、三库PID与四个owned root均消失。
- 判官独立Node15、Python24项及源码/index/tree/snapshot字节复核通过。坏ACK跳过后续关闭、深层JSON中断安全prefix两项P2均补回归并解除。新增SDK测试还纠正了旧deepStrictEqual把null-prototype当JSON协议差异的断言，仍精确要求thinking仅type=disabled。

[历史失败记录](../agent-model-2026-11-16/cleanup-observations.md)不修改。本次未复现旧失败，新增诊断不能倒推缺失的旧根因。未知回收仍失败/占用保留；日志写入失败也不改变控制权限。生产宿主sink/留存、Linux/模型输入计数及其他放行门槛继续保留。

最终只补证据与交接文档，提交前逐项对比清单中11项可执行输入，临时验证快照和prepared runtime由父任务清理。博客04更新首错与恢复机制，分类后端、原三标签，未发布；正文预览使用当前dirty renderer/CSS，不代表已提交前端或完整页面E2E。
