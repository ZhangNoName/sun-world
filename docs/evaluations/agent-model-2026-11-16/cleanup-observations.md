# 回收观察与保留的失败

d3a21c40871838845dcb4171bfce8d4ae5203b46暂存树首次同时运行API gate、Worker gate和原生数据库套件。API606/native MySQL17/native API组合10/双Mongo隔离/真实四题通过，但Worker59/60，parent-exits/child-remains一项初次finalize未完成，直到40秒deadline后AGENT_EXECUTION_FAILED。SDK合成六情景前五通过，第六crash cleanup失败。参见[Worker日志](parallel-worker-failure.txt)和[SDK并行日志](parallel-sdk-failure.txt)。

随后串行Worker60/60通过；SDK完整suite串行仍第六失败，见[SDK串行日志](serial-sdk-failure.txt)。对应fsync日志登记的SDK PGID11187、14221后来分别检查ESRCH后才删除保留的私有root，不把后来消失写成当时已确认成功。故不能把两次SDK失败或Worker失败定性为仅由负载导致。

同树的无源码修改诊断运行：单crash场景通过；在原Fixture.close外层仅添加安全cause class/errno记录的整六情景也通过，未触发诊断行。它们是额外观察，不改判原失败，不替代最终无包装的默认suite。旧ProcessRunner初次finalize异常被吞、SDK close固定码缺少具体阶段，现有日志不足以区分瞬时权限、回收轮询窗口、目录删除或其他原因；后续应增加固定阶段/错误类别诊断再复现，不打印自由异常文本/凭据。

独立纯组件与实际owned Python孤儿注入又确认一项具体清理缺陷：SDK fixture reaper初次killpg(0)遇到EPERM便直接退出、没有尝试TERM/KILL，区别于已有outer launcher。这项可独立复现并修复；仍不能据此认定上面原生失败就是同一原因。永久拒绝必须保留unknown/失败，不能把权限拒绝当ESRCH。最终修正与验证结果见[分支交接](../../handoff/branches/zxy-dsh-platform-foundation.md)。

默认进程门禁和SDK六情景用于本机验证；Linux实际memory/PID/network/cgroup/reaper、宿主崩溃与生产身份仍未验收。串行通过不构成并行清理稳定性或生产隔离保证。
