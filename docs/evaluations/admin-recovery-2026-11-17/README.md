# 最后启用管理员的事务保护：本地实证

日期2026-11-17；基点8d62886860406ceb5829438ad9f8ca95cf309b83。遵循[写入协议](../../development/admin-recovery-invariant.md)，只用合成账号与自有临时数据库；无业务库、官方模型请求、代理配置或生产变更。

## 原版本与最终源码

[before.json](before.json)绑定原 UserManager/RoleManager SHA 与真实 MySQL 8.4.13 复现：唯一管理员可停用为status0、角色可改名/删除、删除后留1失联用户关联；角色替换传[2,2]第二次插入失败返回false，但旧admin绑定已丢，只剩normal角色。它是服务层复现，不是已验角色分配HTTP入口或线上事故。该临时实例退出且根已删除。

最终8个源码/测试/维护CLI与source-only树 **03d570f349aaffac722e5f46465996fff22b87b4** 逐字一致，见[source-set.json](source-set.json)。5份生产源在全部本轮验收中未再改；扩展native后仅纠正离线测试名的匿名表述，未改断言，再冻结并重跑完整API及native16。未引入schema、恢复API或Agent写工具；原40项HTTP shadow登记及require_admin规则保持。

## 验证结果

实测记录、日志SHA和临时根确认在[results.json](results.json)。原始日志保留ignored `.tmp/admin-recovery/`。

| 检查 | 结果与边界 |
| --- | --- |
| `corepack pnpm check:api` | 最终953/36.022秒，exit0；含新增离线15，所有API门禁通过 |
| `scripts/test-admin-recovery-mysql.py` | 冻结最终16项全过，零skip，真实MySQL8.4.13，exit0；耗时见results |
| 原 `scripts/test-agent-mysql.py` | 33/6.133秒，真实owned MySQL，exit0 |
| 原 `scripts/test-agent-stack.py` | 24/17.371秒，真实owned MySQL/Redis/认证/HTTP，Worker/模型/正文明确合成；exit0 |
| 判官复审 | 无确认源码阻断；独立离线15过，空目录/规范化code修复补验。未把SQLite作为InnoDB锁证据 |
| diff / 根格式 | diff通过；format仅既有内容素材manifest失败，未修改或豁免 |

新增native覆盖status/delete、角色code/delete、整体角色替换、多个/禁用/Unicode空白角色、关联清理、实际SQL错误回滚、pool1、零目录拒绝后修复、改code修复，以及撤权持锁期间另一连接新建未绑定admin候选仍不能放行最后停用。

并发混合撤权：两个启用管理员，第一连接先取得角色锁并暂停在用户status更新前；第二连接整体替换另一管理员角色。必须实际观察 `INNODB_TRX` 的LOCK WAIT且第二future未结束，才释放第一连接；第一成功后第二重读并拒绝，最后用户状态/原admin绑定仍正确。原13首轮未捕获等待而失败，诊断复跑成功；采样20ms改150ms后保留原oracle，三次独立实例13/13过；扩展16及冻结16又各过一次。元数据刷新时序是首轮观测失败的推断，未证明根因，也未以放宽状态断言掩盖失败。

离线SQLite测试翻译MySQL锁/索引语法，只检查真实事务的功能与异常回滚。HTTP TestClient用替换的身份依赖验证三个固定409 envelope及非admin403，不声称实际匿名Cookie/近期认证/恢复账号验收。原stack24维持真实认证链路，不能与这些断言拼成新HTTP入口或真实SDK E2E。

复现维护命令需显式提供已有本机二进制，不下载或使用共享实例：

```bash
apps/api/.venv/bin/python scripts/test-admin-recovery-mysql.py \
  --mysqld /path/to/verified/local/mysqld
```

## 博客、资源与剩余边界

按sun-world-blog→case-study准备[本地稿](../../blog/2026-11-17-last-administrator-transaction.md)，后端分类，架构笔记/权限管理/数据库事务。为说明多个入口汇入同一事务并分流提交/回滚，新增透明SVG；博客03原管理迁移段只加案例链接。事实审稿修正了HTTP入口与服务层、方法失败与页面观察的两处混淆。

1280/390实渲检查：4唯一稳定章节、6重点、正文16px/无首行缩进、无双星残留或横向溢出；SVG360/约342px，明暗截图已人工查看。DOM数据见[desktop](blog-desktop.json)、[mobile](blog-mobile.json)和[dark](blog-dark.json)。预览使用工作区已有dirty Markdown/CSS，不是完整前端门禁；本轮无前端源变更，不重跑Web。前轮源码完整Web通过仍有效，当前工作区原2处UI违规与素材format失败保留。

本地草稿预览：http://127.0.0.1:3033/.tmp/admin-recovery-blog-norhds6u/index.html 。该自有非Git稿件目录留给用户查看，不新增/切换预览服务。博客未发布。

本轮日志定位的10个owned MySQL根均在fixture终态后移除，独立ps核无引用；原3030/8032/3033均200。未动旧live/失败证据根、Linux缓存、模型目录、密钥或Clash Verge。保留原80/展开123状态和main handoff原210加1删；只中文本地提交，不推送部署。

不变量只覆盖本服务参与协议的减少管理员写入；不覆盖外部SQL/旧服务。启用admin角色存在不证明凭据、近期认证、可授予集合、审计、生产目标盘点或真实人工恢复；阶段A与P1/A–D未整体完成，官方Linux四题失败和停止付费复跑保持。
