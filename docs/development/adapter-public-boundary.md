# 旧适配入口进入模块的公开边界

2026-11-17，承接4873ed1。上一turn已保存门禁、真实验证及版本属progress。本轮按总计划继续后端模块边界，把盘点中的11处旧HTTP/controller/type私有引用迁出，并把门禁从modules/core扩至整个apps/api/src。不是仅把所有实现重新命名为public，不改变HTTP/模型/授权语义，不声称间接依赖或完整P1完成。

## 具体迁移

- blog controller的build_blog_list_query/count两个compatibility别名只供仓内SQL检查使用，业务代码并未调用。移除无业务用途别名，唯一脚本check-blog-list-query改在所属repository做白盒协议检查；不把SQL构造器/仓储对象列为模块公开应用接口。原公开查询/分页SQL及HTTP响应保持。
- 新identity.public仅显式公开IdentityDomainError及normalize_email/phone供旧login type与UserManager延迟调用；保持同一类/函数、大小写与电话规则，不能顺便重写认证、验证或角色数据。新files.public公开原上传错误/StoredUpload/两存储函数，文件路由改入口，校验/大小/路径/返回保持。
- AI公开接口提供原AiService类、Provider Catalog DTO/error、原metrics snapshot类型与只读get_ai_run_metrics_snapshot函数，函数调用同一内部全局collector.snapshot()；不导出可变collector或repository。management.public显式导出原ManagementDenied，auth适配保持同一异常身份及HTTP转换。
- AI路由属于应用组装，不放入通用ai.public。src.module_composition增加惰性get_ai_v1_router工厂，返回原AI router singleton；旧routers/ai入口调用该组装工厂后按原顺序合并legacy+v1，路径、依赖、模型与schema不复制、不新增。仅导入业务public不得加载app_instance/路由或启动模型、数据库/网络。

## 门禁规则

- 全量扫描apps/api/src所有Python源（含新增目录/initializer/函数/typechecking），不是列出旧11路径或逐文件豁免。原modules/core方向、相对/alias/getattr/动态导入/public声明及前轮五类修正全部保留；解析符号时也使用全量src，不执行应用、不读取业务配置。
- modules之间、以及modules之外的HTTP/controller/type/其他src入口进入任何业务模块，均只可使用所属模块public的静态公开值；同模块内部引用保持。唯一显式src.module_composition是组装根，可导入已有模块manifest/内部应用实现/路由做接线，但未知目标仍拒绝，不以任意路径或后缀自动认定组合根。
- core与业务模块不能反向import组合根；旧适配层可调用组合根的接线工厂。不得把“外部适配可组装”误放宽给业务；同样禁止core→业务及ai→agent_runtime反向（即使经public）。明确允许的组装根不抹掉其他src文件违规。
- 私有business模块对象不得经公开facade转交；public仍唯一模块body静态list/tuple __all__、单target且无读写逃逸。路由装配/helper不放公共业务facade；不为lint迁走业务授权规则。遇同一canonical module被文件/包双定义须拒绝，避免覆盖AST时漏一个文件。
- 这是完整src中“直接进入业务模块”的静态规则；模块调用旧Auth router/controller/type后的间接访问、任意反射/猴补丁/一般Python数据流与Web/Worker边界仍独立待，不冒称全仓无绕过或运行时安全隔离。

## 分工与验收

复用coding一名实现限定新facade、11边迁移/组合根、checker/必要测试与SQL脚本；root负责真实源码盘点/反例、契约/公开身份与无bootstrap、新owned native/固定SDK/guest包及原场景、证据/博客/handoff/中文本地保存；判官实现后只读review，无新agent/worktree。所有协议delta先落本文，再广播，下次Claude Code/claude-ds带上完整src静态/组合根特例/间接依赖未完/禁止导出变动collector等约束。

验证：旧198源盘点11私有边归0、增加2facade后完整src约200（按实际报告）；真实副本CLI从controller/type/routers/新src目录插private或alias/dynamic边必须拒绝，业务/core反向组合根继续拒，真实组装factory正例通过；文件/包重复与缺树负例，前15单元/root27控制保持。旧基点应用新门禁应拒绝实际旧边，不只验证人造清单。

原SSE类/encoder、AiService/DTO/error/metrics snapshot、归一化函数、文件函数/类及ManagementDenied保持身份；可变collector/repository/router不得从普通业务public导出。新轻量public在fresh子进程导入时不能带app_instance/AI router或初始化业务manager；get_ai_v1_router调用才取得原router，合并route次序/旧guard40+9+9+9+read1保持。catalog/两工具/产品Skill/能力集合字节不变，独立fresh OpenAPI保持原paths/schema（期望整JSON相等）。

