# Web CSS 预算与指针资源编码

2026-11-17，基点d45d32d。继续总计划合并前的Web门禁，不调整50KiB CSS预算，不修改/暂存原80项dirty（展开123项）。起点产物CSS gzip52362B、超1162B；独立HEAD源码的同production Vite构建CSS gzip51836B也超636B，不能再把失败仅归因于未提交样式。首次干净源码对照只运行Vite及产物/预算检查，不冒称完整check:web已通过。

## 范围与取舍

原EditorCanvasPage整份路由CSS为8244B gzip，其中包含10个32×32内联PNG指针，不能把整chunk大小当作图片本身。原图都是8bit RGBA且每个像素R=G=B，透明度独立；可按PNG规范无损合并RGB为灰度，同时保持alpha、sRGB/gAMA/pHYs、尺寸、CSS选择器与热点。保留内联以兼容编辑器库打包，不把图移到另一扩展名来规避预算，不降低图像质量或换设计。编码参考[PNG的RGB合并](https://www.w3.org/TR/png-3/#4Concepts.RGB-merging)与灰度alpha格式；只针对本仓库有界资源，不建设通用图片处理服务，不新增运行依赖。

root独占HEAD快照/当前产物对照、原图与新图独立浏览器解码、编辑器实际加载、完整Web/窄门禁、博客/证据/交接与中文本地提交。coding只写packages/editor/src/cursor/cursor.css与维护的scripts/optimize-editor-cursors.mjs；先dry-run确认真实节省，再改编码。判官实现后只读审查。转换器须有界、CRC/块顺序/8bit非交错32×32格式严格检查，不支持格式拒绝；仅10个已知内联资源，保非PNG CSS字节，输出固定摘要不打印图像data URL。重跑应幂等，不从URL或任意文件加载内容。默认check、显式write，不修改其他源。

不能只用转换器自己的解码器证明自己正确：root用浏览器原生Image/Canvas对每张原图和新图解码，比尺寸、全部RGBA及不同底色合成，核cursor CSS热点/回退与选择器；有条件再用系统ImageIO作为第二独立解码器。完整工作区Web门禁要保原dirty参与，另有HEAD/最终源码对照。CSS减小要来自实际字节减少，不改预算计算或隐藏资产；保留前后全部CSS/图像总量与失败记录，不把字节节省称为网络延迟实测。

首次工作区完整Web在CSS降至50104B、所有体积预算通过后，继续发现此前被早停遮住的UI消费者门禁：本分支BlogQaPage原生label与Slot重试button须分别改为Base UI Label/Button，交coding在这两份干净任务文件中窄修并复验。原dirty BlogComments的label与SunMarkdownPreview的table保留，不为过门禁改它们或放宽检查器；另在最终source-only源码跑完整Web，区分任务提交与工作区未提交实现。写入失败保原仅指rename前；rename后目录同步/close失败会报错但文件可能已经替换，不增加不可靠回滚。

cursor.css历史空白不符合本仓库Prettier，触及后须格式化。优化器自身的非PNG字节等价先单独保留；root随后只让Prettier格式化这份任务文件，不改PNG内容。最终再用浏览器CSSOM逐规则比selector与规范化声明、热点/回退及图像字节，证明格式调整没有改变CSS语义，而不继续声称最终文件所有非PNG字节都原样。

现有3030/8032/3033不停止，不读key/业务.env/config，不重跑SDK/DB/VM或供应商。按用户最新范围只复用既有Clash Verge，不配置代理/节点/DNS/系统，不因本轮自动重试官方四题。新临时快照是独占非Git测试目录，终态后核原inode与无打开文件再删除，不建worktree，不收养未知进程；旧live/失败证据根与缓存保持。

博客按sun-world-blog路由撰写与实际材料匹配的性能案例；不改原dirty的Stars性能文章或pnpm稿。分类前端、标签架构笔记/性能优化/前端工程；明确50KiB是本项目预算，不宣称通用阈值。评估关系/数据图，真实桌面手机渲染并记未发布。生产/官方Linux四题/人工/不可变版本/恢复/TLS等独立门槛仍待，Web预算通过也不放行P1/A–D。

## 维护入口

使用仓库Node24.17.0和Corepack pnpm10.15.1：

```bash
corepack pnpm exec node scripts/optimize-editor-cursors.mjs --check
corepack pnpm exec node scripts/optimize-editor-cursors.mjs --write
```

check只读并报告changed，合法但可优化时也可返回0，不是新增CI编码门禁；不支持格式/损坏/非灰度会拒绝。write只在changed时原子替换固定源文件。默认gzip摘要用level6，仅便于重算源码，最终构建预算仍按原manifest的level9，禁止混算。最后还要正常格式化这份触及CSS、核图像与CSSOM，并运行原Web门禁。

## 2026-11-17 本地 checkpoint

四份任务源冻结于source-only树7f92cf95ba195296e547392201aced9d789801bd。10张PNG7893→5662B，原RGBA8→gray+alpha8，pHYs/sRGB/gAMA逐字节保持，默认检查幂等；优化器只替换PNG字节，最终CSS必要格式化后通过原生CSSOM12条规范化规则/热点/回退等价。Chrome原生解码10对×4底色×两尺寸，以及Apple ImageIO10对独立像素检查均通过；库构建仍内联同10图，41项编辑器测试通过。

真正产物CSS两组均减2258B：工作区52362→50104，HEAD对照51836→49578，18份CSS中17份SHA不变，仅EditorCanvasPage8244→5986B gzip。预算/计算/资产范围原样。[实证](../evaluations/web-css-budget-2026-11-17/README.md)保全部测量与源码摘要，不将KB变化称为延迟改善。

CSS过关后新暴露2任务源+2原dirty UI消费者失败；窄修前2为Base UI Label/Button，25+typecheck与真实问答/AI页各8回放通过，判官复审无确认阻断。最终源码快照完整check:web exit0（真实注册4/contracts6/AI UI25/Web292/类型/构建/SSG/所有预算/UI与chunk全过）；工作区Web309与预算过，整体仍因原dirty label/table失败。根format仅原素材manifest失败，未改/豁免这些原dirty。实际编辑器两尺寸选择/拖动/矩形切换通过，矩形原本沿用默认箭头，初始错误crosshair观察假设只在ignored脚本纠正。

两份非Git源码目录终态后原inode/所有者/无打开文件核后删除，3030/8032/3033均200。原80/123dirty、主handoff原210加1删与旧live/失败根/缓存保持；无SDK/DB/VM或供应商运行、不配置代理。新增前端case-study与ECharts透明数据图，5章节/7重点，1280/390明暗实渲通过未发布。只中文本地保存，无push/deploy/publication，P1/A–D未整体验收。下一步按总计划继续核对A恢复边界等剩余可本地缺口；后续Claude Code/claude-ds先读本文和最新分支checkpoint，不能继续把CSS超额当未定位问题。
