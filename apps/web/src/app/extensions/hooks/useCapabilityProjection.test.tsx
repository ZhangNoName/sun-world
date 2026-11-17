import { StrictMode, useEffect } from 'react'
import { renderToString } from 'react-dom/server'
import { act, render, screen, waitFor } from '@testing-library/react'
import { CAPABILITY_KEYS } from '@sun-world/contracts'

import { getCapabilityProjection } from '@/modules/account/api'
import type { CapabilityProjection, UserInfo } from '@/modules/account/types'
import {
  PageContributionsProvider,
  usePageContributions,
} from '@/modules/page-contributions'
import { AiWorkspaceTools } from '@/modules/ai/components/AiWorkspaceTools'
import {
  aiWorkspaceToolsSlot,
  type AiToolsContext,
} from '@/modules/ai/extension-contract'
import {
  createContributionRegistry,
  type ContributionProps,
} from '@/shared/extensions'
import { useAuthStore } from '@/store/auth'
import { AppPageContributions } from '../AppPageContributions'
import { useCapabilityProjection } from './useCapabilityProjection'

vi.mock('@/modules/account/api', async (original) => ({
  ...(await original<typeof import('@/modules/account/api')>()),
  getCapabilityProjection: vi.fn(),
}))

const user: UserInfo = {
  id: 1,
  name: '合成用户',
  age: 0,
  birth_day: '2000-01-01',
  email: '',
  phone: '',
  sex: 0,
  status: true,
}
const signals: AbortSignal[] = []
function Restricted({ signal }: ContributionProps<AiToolsContext>) {
  useEffect(() => {
    signals.push(signal)
  }, [signal])
  return <span>受限入口</span>
}
function Public() {
  return <span>公开入口</span>
}
const registry = createContributionRegistry<AiToolsContext>({
  slots: [aiWorkspaceToolsSlot],
  knownCapabilities: CAPABILITY_KEYS,
  modules: [
    { id: 'ai', version: '1', dependencies: [], contributions: [] },
    {
      id: 'synthetic',
      version: '1',
      dependencies: [],
      contributions: [
        {
          id: 'synthetic.restricted',
          moduleId: 'synthetic',
          slot: aiWorkspaceToolsSlot.id,
          slotVersion: '1',
          order: 1,
          requires: ['identity.role.create'],
          projectIds: ['sun-world'],
          load: async () => ({ default: Restricted }),
        },
        {
          id: 'synthetic.public',
          moduleId: 'synthetic',
          slot: aiWorkspaceToolsSlot.id,
          slotVersion: '1',
          order: 2,
          requires: [],
          projectIds: ['sun-world'],
          load: async () => ({ default: Public }),
        },
      ],
    },
  ],
})
const fetcher = vi.mocked(getCapabilityProjection)
function result(
  changes: Partial<CapabilityProjection> = {}
): CapabilityProjection {
  return {
    app_id: 'sun-world',
    account_id: '1',
    session_ref: 'a'.repeat(64),
    capabilities: ['identity.role.create'],
    max_age_seconds: 15,
    ...changes,
  }
}
function pending() {
  let resolve!: (value: CapabilityProjection) => void
  const promise = new Promise<CapabilityProjection>((yes) => {
    resolve = yes
  })
  return { promise, resolve }
}
function Harness({ consumers = 1 }: { consumers?: number }) {
  const projection = useCapabilityProjection()
  return (
    <PageContributionsProvider
      registry={registry}
      enabledModuleIds={['ai', 'synthetic']}
      {...projection}
    >
      {Array.from({ length: consumers }, (_, index) => (
        <AiWorkspaceTools key={index} presentation="sidebar" />
      ))}
    </PageContributionsProvider>
  )
}

beforeEach(() => {
  signals.length = 0
  fetcher.mockReset()
  fetcher.mockResolvedValue(result())
  useAuthStore.getState().clearTokens()
  useAuthStore.setState({ status: 'authenticated', user })
})

it('has no side effects for SSR or a provider with no consumers', async () => {
  expect(renderToString(<Harness />)).not.toContain('受限入口')
  expect(fetcher).not.toHaveBeenCalled()
  const mounted = render(<Harness consumers={0} />)
  expect(fetcher).not.toHaveBeenCalled()
  mounted.rerender(<Harness consumers={2} />)
  expect(await screen.findAllByText('受限入口')).toHaveLength(2)
  expect(fetcher).toHaveBeenCalledTimes(1)
  const signal = fetcher.mock.calls[0][0]
  mounted.unmount()
  // A completed fetch no longer owns resources; mounted contributions do.
  expect(signals.every((item) => item.aborted)).toBe(true)
  expect(signal).toBeInstanceOf(AbortSignal)
})

