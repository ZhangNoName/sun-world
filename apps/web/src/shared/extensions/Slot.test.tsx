import { lazy, memo, StrictMode } from 'react'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import userEvent from '@testing-library/user-event'
import {
  createContributionRegistry,
  Slot,
  type Contribution,
  type ContributionProps,
} from './index'

interface Context {
  scene: 'chat'
  presentation: 'sidebar' | 'rail'
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}
const initial = {
  slotId: 'tools',
  context: { scene: 'chat', presentation: 'sidebar' } as Context,
  scope: {
    projectId: 'sun-world',
    accountKey: 'account-a',
    sessionKey: 'session-1',
  },
  enabledModuleIds: ['host', 'feature'],
  capabilities: { status: 'ready' as const, grants: ['read'] },
}
function setup(items: Partial<Contribution<Context>>[] = [{}]) {
  const signals: AbortSignal[] = []
  const View = ({ context, scope, signal }: ContributionProps<Context>) => {
    signals.push(signal)
    return (
      <span>
        {scope.accountKey}:{scope.projectId}:{scope.sessionKey}:
        {context.presentation}
      </span>
    )
  }
  const load = vi.fn<Contribution<Context>['load']>(async () => ({
    default: View,
  }))
  const registry = createContributionRegistry<Context>({
    slots: [
      {
        id: 'tools',
        version: '1',
        ownerModuleId: 'host',
        maxContributions: 8,
        validateContext: (value): value is Context =>
          !!value &&
          typeof value === 'object' &&
          (value as Context).scene === 'chat' &&
          ['sidebar', 'rail'].includes((value as Context).presentation),
      },
    ],
    modules: [
      { id: 'host', version: '1', dependencies: [], contributions: [] },
      {
        id: 'feature',
        version: '1',
        dependencies: [{ id: 'host', version: '1' }],
        contributions: items.map((item, index) => ({
          id: `item-${index}`,
          moduleId: 'feature',
          slot: 'tools',
          slotVersion: '1',
          order: index,
          requires: ['read'],
          projectIds: ['sun-world', 'other'],
          load,
          ...item,
        })),
      },
    ],
    knownCapabilities: ['read'],
  })
  return { registry, load, View, signals }
}
afterEach(cleanup)
it('accepts a standard memoized React component', async () => {
  const { registry } = setup([
    { load: async () => ({ default: memo(() => <span>memo entry</span>) }) },
  ])
  render(<Slot {...initial} registry={registry} />)
  await screen.findByText('memo entry')
})
it('does not execute lazy loaders during SSR', () => {
  const { registry, load } = setup()
  expect(renderToString(<Slot {...initial} registry={registry} />)).toContain(
    '正在加载功能'
  )
  expect(load).not.toHaveBeenCalled()
})
it('starts in an effect, rejects schema-invalid contexts and loads public entries without grants', async () => {
  const { registry, load } = setup([{ requires: [] }, {}])
  const view = render(
    <Slot
      {...initial}
      context={{ scene: 'invalid' } as unknown as Context}
      registry={registry}
    />
  )
  expect(load).not.toHaveBeenCalled()
  view.rerender(
    <Slot
      {...initial}
      registry={registry}
      capabilities={{ status: 'loading' }}
    />
  )
  await screen.findByText('account-a:sun-world:session-1:sidebar')
  expect(load).toHaveBeenCalledOnce()
})
it.each(['permission', 'module'] as const)(
  'unmounts and aborts on %s revocation',
  async (reason) => {
    const { registry, signals } = setup()
    const view = render(<Slot {...initial} registry={registry} />)
    await screen.findByText('account-a:sun-world:session-1:sidebar')
    const signal = signals.at(-1)!
    view.rerender(
      <Slot
        {...initial}
        registry={registry}
        capabilities={{
          status: 'ready',
          grants: reason === 'permission' ? [] : ['read'],
        }}
        enabledModuleIds={
          reason === 'module' ? ['host'] : initial.enabledModuleIds
        }
      />
    )
    expect(signal.aborted).toBe(true)
    expect(
      screen.queryByText('account-a:sun-world:session-1:sidebar')
    ).not.toBeInTheDocument()
  }
)
it.each(['accountKey', 'projectId', 'sessionKey', 'context'] as const)(
  'aborts the old mount on %s change and on unmount',
  async (field) => {
    const { registry, load, signals } = setup()
    const view = render(<Slot {...initial} registry={registry} />)
    await screen.findByText('account-a:sun-world:session-1:sidebar')
    const old = signals.at(-1)!
    const next =
      field === 'context'
        ? {
            ...initial,
            context: { ...initial.context, presentation: 'rail' as const },
          }
        : {
            ...initial,
            scope: {
              ...initial.scope,
              [field]: field === 'projectId' ? 'other' : 'new-value',
            },
          }
    view.rerender(<Slot {...next} registry={registry} />)
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(signals.at(-1)).not.toBe(old))
    expect(old.aborted).toBe(true)
    const current = signals.at(-1)!
    expect(current.aborted).toBe(false)
    view.unmount()
    expect(current.aborted).toBe(true)
  }
)
it('does not mount a lazy result arriving after a scope change', async () => {
  const first = deferred<{ default: () => React.ReactNode }>()
  const late = vi.fn(() => <span>OLD PRIVATE CONTENT</span>)
  const { registry, load } = setup()
  load.mockReturnValueOnce(first.promise)
  const view = render(<Slot {...initial} registry={registry} />)
  await waitFor(() => expect(load).toHaveBeenCalledOnce())
  view.rerender(
    <Slot
      {...initial}
      registry={registry}
      scope={{ ...initial.scope, accountKey: 'account-b' }}
    />
  )
  await screen.findByText('account-b:sun-world:session-1:sidebar')
  await act(async () => first.resolve({ default: late }))
  expect(late).not.toHaveBeenCalled()
  expect(screen.queryByText('OLD PRIVATE CONTENT')).not.toBeInTheDocument()
})
it('isolates loader errors and retries only the failed contribution with a new loader', async () => {
  const broken = vi
    .fn()
    .mockRejectedValueOnce(new Error('PRIVATE ERROR'))
    .mockResolvedValue({ default: () => <span>recovered</span> })
  const { registry, load, signals } = setup([
    { id: 'broken', load: broken },
    { id: 'healthy' },
  ])
  render(<Slot {...initial} registry={registry} />)
  await screen.findByRole('alert')
  await screen.findByText('account-a:sun-world:session-1:sidebar')
  expect(screen.queryByText('PRIVATE ERROR')).not.toBeInTheDocument()
  const healthy = signals.at(-1)!
  await userEvent.click(screen.getByRole('button', { name: '重试' }))
  await screen.findByText('recovered')
  expect(broken).toHaveBeenCalledTimes(2)
  expect(load).toHaveBeenCalledOnce()
  expect(healthy.aborted).toBe(false)
})
it('is safe under StrictMode and never mounts after unmount', async () => {
  const pending = deferred<{ default: () => React.ReactNode }>()
  const late = vi.fn(() => <span>late</span>)
  const { registry, load } = setup()
  load.mockReturnValue(pending.promise)
  const view = render(
    <StrictMode>
      <Slot {...initial} registry={registry} />
    </StrictMode>
  )
  await waitFor(() => expect(load).toHaveBeenCalledOnce())
  view.unmount()
  await act(async () => pending.resolve({ default: late }))
  expect(late).not.toHaveBeenCalled()
})
it('aborts and removes the old component while an identical-ID replacement registry loads', async () => {
  const old = setup(),
    next = setup()
  const pending = deferred<Awaited<ReturnType<Contribution<Context>['load']>>>()
  next.load.mockReturnValue(pending.promise)
  const view = render(<Slot {...initial} registry={old.registry} />)
  await screen.findByText('account-a:sun-world:session-1:sidebar')
  const oldSignal = old.signals.at(-1)!
  view.rerender(<Slot {...initial} registry={next.registry} />)
  expect(oldSignal.aborted).toBe(true)
  expect(
    screen.queryByText('account-a:sun-world:session-1:sidebar')
  ).not.toBeInTheDocument()
  await waitFor(() => expect(next.load).toHaveBeenCalledOnce())
  await act(async () =>
    pending.resolve({ default: () => <span>new implementation</span> })
  )
  await screen.findByText('new implementation')
})
it('aborts a component that throws during rendering and retries with a fresh signal', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const captured: AbortSignal[] = []
  let fail = true
  const { registry, load } = setup([
    {
      load: async () => ({
        default: ({ signal }) => {
          captured.push(signal)
          if (fail) throw new Error('PRIVATE RENDER FAILURE')
          return <span>render recovered</span>
        },
      }),
    },
  ])
  const view = render(<Slot {...initial} registry={registry} />)
  await screen.findByRole('alert')
  expect(captured.every((signal) => signal.aborted)).toBe(true)
  expect(screen.queryByText('PRIVATE RENDER FAILURE')).not.toBeInTheDocument()
  fail = false
  await userEvent.click(screen.getByRole('button', { name: '重试' }))
  await screen.findByText('render recovered')
  expect(captured.at(-1)?.aborted).toBe(false)
  expect(load).not.toHaveBeenCalled()
  view.unmount()
  expect(captured.at(-1)?.aborted).toBe(true)
})
it('keeps a suspended lazy contribution in its own loading state beside a healthy entry', async () => {
  const pending = deferred<{ default: () => React.ReactNode }>()
  const Lazy = lazy(() => pending.promise)
  const { registry } = setup([
    { load: async () => ({ default: Lazy }) },
    { requires: [] },
  ])
  render(<Slot {...initial} registry={registry} />)
  await screen.findByText('account-a:sun-world:session-1:sidebar')
  expect(screen.getByRole('status')).toHaveTextContent('正在加载功能')
  await act(async () =>
    pending.resolve({ default: () => <span>lazy entry</span> })
  )
  expect(screen.getByText('lazy entry')).toBeInTheDocument()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})
