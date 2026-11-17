# 正式问答 API 的前端接线

2026-11-17，基点61608ea。总计划核对确认A已有40项管理员影子基线及local profile聚合盘点，不重复实现或读取业务配置。D还有实质接线缺口：正式capabilities返回mode=formal，前端只识别site并对其他已认证模式调用/local/session；正式来源是可信site_origin的绝对/blog链接，前端只保留相对URL，且GET/cancel尚未共用归一化。先补这条实际消费者路径，不重建插件框架或因此放行生产。

## 客户端边界

formal/site均使用原AuthStore正常Cookie/JWT/Redis会话与登录页，不调用合成会话/文章接口；只有明确fixtures，或历史兼容的缺mode且local_validation=true才使用合成入口。未知/矛盾模式失败关闭，不凭authenticated或陌生mode降级fixture登录。capabilities是展示投影，每次真正请求仍由原API授权。

来源统一在SSE、GET和cancel的客户端边界归一化。保留合法相对/blog/正整数ID及历史fixture路径；绝对链接只接受静态SITE_URL或当前浏览器origin，必须精确/blog/对应article_id、无凭据/query/fragment/反斜杠等歧义，再转站内相对路径。不能把API返回的任意origin当白名单，也不因后端配置为正式就接受外链。正文继续按纯文本渲染。

formal展示正常账号/登录/退出和公开文章示例；常见正式错误码映射为可行动的中文提示，不直接显示内部mode或诊断码。禁用准入不发送新run。登出、账号切换、卸载使旧scope失效、取消流/请求，旧能力/历史/终态迟到不能回填当前账号；同一个请求的401刷新重试仍用同一幂等key，不制造第二份运行。

同时核验原AuthStore的异步恢复：登出/清理或新的认证上下文开始后，旧restore/refresh响应不能重新写入用户或到期时间，旧失败不能清空新账号，旧finally不能丢失新promise句柄。同scope并发仍共享一次恢复/刷新。这里只约束客户端状态，不承诺撤回已发送HTTP响应的Set-Cookie或服务器全局认证事务；原后端会话规则不变。

## 实证与协作

root负责AuthStore先复现再修、独占三库/真实固定SDK/原正式API的消费者合同导出与安全fixture、浏览器实际渲染、适当完整门禁、博客/证据/交接及中文本地保存。coding仅负责blog-qa-api/useBlogQa/BlogQaPage及就近测试；判官实现后只读复审。模式/来源/异步账号拒绝路径要证明修前失败、修后通过，不能仅靠类型检查。

消费者合同从维护的当次独占MySQL/Redis/MongoDB、原public/private路由、真实AuthManager会话、mTLS和固定SDK取得合成成功/取消的实际capabilities/SSE/GET/cancel JSON；站点来源在测试构造时显式固定为canonical SITE_URL，不事后修改返回。只导出合成问题/答案/公开来源和固定状态，绝不导出Cookie、服务/run token、TLS文件或任意异常。前端用同一份实际合同做消费与浏览器回放，并清楚标为合同回放；不把它冒称已切换当前站点、正式生产登录或在线浏览器三库全链路验收。

现有3030/8032/3033不停止或切profile，不读key/业务.env/config或旧测试账号资料，不调用供应商，不触旧live runtime/失败证据根，不推送/部署/发布，保原80dirty/主handoff原210加1删。SDK仅离线缓存准备，不部署本地模型。新contract维护入口独立复用原owned DB/Popen清理，不改原Linux payload/CLI或重跑已终态VM。任何清理未知保证据并失败，不从文件收养PID。

按sun-world-blog→design同题评估博客04/05，说明历史已保存但消费者还须正确恢复会话与来源；分类/标签/稳定ID保持，现有两图足够则不加图，桌面/手机实渲并记录未发布。新页面slots、生产接线/容量/TLS、官方Linux四题/人工/模型版本与其他运维门槛仍独立待，D/P1/A–D不因本轮完成自动通过。后续Claude Code/claude-ds先读本文和最新分支handoff。

## 2026-11-17 本地验收 checkpoint

formal/site分流、所有读取路径的来源归一化、AuthStore认证世代与问答运行世代已实现。新发送在网络响应前使旧运行操作失效；同账号旧cancel成功/失败、恢复成功/失败、刷新失败均不能覆盖新问题，退出或新登录也不能被旧restore/refresh回填。判官独立复现的两项P2已修复，18项hook测试和五种交错复核通过，无剩余确认阻断。

新增维护入口 `scripts/test-agent-web-contract.py`，显式复用原独占三库、固定SDK与原路由；只输出安全合成公开合同。成功/取消各1次SDK，模型请求3/1，ACK及fixture清理全通过，供应商请求0，总9.263秒。fixture与实际报告JSON值相等，canonical来源未经导出后改写。producer308项源码运行后核对一致；前端连同新单测共318项摘要见[实证](../evaluations/agent-formal-web-2026-11-17/README.md)。不是生产HTTP密码登录验收。

API938通过；完整Web的contracts6、AI UI25、Web264、类型/构建/SSG/manifest通过，但最终CSS gzip预算仍失败，整个Web gate不通过。无其他未提交源码的非Git临时快照64项及类型检查通过，之后仅一份测试文件Prettier换行调整，16项复验通过。根format的本轮测试格式问题已修，原素材manifest失败保留，不调整预算或其他任务素材。

实际组件、Hook、AuthStore与实际导出合同的浏览器回放覆盖1280/390两尺寸、匿名/恢复/发送/取消共8场景；引用站内化、无fixture登录和local请求、无溢出。正常session port以合成状态替代，禁止其他HTTP，不将合同回放称为浏览器在线三库全链路。临时SDK runtime与源码快照核inode/无打开文件后移除，已有3030/8032/3033均200。博客04补两段恢复边界，后端/原三标签/7稳定ID/两透明图保持，桌面手机实渲通过，未发布。下一步继续D有限slot/contribution及其卸载/错误隔离，生产和人工等独立门槛保持。
