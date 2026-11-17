# 后端模块公开接口与静态导入边界

2026-11-17，基点6728308。本轮落实实现规范中的非法跨模块导入检查：迁移运行模块四处私有引用，并把能力投影反向创建全局注册表改为应用装配注入。门禁已接入API runner，范围是后端业务模块和平台核心的直接导入；它不代替业务鉴权或运行时隔离。实施规则见[协议](../../development/module-import-boundary.md)。

## 基线、范围与行为

[基线](before.json)离线盘点198个API Python文件，发现agent_runtime两处AI schemas、一处博客tools、一处博客manifest直接依赖，以及management投影反向创建module_composition。此前没有该静态门禁。它们是代码耦合问题，不是外部请求绕过授权。

[最终盘点](after.json)中四处私有直接边和一处组合根回流均为0。门禁自动扫描九业务目录89个Python文件及core25个，共114个AST，包括initializer、嵌套函数、TYPE_CHECKING、绝对/相对导入与别名；新增模块不需要手写豁免。跨模块只允许精确public facade及静态__all__公开值，拒私有路径/包根/star/未知导出/模块对象穿透；core不依赖业务或组合根，ai不反向依赖agent_runtime。本站或不可证明目标的动态import拒绝，固定外部MCP依赖不导入、不探测。缺树不能空扫描绿。

公开声明要求模块body唯一静态list/tuple，Assign只能有一个Name(__all__) target；除声明target外不允许读取、修改或逃逸这个声明容器。检查器跟踪常用import/from/赋值/getattr别名与函数静态局部导入。它是架构lint，不能证明任意反射、运行时猴补丁和一般Python数据流无绕过。

原有HTTP/controller/type适配层仍有11处私有引用；业务模块对旧Auth router、持久化controller及共享type的间接依赖也保留。没有把它们改名藏到公开文件或逐文件豁免，也不能据直接边检查宣称全仓分层已迁移完成；这些旧入口仍需按业务服务逐项迁移。

运行时的SSE类型与encoder通过AI公开接口，工具通过原create_public_tools工厂，工具版本来自显式注入的registry；投影由组合根工厂注入registry，依赖构造失败仍固定503/no-store/Vary Cookie。[身份核验](facade-identity.json)实际确认SSE类和函数是原对象，工厂仍返回原BlogPublicTools，注册工具仍search/read两项v1。[契约核对](contract-check.json)中HEAD/working OpenAPI和catalog字节相同，独立进程fresh schema相等；未加工具/能力/授权API或改变产品Skill。

## 冻结及真实验证

[最终17源](source-set.json)冻结树 `8afdeb06c4cc6db13513167387fe65ed81799224`；生产7、测试7、scripts2、local server1。独立review核工作区/index/树全部摘要。源码中checker369行，测试基于真实源码副本和实际CLI，不执行应用。日志命令、SHA和清理见[results](results.json)，原日志在ignored `.tmp/module-import-boundary/`。

| 范围 | 结果 |
| --- | --- |
| 完整API runner | 1048 / 57.144秒，exit0 |
| 新导入门禁 | 15项真实源码副本单元；root另27个真实复制树CLI对照全过 |
| 原生owned MySQL8.4.13/Redis7.2.17/真实Auth/Cookie能力接口 | 17 / 3.163秒，零skip |
| 原认证/两库栈 | 24 / 17.240秒 |
| Mac固定SDK0.2.2-rc.1/三库/mTLS | 原六合成场景，34.368秒，exit0 |
| 独立review | checker15、projection12、17源摘要、六类修后CLI反例及原公开对象身份，无剩余确认阻断 |
| 契约 | OpenAPI/catalog字节不变、fresh schema及exporter --check通过 |

[root27个CLI对照](independent-controls.json)缓存开始时的checker/198源字节，核对最终冻结树；包括公开named/module alias正例、外部未安装包常量（静态不执行）、直接raise哨兵不执行、缺树/bare命名空间、nested/type-checking/相对私有导入、star/包根/未知公开名、module alias私有属性、模块对象导出、core/ai反向、组合根、动态目标/keyword alias、函数局部及共享target导出、后置闭包导入。最终门禁应用于旧HEAD复制树正确拒绝；临时非Git目录自动清理，没有创建worktree。

