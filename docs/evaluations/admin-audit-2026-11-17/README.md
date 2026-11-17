# 管理变更同事务审计与Linux源码包兼容实证

日期2026-11-17，基点2dc4d58e3749f0e0ad49b45e9111ab73ec715044，按[协议](../../development/admin-transaction-audit.md)为9项已接近期认证的HTTP维护写入提供同库变更记录。只有owned临时库与VM，未访问业务库、账户、密钥或官方模型。

## 原行为、实现与源码绑定

[before.json](before.json)绑定原8源SHA：真实MySQL/Redis/AuthManager/Cookie的九写成功，库中没有审计表。额外`/user/2oops`在该严格MySQL DML模式返回500、目标2仍启用；未复现误停账号，新422是写前明确校验，不能编成原版本误停用漏洞。

新增兼容表admin_change_audit，只有actor/会话请求hash引用、固定动作/目标、影响行数及UTC记录时间。9handler显式传server context，同一UOW执行业务与audit；六表齐全且InnoDB才DML。实际无变化不伪记；绑定替换可记录0行完成动作，清历史失联关联也按实际DELETE数记，主对象不存在的原返回保留。内部audit=None路径仍未迁移；context不是服务层授权凭据，request_ref不是不可伪造身份。

最终21源/测试/合同/CLI的source-only树 **2b3426264d34563a9ddfd7888e6a6c2c8e404989** 与working/index逐字匹配，见[source-set.json](source-set.json)。Mac数据库验收运行于17源树dbbb1e493f76a67c21f974520c04efb591a0ea80；其后只补4个Linux宿主打包文件，17源字节保持。完整API最终在21源树运行，不把提前快照伪称后来运行。

## 数据库与API验收

原日志保留ignored `.tmp/admin-audit/`，精确耗时/日志SHA/执行树见[results.json](results.json)。

| 检查 | 结果及范围 |
| --- | --- |
| 完整 `corepack pnpm check:api` | 最终991/37.071秒，exit0；含新审计16、最终归档13与全部既有API单元/契约检查 |
| 新 `scripts/test-admin-audit-stack.py` | 16/2.542秒，真实owned MySQL8.4.13/Redis/Auth/Cookie/HTTP，零skip |
| 原近期认证stack | 12/2.425秒，旧时间/refresh不洗白/重新登录/注销等兼容，exit0 |
| 原正式两库stack | 24/17.347秒，实际MySQL/Redis/Auth/HTTP，Worker/model/article合成，exit0 |
| 原最后管理员/原MySQL | 16/0.596秒、33/6.104秒，内部None/兼容schema继续通过 |
| schema/deploy/OpenAPI | 31表279列契约、部署协议通过；新导出与既有OpenAPI JSON完全一致，见[比较](openapi-check.json) |

native16逐一核九动作actor/action/target/affected与一条记录；真实MySQL触发器在audit INSERT抛错时九业务写均503且五张业务表逐字回滚，表改名后九写拒绝、恢复后可成功，实际MyISAM拒绝。还验零变化/读取不伪造记录、空绑定记录、历史失联关联清理计数、重复关联第二INSERT失败回滚、非法目标422/前导零兼容、body/Header不改actor或带入业务值、最后管理员409不留audit、pool1无嵌套借连接。

并发用独立Cookie客户端/两个管理员，在实际业务SQL后、audit INSERT前设置barrier，确认两事务都到达才放行，目标和session_ref各归原actor。提交故障明确是边界注入：commit前异常两者都无；先完成实际commit再抛确认异常，两者都在但503，不自动重试或声称已回滚。不是物理断电、真实网络丢包或跨库事务验收。兼容DDL在旧结构仅产生一条CREATE TABLE，原数据不变，第二计划为空。

首次native16的唯一失败是本线程把build_plan的(actions,errors)元组当action列表；只修解包后16过。新离线审计测试另有无序frozenset注册路由的随机宿主失败，排序后coding三hashseed各16过、判官另三seed各16过，原保守动态遮挡gate不改。这些失败保留，不归因业务事务代码，也不把SQLite metadata stub当实际MySQL engine证据。

复现本机维护CLI需显式已有二进制，不下载或使用共享实例：