it('removes captured grants on account change and rejects a response from the old account', async () => {
  render(<Harness />)
  await screen.findByText('受限入口')
  const late = pending()
  fetcher.mockReturnValueOnce(late.promise)
  act(() => useAuthStore.setState({ user: { ...user, id: 2 } }))
  expect(screen.queryByText('受限入口')).not.toBeInTheDocument()
  expect(signals[0].aborted).toBe(true)
  await act(async () => late.resolve(result()))
  expect(screen.queryByText('受限入口')).not.toBeInTheDocument()
  expect(screen.getByText('公开入口')).toBeInTheDocument()
})

it('changes mount isolation on same-account login and on a new server family', async () => {
  render(<Harness />)
  await screen.findByText('受限入口')
  act(() => {
    useAuthStore.getState().clearTokens()
    useAuthStore.setState({ status: 'authenticated', user })
  })
  await waitFor(() => expect(signals).toHaveLength(2))
  expect(signals[0].aborted).toBe(true)
  fetcher.mockResolvedValueOnce(result({ session_ref: 'b'.repeat(64) }))
  act(() => window.dispatchEvent(new Event('focus')))
  await waitFor(() => expect(signals).toHaveLength(3))
  expect(signals[1].aborted).toBe(true)
  expect(signals[2].aborted).toBe(false)
})

it('keeps public entries but aborts a restricted subtree on failed renewal', async () => {
  render(<Harness />)
  await screen.findByText('受限入口')
  fetcher.mockRejectedValueOnce(new Error('private'))
  act(() => window.dispatchEvent(new Event('focus')))
  await waitFor(() => expect(signals[0].aborted).toBe(true))
  expect(screen.queryByText('受限入口')).not.toBeInTheDocument()
  expect(screen.getByText('公开入口')).toBeInTheDocument()
})

it('does not retain an ignored-abort late response after logout or unmount', async () => {
  const late = pending()
  fetcher.mockReturnValueOnce(late.promise)
  const mounted = render(<Harness />)
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
  const oldSignal = fetcher.mock.calls[0][0]
  fetcher.mockResolvedValueOnce(
    result({ account_id: null, session_ref: null, capabilities: [] })
  )
  act(() => useAuthStore.getState().clearTokens())
  expect(oldSignal.aborted).toBe(true)
  await act(async () => late.resolve(result()))
  expect(screen.queryByText('受限入口')).not.toBeInTheDocument()
  mounted.unmount()
})

it('is StrictMode safe and does not request during auth restoration', async () => {
  useAuthStore.setState({ status: 'restoring', user: null })
  const mounted = render(
    <StrictMode>
      <Harness />
    </StrictMode>
  )
  await screen.findByText('公开入口')
  expect(fetcher).not.toHaveBeenCalled()
  act(() => useAuthStore.setState({ status: 'authenticated', user }))
  await screen.findByText('受限入口')
  expect(fetcher).toHaveBeenCalledTimes(1)
  mounted.unmount()
  expect(signals.every((signal) => signal.aborted)).toBe(true)
})

it('uses the real application provider without fetching until a consumer registers', async () => {
  const mounted = render(
    <AppPageContributions>
      <span>宿主</span>
    </AppPageContributions>
  )
  expect(fetcher).not.toHaveBeenCalled()
  function Consumer() {
    const environment = usePageContributions()
    return <output>{environment.capabilities.status}</output>
  }
  mounted.rerender(
    <AppPageContributions>
      <Consumer />
    </AppPageContributions>
  )
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent('ready')
  )
  expect(fetcher).toHaveBeenCalledTimes(1)
})

it('keeps an actual restricted mount for identical renewal, then aborts it exactly at expiry', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
  const late = pending()
  fetcher
    .mockResolvedValueOnce(result())
    .mockResolvedValueOnce(result())
    .mockReturnValueOnce(late.promise)
  const mounted = render(<Harness />)
  try {
    await act(async () => {
      for (let turn = 0; turn < 12; turn++) await Promise.resolve()
    })
    expect(screen.getByText('受限入口')).toBeInTheDocument()
    const signal = signals[0]
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_000)
    })
    expect(signals).toHaveLength(1)
    expect(signal.aborted).toBe(false)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_000)
    })
    expect(signal.aborted).toBe(false)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(screen.queryByText('受限入口')).not.toBeInTheDocument()
    expect(signal.aborted).toBe(true)
  } finally {
    mounted.unmount()
    vi.useRealTimers()
  }
})

it('does not mount a restricted Slot from anonymous management grants', async () => {
  useAuthStore.getState().clearTokens()
  fetcher.mockResolvedValueOnce(
    result({
      account_id: null,
      session_ref: null,
      capabilities: ['identity.role.create'],
    })
  )
  render(<Harness />)
  await screen.findByText('公开入口')
  await act(async () => {
    for (let turn = 0; turn < 12; turn++) await Promise.resolve()
  })
  expect(screen.queryByText('受限入口')).not.toBeInTheDocument()
  expect(signals).toHaveLength(0)
})