新原生17沿用旧16的所有认证/TTL/撤销/注销/依赖/零业务audit断言；新增真实HTTP构造registry失败固定503与缓存头。原SDK六场景验证成功恢复、取消、TLS断开、Redis会话撤销、提交前撤文与Worker崩溃，不调用真实模型。Web生产源和契约无变化，不重复上轮完整Web/Worker；原两dirty UI门禁与素材格式问题保持，root format仅原manifest失败。

## 反例与验收失败记录

[反例历史](counterexample-history.json)保留五类开发中的静态假绿：__all__后续mutation、keyword动态import结果别名、函数局部假声明、链式赋值的容器别名、嵌套后置import闭包。修前实测错误放过，修后原样拒绝；它们不是生产或业务写越权。没有用“Python无法完全静态证明”跳过这些已声明支持的普通形式。

初始源树[458934cc清单](initial-source-set.json)原生16中一例失败：旧fixture在service构造后patch全局registry工厂，注入后service不再访问它。只改该测试为注入真正抛错的BrokenRegistry，保持固定503与无敏感错误断言，并另增真实HTTP工厂失败一例，最终17通过；生产源不回退。

第一次Mac SDK5.309秒早失败且Worker stop ACK未确认。root把新离线准备的运行时放在HOME内，违反原fixture明确的路径隔离约束；原stderr按宿主设计未保存，因此不宣称唯一低层失败原因。仅把自有同字节运行时移到/private/tmp，保持原守卫，再用同源六场景通过；原失败记录和`/private/tmp/sun-world-sdk-stack-effdbhnv`仅含合成TLS测试文件的根保留，后续成功不把原ACK改真。没有读取/提交这些凭据。

## Linux包与资源

[完整原生V4](linux-native.json)仍保留原全部值。[payload绑定](linux-payload-binding.json)核234声明源逐字对应281payload/67资产，变动恰是本轮七个生产Python文件；原source列表未增删。分离console/host control严格V4重算19字段与两SHA相等。实际guest原49协议零skip/9隔离/5网关/固定组件SDK/正式API与三库mTLS原六合成场景均过，供应商0，legacy per_run=false原样保留。

67资产及固定SDK封包与上轮全部相同，catalog/Worker选定源没变，无需重封或下载；新缓存仅APFS clone原68个缓存文件（含sidecar），原缓存不改。新静态checker在host API runner执行，原生能力17在Mac owned库执行；不冒称guest执行新15/17，亦不据此放行P1或官方四题。

[Mac准备记录](mac-sdk-runtime.json)为原锁文件--offline准备，没有模型部署；[清理](mac-sdk-cleanup.json)核inode/uid/无打开文件后删除自有运行时根。7个日志可定位owned DB根均删除且ps无引用，当前/private/tmp的sunworld-agent-*目录无残留；成功fixture与VM的组/三库/root按原监督器确认清理。旧live/两失败根以及本次新失败证据根保留，原3030/8032/3033均200。

## 稿件与后续

按sun-world-blog→design修订[博客03](../../blog/2026-11-12-dsh-skill-boundaries.md)第二节，解释公开接口和组合根的责任；后端/架构笔记、Agent、DeepSeek Harness，六稳定ID/十重点保持。既有共享服务文本图及页面装配透明SVG仍有效，两段新增说明无需再画重复图，SVG字节不变。1280/390明暗实际查看、无缩进/溢出/裸双星，见[desktop](blog-desktop.json)/[mobile](blog-mobile.json)/[dark](blog-dark.json)。预览 http://127.0.0.1:3033/.tmp/module-import-blog-och7n63y/index.html ，未发布。

原80/123和main原210加1删保留，仅中文本地保存，不推送部署/发布、配置Clash或恢复官方付费四题。下一步继续旧适配层的业务归属/公开边界、完整授权可授予范围及剩余本地验收；生产目标/恢复备份、官方完整四题、人工/模型版本/容量等仍独立待，A/P1/A–D未整体完成。
