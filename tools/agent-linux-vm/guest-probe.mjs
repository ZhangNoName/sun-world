import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, readlinkSync, statfsSync } from 'node:fs'
import { cpus, networkInterfaces, release, totalmem } from 'node:os'

assert.equal(process.platform, 'linux')
assert.equal(process.arch, 'arm64')
assert.equal(process.version, 'v24.17.0')
const seed = Number(process.env.SW_LINUX_EPOCH)
const beforeClock = Number(process.env.SW_LINUX_CLOCK_BEFORE)
assert.ok(
  Number.isSafeInteger(seed) && seed >= 1600000000 && seed <= 4102444800
)
assert.ok(Number.isSafeInteger(beforeClock) && beforeClock >= 0)
assert.ok(Math.abs(Date.now() - seed * 1000) < 120000)
const controllers = readFileSync('/sys/fs/cgroup/cgroup.controllers', 'utf8')
  .trim()
  .split(/\s+/)
  .sort()
assert.equal(statfsSync('/sys/fs/cgroup').type, 0x63677270)
assert.ok(['memory', 'pids'].every((name) => controllers.includes(name)))
assert.ok(Object.keys(networkInterfaces()).every((name) => name === 'lo'))
const namespaces = ['mnt', 'net', 'pid', 'user']
const before = Object.fromEntries(
  namespaces.map((name) => [name, readlinkSync('/proc/self/ns/' + name)])
)
const inner = `
  const fs=require('node:fs'),os=require('node:os');
  const names=['mnt','net','pid','user'];
  process.stdout.write(JSON.stringify({pid:process.pid,
    namespaces:Object.fromEntries(names.map(n=>[n,fs.readlinkSync('/proc/self/ns/'+n)])),
    processes:fs.readdirSync('/proc').filter(n=>/^[0-9]+$/.test(n)),
    interfaces:Object.keys(os.networkInterfaces())}));`
const nested = JSON.parse(
  execFileSync(
    '/usr/bin/unshare',
    [
      '--user',
      '--map-root-user',
      '--mount',
      '--net',
      '--pid',
      '--fork',
      '--mount-proc',
      process.execPath,
      '-e',
      inner,
    ],
    { encoding: 'utf8', timeout: 5000, maxBuffer: 8192 }
  )
)
assert.equal(nested.pid, 1)
assert.deepEqual(nested.processes, ['1'])
assert.ok(nested.interfaces.every((name) => name === 'lo'))
assert.ok(namespaces.every((name) => before[name] !== nested.namespaces[name]))
const proof = {
  version: 'sun-world-linux-guest-probe/1',
  platform: process.platform,
  architecture: process.arch,
  node: process.version,
  kernel: release(),
  cpu_count: cpus().length,
  memory_bytes: totalmem(),
  test_host_clock_seed_applied: true,
  clock_before_seed_seconds: beforeClock,
  cgroup2_mounted: true,
  required_controllers: ['memory', 'pids'],
  namespace_probe_succeeded: true,
  network_devices_other_than_loopback: 0,
  per_run_isolation_verified: false,
}
console.log('SW_LINUX_PROBE ' + JSON.stringify(proof))