完整API、schema/SQL门禁、真实MySQL/Redis/Auth能力17与原stack24按影响验证；上传与identity/admin路由需真实HTTP无DB/临时owned资源的原拒绝/边界及异常响应，不能用mock返回成功取代功能。固定SDK三库/原生guest合成用于验证public新依赖和路由装配。新2facade加入显式Linux source合同/asset source SHA，实际payload逐字绑定；catalog/Worker没变不重封固定SDK，原67资产/封包保持，不宿主执行Linux ELF。

Mac SDK如需准备仅原锁--offline，目录必须在HOME外的/private/tmp一次性自有根；不得再置HOME或放宽原守卫。已存在live/三失败SDK根与原67缓存不动。完整API诊断可窄测，最终review收敛后统一freeze/全量，避免每个小修重复整套；Web源/契约无变化不重跑完整Web/Worker，不改原两UI/素材format问题。

博客按sun-world-blog→design同题修订博客03公开接口范围，若纯测试进度则只积累素材；分类/标签/原图取舍/双尺寸明暗预览/未发布状态写handoff。保持原80/123/main210加1删与3030/8032/3033/旧预览。只本地中文提交，不推送部署发布、不配置Clash或恢复官方付费四题、不接业务配置/密钥/真实角色数据。生产/官方/人工/细粒度授予与完整间接迁移门槛未完成。

## review与root反例补强

新fresh schema测试首次误用Python原json.dumps排版字节对比Prettier产物而失败；独立复验证明完整JSON相等/原合同字节未变，仅测试改为整体document等价，不改合同迁就格式。

判官真实完整src副本及无业务IO的纯Python核到src根star漏检：from src import *后能取得先前public import加载出的modules命名空间并深入ai.schemas，初版gate误exit0。属原包根/star直接边支持范围而非业务越权。应保守拒绝本站src根star（不模拟运行时namespace），补真实新adapter负例，保修前/后证据后再冻结。

补丁最终保守拒所有本站src绝对/相对star，含模块内star，仅用显式值声明；当前源码无此兼容依赖，外部math star正例保持。root41个真实CLI控制保留修前根star错误0日志；最终再以同样case复验。另新增test_adapter_http_boundary.py三项实际ASGI：无Cookie401/普通用户403先于服务与存储；admin错误图片400/实际临时PNG字节写入200且随机安全文件名；真实collector只读HTTP与Provider DTO422/同类DomainError404映射，错误服务仅抛fault不mock成功。首次3/.707秒过，最终全量再包含，不接业务配置或DB。

## 最终本地checkpoint

19源冻结775aa9b132c49053d048c7d2e0a1ce613449b552；全src200/非组合根私有入边11→0、明确组合根6。API1059/71.057、真实能力17/3.187、原stack24/16.953、Mac固定SDK三库六合成34.281通过；判官独立gate20/fresh3/HTTP3/19摘要无确认阻断，root41个缓存开始字节的真树CLI过且200源向量匹配冻结树。原schema整JSON相等，合同原字节保持，原40+9+9+9+read1/SQL/catalog gate过。

实际Linux236声明源/283payload十二生产变动逐字核，原49/9/5/固定SDK/正式三库六合成过supplier0、legacyfalse保持，console/control19字段双SHA重算相等，旧234及缺2public的三负例拒；67资产/SDK封包原样无重封。新上传/装配/完整src测试在Mac而非guest。四日志定位DB根删除/ps无引用、当前sunworld-agent-*无目录，成功Mac SDK根核inode/uid/lsof无打开文件后删、VM组/root回收；旧live和三失败根/原缓存不动。

[实证](../evaluations/adapter-public-boundary-2026-11-17/README.md)存全部范围及star红/修拒、Python namespace实际可达但非runtime sandbox、fresh排版/pycache宿主修正边界。博客03同题三段/六ID/十重点/原图不变，1280/390明暗过未发布；预览 http://127.0.0.1:3033/.tmp/adapter-public-blog-iv5ma8le/index.html 。原80/123/main210加1删、3030/8032/3033与原UI/素材失败保留，无Web源/合同变化不重跑Web/Worker。中文本地保存，无push/deploy/pub/Clash配置/付费复跑；间接授权/完整授予/生产目标恢复/官方人工版本容量等仍待，持续goal/A/P1/A–D未完成。后续CC先读本协议，保唯一组装/完整src直接范围、公有只读值/原对象/禁止暴露collector与路由、Mac/guest/合成限度。
