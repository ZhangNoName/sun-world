// Trusted pre-sandbox wrapper. stdin remains exclusively the execution input.
import { executeLinuxLaunch } from './linux-launcher.mjs'

try {
  if (process.argv.length !== 3 || process.argv[2].length > 16384)
    throw new Error()
  await executeLinuxLaunch(JSON.parse(process.argv[2]))
} catch {
  process.stderr.write('AGENT_LINUX_LAUNCH_FAILED\n')
  process.exitCode = 1
}
