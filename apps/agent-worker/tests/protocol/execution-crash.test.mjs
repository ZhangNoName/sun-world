import assert from 'node:assert/strict'
import { lstat, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
import { runInput } from './test-helpers.mjs'
import {
  alive,
  cli,
  ownedFixture,
  reap,
  waitFor,
} from '../fixtures/crash-owned.mjs'

const version = 'sun-world-worker-crash-proof/1'

for (const scenario of ['idle_cancelled', 'running', 'completed'])
  test(
    'actual controller SIGKILL preserves journal ownership and bounded recovery: ' +
      scenario,
    { skip: typeof process.getuid !== 'function', timeout: 30000 },
    async (t) => {
      try {
        assert.equal(process.versions.node, '24.17.0')
        const owned = await ownedFixture(t),
          run = runInput()
        const { controller, initialized } = await owned.startController(run)
        assert.ok(
          initialized.ok && initialized.available,
          'CONTROLLER_NOT_READY'
        )
        let starts = 0
        if (scenario === 'idle_cancelled') {
          const ack = await controller.request('cancel', { run })
          assert.ok(
            ack.ok && ack.status === 'cancelled' && ack.starts === 0,
            'CANCEL_NOT_DURABLE'
          )
        } else {
          owned.expectExecution()
          const ack = await controller.request('start', { run })
          assert.ok(
            ack.ok && ack.status === 'running' && ack.starts === 1,
            'REAL_RUNNER_NOT_STARTED'
          )
          starts = 1
          await waitFor(async () => {
            await owned.registerGroups()
            return owned.groups.size === 1
          })
          assert.ok(
            [...owned.groups].every(alive),
            'SYNTHETIC_GROUP_NOT_RUNNING'
          )
          assert.ok(
            (await readdir(join(owned.root, 'workspaces'))).some((name) =>
              name.startsWith('run-')
            ),
            'WORKSPACE_MISSING'
          )
          if (scenario === 'completed') {
            const ack = await controller.request('finish', { run })
            assert.ok(
              ack.ok && ack.status === 'completed',
              'COMPLETION_NOT_CONFIRMED'
            )
            assert.ok(
              [...owned.groups].every((pid) => !alive(pid)),
              'COMPLETION_GROUP_NOT_GONE'
            )
            assert.ok(
              (await readdir(join(owned.root, 'workspaces'))).length === 0,
              'COMPLETION_WORKSPACE_NOT_GONE'
            )
          }
        }
        const beforeRecord = await owned.record(run),
          beforeLock = await owned.lock()
        await owned.kill(controller)
        if (scenario === 'running') {
          assert.ok(
            [...owned.groups].every(alive),
            'CONTROLLER_DEATH_MUST_NOT_CONFIRM_EXECUTION_DEATH'
          )
          assert.ok(
            (await readdir(join(owned.root, 'workspaces'))).length > 0,
            'UNKNOWN_WORKSPACE_MUST_REMAIN'
          )
        }
        for (const apply of [false, true]) cli(owned.root, apply)
        const rejected = await owned.startController(run)
        assert.ok(
          !rejected.initialized.ok &&
            rejected.initialized.error === 'AGENT_JOURNAL_UNAVAILABLE',
          'STALE_LOCK_TAKEN_OVER'
        )
        await rejected.controller.request('exit')
        await rejected.controller.exit
        await waitFor(() => !alive(rejected.controller.child.pid))
        assert.ok(
          (await owned.record(run)).equals(beforeRecord),
          'LOCK_REJECTION_CHANGED_RECORD'
        )
        assert.ok(
          (await owned.lock()).equals(beforeLock),
          'LOCK_REJECTION_CHANGED_LOCK'
        )
        for (const pid of owned.groups) await reap(pid)
        await owned.unlock() // Fixture-only: every owned group is already proven gone.
        const recovered = await owned.startController(run)
        assert.ok(
          recovered.initialized.ok && recovered.initialized.starts === 0,
          'RECOVERY_REDISPATCHED'
        )
        const observed = await recovered.controller.request('inspect', { run })
        assert.equal(
          observed.status,
          scenario === 'idle_cancelled'
            ? 'cancelled'
            : scenario === 'running'
              ? 'interrupted'
              : 'completed'
        )
        let recoveryStarts = 0
        if (scenario === 'running') {
          assert.equal(recovered.initialized.available, false)
          const raw = JSON.parse((await owned.record(run)).toString())
          assert.ok(
            raw.status === 'interrupted' && raw.needs_reap === true,
            'UNKNOWN_EXECUTION_RELEASED'
          )
          for (const candidate of [run, runInput()]) {
            const ack = await recovered.controller.request('start', {
              run: candidate,
            })
            assert.ok(
              !ack.ok &&
                ack.error === 'AGENT_RUNTIME_UNAVAILABLE' &&
                ack.starts === 0,
              'UNKNOWN_EXECUTION_REPLAYED'
            )
          }
          const cancelled = await recovered.controller.request('cancel', {
            run,
          })
          assert.ok(
            !cancelled.ok && cancelled.error === 'AGENT_PROCESS_UNCONFIRMED',
            'UNKNOWN_CANCEL_CONFIRMED'
          )
          const closed = await recovered.controller.request('close')
          assert.ok(
            !closed.ok && closed.error === 'AGENT_PROCESS_UNCONFIRMED',
            'UNKNOWN_CLOSE_CONFIRMED'
          )
          assert.ok(
            (
              await lstat(join(owned.root, 'journal', '.controller.lock'))
            ).isFile(),
            'UNKNOWN_LOCK_REMOVED'
          )
          assert.ok(
            (await readdir(join(owned.root, 'workspaces'))).length > 0,
            'UNKNOWN_WORKSPACE_RELEASED'
          )
        } else if (scenario === 'idle_cancelled') {
          const ack = await recovered.controller.request('start', { run })
          assert.ok(
            !ack.ok &&
              ack.error === 'AGENT_EXECUTION_TERMINAL' &&
              ack.starts === 0,
            'LATE_START_REPLAYED'
          )
          assert.ok(
            (await recovered.controller.request('close')).ok,
            'TERMINAL_CLOSE_FAILED'
          )
        } else {
          const duplicate = await recovered.controller.request('start', { run })
          assert.ok(
            duplicate.ok &&
              duplicate.status === 'completed' &&
              duplicate.starts === 0,
            'COMPLETED_REQUEST_REPLAYED'
          )
          const changed = {
            ...run,
            deadline: new Date(Date.parse(run.deadline) + 1).toISOString(),
          }
          const conflict = await recovered.controller.request('start', {
            run: changed,
          })
          assert.ok(
            !conflict.ok &&
              conflict.error === 'AGENT_EXECUTION_CONFLICT' &&
              conflict.starts === 0,
            'CHANGED_REQUEST_REPLAYED'
          )
          const fresh = runInput()
          owned.expectExecution()
          const ack = await recovered.controller.request('start', {
            run: fresh,
          })
          assert.ok(ack.ok && ack.starts === 1, 'NEW_IDENTITY_NOT_ACCEPTED')
          assert.ok(
            (
              await recovered.controller.request('wait_completed', {
                run: fresh,
              })
            ).ok,
            'NEW_EXECUTION_NOT_COMPLETED'
          )
          await owned.registerGroups()
          assert.ok(
            owned.groups.size === 2 &&
              [...owned.groups].every((pid) => !alive(pid)),
            'NEW_GROUP_NOT_CONFIRMED_GONE'
          )
          recoveryStarts = 1
          assert.ok(
            (await recovered.controller.request('close')).ok,
            'TERMINAL_CLOSE_FAILED'
          )
        }
        await recovered.controller.request('exit')
        await recovered.controller.exit
        await waitFor(() => !alive(recovered.controller.child.pid))
        await owned.cleanup()
        assert.ok(owned.gone(), 'OWNED_GROUPS_NOT_GONE_AFTER_CLEANUP')
        let rootGone = false
        try {
          await lstat(owned.root)
        } catch (error) {
          rootGone = error.code === 'ENOENT'
        }
        assert.ok(rootGone, 'PRIVATE_ROOT_NOT_REMOVED')
        t.diagnostic(
          'worker-crash-proof ' +
            JSON.stringify({
              version,
              case: scenario,
              signal: 'SIGKILL',
              actual_controller_sigkill: true,
              fixture_only_unlock: true,
              controller_group_gone: true,
              stale_lock_rejected: true,
              lock_bytes_preserved: true,
              record_bytes_preserved_before_recovery: true,
              running_orphan_observed: scenario === 'running',
              recovery_needs_reap: scenario === 'running',
              runner_starts_before_crash: starts,
              runner_starts_after_recovery: recoveryStarts,
              owned_groups_gone: true,
              private_root_removed: true,
            })
        )
      } catch {
        throw new Error('WORKER_CRASH_VALIDATION_FAILED')
      }
    }
  )

test(
  'an old dead group cannot satisfy a second pending execution registration',
  { skip: typeof process.getuid !== 'function', timeout: 30000 },
  async (t) => {
    try {
      const owned = await ownedFixture(t),
        run = runInput()
      const first = await owned.startController(run)
      assert.ok(first.initialized.ok, 'CONTROLLER_NOT_READY')
      owned.expectExecution()
      assert.ok(
        (await first.controller.request('start', { run })).ok,
        'FIRST_START_FAILED'
      )
      await waitFor(async () => {
        await owned.registerGroups()
        return owned.groups.size === 1
      })
      assert.ok(
        (await first.controller.request('finish', { run })).ok,
        'FIRST_COMPLETION_FAILED'
      )
      assert.ok(
        [...owned.groups].every((pid) => !alive(pid)),
        'OLD_GROUP_NOT_GONE'
      )

      // Reserve the second dispatch's registration before it can enter a real
      // runner. At this stage only the completed old group has a marker. This
      // is also the observable state when a spawned bootstrap is delayed before
      // writing its nonce marker; no fabricated PID or marker fills the gap.
      owned.expectExecution()
      await assert.rejects(
        owned.cleanup(),
        /^Error: FIXTURE_CLEANUP_UNCONFIRMED_ROOT_RETAINED$/
      )
      assert.ok(
        (await lstat(owned.root)).isDirectory(),
        'MISSING_REGISTRATION_ROOT_REMOVED'
      )
      assert.ok(
        owned.groups.size === 1 && !owned.gone(),
        'OLD_GROUP_FILLED_NEW_GAP'
      )
      await assert.rejects(
        owned.unlock(),
        /FIXTURE_UNLOCK_REQUIRES_ALL_OWNED_GROUPS_GONE/
      )

      // Fulfil that reserved dispatch with the fixture's second actual
      // ProcessRunner execution, then require both registrations and ESRCH
      // before the same cleanup is allowed to remove its private root.
      const fresh = runInput(),
        second = await owned.startController(fresh)
      assert.ok(second.initialized.ok, 'SECOND_CONTROLLER_NOT_READY')
      const ack = await second.controller.request('start', { run: fresh })
      assert.ok(ack.ok && ack.starts === 1, 'SECOND_REAL_RUNNER_NOT_STARTED')
      assert.ok(
        (await second.controller.request('wait_completed', { run: fresh })).ok,
        'SECOND_COMPLETION_FAILED'
      )
      await owned.registerGroups()
      assert.ok(
        owned.groups.size === 2 &&
          [...owned.groups].every((pid) => !alive(pid)),
        'SECOND_REGISTRATION_NOT_CONFIRMED'
      )
      await owned.cleanup()
      assert.ok(owned.gone(), 'OWNED_GROUPS_NOT_GONE_AFTER_CLEANUP')
      await assert.rejects(lstat(owned.root), { code: 'ENOENT' })
    } catch {
      throw new Error('WORKER_CRASH_REGISTRATION_VALIDATION_FAILED')
    }
  }
)
