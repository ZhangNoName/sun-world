# 全项目对接：统一登录与隔离专项评审

日期：2026-11-12。范围：设计审阅、必要源码/项目说明核对、官方协议参考。未访问用户档案、密钥或生产配置，未运行攻击测试、账号迁移或部署。以下优先级表示设计放行风险，不是已证实线上漏洞。

## 结论

保留 Stars 独立门户、各产品独立数据与会话、分层接入方向。L0/L1 导航可独立推进；L2–L4 必须先满足[身份与隔离专题](../architecture/federated-identity-and-isolation.md)。本轮只修改文档，用户要求暂不开发。

## 发现及修订

| 编号 | 优先级 | 原方案缺口与依据 | 已写入的设计处理 |
| --- | --- | --- | --- |
| SEC-01 | P1 | 目录 project_id 表示产品，扩展契约却将其作为隔离范围；帧集实际还包含 workspace 与内部 project | 区分 app_id、tenant_ref、resource_scope、owner；由目标验证完整层级 |
| SEC-02 | P1 | 统一登录仅描述 issuer/sub，没有账号绑定事务；现有 identity/service.py 已有 login/connect、一次性 state 与会话关联，迁移不能弱化 | 登录/绑定分开，回调重验同一本地会话与近期认证，唯一映射、并发冲突与禁用账号不自动注册 |
| SEC-03 | P1 | 原方案未考虑 pairwise subject 与 client 变更 | identity key 包含环境/issuer/client/sub，禁止跨 RP 字符串比对；issuer/client/sector 更换按身份迁移处理 |
| SEC-04 | P1 | AuthManager 的本地 logout 不等于全局撤销；上游到本地会话缺关联与传播上限 | 保存上游 sid 与本地 family；分当前产品、当前统一会话、所有设备退出；校验注销通知并去重；注销不解除身份绑定 |
| SEC-05 | P1 | IdP 故障与旧登录回退未限定，可能成为中央禁用的绕路 | 未联邦/已联邦账号区分；已知封禁不可被旧入口绕过；有界有效性重验与敏感操作在线检查，故障不无限续期 |
| SEC-06 | P1 | 仅有“服务身份+可选委托”原则，宽服务凭据可能替代普通用户 | actor/subject 分开；连接、用户、委托、目标策略取交集；目标不支持代办时不开“我的资源”接口 |
| SEC-07 | P1 | 帧集平台支持预览与普通前台不同；同 workspace 的对话/私人素材也不是成员全可读 | 独立能力与目标范围矩阵，普通 adapter 不使用支持预览；私人素材、团队素材、本人对话/job 分别校验 |
| SEC-08 | P1 | 只列数据库/缓存未覆盖全部派生副本及在途任务 | 补附件 HEAD/Range、导出、搜索、AI、队列、回调、审计、备份恢复与清理；本地取消不冒充远端取消 |
| SEC-09 | P2 | “登录后的私有目录”仍可能向所有登录用户泄露内部地址与摘要 | 目录可见/启动/摘要/动作四分；服务端投影，公开 Stars 快照仅公开字段 |
| SEC-10 | P1 | F2 档案托管排在 F3 身份试点前，可能被误读为可先上线无可靠身份的档案 | 纯无档案计算可先行；档案须有验收后的本地认证，否则等待 F3 |

## 再审中修正的边界

- 退出撤销会话与当次委托，保留账号绑定；不把普通 logout 变成 unlink。
- 60 秒是待验收的上游状态缓存目标，包含在途请求时不能直接称为“全站 60 秒内停止一切数据交付”。提交/交付前重验并报告实际窗口。
- 独立产品的业务角色不从 IdP admin claim 或门户管理员继承。目标已有支持例外仍由目标管理，不自动成为 Agent 工具。
- 零点 README 记录单店构建，商户/门店层级是扩展目标，不声称多商户平台已实现。

## 核对材料与验收边界

- 本仓库：`apps/api/src/modules/identity/service.py` 的 login/connect、getdel、connect_guard；`apps/api/src/controller/auth_manager.py` 的会话与近期认证；对接方案和模块扩展契约。
- 帧集：`ai-video/studio/README.md` 的后台支持预览、对话归属、团队与私人素材规则；零点根 README 的单店配置；观象 web/README.md 的本机单用户边界。
- 标准参考：[OIDC Core](https://openid.net/specs/openid-connect-core-1_0.html)、[OAuth 安全实践](https://www.rfc-editor.org/rfc/rfc9700.html)、[Back-Channel Logout](https://openid.net/specs/openid-connect-backchannel-1_0.html)、[Token Exchange](https://www.rfc-editor.org/rfc/rfc8693.html)。只核对设计方向，不声称现有实现符合标准。

判官负责身份流程与再审，阎王负责权限/数据范围，主线程整合并检查跨文档一致性。专题中的 ID/AU/DT 验收矩阵、IdP 能力选型、双用户/双空间测试及实际撤销时限均未执行，是后续放行门槛。
