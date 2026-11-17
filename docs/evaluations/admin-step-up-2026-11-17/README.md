# 管理写入近期认证：本地实证

日期2026-11-17，基点319b527eab676857ecceb41ecc711355423c2daa，遵循[近期认证协议](../../development/admin-recent-authentication.md)。只使用owned/socket-only MySQL8.4.13、Redis和合成账号；真实AuthManager、签名Cookie、HTTP处理与业务manager。未导入生产应用lifespan或配置，未调用模型。

## 原行为与切换边界

[before.json](before.json)绑定原5源SHA：700秒前初次认证、access仍有效的管理员通过真实Cookie HTTP创建角色，201且新增1行；signed string/float认证时间也被原getter接受。早期基线脚本两次误用Redis fixture helper名，在业务测试前失败，修正为既有`verified_client(environment)`后才取得该结果，不算产品失败。

本轮明确切换2项用户、4项角色、3项resource维护写入；旧40个require_admin依赖仍全在，其余31项和管理读取保持原规则。新守卫先旧管理员、再同access Cookie的当前Redis和严格初次认证证明；默认600秒、共用identity原60–3600配置范围，陈旧403避免Web把它当过期access自动刷新重放。未新增用户更新/角色分配HTTP入口、恢复入口、细粒度授权或Agent写工具。

最终15源/测试/CLI与source-only树 **04211c8b34de3e5f492f2fe37b68194537d857c4** 逐字匹配，见[source-set.json](source-set.json)。完整API在该冻结树运行；native12、旧stack24与负对照在前一树7b697ec21f878e2bc9b3ea2269e7e32fb3e20faf运行，两树只差新schema单测隔离，所有生产/native/CLI字节相同。初步native11在冻结前探索，不用它代替12的最终覆盖。

## 结果与发现

原日志保留ignored `.tmp/admin-step-up/`，精确耗时、SHA及执行树在[results.json](results.json)。

| 检查 | 最终结果 |
| --- | --- |
| 完整 `corepack pnpm check:api` | 967/39.667秒，exit0；含新14与原近期/管理/身份关联/上传/应用生命周期等测试 |
| `scripts/test-admin-recent-stack.py` | 12/1.864秒，零skip，真实两库/AuthManager/Cookie/HTTP，exit0 |
| 原 `scripts/test-agent-stack.py` | 24/16.893秒，真实两库/认证/HTTP，Worker/model/article合成，exit0 |
| Web工作区单元 | 72文件/310项/15.76秒，exit0；含新增403不refresh且不replay断言，HTTP生产源未改 |
| schema-only门禁与新导出 | 实际40+9集合；新导出与既有OpenAPI JSON完全一致，见[比较](openapi-check.json)，未覆盖原契约文件 |
| 复审 | 判官独立14及12类内存整轮过，测试隔离再次同进程核模块身份，无剩余确认阻断 |
| diff / 格式 | diff过；根format仍仅原内容素材manifest失败；任务JSON/TS定向格式通过 |

native12覆盖九路陈旧拒绝且5张业务表逐字不变、九路近期实际写入、六个管理读取兼容、普通refresh继承旧时间、真实密码登录恢复写入及注销旧Cookie拒绝、禁用/撤角色、匿名/普通用户、Header/body时间不能替代Cookie、proof类型、配置及注入依赖失败、原三个最后管理员409。依赖失败通过边界注入，不声称停掉真实Redis/MySQL或测过灾难恢复；此fixture不装完整CSRF中间件，不是整站浏览器或真实SDK E2E。

复审确认P2：旧refresh将null交给签发默认值而取当前时间，string/float又被int转换；新getter虽拒绝，普通刷新却能洗成合格proof。现原正整数且未来不超过60秒才原样继承，其他归0，普通legacy刷新可继续而近期维护仍拒绝。native真正镜像signed access+refresh两份证明，missing/null/string/float/bool/0/负/远未来均检查前403→refresh200且proof0→后403与五表原样；不能仅改access、让另一个有效refresh掩盖问题。

负对照仅在独立owned子进程内从基点AST恢复旧refresh函数，其他新源保持，新增case实际1项/6子例失败（null/string/float洗成有效时间，及其他无效值未归0），driver确认预期suite exit1后正常收尾。没有改回仓库源，也不把6个失败全说成获得近期权限。仅合成的已签名且仍活动的异常token，不是客户端可篡签名的证据。

首个完整API967为2fail/9error：新测试同进程调用schema exporter，后者把runtime模块替为schema stub，污染随后应用配置/生命周期/上传测试。修复只把该schema测试改为30秒上限独立子进程，仍要求实际40+9集合通过且父app_instance身份不变；没有改exporter、生产App或旧oracle。随后同进程相关34/34、判官14/namespace复验及最终完整967均过。原失败日志与执行树保留，不冒称首跑绿。

复现新维护命令需要已有本机二进制，不下载、不接共享实例：

```bash
apps/api/.venv/bin/python scripts/test-admin-recent-stack.py \
  --mysqld /path/to/verified/local/mysqld \
  --redis-server /path/to/verified/local/redis-server
```

## 博客与资源

按sun-world-blog→case-study修订[原管理员事务案例](../../blog/2026-11-17-last-administrator-transaction.md)，不另建进度稿；后端/架构笔记、权限管理、数据库事务。新增近期认证一节，保原4个ID、共5章/8重点，补合成签名及活动Redis前提；博客03只同步边界链接。沿用原透明多入口事务图；新增刷新类型转换是单点因果，正文足够解释，不增加重复流程图。

1280/390明暗实渲及[desktop](blog-desktop.json)/[mobile](blog-mobile.json)/[dark](blog-dark.json)：无缩进、双星或横向溢出，SVG360/342px。最初新增段落滚动后截图未等绘制而空白；只改ignored观测器为instant滚动、双帧等待与段落viewport断言，重新截图并人工查看，未改前端源/CSS。预览仍使用dirty Markdown/CSS，不是完整Web门禁；当前原2处UI违规保持，未用310单元声称整站绿色。

本地预览：http://127.0.0.1:3033/.tmp/admin-recent-blog-r4iyo_3q/index.html ，自有非Git目录留供查看，旧预览不覆盖。稿件未发布。报告可定位的9个owned根在fixture终态后移除，独立ps无引用；原3030/8032/3033均200。未动旧live/failed roots、Linux缓存、密钥、模型目录或Clash Verge，不新增代理。

原80/展开123状态、主handoff原210加1删保留，只中文本地提交；不推送部署。阶段A/P1/A–D未整体完成：剩余可授予集合/细粒度能力/完整审计、生产目标盘点和真实恢复演练，官方Linux四题与人工/版本决策仍独立待，不恢复付费复跑。
