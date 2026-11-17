# 旧适配层的模块公开接口

2026-11-17，基点4873ed1，承接[前轮模块导入检查](../module-import-boundary-2026-11-17/README.md)。本轮把原11个私有适配引用迁出，并把门禁从modules/core扩到整个API src；业务与HTTP行为保持，适配规则见[协议](../../development/adapter-public-boundary.md)。

## 迁移及范围

[原HEAD真实盘点](before.json)198源、七个adapter文件有11个私有业务模块引用，原114源门禁实际CLI仍exit0。[最终盘点](after.json)为200源，非组合根的直接私有入边归0；唯一确切src.module_composition有六条明确的私有装配边。新目录自动扫描，不列11文件豁免；文件/包同canonical module双定义拒绝。

迁移没有把全部内部实现重新导出：

1. 新identity.public只提供原错误类及两归一化函数，旧login type/UserManager保持延迟调用；files.public提供原上传类型/错误/两存储函数，原校验与文件名规则不改。
2. AI public提供原Service/DTO/error/snapshot类型及只读snapshot函数；内部可变collector、repository与router不公开。ManagementDenied保持原异常身份。指标getter仍读取同一个内部collector。
3. AI router由组合根惰性getter取得原singleton，外层按原legacy→v1次序组装，普通public import不加载app_instance或路由、不构造业务manager。
4. BlogManager未被业务使用的两个SQL构造器兼容别名移除，唯一仓内调用脚本改在所属repository白盒验证；不把SQL构造器变成业务接口。仓储源字节未变、SQL检查通过。此处是内部Python别名的明确移除，不保证仓外依赖私有别名的代码兼容；HTTP URL/JSON契约不变。

门禁覆盖全部apps/api/src（200 Python），不含根main.py、tests或scripts；只允许真实组合根私有接线，未知目标仍拒，类似名字不能获取豁免。业务/core反向组合根及core→business/ai→runtime仍拒；adapter可调用装配factory。public仍要求唯一模块级静态__all__、单target且不允许容器读写/别名逃逸，内部Python模块对象不得作为公开值。本站所有绝对/相对star保守拒，外部math星号正例保持。

这是完整src中的直接业务入边约束；模块经旧Auth router、controller、type的间接访问及一般反射/运行时数据流仍待，不是全仓无私有耦合或Python安全沙箱。没有新授权、能力、工具、模型或业务数据迁移。

## 冻结及验证

[19源清单](source-set.json)绑定树 `775aa9b132c49053d048c7d2e0a1ce613449b552`（生产12、测试3、host脚本2、Linux合同2），独立review核工作区/index/树摘要全部一致。随后仅文档/博客。精确命令、日志SHA、清理见[results](results.json)，原日志ignored `.tmp/adapter-public-boundary/`。

| 范围 | 最终结果 |
| --- | --- |
| 完整API runner | 1059 / 71.057秒，exit0 |
| 真实MySQL8.4.13/Redis7.2.17/Auth/Cookie能力接口 | 17 / 3.187秒 |
| 原认证/两库stack | 24 / 16.953秒 |
| Mac固定SDK0.2.2-rc.1/真实三库/mTLS | 原六合成场景，34.281秒，exit0 |
| 直接门禁 / fresh public及装配 / HTTP | 20 / 3 / 3；均包含于完整API，判官另独立通过 |
| root实际源码复制树CLI | 41对照通过，全部200源字节匹配冻结树 |
| 契约与旧门禁 | 40+9+9+9+read1、SQL、catalog --check通过；OpenAPI/catalog原字节不变 |

[公开值声明](public-exports.json)与fresh子进程验证原类/函数身份、同collector读取、路由getter惰性/原singleton与组装次序。fresh过程审计网络连接/DNS、进程启动、可写文件open和controller/database构造；不把关键I/O审计说成任意系统调用无副作用证明。

