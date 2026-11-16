# OpenAI官方API本地接入实证

2026-11-16，基点cc42e9c。用户授权直接使用官方API及检查Clash Verge转发，不要求本地部署模型。固定gpt-6.1-sol、Responses协议、显式回环代理；运行凭据从ignored 0700目录中的0600私密文件读取，不向源码/提交/报告/应用日志或Worker传入值。协议与启动方式见[本地接入](../../development/agent-openai-validation.md)。

## 最终结果与失败历史

| 证据 | 结果与边界 |
| --- | --- |
| [模型目录](catalog.json) | 官方HTTPS返回200，选定模型可见；只保留最小安全投影 |
| [单次生成](smoke.json) | 输出匹配，154输入/6输出；上限256、store=false |
| [函数调用往返](tool-roundtrip.json) | 两请求183/20与231/11，固定read文章1，再根据合成正文回答七天；每次上限1024 |
| [首次浏览器](browser-first.json) | 正常登录、实际问答与来源41成功；刷新固定等1.8秒仍未恢复，检查记failed |
| [第二次浏览器](browser-second.json) | 独立新run首次模型回调约8秒后502/model_proxy_failed；没有上游首错，原因未定，不能猜测为网络/配额/计费/解析 |
| [最终浏览器](browser-final.json) | 新增安全诊断后，独立新run正常登录→实际SDK问答→来源41→刷新恢复通过；刷新改为最多15秒状态轮询，没有改页面、题目或预算 |
| [最终站点链路](site-transport.json) | 实际search/read各一次、模型回调三次200；正常launcher输出写repo日志仍启动成功，sandbox仓库读取/外网EPERM保持 |

三个浏览器记录都是独立显式运行，不是自动重放。保留前两份失败记录，不以最终通过倒推历史失败原因或宣称代理从不失败。诊断版尚未重现第二次模型失败；以后失败日志只记录固定阶段、HTTP status、已知类别和本模块源码行整数，不复制自由异常值、响应、headers、参数或推理，日志sink异常不替换主错。

正式传输经可信HTTPS DNS取得固定官方host的全A记录，再由原Provider全public校验及IP pin。自定义受限CONNECT只把已校验IP:443送到显式回环代理，再由direct TLS层保留官方Host/SNI和证书验证。没有关闭TLS验证、继承环境代理、跟随重定向或自动retry。目录探测先用固定官方hostname的普通代理HTTPS确认key可用；它不冒称IP pin证据，后续生成/工具/站点链路才使用受限transport。

## 代码审查与回归

- 最终API667项通过，Responses14项、CONNECT14项由独立判官复核；Worker71项通过，含Darwin日志FD回归；launcher协议和定向格式/空白检查通过。源文件摘要和验证源树见[清单](validation-manifest.json)。
- 强制指定工具却返回纯文字曾被空集合any检查漏放，独立判官实复现并修为必须恰好一个同名调用；none/required/parallel约束、历史call_id重用、完整usage/实际输出上限、phase丢失、取消排空与凭据文件边界均保持拒绝路径。
- 启动曾两次在sandbox负向自检native abort。最小对照确认repo日志FD继承2/2崩溃，其他相同条件只换/private/tmp日志或pipe为4/4通过；更早10个pipe/PTY检查未重现。只改probe用pipe、父进程转发，不改SBPL；没有声称定位具体内核syscall。新增回归让parent真实写repo日志并执行实际launcher片段，仓库读取和外网EPERM仍成立。最后完整launcher用repo日志实际启动通过。
- 真实浏览器1280/390无页面溢出、pageerror为0；模型标识来自当前服务，答案来源由实际读取记录核对。该入口使用现有开发SQLite及workspace前端，不是正式MySQL/mTLS V2整栈或已提交前端验收。

## 当前状态

本地站点3030/API8032继续运行，显式模型覆盖保存在ignored开发options，仅引用私密key文件和无凭据代理地址。独立浏览器与诊断临时目录已清理；本次启动所需SDK临时目录随launcher保留，停止launcher后回收。没有新增本地模型、修改站点模型目录、迁移数据库或开启生产准入。

博客05按sun-world-blog→sun-world-write-design补托管API计数、Responses工具/阶段适配与推理输出预算，后端及原三标签不变；5稳定章节ID、7处strong，1280/390正文预览通过。原透明预占图仍准确，图宽360/342px，不增重复图；使用dirty renderer/CSS，未发布。输入token预出网累计硬限、人工语义、模型版本、Linux硬隔离、旧库崩溃/journal留存与生产TLS仍独立待验收。本轮不推送、不部署，不以此放行P1/A–D整体。
