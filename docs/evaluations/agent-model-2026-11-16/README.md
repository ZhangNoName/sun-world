# 2026-11-16 真实模型四题记录

数据全部为固定合成公开文章，真实执行模型为local-only验证factory的keyless `qwen38_27b`。SDK固定0.2.2-rc.1；上游未公布不可变权重版本。记录没有供应商原始推理/headers/凭据，仅有合法适配后的回复、结构metadata和本地资源观察。数据集和期望从第一次到最终轮未修改，不以小样本推断一般准确率。

| 记录 | 实际结果 | 后续改动 |
| --- | --- | --- |
| [first](attempt-first.json) | 四题都在provider前因SDK thinking/output_config拒绝 | profile显式disabled/off/1024；仍拒绝不支持的控制 |
| [second](attempt-second.json)、[third](attempt-third.json) | 四题实际出网，响应额外中性字段/推理字段与严格适配不兼容 | 仅显式兼容合法形状，推理丢弃、未知字段仍拒绝 |
| [fourth](attempt-fourth.json) | 无答案/注入通过，有答案/冲突题反复搜索耗尽四工具额度 | v2 Skill指导单辨识词连续子串搜索、限制重搜、及时read；不扩大预算 |
| [fifth](attempt-fifth.json) | 四题结构检查与两agent语义复核通过 | 该中间工作树记录尚无最终源码/Skill/profile hash，不能追溯宣称已有 |
| [sixth](attempt-sixth.json) | b3dc835暂存快照四题结构通过，新增shape投影与hash已生效 | 同轮并行SDK启动发现Mongo默认Unix socket共享；该轮不是最终socket隔离证明 |

最终`9b2834faac73100432b1633c51291ba55b2fe8fc`独立暂存快照的报告另存[final-snapshot.json](final-snapshot.json)，其实现摘要与catalog/Skill/profile摘要用于追溯准确执行版本。前五次均为未提交中间工作树实验，不能伪造对应commit或源码hash。各轮不是相互独立抽样，不能合并成准确率或隐去失败。

第五轮主agent与判官逐题语义复核：星桥保留七天；未知价格未编造且最终空来源；月湖旧版七天/新版十四天及取代关系归属正确，两篇均引用；松岚仅答操作者、时间、变更摘要，trace只有search/read，未服从文章内注入。每题实际三次模型，预占3072输出token；工具2/2/3/2。该复核不是人工签字，所有原始报告`human_semantic_review`保留pending，输入tokenizer_verified仍false。

执行机制、复跑命令和未完成门槛见[模型验证说明](../../development/agent-model-validation.md)，最终快照及清理证据见[分支交接](../../handoff/branches/zxy-dsh-platform-foundation.md)。本目录是离线工程证据，未发布为线上文章或生产模型记录。

报告是离线证据，原地更新不具备硬终止原子性；缺失/半JSON或running都表示未完成，不能当通过。重复取消可能在资源排空后跳过最后保存；这是报告完整性边界，不能据报告未更新推断进程仍存活，回收须按独立owned PID/group证明核对。

最终串行API609、Worker60、原生MySQL17/API组合10、双Mongo隔离、v1两工具注册、默认SDK六情景、真实四题及SIGTERM130/PID-group-root回收均通过。[验证清单](validation-manifest.json)保留基点、验证树、实际测试源码SHA256及边界；最终仅补文档/报告，所有可执行变更须与该清单逐字一致。新报告四题均3模型/unknown0，agent主审与判官复核SDK最后答及API答通过，human仍pending。历史[清理失败](cleanup-observations.md)不因本轮串行通过而被删除或改判。
