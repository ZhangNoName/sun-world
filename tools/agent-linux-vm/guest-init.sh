#!/bin/sh
# This file is /init only inside the disposable, NIC-free guest.
set -eu
export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
export LC_ALL=C TZ=UTC
if [ -x /usr/bin/busybox ]; then BB=/usr/bin/busybox; else BB=/bin/busybox; fi
early_failure() {
  printf '\nSW_LINUX_EARLY_FAILURE\n'
  if [ -w /proc/sysrq-trigger ]; then printf o >/proc/sysrq-trigger; fi
  while :; do "$BB" sleep 1; done
}
trap early_failure EXIT
"$BB" mkdir -p /proc /sys /dev
"$BB" mount -t proc proc /proc
"$BB" mount -t sysfs sysfs /sys
"$BB" mount -t devtmpfs devtmpfs /dev
modprobe virtio_console 2>/dev/null || true
modprobe virtio_rng 2>/dev/null || true
exec </dev/hvc0 >/dev/hvc0 2>&1
"$BB" mkdir -p /newroot
"$BB" mount -t tmpfs -o mode=0755,size=1536m tmpfs /newroot
"$BB" cp -a /sw-root/. /newroot/
"$BB" cp -a "$BB" /newroot/usr/local/bin/busybox
"$BB" mkdir -p /newroot/tmp /newroot/run /newroot/proc /newroot/sys /newroot/dev
"$BB" mount -t tmpfs -o mode=1777,nosuid,nodev,size=384m tmpfs /newroot/tmp
for name in proc sys dev; do
  "$BB" mount --move "/$name" "/newroot/$name"
done
"$BB" mkdir -p /newroot/sys/fs/cgroup
"$BB" mount -t cgroup2 none /newroot/sys/fs/cgroup
exec "$BB" switch_root /newroot /usr/local/bin/tini -- /bin/sh /work/run-guest.sh
