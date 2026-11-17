import { useEffect } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

import { AppPageContributions } from '@/app/extensions/AppPageContributions'
import { PageContributionsProvider } from '@/modules/page-contributions'
import {
  createContributionRegistry,
  type ContributionProps,
} from '@/shared/extensions'
import { useAuthStore } from '@/store/auth'
import type { UserInfo } from '@/modules/account/types'
import {
  aiWorkspaceToolsSlot,
  type AiToolsContext,
} from '../extension-contract'
import { AiWorkspaceTools } from './AiWorkspaceTools'

vi.mock('@/modules/account/api', async (original) => ({
  ...(await original<typeof import('@/modules/account/api')>()),
  getCapabilityProjection: vi.fn(async () => ({
    app_id: 'sun-world',
    account_id: null,
    session_ref: null,
    capabilities: ['blog.article.read_public'],
    max_age_seconds: 15,
  })),
}))

const syntheticUser: UserInfo = {
  id: 1,
  name: '合成用户',
  age: 0,
  birth_day: '2000-01-01',
  email: '',
  phone: '',
  sex: 0,
  status: true,
}

beforeEach(() => useAuthStore.getState().clearTokens())

it('loads the real public entry in both host presentations without execution permission', async () => {
  const { rerender } = render(
    <MemoryRouter>
      <AppPageContributions>
        <AiWorkspaceTools presentation="sidebar" />
      </AppPageContributions>
    </MemoryRouter>
  )
  expect(
    await screen.findByRole('link', { name: '博客问答' })
  ).toHaveTextContent('博客问答')
  rerender(
    <MemoryRouter>
      <AppPageContributions>
        <AiWorkspaceTools presentation="rail" />
      </AppPageContributions>
    </MemoryRouter>
  )
  const compact = await screen.findByRole('link', { name: '博客问答' })
  expect(compact).toHaveTextContent('问答')
  expect(compact).toHaveAttribute('href', '/aigc/blog-qa')
})

it('aborts the old mount after a same-account reset batched into one render', async () => {
  const signals: AbortSignal[] = []
  const effects = vi.fn()
  function Probe({ scope, signal }: ContributionProps<AiToolsContext>) {
    useEffect(() => {
      effects()
      signals.push(signal)
    }, [signal])
    return (
      <output>
        {scope.accountKey}:{scope.sessionKey}
      </output>
    )
  }
  const load = vi.fn(async () => ({ default: Probe }))
  const registry = createContributionRegistry<AiToolsContext>({
    slots: [aiWorkspaceToolsSlot],
    knownCapabilities: [],
    modules: [
      { id: 'ai', version: '1', dependencies: [], contributions: [] },
      {
        id: 'probe',
        version: '1',
        dependencies: [],
        contributions: [
          {
            id: 'probe.entry',
            moduleId: 'probe',
            slot: aiWorkspaceToolsSlot.id,
            slotVersion: '1',
            order: 1,
            requires: [],
            projectIds: ['sun-world'],
            load,
          },
        ],
      },
    ],
  })
  useAuthStore.setState({ status: 'authenticated', user: syntheticUser })
  const { unmount } = render(
    <PageContributionsProvider
      registry={registry}
      enabledModuleIds={['ai', 'probe']}
      capabilities={{ status: 'unknown' }}
    >
      <AiWorkspaceTools presentation="sidebar" />
    </PageContributionsProvider>
  )
  await waitFor(() => expect(effects).toHaveBeenCalledTimes(1))
  const first = screen.getByRole('status').textContent
  act(() => useAuthStore.setState({ accessTokenExpire: Date.now() + 60_000 }))
  expect(effects).toHaveBeenCalledTimes(1)
  act(() => {
    useAuthStore.getState().clearTokens()
    useAuthStore.setState({ status: 'authenticated', user: syntheticUser })
  })
  await waitFor(() => expect(effects).toHaveBeenCalledTimes(2))
  expect(signals[0].aborted).toBe(true)
  expect(signals[1].aborted).toBe(false)
  expect(screen.getByRole('status').textContent).not.toBe(first)
  expect(screen.getByRole('status').textContent).toMatch(/^1:/)
  unmount()
  expect(signals[1].aborted).toBe(true)
})
