# C3 会话当前读与一次性 MySQL 验证

日期：2026-11-15；基点6bd6a44。本轮完成正式运行的会话授权适配、事务隔离/池边界和真实MySQL首批验证。没有注册正式HTTP或派发Worker，现有SQLite入口不变；没有读取业务配置、连接共享数据库或执行生产DDL。

## 当前读与锁顺序

正式Ledger/Gateway统一使用`ledger.unit_of_work()`，传`isolation_level='READ COMMITTED'`。MySQLUnitOfWork在首条操作之前执行仅针对下一事务的SET TRANSACTION；不设置SESSION/GLOBAL，不改变旧业务默认隔离。隔离值为固定allowlist，设置失败会释放连接，复用UOW时重置commit状态。

授权账户/角色使用同UOW单条非锁定LEFT JOIN，只投影用户ID/status和角色code，避免查询密码、联系方式或resource。accept保留用户→run的幂等锁顺序；持run锁的其他操作不反向锁用户行。RC下后续语句能看到已提交的角色/禁用变化，依据见[InnoDB隔离说明](https://dev.mysql.com/doc/refman/8.4/en/innodb-transaction-isolation-levels.html)；单事务设置的作用域见[SET TRANSACTION](https://dev.mysql.com/doc/refman/8.4/en/set-transaction.html)。

来源重验也必须复用连接：RunGateway新增必需`source_reader(uow,principal,article_id)`，blog.public的`create_public_tools(uow,content_db)`支持同连接元数据/标签读取；不在最终事务中拿原业务pool再次借连接。源正文仍经原Mongo服务读取，跨MySQL/Mongo不是原子快照。

本方案只要求每次观察到的撤销被拒绝，不承诺Redis与MySQL之间的全局原子撤销排序；P2敏感写入仍需独立授权版本与同事务栅栏。

## 已有认证的适配

SessionAuthenticator支持可选uow；AuthManager未传uow时保持原路径，传入时要求RC并调用UserManager.get_auth_context。JWT/Redis令牌校验及family/device规则复用旧实现，没有第二套登录。

RunSessionAuthorizer.bind在事务外用正常会话验证绑定可信run；每run仅在有界内存保留已验证token/reference（最大128项、TTL最多60秒）。gateway调用时在当前UOW重新验证Redis现存会话、当前账户/角色与run owner/family/deadline；同family刷新可继承，更新token不延原TTL/deadline。过期、缓存丢失/API重启模拟、不同family/device、依赖故障、并发revoke/close都失败关闭，不凭账本hash重建登录。repr/异常不显示token；旧黑名单日志中token前缀已去除并回归。

RunAllowlistPolicy只接收服务器的正整数名单，默认要求当前admin角色，并限制sun-world/blog-qa；可显式配置普通登录名单，不给Agent写权限。C3后续组合根须注入这些适配，不能继续使用测试回调。

## 一次性数据库工具

```bash
apps/api/.venv/bin/python scripts/test-agent-mysql.py --mysqld /absolute/path/to/mysql/bin/mysqld
```

该启动器不下载/安装软件，不读应用YAML、env文件或凭据，不提供host/database/socket覆盖选项。它为已经验证的本地binary创建新临时datadir、Unix socket和nonce marker，用`--no-defaults`、`--skip-networking`、`--mysqlx=0`与最小环境启动；目录私有、只在自建Unix socket上以空密码测试root连接，不注册系统服务。测试进程先复核nonce和实际`@@datadir/@@socket/@@skip_networking`，之后只在该实例创建随机测试库。

数据库子进程buffer pool为64MiB、redo为32MiB，关闭performance schema/binlog；不把它当性能或容量样本。正常结束/测试失败/SIGTERM或SIGINT都会停止自己创建的mysqld并清理临时数据目录。不得把脚本改成指向业务MySQL进行验收；它不是生产迁移工具。

独立集成目录`apps/api/tests/integration/test_agent_mysql.py`由此命令显式discover，不混入默认无数据库API gate。缺少启动器证明时测试skip；测试库只在已验证的自有实例中创建/删除。

## 已取得的证据

使用[官方MySQL 8.4下载](https://dev.mysql.com/downloads/mysql/8.4.html?os=33)的macOS15 ARM64压缩包8.4.13：

- 文件：mysql-8.4.13-macos15-arm64.tar.gz；官方MD5 `73926da59774274b5cdfe78cd2150840`匹配。
- 本地SHA256：`f324f8950e24d4147470bbc6a6ef0b90ef93b91d3fc74154b3d2ba085b44912a`；codesign --verify --strict通过。
- 下载/解压仅保留在ignored `.tmp/mysql-test-runtime`作为复跑缓存，没有Homebrew安装或系统服务；所有运行数据目录和PID已回收。

真实MySQL **13项测试通过**：中央28表DDL、并发accept/claim唯一赢家、RC重复读观察新提交且后续普通RR不泄漏、单连接空RC及首SQL前异常退出不污染下次默认、receipt/JSON历史同事务、取消完成竞争、最终状态失败rollback、真实unicode_ci别名隔离、JWT/family刷新后撤角色、最终来源重读期间禁用账号后拒绝答案、API内存丢失模拟与过期reconcile不重派，以及实际INNODB_TRX确认B处于LOCK WAIT时A仍能用两个连接完成账户/来源重验。另用真实公开博客工具facade验证元数据/标签查询不借第二个连接，正文为合成Mongo适配。

信号实验：等待mysqld ready后向启动器发SIGTERM，退出130、owned server PID不存在、临时datadir不存在。未通过删目录替代进程回收。

默认API gate **518项通过**；新增会话适配10项、UOW7项（含旧3项）和旧auth/核心策略回归通过。Redis仍为合成StatefulRedis，JWT使用真实AuthManager/jose；没有真实Redis、真实模型、正式SDK派发或Linux隔离验收。MySQL只验证8.4.13/macOS这组环境，不声称旧版本/其他配置等价。

## 后续

继续C3 dispatcher/router与版本化Worker协议、真实Redis/SDK链路、未知派发/断流/重启端到端；数据库进程崩溃/恢复和提交确认丢失的真实故障矩阵仍待完成（本轮API重启仅用新authorizer模拟内存丢失，未杀应用进程）。B的Linux/PID/token/TLS另行放行。保留原有素材格式/CSS预算问题；上述通过不代表全仓root gate、C3或A–D整体完成。
