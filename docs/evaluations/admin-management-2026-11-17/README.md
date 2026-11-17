# 九项管理服务与事务授权复验

2026-11-17，`zxy/dsh-platform-foundation`，承接dd71144。按[协议](../../development/admin-management-service.md)实施，本地开发、review、验证与中文保存；无推送、部署、发布、真实供应商调用或代理配置。

## 实现与基线

原manager是受信任内部持久化路径。实际owned数据库的[基线](before.json)确认：不带证明可内部创建角色，格式合法的audit也只负责归属记录。这不是已经证明的外部入口绕过；旧HTTP管理员/近期/audit守卫原样保留。

新`modules/management`普通包在public入口公开service/scope；九维护HTTP改调同一service。固定action→九identity能力，只映射当前规范化admin，限定sun-world及user/role/resource类型；严格业务schema不接受caller角色、owner或授权callback，audit必须匹配当前actor/session摘要。当前未实现细粒度可授予集合，也未开放Agent写工具。

初次短RC权威鉴权结束后才做业务准备；实际写UOW在六表InnoDB检查后，按roles目录→actor users→现有user_roles锁定，再通过同一连接重读活动会话、status=1与当前角色并复验能力/目标。DML和audit共用事务，实际commit前再次检查Redis活动与认证时间；保护型路径在last-admin检查之后、commit之前执行。账号与角色主动自降权使用已锁定的前置Principal，另有启用管理员时正常提交；最后管理员仍409。

锁持续到commit，协调参与协议的数据库撤权。Redis最后检查与MySQL commit没有跨库事务，之后的注销仍有竞争窗口；内部raw None路径也没有被全局禁用。不能据此放行未来Agent写入、跨项目代办、全量管理迁移或生产恢复。

40旧guard、9近期、9audit、9service接线精确门禁，并验证execute固定action及实际注入的service receiver；四负例覆盖错receiver/错Depends/unused服务参数/错action。[目录对照](catalog-delta.json)核原blog模块、两工具、输入输出schema、产品Skill逐字段不变，只增无tools/skills的identity-management及重算bundle摘要。

## 冻结与验证

[33项源码及摘要](source-set.json)的source-only tree为`faab9674b3c4c6e2e9020f7e6cdd5a43cfb7bac6`，后续只补文档；最终工作字节、暂存与review核对一致。完整结果和原日志SHA见[results](results.json)，原日志保留ignored `.tmp/admin-management/`。

| 验证 | 结果 |
| --- | --- |
| 完整API门禁与单元 | 1007 / 38.676秒，exit0 |
| 新owned MySQL8.4.13/Redis7.2.17/Auth/Cookie/HTTP及direct service | 19 / 3.347秒，零skip |
| 三类真实撤权锁等待，每类三次 | 9 / 1.531秒，指定thread确实LOCK WAIT |
| 原同事务audit | 16 / 3.444秒 |
| 原近期认证 | 12 / 2.286秒 |
| 原最后管理员MySQL | 16 / 0.555秒 |
| 原MySQL | 33 / 5.590秒 |
| 原两库/Auth/HTTP协议（合成Worker/model/articles） | 24 / 16.666秒 |
| 独立只读review | 新service16及40+9+9+9门禁、源码/目录/包绑定通过，无剩余确认阻断 |
| schema/deploy/新OpenAPI | 31表279列未变，deploy协议通过，[新导出](openapi-check.json)与既有JSON相等 |

新19项在没有HTTP guard的直接service调用中核九正常和九动作各自的无凭据/普通用户/陈旧拒绝，另核失效/伪Principal/claim角色/伪audit/未知action和scope、未知业务字段、status2、初次及最终依赖故障。业务前可见角色/绑定/停用撤销拒绝；业务和audit后注销在普通路径与三种保护型路径都回滚；认证窗口过期也回滚。pool1创建用户无嵌套借连接，另有管理员时自停用、本人角色改码与删除均可提交。旧audit真实触发器九路回滚、缺表/MyISAM、commit已成后丢ACK不重放等保持。

三种并发测试在实际DML/audit后暂停，让另一连接改角色、停actor或删actor绑定，强制观察该thread的InnoDB LOCK WAIT，再释放并核当前201、撤权完成、下一请求401/403和唯一audit。首次17项诊断过；扩为19后的首轮只在status等待观测失败，未确认偶发初因。仅把宿主采样从0.03秒改为原恢复测试已用0.15秒，并增加失败诊断，不改生产锁或降低oracle；纠正19、冻结19和额外三类各三次均通过。保留失败日志及摘要，不能写成已定位并修复生产锁缺陷。