新HTTP三例实际调用ASGI路由：无Cookie401及normal403先于service/storage/metrics；admin坏magic400且无文件，合成PNG字节实际写到临时目录、UUID文件名不含客户端路径；metrics真实collector快照，Provider DTO缺项422、原公开异常类故障404映射。Provider stub只抛错误，没有mock成功。身份由受控server principal/无Cookie依赖提供，明确不是这些上传/Provider路径的真实JWT/业务数据库全链路；签名Cookie与真实存储另由native17/旧24验证。

[契约对照](contract-check.json)独立进程fresh完整OpenAPI JSON与合同相等，HEAD/working原文件字节相等（7601d62a…/94f1166a…）。Python原json.dumps pretty排版与Prettier bytes不同是既有事实，fresh单测初次误拿两种排版做字节等号，已修成完整JSON比较；没有重格式化或改字段迁就测试。

## 反例及适配层限制

[41个真实CLI控制](independent-controls.json)缓存开始时checker及200源字节，核冻结树；除前轮27项外，新增controller/type/router/新src目录的private/包根/非公开collector、router/SQL名、合法组装、相似组合根、未知目标及canonical冲突。临时非Git复制目录均自动移除，无新增worktree。

[反例历史](counterexample-history.json)保留src根star初版假绿。真实副本`from src import *`可从先前加载的包取得modules命名空间并深入ai.schemas，root原样CLI错误exit0；修后LOCAL_STAR_IMPORT拒绝，相对src根/core star同样拒。另[纯Python观察](star-runtime-observation.json)证实该命名空间语义仍存在，因此修复的是构建时检查，绝非运行时私有访问沙箱；这不是业务写越权。

fresh测试首轮还因-I忽略PYTHONDONTWRITEBYTECODE而触发pycache写审计，改为显式-B，未放宽审计。首份完整错误日志未由root归档，仅记录经独立复验的最小事实；冻结后所有正式验证一次通过。

## Linux字节绑定与清理

[完整V4原生报告](linux-native.json)与[逐字绑定](linux-payload-binding.json)核236声明源/283payload/67资产，含两新public及十二生产源变动。分离console/host control严格重算19字段与双SHA，原值不补真；旧234清单/缺任一新public的三个真实闭包负例均拒。

实际guest原49协议零skip、9资源/文件系统、5网关、组件SDK和正式API/三库/mTLS原六合成场景过，supplier0、legacy per_run=false保留。67资产含固定SDK封包与上轮逐字相同，无需重封/升级/下载。新gate20、fresh3和HTTP3（含上传及旧路由装配）在macOS执行；guest是原formal合成链与新源码包，不冒称guest验证上传/main bootstrap或全部新单测。

Mac运行时按原锁--offline准备在HOME外的自有/private/tmp根，[inode/uid/lsof核对](mac-sdk-cleanup.json)后删除，未修改HOME守卫。四个日志可定位DB根均删除且ps无引用，当前sunworld-agent-*目录无残留，成功SDK/VM的组/三库/root确认回收；原live及三个失败证据根、旧缓存不动。本轮没有新的原生失败根。

## 稿件与后续

按sun-world-blog→design修订[博客03](../../blog/2026-11-12-dsh-skill-boundaries.md)公开接口、只读统计和路由装配说明，后端/架构笔记、Agent、DeepSeek Harness，六ID/十重点。原文本关系图与透明装配SVG仍有信息作用，三段示例无需重复图，SVG字节不变；1280/390明暗实际查看，无缩进/溢出/裸星，见[desktop](blog-desktop.json)/[mobile](blog-mobile.json)/[dark](blog-dark.json)。预览 http://127.0.0.1:3033/.tmp/adapter-public-blog-iv5ma8le/index.html ，未发布。

Web生产源/契约无变化不重跑完整Web/Worker；原两dirty UI和素材manifest格式失败保留。原80/123/main210加1删与3030/8032/3033保持，仅中文本地保存，不推送部署发布、配置Clash或恢复官方付费四题。后续间接身份/持久化边界、细粒度可授予集合、生产目标/备份恢复/官方完整四题/人工与版本策略/容量仍待，A/P1/A–D未整体完成。
