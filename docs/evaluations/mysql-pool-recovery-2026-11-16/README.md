# 数据库恢复后，原连接池仍可工作

基点402b14d，本机macOS arm64，只使用owned Unix socket MySQL和合成数据。修前旧池在补建失败后丢失位置，queue耗尽，即使真实数据库已恢复也不会再调用factory。修后位置与物理handle分开，空位在后续独立checkout恢复；旧idle探活在任何业务SQL前失败时可受控新建一次。SQL/COMMIT发出后仍原样失败，不重放写事务、不重跑Worker、不退预算。

## 权威证据

| 检查 | 最终结果与范围 |
| --- | --- |
| 修前纯离线 | 一个位置耗尽、factory2次，恢复连接从未被尝试；[安全投影](before-offline.json) |
| 修前真实MySQL | actual SIGKILL、两连接失败/queue0、原datadir/socket/UUID恢复后同manager仍失败，owned回收；[安全投影](before-native.json) |
| 同池原生恢复 | 固定4题、5次真实SIGKILL/重启、零skip、6.384秒；原manager及ledger不替换；[结果](native-pool.json) |
| 原八题崩溃矩阵 | 8题/8次真实SIGKILL，零skip，10.191秒；原unknown断言保留；[结果](native-lifecycle.json) |
| MySQL迁移/事务回归 | 29项、4.086秒，通过 |
| MySQL/Redis/Auth/ASGI栈 | 19项、15.890秒，通过，含历史删除/真实LOCK WAIT/Redis回收 |
| 真实固定SDK整栈 | 六个合成场景通过，真实三库与双向mTLS；无供应商调用、无Linux验收 |
| 完整API | 758项、28.414秒，通过 |
| 独立review | MySQL离线35、launcher6通过；三条close中断P2原复现修后通过，无剩余确认阻塞，未独立运行真实DB/SDK |

四个pool场景包含：两轮停机/恢复与并发容量，8线程的32次请求只使用池内两条物理连接，恢复后未提交UOW仍回滚；admission提交前断开无半条历史且无自动重放；实际提交后ACK丢失，恢复后按原键只查到一个run/问题；输入16384预占已提交后ACK丢失且数据库持续不可用，无生成请求，恢复后仍保留预算，过期只对账为中断。这里上游计数/生成响应均合成，ACK丢失为connection.commit返回后的确定性注入，数据库进程故障为真实SIGKILL。

## 中间失败和修复

首个正常pool四题已通过，但独立review确认三种driver.close抛KeyboardInterrupt的离线缺口：close批次丢后续handle、reset状态无法收尾一直busy、borrow把未确认handle当空位而可能增加物理容量。最终批次保首错继续其他handle，独立收尾后传播；PendingClose持续占原位置/registry，确认关闭前不factory。close是拒绝新工作的终态，已借UOW由原持有者结束，不能用close返回代替排空。

原lifecycle首轮8题有1项失败：数据库立即重启后，新的unknown结算遇排队旧idle探活失败，旧oracle要求unknown却留下reserved。保留oracle，修为业务SQL尚未执行前可确认关闭旧handle、一次受控factory替换。新factory后的ping再失败不二次factory，yield只有一处，SQL/COMMIT后的错误不进入准备分支。最终原八题全过；持续停机的pool预算题仍保留reserved，明确结算也不可用而不授予重放。未将中间失败覆盖成最终成功日志。

三条关闭中断只证明离线driver故障边界，不声称实际MySQL常见频率；原生报告不包含这些中断。这里确认“连接已失效且补建失败→位置丢失”的因果，不反推旧代理/清理或某条历史warning最初为什么出现。

## 来源、资源与边界

[最终检查和67项源码摘要](validation-manifest.json)对应执行源树ddb018ea1d80f09531e569e0a1781facf7e60b24；[开发契约与命令](../../development/mysql-pool-recovery.md)说明default lifecycle与显式pool范围。源代码变化只涉及通用MySQLManager、factory测试子类和故障验证，不改业务schema/授权/模型协议。原始日志及监督driver仅留ignored `.tmp/mysql-pool-recovery`，未提交运行根、PID、业务数据、凭据或环境值。

fresh SDK只用592缓存包，下载0，17个Worker源码与prepared资源及index一致；六情景结束后prepared runtime已删，MySQL/Redis/Mongo及SDK私有根归零，既有3030/8032站点与3033正文预览保留。root-script、api:deploy-schema、七文件Python AST、scoped diff和本轮JSON格式通过；根format只报原有`docs/content-sources/csdn-qq-42345136/manifest.json`，不宣称root/Web全绿。

博客04补三个连接生命周期段落，后端分类与原标签保留、两张透明图保留，无新增重复图。1280/390视觉/DOM预览通过、7稳定章节、25处strong、0px缩进、无残留双星或横向溢出，未发布；预览仍用dirty renderer/CSS，非完整文章页验收。

本轮不推送部署发布、不操作业务库、不调用供应商。Linux硬隔离/未知孤儿/旧锁、断电/跨版本/目标业务库和备份恢复、长期账本容量、全账号/备份日志政策、人工语义/上游版本策略与生产TLS仍独立未完成，P1/A–D及持续goal不整体放行。
