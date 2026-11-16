# 合成旧结构升级与真实 MySQL 进程崩溃

本轮基点89df5ce，测试宿主为macOS arm64，MySQL为已验证缓存8.4.13。只用owned Unix socket实例和合成用户、历史、文章与模型；不加载业务配置、供应商密钥或生产快照，不更新现有站点数据库。接口与事务生产源码未改。

## 验证范围

| 组合 | 结果与边界 |
| --- | --- |
| 原生默认MySQL suite | 29项、零skip：原19项+合成升级8项+构造2项；新建实例内安装合成旧结构后升级，不是真实业务库快照 |
| 原生恢复suite | 固定8题、零skip、每题恰好1次SIGKILL；确认退出后同datadir/socket/UUID重启、禁TCP、flush=1 |
| 事务故障 | admission与completion提交前崩溃无半条历史；真实COMMIT返回后注入ACK丢失、实际崩溃重启，重查唯一运行/答案 |
| 模型预算故障 | attempt/input/observation提交后实际崩溃，不重放生成或退预算；上游为纯合成计数与生成响应 |
| 会话与租约 | 新授权器无旧volatile绑定，过期accepted失败/running中断，旧执行不可再领取 |
| 原生信号 | 初始化期间SIGTERM、关闭wait栅栏第二次SIGTERM；均130、PID/组/目录消失、无fallback |
| 独立审查 | 离线11项通过（signals5、实际报告入口4、升级构造2）；审查未独立启动真实DB |

旧结构只来自中央schema的deepcopy裁剪：无Agent表的业务结构，以及缺八个run预算列/四个call输入元数据列的结构。检查旧用户、字典外键、普通历史、Agent运行及observed/unknown调用原列逐列保持；新预算列0、元数据NULL，不猜测历史token。一次正式DDL成功、下一条固定非法SQL失败后，rollback不能撤销已完成DDL，freshconnection重新plan只补剩余项。五种不兼容列/索引/FK错误均阻止其余待建表动作，实际DDL和旧记录未变。

恢复阶段使用新API连接管理器；并未验证原在线连接池在无限停机后自动恢复。COMMIT回执丢失为确定性边界注入，数据库SIGKILL为真实进程故障；不能据此承诺主机断电、磁盘故障或一般网络故障恢复。输入case曾出现一次旧池replacement连接拒绝warning，最终断言通过；不抹去观察，也不将其扩称为已解决的生产连接故障。

## 报告与来源

- [八题原生安全投影](native-recovery.json)：固定场景集合、testsRun与逐题crash均受入口约束；无路径、PID、凭据或问题正文。
- [原生中断安全投影](native-shutdown.json)：两个实际mysqld阶段；监督driver/原始日志仅留ignored本地任务目录。
- [最终检查与源码摘要](validation-manifest.json)：摘要只覆盖列出的源，不能把旧官方模型或Worker全栈报告自动视为本轮结果。
- [开发与复跑契约](../../development/agent-mysql-recovery.md)。

初版入口在env设置前import导致8skip并失败，后修import顺序；第一次有效运行因测试清理复用已关闭旧admin连接报错，修为清理单独借新owned连接；升级首轮空fetchall的tuple/list适配断言失败后统一为list。判官另复现空矩阵零执行仍exit0，现固定8题、8次执行和逐题crash，四项实际CLI回归阻止空/缺题/skip/零执行误绿。完整API曾触发旧取消测试等入口登记便索引异步观察的竞态，现等观察记录，生产取消逻辑未改。中间日志保留为本地诊断，不覆盖最终运行。

本轮不重跑供应商四题或Worker SDK全栈，不修改主机时间/系统服务，不推送、部署或发布博客。目标业务库迁移/备份恢复、断电/跨版本/Linux、未知孤儿/旧锁、历史及账号删除政策、生产TLS、人工语义仍独立待验收，持续goal未完成。
