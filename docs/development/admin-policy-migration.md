# 管理员权限影子迁移

日期：2026-11-15。当前分支本地实现，未切换鉴权、未部署。阶段 A 的后续范围见[分阶段计划](../plans/dsh-platform-implementation.md)。

## 源码盘点

本轮只检查源码和无运行时初始化的路由组合，不读取数据库账户或凭据，也不代表生产角色数据已核对。

| 现有数据或入口 | 作用 | 当前权限边界 |
| --- | --- | --- |
| `roles`、`user_roles` | 角色定义与账户绑定 | UserManager 查询当前角色，AuthManager 验证会话与账户状态 |
| `resources`、`role_resources` | 页面、接口、按钮元数据与角色绑定 | 会随用户信息返回；`require_admin` 不以这些行决定放行，不直接映射为 capability |
| 文章写入口 | 创建、修改、删除，3 项 | 当前管理员角色 |
| 账号管理 | 创建、列表、详情、删除，4 项 | 当前管理员角色；本人资料另走原路径 |
| 角色管理 | CRUD、绑定资源，6 项 | 当前管理员角色 |
| 资源管理 | CRUD，5 项 | 当前管理员角色 |
| 文件上传 | 图片、视频，2 项 | 当前管理员角色 |
| 管理查询与 AI 目录 | 指标、日志、遥测、告警、模型目录，10 项 | 当前管理员角色 |
| 字典与评论管理 | 字典类型/条目 CRUD、评论查询/审核，10 项 | 当前管理员角色 |

总计 **40 个 HTTP method + 路由模板**。这里只盘点 `require_admin` 依赖树覆盖的入口，不包含普通登录、本人物品归属和公开查询。权限授予、删管理员、绑定资源等旧写入口仍需后续近期认证、审计和最后恢复管理员保护，不能因路由在清单中就视为这些能力已完成安全迁移。

## 影子判定

1. 原 `get_current_user` 继续验证 Cookie、Redis 会话与当前账户，再交给原管理员角色判断。401 的认证失败不会进入影子比较。
2. 候选基线仅接受清单中的操作、用户主体、正整数用户 ID 与当前 `admin` 角色。不检查资源行，也不把管理员身份解释成 Agent 写权限；公开读取策略保持原状。
3. 影子结果仅作观测。新旧判断不同、入口未登记或候选计算异常时，写入现有有界审计日志。候选或日志失败不改变旧鉴权结果；没有“任一策略允许即放行”的分支。
4. 事件为 `admin_policy_shadow_candidate_allow`、`admin_policy_shadow_candidate_deny`、`admin_policy_shadow_unmapped` 和 `admin_policy_shadow_error`。只写已登记的 method/路由模板；未知入口记固定占位，不写账户、Cookie、原始路径、查询参数或异常文本。匹配结果不逐请求写盘。

比较使用本次已验证的账户上下文，无额外会话体系、无 allow 缓存。新基线只在影子模块使用，不能作为业务服务或工具授权接口。

## 漂移门禁与验证

```bash
apps/api/.venv/bin/python scripts/check-admin-policy.py
corepack pnpm check:api
```

检查复用 OpenAPI 的 schema-only 组合根，遍历有效路由依赖树，覆盖路由级、端点级和嵌套依赖及前缀。基线与实际集合双向比较：新增入口未登记、已有守卫移除或路由删除但基线未清理都会失败。包含管理员守卫的同 method/path 重复注册也会拒绝，避免无守卫版本优先匹配而集合检查仍通过。对前置公开动态路由与管理员路由的固定前缀重叠，按注册顺序保守拒绝；不尝试证明任意路径转换器的正则互斥，可将更具体的受保护路由放在前面。它验证守卫覆盖，不证明服务层归属或业务约束正确；人工调用守卫不代替依赖声明。

下一步需在明确目标环境只读核对实际角色/resource 行、重复/失联绑定和恢复管理员，再逐入口定义最小能力、资源范围和迁移时点。本轮不执行 DDL、不改权限数据、不启用权限管理新后台或 Agent 写工具。


## 实际数据的只读盘点

```bash
apps/api/.venv/bin/python scripts/audit-local-permissions.py --local
```

此命令只读取明确的 `local.yml` 和 `local.override.yml` 中MySQL配置，忽略任意覆盖路径、AI凭据和生产配置；运行模式非local/dev/test时拒绝。local配置可以指向远端数据库，因此这里的“local”只表示配置profile，不声称数据库位于本机。

同一连接以REPEATABLE READ + WITH CONSISTENT SNAPSHOT + READ ONLY开启事务，确认五张授权表都是InnoDB后读取计数，成功/失败均rollback，不调用commit；连接始终关闭。角色/资源定义最多各10000条，超过上限拒绝报告；内部只取定义ID/代码，不查询账号身份或凭据列。角色代码采用Python的strip/lower与现有守卫一致，避免SQL TRIM漏掉Tab和Unicode空白。管理员按DISTINCT启用用户计数，不因重复角色绑定重复计人。

标准输出只有版本、计数、问题代码与提醒，无用户ID、名称、联系方式、密码、主机、资源路径或驱动异常。退出码：0=本次聚合未发现结构问题（仍可能有提醒），2=有结构问题或无启用管理员，1=配置/读取/事务失败、未产出报告。`administrator_recovery`始终为unverified，不将“有admin角色”当作恢复路径已验证。

2026-11-15配置local目标的只读快照结果：users6、roles2、resources0、user_roles6、role_resources0、enabled administrators1；空码、重复码、重复/失联绑定计数均0。存在single_enabled_administrator提醒，未修改任何表或角色。资源目录为空证明当前数据不足以直接生成细粒度capability映射，不以空目录推导放行或拒绝现有管理员操作。

本次核对只代表读取时的配置目标，不证明生产环境数据一致，也不作为自动开写功能依据。下一步需确认恢复管理员的实际登录方式和运维恢复路径，逐入口定义/评审能力映射；旧管理员守卫继续生效。
