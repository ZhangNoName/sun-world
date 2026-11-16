# 官方四题人工复核材料

2026-11-16开始，2026-11-17收尾；基点59b018f。当前状态为 **pending，尚未收到明确人工结论**。本轮只准备忠实材料并询问用户，不重新生成模型答案，不修改原始评测报告或替用户验收。契约见[人工复核说明](../../development/agent-human-semantic-review.md)。

可直接查看[纯文本材料](review.md)或[本地阅读页](http://127.0.0.1:3033/.tmp/agent-human-review-20261116/index.html)。每题包含合成原文、原问题、实际API交付答案、原判据及实际来源文章ID/标题，覆盖有答案、无资料、版本冲突与正文注入。原评测时间为2026-11-16T11:11:08.682143+00:00，模型标识gpt-6.1-sol，不能把这次快照推广为之后每个版本的语义保证。

## 材料完整性

`scripts/prepare-agent-semantic-review.py`只读取两个固定、字节SHA钉住的入库文件：官方四题报告与合成数据集。SHA、四case ID和导出文件摘要在[导出manifest](manifest.json)；report内dataset、问题、case顺序、来源ID及标题全部匹配才输出。旧run UUID、失效localhost来源URL、模型trace、预算明细不进入材料，原始文件均未改。

三个导出物review.md/index.html/manifest.json与冻结exporter的内存结果逐字节相等；预览由现有Vite public目录原样提供，HTTP字节也完全相等，没有注入HMR脚本。HTML无脚本/表单/外链，CSP禁脚本和外部资源；伪system和攻击URL只按转义原文显示，不成为标签、指令或链接。Markdown用自适应代码围栏保留同样文本。无答案题明确是服务端固定兜底与空来源，不能据此证明模型原始末答拒绝编造。

正式导出：

```bash
apps/api/.venv/bin/python scripts/prepare-agent-semantic-review.py --output-dir /absolute/new/directory
```

输出目录独占0700、文件独占0600，源验证/内存渲染先于创建，不覆盖已有目录或symlink；IO失败不能称成功。导出只表示准备阅读材料，manifest的pending和页面标签是这份静态材料准备时的状态。后续收到明确用户结论时，另录其原文/范围/时间并绑定同一输入和材料摘要，保留原评测与这三份静态导出物，不由工具、默认选项、agent或等待时长替人通过。

## 验证与剩余门槛

API全量796项/30.743秒通过；coding与独立判官各9项离线通过，两Python AST通过、无确认阻塞。覆盖输入篡改/嵌入类型/四题错配/重复、来源标题、HTML/Markdown转义、身份/地址不投影、NOFOLLOW/FIFO/上限、权限/不覆盖、部分fsync失败无成功stdout和纯stdlib/无运行时依赖。独立复核未访问浏览器或额外环境证据；环境核对和页面验收由root执行，范围不混称。

阅读页1280/390均4卡/16字段与原件一致、无横向溢出，实际DOM脚本/表单/anchor/system标签均0，CSP脚本禁用；已视觉核对桌面与手机。root-script和定向JSON格式通过；根format仍只报既有内容manifest，未改该dirty，不称root/Web全绿。[验证清单](validation-manifest.json)绑定6项source/index及执行源树`eabd6b7f1632d7a284b8b0f45bd4d8156de92e8e`，材料不是新官方调用或人工结果。

[本机只读环境观察](environment.json)记录PATH、8个常见安装路径及5个本地socket候选：均没有可用入口；未安装/启动VM或联系远端daemon。只代表已检查范围，不断言整台机器没有其他Linux环境，Linux memory/PID/network验收仍false。

博客05同题补“原文/实际答案对照”和“导出不是人审”，分类后端，原架构笔记/Agent/DeepSeek Harness标签、5章节ID及透明预算图保留；9处strong，1280/390无缩进/双星/溢出、图360/342px。新增内容是材料对照的文字规则，阅读页卡片已直观呈现，不补重复图片；未发布，博客正文仍用dirty renderer/CSS预览，不代表整页构建验收。

未收到人工回复之前本门槛继续pending；即使这四题通过，也不等于一般正确率或生产准入。Linux、不可变模型/生产版本决策、生产TLS、目标业务库/备份和完整账号日志政策仍独立待验收，P1/A–D未整体完成。其他80项dirty与既有服务保持，只本地版本保存，不推送/部署/发布。
