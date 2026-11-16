#!/bin/sh
export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
export LC_ALL=C TZ=UTC
export NO_COLOR=1 NODE_DISABLE_COLORS=1
export SW_LINUX_EPOCH="${sw_epoch:-0}"
umask 077
status=1
finish() {
  printf '\nSW_LINUX_GUEST_RESULT {"version":"sun-world-linux-guest-result/1","protocol_exit":%s}\n' "$status"
  sync
  # This /proc is exclusively the disposable Linux guest's mounted procfs.
  printf o >/proc/sysrq-trigger
  while :; do sleep 1; done
}
trap finish EXIT
cd /work/sun-world || exit 1
case "$SW_LINUX_EPOCH" in ''|*[!0-9]*) exit 1 ;; esac
[ "${#SW_LINUX_EPOCH}" -eq 10 ] || exit 1
[ "$SW_LINUX_EPOCH" -ge 1600000000 ] && [ "$SW_LINUX_EPOCH" -le 4102444800 ] || exit 1
export SW_LINUX_CLOCK_BEFORE="$(date +%s)"
date -s "@$SW_LINUX_EPOCH" >/dev/null || exit 1
if [ "${sw_gateway:-0}" = 1 ]; then
  /usr/local/bin/busybox ip link set dev lo up || exit 1
  # Guest-local controller TLS name; no DNS or external network is available.
  printf '127.0.0.1 localhost\n::1 localhost\n' >/etc/hosts || exit 1
fi
node /work/probe.mjs || exit 1
node --test --test-reporter=tap \
  apps/agent-worker/tests/protocol/execution-service.test.mjs \
  apps/agent-worker/tests/protocol/execution-journal.test.mjs \
  apps/agent-worker/tests/protocol/journal-maintenance.test.mjs \
  apps/agent-worker/tests/protocol/process-runner.test.mjs \
  apps/agent-worker/tests/protocol/execution-crash.test.mjs
status=$?
if [ "$status" -eq 0 ] && [ "${sw_containment:-0}" = 1 ]; then
  node tools/agent-linux-vm/containment-suite.mjs
  status=$?
fi
if [ "$status" -eq 0 ] && [ "${sw_gateway:-0}" = 1 ]; then
  node tools/agent-linux-vm/gateway-suite.mjs &&
    node apps/agent-worker/tests/integration/sdk-run.mjs /runtime-sdk --linux-gateway
  status=$?
fi
if [ "$status" -eq 0 ] && [ "${sw_stack:-0}" = 1 ]; then
  chmod 700 /runtime-sdk || exit 1
  export PYTHONDONTWRITEBYTECODE=1
  /opt/python/bin/python3.12 -I tools/agent-linux-vm/stack-probe.py &&
    /opt/python/bin/python3.12 -I scripts/test-agent-sdk-stack.py \
      --mysqld /opt/mysql/bin/mysqld --redis-server /usr/local/bin/redis-server \
      --mongod /opt/mongo/bin/mongod --sdk-runtime /runtime-sdk \
      --node /usr/local/bin/node --linux-stack
  status=$?
fi
exit "$status"
