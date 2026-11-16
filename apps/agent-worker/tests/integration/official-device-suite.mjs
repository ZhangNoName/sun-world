// Native probe through the same production launchSpec, with the channel live.
import assert from 'node:assert/strict'
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  rmdir,
  stat,
  writeFile,
} from 'node:fs/promises'
import { join } from 'node:path'
import { createLinuxLaunchSpec } from '../../src/linux-launcher.mjs'
import { ProcessRunner } from '../../src/process-runner.mjs'
import { runInput } from '../protocol/test-helpers.mjs'

assert.equal(process.platform, 'linux')
const serial = await stat('/dev/hvc1')
assert.ok(serial.isCharacterDevice() && serial.rdev > 0)
const root = await mkdtemp('/run/sun-world-official-device-')
const cgroup = '/sys/fs/cgroup/' + root.split('/').at(-1)
await mkdir(cgroup, { mode: 0o700 })
await chmod(cgroup, 0o700)
await writeFile(join(cgroup, 'cgroup.subtree_control'), '+memory +pids')
const runtime = join(root, 'runtime'),
  workspaces = join(root, 'workspaces')
await mkdir(runtime, { mode: 0o700 })
await mkdir(workspaces, { mode: 0o700 })
await writeFile(
  join(runtime, 'probe.mjs'),
  `
import assert from 'node:assert/strict';
import fs from 'node:fs';
let wire='';for await(const chunk of process.stdin){wire+=chunk;assert.ok(wire.length<=65536)}
const {rdev}=JSON.parse(JSON.parse(wire).run.question);
assert.ok(Number.isSafeInteger(rdev)&&rdev>0);
for(const path of ['/dev/hvc1','/proc/1/root/dev/hvc1']){
  assert.throws(()=>fs.openSync(path,'r'),error=>error.code==='ENOENT');
}
for(const entry of fs.readdirSync('/proc/self/fd')){
  try {const s=fs.fstatSync(Number(entry));assert.ok(!s.isCharacterDevice()||s.rdev!==rdev)}
  catch(error){if(error.code!=='EBADF')throw error}
}
assert.ok(!Object.keys(process.env).some(k=>/OPENAI|PROXY|KEY_FILE/.test(k)));
fs.writeFileSync('/work/home/proof.json',JSON.stringify({path_denied:true,inherited_device_absent:true,provider_environment_absent:true}));
`
)
let handle, sample, proof
try {
  const launch = createLinuxLaunchSpec({
    cgroupRoot: cgroup,
    runtimeDirectory: runtime,
    entry: 'probe.mjs',
  })
  const runner = new ProcessRunner({
    workspaceRoot: workspaces,
    launchSpec: async (context) => {
      let containment
      const observed = {
        stop: () => containment.stop(),
        release: async () => {
          proof = JSON.parse(
            await readFile(join(context.workspace, 'home/proof.json'), 'utf8')
          )
          sample = await containment.snapshot()
          await containment.release()
        },
      }
      const specification = await launch({
        ...context,
        registerContainment(value) {
          containment = value
          context.registerContainment(observed)
        },
      })
      assert.equal(specification.containment, containment)
      return { ...specification, containment: observed }
    },
  })
  handle = await runner.start(
    runInput({
      question: JSON.stringify({ rdev: serial.rdev }),
      deadline: new Date(Date.now() + 15000).toISOString(),
    })
  )
  await handle.done
  assert.deepEqual(proof, {
    path_denied: true,
    inherited_device_absent: true,
    provider_environment_absent: true,
  })
  assert.equal(sample.populated, 0)
  assert.equal(sample.pids_current, 0)
  assert.deepEqual(await readdir(workspaces), [])
  assert.ok(
    (await readdir(cgroup, { withFileTypes: true })).every(
      (e) => !e.isDirectory()
    )
  )
  await rmdir(cgroup)
  await rm(root, { recursive: true })
  console.log(
    'SW_LINUX_OFFICIAL_DEVICE_RESULT ' +
      JSON.stringify({
        version: 'sun-world-linux-official-device/1',
        controller_device_present: true,
        task_device_path_denied: true,
        task_inherited_device_absent: true,
        task_provider_environment_absent: true,
        cgroup_and_workspace_removed: true,
      })
  )
} finally {
  if (handle) await handle.stop()
}