it('isolates lazy rejection and retries with a new mount and signal without host Suspense', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const failed = deferred<{ default: () => React.ReactNode }>()
  const recovered = deferred<{ default: () => React.ReactNode }>()
  const signals: AbortSignal[] = []
  const load = vi
    .fn<Contribution<Context>['load']>()
    .mockImplementation(async () => {
      const Lazy = lazy(() =>
        load.mock.calls.length === 1 ? failed.promise : recovered.promise
      )
      return {
        default: (props) => {
          signals.push(props.signal)
          return <Lazy />
        },
      }
    })
  const { registry } = setup([{ load }, { requires: [] }])
  render(<Slot {...initial} registry={registry} />)
  await screen.findByText('account-a:sun-world:session-1:sidebar')
  await act(async () => failed.reject(new Error('PRIVATE LAZY ERROR')))
  await screen.findByRole('alert')
  expect(signals.length).toBeGreaterThan(0)
  expect(signals.every((signal) => signal.aborted)).toBe(true)
  expect(screen.queryByText('PRIVATE LAZY ERROR')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '重试' }))
  await waitFor(() => expect(load).toHaveBeenCalledTimes(2))
  expect(signals.at(-1)?.aborted).toBe(false)
  await act(async () =>
    recovered.resolve({ default: () => <span>lazy recovered</span> })
  )
  expect(screen.getByText('lazy recovered')).toBeInTheDocument()
  expect(
    screen.getByText('account-a:sun-world:session-1:sidebar')
  ).toBeInTheDocument()
})
it('does not mount a suspended lazy entry after permission revocation', async () => {
  const pending = deferred<{ default: () => React.ReactNode }>()
  const late = vi.fn(() => <span>late lazy entry</span>)
  const Lazy = lazy(() => pending.promise)
  const signals: AbortSignal[] = []
  const { registry } = setup([
    {
      load: async () => ({
        default: (props) => {
          signals.push(props.signal)
          return <Lazy />
        },
      }),
    },
    { requires: [] },
  ])
  const view = render(<Slot {...initial} registry={registry} />)
  await screen.findByText('account-a:sun-world:session-1:sidebar')
  expect(signals.length).toBeGreaterThan(0)
  view.rerender(
    <Slot
      {...initial}
      registry={registry}
      capabilities={{ status: 'ready', grants: [] }}
    />
  )
  expect(signals.every((signal) => signal.aborted)).toBe(true)
  await act(async () => pending.resolve({ default: late }))
  expect(late).not.toHaveBeenCalled()
  expect(
    screen.getByText('account-a:sun-world:session-1:sidebar')
  ).toBeInTheDocument()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})
