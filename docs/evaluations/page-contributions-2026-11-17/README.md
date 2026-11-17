# 首个页面贡献与卸载隔离实证

基点dc32f26。按[协议](../../development/page-contributions.md)将现有博客问答导航改为blog模块声明、AI宿主布局、应用显式装配的首个静态view贡献。公开导航requires=[]，不授予Agent权限，不新增能力服务、写操作或生产入口。保留原Web模块ID，不将其自动当成后端身份。

## 检查结果

| 检查 | 结果 |
| --- | --- |
| 通用注册 | 22项：未知slot/版本/能力、重复归属、依赖/环、数量、稳定排序、显式项目等 |
| React挂载 | 17项：能力未知/撤销、贡献模块关闭、账号/项目/session/context切换、迟到加载、独立错误/重试、SSR/StrictMode等 |
| Suspense回归 | 实现者先以3项真实React.lazy用例复现失败，再补每项Suspense；判官独立Slot17复验，无剩余确认阻断 |
| 真实组装与回归 | root29项通过；判官独立45项及后续Slot17通过；真实registry4项成为check:web构建前门禁 |
| 纯源码快照 | source-only树解包到非Git临时目录，不含其他未提交源码；113项与类型检查通过，已清理 |
| 完整Web | contracts6、AI UI25、Web309、类型/构建/SSG/manifest通过；最后total-css-gzip（18 assets）失败，整体不通过，未隔离证明预算根因 |
| 根格式 | 仅原素材manifest失败，任务范围格式及diff检查通过；不调整预算或其他任务素材 |
| 真实页面浏览器 | 1280/390各展开、折叠、贡献停用、失败重试，共8场景；使用实际AigcPage/Hook/AuthStore/注册，只以合成GET provider响应替代HTTP，无供应商调用 |

实际宿主的AuthStore.sessionRevision镜像原认证epoch，避免同一账号清理再登录被React批为一次render后继续沿用旧挂载。集成测试还确认普通到期时间同步不重启贡献。组件signal与scope用于卸载请求和拒绝迟到交付，不撤回已发服务器操作。UI模块关闭只停止贡献装配，不代表后端运行已撤销。

受限requires采用全部满足，unknown/loading/error不加载；真实贡献只有公开导航，能力服务尚未新增，受限投影均为明确合成测试。项目筛选与相同本地ID切scope证明生命周期，不是多租户授权或第二项目上线。

## 证据与失败记录

[validation-manifest.json](validation-manifest.json)保存22项改动源摘要、source-only树、门禁与ignored日志/截图摘要；[browser-replay.json](browser-replay.json)明确live_api_e2e=false。最终浏览器观察检查viewport中的实际命中目标；手机折叠时通过打开对话列表发现入口，不把屏外或被覆盖的DOM算可见。

初始UI预览漏了实际宿主尺寸，DOM存在却截到空背景；补真实应用main高度，并加强可见性后，旧观察器又在折叠动画中提前判断。最终等实际命中可见再判定，全部8场景通过。只修ignored harness，未改产品CSS。失败重试对当前可见挂载生效，另一个隐藏挂载的错误仍独立保留，未伪称所有挂载一起重试。

博客初次预览发现原稿粗体句末标点未渲染，已在源稿修正。图片data URL及Vite内联URL被正常安全渲染器拒绝，最终预览直接提供自有SVG文件URL，未放宽渲染策略；独立预览根还需按真实应用约束宽度，防止body flex按表格最小内容扩宽手机视口。旧失败日志保留，不将这些harness失败算产品修复。实际像素复用了工作区原有dirty Markdown/CSS；纯源码快照证明逻辑与类型，不冒称干净样式截图。

## 清理、文章与下一步

[cleanup.json](cleanup.json)确认非Git源码快照按原inode/所有者、无打开文件后删除，现有3030/8032/3033均200；未重跑SDK/三库/VM，未触旧live runtime/失败证据根或Linux缓存。原80项状态（展开123项）与主handoff原210加1删保持。

按sun-world-blog→design局部更新[博客03](../../blog/2026-11-12-dsh-skill-boundaries.md)，分类后端，标签架构笔记/Agent/DeepSeek Harness。保留5个原章节ID，新增页面扩展章节；一张透明装配图解释模块、宿主、应用、服务端之间的职责，避免用文字反复列关系。桌面1280/手机390，6章节、6处重点、无首行缩进/溢出，图360/342px，实际渲染与目视通过，未发布。

用户最新确认直接复用Clash Verge现有转发，代理配置不在范围；不再等待另一代理资料，不新增项目代理设置或调整节点/系统代理。这不是此前超时已消失的证明，官方Linux四题原失败与停止付费复跑状态保持。

其他slot、写action、新能力投影、生产接线/目标库/备份/TLS、未知孤儿恢复、断电/多副本、官方Linux四题及人工/模型版本策略仍独立待。只中文本地提交，无推送、部署、发布，P1/A–D未整体完成。