原audit双actor测试的barrier移到进入HTTP之前：新共同目录锁本就刻意串行化DML，不能要求两连接同时持锁到达audit。仍同时发起两真实请求，核两笔事务、不同actor/session及目标精确对应。

## Linux包、SDK绑定与实际guest

六个新src文件（含initializer/public/manifest/policy/schema/service）显式加入source合同，226→232；stack-assets仅source合同SHA变化，其余固定依赖版本、合同与原资产未改。第一次prepare正确拒绝旧SDK封包与新catalog源码摘要不符，失败报告确认未启动VM且组/根回收。

使用既有Linux依赖树和原`prepare-agent-linux-sdk.py`离线重封，将原缓存其余文件APFS克隆到独立0700 cache视图；未执行Linux ELF、未安装/联网或替换旧缓存。[重封对照](sdk-reseal.json)确认选定源码仅catalog摘要改变、原Linux二进制摘要和其他缓存文件不变。[负对照](sdk-binding-controls.json)确认旧封包+新catalog拒绝，旧封包+原catalog通过，新封包+新catalog通过，没有放宽验证。

[完整V4原生报告](linux-native.json)保留全部字段：实际VZ Linux通过原49协议零skip、9隔离、5网关、组件固定SDK与正式API/三库/mTLS原6合成场景；真实SDK六执行、模型10次/工具4次均合成，供应商0。formal峰值113446912字节、512MiB/64task，原冷启动SIGABRT观察及旧`linux_per_run_isolation_verified=false`保持，不改写成全部隔离已完成。

[字节绑定](linux-payload-binding.json)核279 payload/67资产，232声明源均逐字等于实际guest；旧226合同及逐个缺六新模块均被最终门禁拒绝。相较上轮67资产仅SDK重封项变化。这里验证六文件装包/宿主导入闭包和原正式合成SDK场景，未逐个执行guest新service导入探针；**新九维护动作/撤权LOCK WAIT是在macOS owned库验收，未冒称已在guest重跑**。官方Linux四题失败/停止付费复跑的状态保持。

可复用新ignored cache运行，报告路径必须不存在：

```bash
PATH=/Users/zxy/.nvm/versions/node/v24.17.0/bin:$PATH \
  apps/api/.venv/bin/python scripts/test-agent-linux-vm.py \
  --cache "$PWD/.tmp/admin-management/linux-assets" \
  --report "$PWD/.tmp/admin-management/another-native.json" --stack
```

## 稿件、清理与剩余边界

按sun-world-blog→case-study同题修订[管理员案例](../../blog/2026-11-17-last-administrator-transaction.md)，后端/架构笔记、权限管理、数据库事务；原六ID保留，新增service章节共七ID/14重点。原两透明图已经交代事务和回滚关系，新锁顺序用编号文字解释，不增加重复配图；博客03同步服务边界。1280/390明暗实际渲染查看、无缩进/溢出/裸双星、图360/约342px，DOM见[desktop](blog-desktop.json)、[mobile](blog-mobile.json)、[dark](blog-dark.json)。预览 http://127.0.0.1:3033/.tmp/admin-management-blog-ode1l4ma/index.html ，本地草稿未发布。初次预览脚本误替换旧anchor、payload辅助脚本异常类型及source快照列表修正只影响宿主验收工具，记录保留。

19个可定位owned MySQL/Redis根终态删除且ps无引用，实际VM三库/组/私有根回收；既有3030/8032/3033均200。独立SDK cache视图及稿件preview保留供复验，旧缓存、旧服务与指定失败根不动。本次JSON格式检查通过，根format:check仍只报原docs/content-sources/csdn-qq-42345136/manifest.json；无Web生产源变化，不重跑全Web，原两处dirty UI门禁问题不动，不能把本文预览当成全Web通过。

仍待生产目标/权限与可授予范围盘点、完整审计查询与保留/独立DB权限、真实恢复/备份/TLS运营等独立验收；A/P1/A–D未整体完成。Clash Verge只复用现有转发，不配置代理；不部署本地模型，不推送、部署或发布。
