# 角色资源整组替换引用验收

2026-11-17，本地分支`zxy/dsh-platform-foundation`承接8d72504，按[协议](../../development/admin-binding-references.md)实现、review、验证与中文本地保存。上一goal turn为有状态进展；当前仍推进阶段A目标边界，资源菜单不当作能力grant存储，不新增授予API/Agent写工具。

## 真实基线与最终行为

[owned MySQL/Redis/Auth/Cookie/HTTP基线](before.json)核原版本：已授权管理员把role999绑定resource1、role4绑定resource999、资源0/负数均200并实际保存失联/非法引用；true/'1'被coerce为1后200；重复[1,1]触发唯一约束503并回滚。未使用业务库，也未把已授权坏引用称匿名绕过。

绑定schema现在是strict list≤500、strict正资源ID≤2147483647，按首次出现去重，允许空清空，500限制先于去重。角色target仍沿既有统一signed64格式检查和实际存在核验，不修改其他动作。服务复制成frozen BindingReferences及tuple；私有hook在原actor授权/锁定后、任何绑定DML前，使用同RC UOW锁读role和按主键升序的全部resources，缺任一统一404 MANAGEMENT_REFERENCE_NOT_FOUND，不删旧绑定、不追加audit。manager接收同一个tuple，caller改原list不能改变检查/写入集合。

首次契约生成捕获signed64上限经FastAPI/OpenAPI转float舍入到2^63。实际resources.id与role_resources.resource_id均signed INT，因此把资源上界收紧到物理列2147483647；[独立最小反例](int64-schema-counterexample.json)重建此转换，精确大整数以十进制字符串保存，未冒充保留了首份全量生成物。真实MySQL实测该最大值绑定成功、下一值422，未迁移/扩大字段。

[契约对照](contract-delta.json)核新生成OpenAPI只有BindResourcesModel资源item边界与description语义差异，TS只有相应注释；全部其他paths/schema、catalog原字节/两个工具/产品Skill/bundle不变。[fresh导出](openapi-check.json)与当前契约JSON相等，schema仍31表279列、deploy协议通过。正常整数数组/URL/envelope保留，坏类型422、缺引用404、重复项集合化是明确行为收紧，不声称全部旧非法输入兼容。

## 冻结与真实事务

[12源码及摘要](source-set.json)source-only tree `21f875c552028d7401b8cade5e8d8ae2aec19d49`。最终摘要与工作字节/暂存/review核对；后续仅文档。精确日志SHA和清理见[results](results.json)，原日志ignored `.tmp/admin-binding/`。

| 范围 | 最终结果 |
| --- | --- |
| 完整API | 1021 / 38.541秒，exit0 |
| 新owned MySQL8.4.13/Redis7.2.17/真实Auth/Cookie/HTTP/direct service | 20 / 3.692秒，零skip |
| 旧管理service | 19 / 3.431秒 |
| 旧同事务audit | 16 / 3.160秒 |
| 旧近期认证 | 12 / 2.243秒 |
| 旧最后管理员MySQL | 16 / 0.555秒 |
| 原MySQL / 原两库/Auth协议 | 33 / 5.775秒、24 / 16.866秒 |
| contracts | 两文件6项通过 |
| 独立review | binding14、旧service16、40+9+9+9及12源/契约/包核对通过，无剩余确认阻断 |

新20核role缺失（含empty）、任一resource缺失整组拒绝、0/-/bool/float/string/null/嵌套/上界溢出422、合法上界成功、去重/500/501、空清空、direct一致、未授权缺对象先401/403、caller list突变仍同tuple、pool1无嵌套；真实second-INSERT trigger且Python trace确认首INSERT已执行、audit INSERT trigger、DML后注销/过期、commit前失败全回滚，实际commit后ACK丢失两者同在且503/不重放。

三项并发均强制指定thread的真实InnoDB LOCK WAIT：

1. setter已完成引用锁读、尚未DELETE时暂停，另一连接只UPDATE目标resources，确实等待；此证据针对引用资源行锁，不是仅凭后面的关联INSERT锁或共同role目录锁推测。
2. 同暂停点由第二个真实HTTP执行resource删除，等待setter提交后清理对象及新关联，最终无orphan。
3. 同暂停点由第二个真实HTTP执行role删除，同样等待并清理，最终无orphan。

原audit的重复ID中途失败测试改为合法[1,2]及真实第二INSERT trigger，保留DELETE/第一INSERT后失败整笔恢复与零audit的oracle；去重不会被当成“已经验证SQL故障”。原raw None持久化未改，离线原FK故障测试保留。新离线14另覆盖500实际资源、物理上界及冻结集合不变性，不把SQLite当InnoDB锁证明。

## Linux字节绑定

只新增targets.py普通模块，显式source 232→233，stack-assets仅source合同SHA变化。复用上一轮独立`.tmp/admin-management/linux-assets`，[完整V4报告](linux-native.json)与[绑定](linux-payload-binding.json)核233源逐字等于280payload，旧232/缺targets拒绝；全部67资产（含固定SDK封包）与上轮原生报告逐字不变，catalog未变因此无需重封或网络下载。

实际VZ原49协议零skip、9隔离、5网关、组件固定SDK与正式API/三库/mTLS原6合成场景通过；六SDK、十合成模型/四工具、供应商0。保全部原字段及legacy per_run=false，不写成全P1/所有隔离完成。新引用20及三类LOCK WAIT在macOS owned库执行，guest本轮是装包和原合成链路，未冒称在guest执行新20。

## 稿件与终态

按sun-world-blog→case-study新增[引用案例](../../blog/2026-11-17-role-resource-reference-validation.md)，区别于前篇最后管理员/审计，不再扩充旧七章长文；分类后端，标签架构笔记/权限管理/数据库事务。四稳定章节/六重点，透明SVG图表达整组对象汇入检查及保持旧绑定/替换提交两分支，有信息作用；1280/390明暗实际查看，图360/约342px，无缩进/页面溢出/裸双星，DOM见[desktop](blog-desktop.json)、[mobile](blog-mobile.json)、[dark](blog-dark.json)。本地预览 http://127.0.0.1:3033/.tmp/admin-binding-blog-kh44o9tx/index.html ，草稿未发布。

15可定位owned DB根删除且ps无引用，实际VM三库/组/私有root回收；3030/8032/3033保持200，原缓存/预览与指定失败根不动。本次JSON/TS格式检查通过；根format仍仅原素材manifest.json问题，原两处dirty UI门禁问题保持，无Web生产源改动不重跑全Web。原80/123及main210加1删留存，只中文本地保存，不推送、部署、发布、配置Clash或恢复付费评测。

本轮未新增FK，未禁止所有内部直接写入，外部SQL/旧服务绕协议仍可破坏引用。资源完整性不授予capability；细粒度grant/可授予集合、生产目标/恢复/备份/完整审计运营、官方Linux四题等继续待独立验收，A/P1/A–D未整体完成。