```bash
apps/api/.venv/bin/python scripts/test-admin-audit-stack.py \
  --mysqld /path/to/verified/local/mysqld \
  --redis-server /path/to/verified/local/redis-server
```

## Linux包与实际合成链路

集成发现最近新增3auth模块未在显式stack-sources中；API983通过不能证明guest可导入。明确加入admin_recovery/recent/admin_audit，声明223→226，stack-assets仅source合同SHA变化，其他字段/二进制合同和SDK版本保持，未广泛扫描工作区。最终宿主AST gate仅处理声明的src模块：普通包需祖先initializer、四已知namespace特批、from成员追溯到独立绑定/声明子模块、visited拒绝空转。不执行源码，不证明第三方/动态import或全部执行顺序语义。

复审先后捕获新gate的两个问题：任意祖先误当namespace/未知成员，以及ImportFrom别名为自己或空循环自证。补实际删auth/init、relative未知成员/namespace边界、自/互空reexport和真转导出后，最终archive13/13及判官独立13/两个原反例通过，无剩余确认阻断。原manifest/各缺3auth/缺真实init均被最终gate拒绝，见[字节绑定与负对照](linux-payload-binding.json)。

使用既有67缓存资产、不带official标志两次实际VZ Linux运行，均协议49、资源/文件隔离9、网关5、组件真实固定SDK及正式三库/mTLS六场景通过、供应商请求0。完整第二次[原生报告](linux-native.json)保所有原字段，包括旧linux_per_run_isolation_verified=false；不补写此字段，不称全部隔离/官方四题或独立API进程重启已重验。

VM分别执行于1c58cd46db87facb74c5d6655d1c89023af82deb、058f06fcd5a57770cb08117ee257bab8947b42ba（当时宿主checker仍有后续发现的静态P2，但实际完整guest没有漏initializer/成员）。最终修订只在不进guest的宿主gate/test，故不重复相同VM：独立确认两次273条payload SHA及67资产完全相同、最终全部226声明源逐字匹配原生payload，再用最终gate对这些相同字节通过。不得把后来host代码说成已在早先VM执行；三库/SDK实际guest与新静态gate是两层证据。

一次VM相对路径参数被admission直接拒绝，未创建资源/报告；改为绝对路径才运行。两次正式运行均host stopped/completed、owned_groups_gone/private_run_root_removed=true；无付费或代理变更，旧official失败门槛保持。最终字节绑定脚本最初reader漏allow_empty关键字而拒绝，修正契约后正/负对照都实际执行，未改生产。

## 博客、交接与限制

按sun-world-blog→case-study同题修订[管理员案例](../../blog/2026-11-17-last-administrator-transaction.md)，后端/架构笔记、权限管理、数据库事务。原5ID保留，新增audit共6章/10重点；新增透明同事务/三结果关系图，原最后管理员图原样，博客03同步边界链接。1280/390明暗实渲人工查看、双图360/约342px、无缩进/溢出/双星，DOM数据在[desktop](blog-desktop.json)、[mobile](blog-mobile.json)和[dark](blog-dark.json)。预览 http://127.0.0.1:3033/.tmp/admin-audit-blog-rt8gsmsg/index.html ，自有非Git稿件目录留查看；dirty Markdown/CSS非完整Web验收，未发布。

报告可定位13个owned MySQL/Redis根已终态删除/独立ps无引用；两次VM原生资源回收确认；原3030/8032/3033均200，旧live/failed roots、Linux缓存资产和密钥未删除。diff和任务JSON格式过，根format仍仅原素材manifest失败，原两处工作区UI问题保持；本轮无Web生产源改动，不重跑310或完整Web，更不把API991当站点全绿。

原80/展开123状态与main handoff原210加1删保持，只中文本地保存，不推送部署。此轮仍不是完整权限迁移或防篡改审计：服务层可授予范围、拒绝/失败尝试、历史查询/前后授权快照、独立DB权限、容量/归档/保留/去标识化/备份恢复与生产目标盘点仍待。生产先DDL；若回滚到不支持审计的版本，须停九写/核在途或限定最低版本，不能只保表却继续未审计写入。P1/A–D、官方四题/人工/模型版本门槛保持，Clash只复用不配置。
