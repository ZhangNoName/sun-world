# 后端模块的静态导入边界

2026-11-17，承接6728308。上一turn已实现/验证/保存能力投影，属progress。本轮落实实现规范2/8节的后端非法跨模块import检查；先核实际源码：agent_runtime两处直接依赖ai.schemas、一处blog.tools、一处blog.manifest，core当前无直接业务导入。用真实迁移及自动拒绝对照补门禁，不把静态检查当运行时安全隔离或宣称整个P1/前后端全部完成。

## 规则与兼容范围

- 检查器离线解析apps/api/src下真实Python AST，不导入应用、不读业务配置或执行模块。扫描所有src/modules与src/core（含initializer、嵌套函数、TYPE_CHECKING、绝对/相对导入），不靠文本正则或只看顶层。所有业务模块目录自动识别，无逐文件豁免或新增模块默认放行；core不得依赖业务模块或组合根，ai不得反向依赖agent_runtime（即使经其public）。
- 同模块内部相对/绝对引用保持；跨模块仅精确src.modules.<owner>.public，public.py须有静态、唯一、非私有的__all__，调用方只可引用显式公开名，禁止跨模块star/包根/私有子路径或公开facade的模块对象再穿透。公共导出可回到本模块内部函数/类/值，但不能导出内部Python模块对象当捷径。__init__不能替代public facade。
- 支持import及from的真实Python相对层级解析、alias与公开module alias属性核对，拒绝未知目标、越过src根、不存在facade/导出及访问其私有属性。importlib.import_module/__import__等动态导入不允许选择本站src（即便是public）；允许可证明常量的外部依赖（现mcp固定模块）。不可证明的动态目标拒绝。检测常用alias/getattr形式，未支持的Python反射/运行时猴补丁不声称可静态证明无绕过；这是维护架构的静态门禁，不是恶意Python安全沙箱。
- 组合根src/module_composition.py以及已有应用HTTP/controller/type适配层不属于业务模块间边；本轮记录它们仍有旧内部接口，不为此批量重构旧路由。组合根不允许被core或业务模块反向导入；现有投影依赖移成显式registry注入，业务模块不扫描或反向创建全局组合。盘点另确认业务模块仍引用旧Auth router、management持久化controller与共享type；这批现有迁移依赖及经它们的间接业务访问不由本轮直接模块导入门禁证明，不能称全部旧分层或全仓依赖迁移完成。后续需按所属业务服务迁移，不能只为让lint通过移动授权实现。
- 运行时两处SSE类型通过ai.public显式导出保持同一个类型/encoder；博客工具通过现有create_public_tools工厂，原工具元数据从应用注入registry获取（不把完整manifest作为公开捷径）。不改变URL/响应schema/工具/产品Skill/模型/业务授权。

## 实施与验收

复用coding一名：限定checker/离线行为测试、四处迁移及facade、能力投影registry注入与原调用测试的必要适配、API runner接线。root负责协议/反例/原生组合/契约/冻结/Linux包/证据/博客/handoff及中文本地提交，判官实现后只读复核，不重复探索、不新建agent或worktree。

新测试必须覆盖真实源码扫描与至少：绝对/相对私有引用、nested/typechecking、包根和star、错误相对层级、facade显式/未知/重复/模块对象导出、import/from别名与属性穿透、core反向/ai反向/业务组合根回流、动态常量本站/不可证明目标与外部常量；不只匹配脚本文本或镜像实现。对冻结源码的临时树作真实反例改动，验证gate非只信测试自建清单。记录旧四处与最终0非法边，不把既有适配层旧耦合写成全仓迁移完成。

API runner/完整API及新原生MySQL/Redis能力16、原stack24、固定SDK三库原合成六场景按实际影响验证；导出OpenAPI/catalog应逐字不变。涉及Linux payload源变更时显式合同逐字重绑，再运行原guest合成范围；固定SDK仅在所选封包源实际变化时按原离线配方重封，不升级依赖、联网模型或宿主执行Linux ELF。Web无产品源变化时不重跑完整构建，保原dirty两个UI/素材format问题，不放宽门禁。

按sun-world-blog同题修订模块/Skill边界稿，若只有测试进度则积累素材；本轮真实公开接口与组合根责任适合补简短边界解释。分类/标签、配图信息价值、1280/390明暗预览和未发布状态写handoff，不为测试数字另起进度博客。只本地中文保存、不推送部署发布、不配置Clash或恢复官方付费四题。保原80/123/main210加1删、3030/8032/3033、旧预览/失败根/原缓存。后续Claude Code/claude-ds须带后端静态/适配层范围、公开导出/注入registry/非恶意代码隔离、无新运行权限及原生产门槛。

