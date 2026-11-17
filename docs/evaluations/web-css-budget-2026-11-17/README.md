# CSS 预算与无损指针编码实证

基点d45d32d；[协议](../../development/web-css-budget.md)。预算保持51200B、计算保持每资产gzip level9后求和，未改检查器或排除资产。首次独立HEAD production Vite构建与原工作区均超额，证实不能把失败只归因于原未提交样式。

## 结果

| 对照 | 改前CSS gzip | 改后CSS gzip | 减少 |
| --- | --- | --- | --- |
| 保留原dirty的工作区 | 52362B | 50104B | 2258B |
| 原HEAD / 最终source-only树 | 51836B | 49578B | 2258B |

两组都是18份CSS，17份SHA保持，唯一变化的编辑器路由CSS8244→5986B gzip。10张PNG本体7893→5662B；不是把图片换成另一扩展名、调低图像质量或放宽计量。[build-comparison.json](build-comparison.json)保存完整CSS列表和摘要。

CLI只读重算的源码gzip使用Node默认level6，原CSS7529→未格式化转换结果5285B；最终Prettier格式化后5291B、9435B raw。它与产物level9/最小化/其他样式同压的值有不同口径，不能混用。重算报告明确不是原始write调用的捕获。最终CLI再check为changed=false，不重复改写。

## 正确性与门禁

- Chrome原生Image/Canvas：1280/390各10对，透明、白、黑、棋盘底色的全部像素一致；CSSOM从direct CSS加载，12条非空规则的selector、规范化声明、热点和fallback一致。[pixel-equality.json](pixel-equality.json)保存每图/底色摘要。
- Apple ImageIO独立解码10对，统一sRGB RGBA8预乘alpha上下文，逐像素相同；其摘要不要求与Chrome直通alpha摘要跨引擎相等。PNG CRC/IHDR独立检查，32×32/8bit/非交错，type6→4，pHYs/sRGB/gAMA逐字节保持，见[png-metadata.json](png-metadata.json)。
- 原编码器只替换PNG时非PNG字节相同；随后历史CSS须按Prettier格式化，最终不再声称非PNG字节相同，改用上述原生CSSOM和图像字节证明语义。库构建成功、41项编辑器既有测试通过，库CSS仍内联同10个新PNG。API Extractor保留TypeScript5.9.3比其内置编译器新的非阻断警告，未升级依赖。
- UI窄修BlogQaPage原label与Slot重试button为Base UI组件，关联/type/callback及signal/Suspense语义保持；25项和类型检查过。判官对编码器、损坏/非灰度/超限等纯内存拒绝路径、格式/两UI delta只读复审无确认阻断。
- 最终source-only树7f92cf95ba195296e547392201aced9d789801bd：完整`corepack pnpm check:web` exit0，真实注册4、contracts6、AI UI25、Web292、类型、构建/SSG、所有预算、UI/Markdown/包边界和chunk检查均过。首次HEAD对照只跑Vite及产物检查，不冒称改前完整Web。
- 当前工作区完整Web：Web309与构建/SSG/全部预算通过，最终仍被原dirty BlogComments原生label、SunMarkdownPreview原生table的UI消费者门禁拒绝。它们未改、未豁免、未暂存；整个工作区gate仍失败。根format仍只报原素材manifest，任务范围格式、语法、root-script与diff过。

[browser-replays.json](browser-replays.json)包含真实AI页/正式问答组件各8个合成HTTP回放、编辑器两尺寸各选择/拖动/矩形三种光标路径；明确非在线API E2E。矩形工具原本无独立cursor激活逻辑，保持选择箭头，不把未使用的crosshair PNG误称为该工具的实际路径。

## 失败记录、清理与文章

CSS门禁通过后才执行到UI检查，首次发现4处（2任务源、2原dirty），修前两任务源后工作区仍有后2处；最终源码快照完整通过。没有把早停前的通过当整个gate绿。

初始浏览器CSSOM探针未带Vite的direct参数，收到JS模块而仅解析出1条规则；最终要求direct CSS、至少10条且声明非空，再确认12条相等。原生PNG像素比较独立于该探针。编辑器观察器两次错误假设矩形工具使用crosshair，查实际实现后改为原有默认箭头，只修ignored观察器，未改工具行为。早期失败与最终日志都保留。

[cleanup.json](cleanup.json)确认两份自有非Git源码快照在构建终态后核原inode/所有者、无打开文件才移除；3030/8032/3033均200。原80状态（展开123）、main handoff原210加1删保留；旧live/失败证据根与Linux缓存不动。未调用供应商或重跑SDK/DB/VM；只复用Clash Verge既有转发，未配置代理/节点/DNS/系统。

按sun-world-blog→sun-world-write-case-study新增[本地案例](../../blog/2026-11-17-inline-cursor-css-budget.md)，前端分类，架构笔记/性能优化/前端工程；5稳定章节、7重点。一个ECharts6.1.0 SSR透明SVG呈现预算线与两组对照，数字见[plot-data.json](plot-data.json)，没有把字节减少说成加载延迟实测。1280/390、明暗主题、图360/342px、无缩进/溢出与表格实渲通过；预览仍使用工作区既有dirty renderer/CSS，未发布。

只中文本地提交，无推送、部署、发布。生产/官方Linux四题/人工/不可变模型版本/目标库与恢复/TLS等仍独立待，Web源码门禁通过不等于P1/A–D整体放行。