## root反例增量

真实源码副本CLI对blog.public在静态__all__后追加同名公开项，初版gate错误exit0，违背唯一且静态的公开导出契约；其他22项与旧基点反例均符合预期。修复应拒绝后续__all__增量/容器mutation及常见alias mutation，不执行应用，也不把它称运行时写越权。保留反例红记录，增加行为回归，修后再冻结最终源码与完整API验证。

判官独立真实副本另核两类假绿：keyword形式__import__(name='importlib')结果未正确跟踪导致后续import_module本站漏检；把唯一__all__移到未执行函数内部仍被误当模块声明。修复统一positional/keyword目标提取，并要求唯一静态声明位于模块body；补负回归及独立复验，不能把局部变量当实际模块导出证明。

后续判官复验同类alias逃逸：__all__ = alias = [...]仍被当成唯一静态声明，alias.append使同一容器重复导出而假绿。应进一步要求Assign恰好一个Name(__all__) target，AnnAssign保持单target；不得只处理直接读取__all__而漏链式赋值。

coding最终自检补原支持范围内的嵌套闭包后置import alias漏检（内函数定义在外函数importlib import之前，运行时合法闭包）；需预登记函数静态局部import/alias再扫描内函数，保原红日志。最终只在这些既定嵌套/alias/声明约束收敛后统一冻结与全量验证，不为每个小修重复运行完整门禁。

root首轮owned原生16中唯一失败为旧fixture仍在service已构造后patch全局registry factory；显式注入后该factory本来就不应再被service调用。生产源不回退，fixture改注入确实抛错的BrokenRegistry保直接服务固定503断言，并另增真实HTTP factory失败/no-store/无业务audit写入一例，最终17再验。初始树458934cc及16/2.619秒失败与日志SHA保留，新冻结仅此测试文件变化；27个CLI反例的198生产源与checker字节不变，不重复无关Web/Worker或付费模型。

首次Mac SDK组合5.309秒早失败且worker_stop_ack未确认；root把新离线准备runtime放在HOME内，原stack-worker配置明确拒绝HOME内runtime，未放宽守卫。该实例仅留下自有TLS测试fixture根，失败日志保留；自有runtime迁到/private/tmp一次性目录，按原固定源复验SDK与后续API，不重跑已通过17/24。旧3个指定live/失败根与原缓存不动，新失败根独立记录，不冒称该失败已有Worker ACK。

## 最终本地checkpoint

最终17源冻结8afdeb06c4cc6db13513167387fe65ed81799224；API1048/57.144秒、能力native17/3.163秒、原stack24/17.240秒、Mac固定SDK三库mTLS六合成/34.368秒通过。门禁114个实际AST/九业务目录，私有4及组合根回流1均消除；root27真树CLI通过、独立checker15/projection12/17摘要及原公开对象身份通过无剩余确认阻断。原生初16失败仅旧fixture patch时点不再适用，已保失败并正确注入再加真实HTTP factory503。

实际Linux234源逐字对应281payload/67资产，恰七生产Python变动；原49/9/5/三库SDK6合成过supplier0/legacyfalse，console/control严格19字段和双SHA重算相等。SDK封包与其余66资产均原样，无需重封；新checker在host、17在Mac，不跨范围冒称guest。Web源/契约无变化，不重跑上轮完整Web/Worker；root format仍仅原素材manifest，原UI两失败保持。

详[实证](../evaluations/module-import-boundary-2026-11-17/README.md)。SDK首次新准备目录误在HOME导致配置拒，移自有private/tmp后六场景过，原ACK未确认与新失败TLS证据根保留；自有成功SDK根核inode/uid/无打开文件后删、7日志定位DB根/VM回收，原指定根/缓存/3030/8032/3033保持。博客03同题两段解释、六ID/十重点/原图不变，1280/390明暗过未发布。仅中文本地保存，无push/deploy/pub/代理/付费复跑，原80/123/main210加1删保持。旧适配11私有、间接Auth/controller/type、细粒度授权及原生产/官方/人工门槛仍待，P1/A–D及持续goal未完成；后续CC必须保本文scope与真实/合成/跨平台验收区分。
