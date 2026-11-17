import { CAPABILITY_KEYS } from '@sun-world/contracts'
import { apiGet } from '@/shared/api'
import { getCapabilityProjection, validateCapabilityProjection } from './api'

vi.mock('@/shared/api', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  request: {},
}))

const valid = {
  app_id: 'sun-world',
  account_id: '1',
  session_ref: 'a'.repeat(64),
  capabilities: [...CAPABILITY_KEYS],
  max_age_seconds: 15,
}

it('loads the typed read with cancellation and without any auth refresh or toast', async () => {
  vi.mocked(apiGet).mockResolvedValue(valid as never)
  const signal = new AbortController().signal
  expect(await getCapabilityProjection(signal)).toEqual(valid)
  expect(apiGet).toHaveBeenCalledWith('/auth/capabilities', {
    config: {
      signal,
      suppressErrorToast: true,
      skipAuthPreflight: true,
      _authRetry: true,
    },
  })
})

it('rejects malformed identity, unknown fields/keys, duplicate or unordered grants, and invalid TTL', () => {
  for (const changes of [
    { app_id: 'other' },
    { account_id: '01' },
    { account_id: '1\n' },
    { session_ref: 'a'.repeat(64) + '\n' },
    { account_id: '9223372036854775808' },
    { account_id: 1 },
    { account_id: null },
    { session_ref: null },
    { session_ref: 'raw-family' },
    { roles: ['admin'] },
    { capabilities: ['unknown'] },
    { capabilities: ['blog.article.read_public', 'blog.article.read_public'] },
    { capabilities: [...CAPABILITY_KEYS].reverse() },
    { max_age_seconds: true },
    { max_age_seconds: -1 },
    { max_age_seconds: 16 },
    { max_age_seconds: 1.2 },
  ])
    expect(() =>
      validateCapabilityProjection({ ...valid, ...changes })
    ).toThrow('能力快照格式无效')
  expect(
    validateCapabilityProjection({
      ...valid,
      account_id: null,
      session_ref: null,
      capabilities: ['blog.article.read_public'],
      max_age_seconds: 0,
    })
  ).toBeDefined()
})

it('does not return an unchecked HTTP payload', async () => {
  vi.mocked(apiGet).mockResolvedValue({ ...valid, roles: ['admin'] } as never)
  await expect(
    getCapabilityProjection(new AbortController().signal)
  ).rejects.toThrow('能力快照格式无效')
})

it('rejects anonymous management grants while accepting public subsets', () => {
  const anonymous = { ...valid, account_id: null, session_ref: null }
  expect(() =>
    validateCapabilityProjection({
      ...anonymous,
      capabilities: ['identity.role.create'],
    })
  ).toThrow('能力快照格式无效')
  for (const capabilities of [[], ['blog.article.read_public']])
    expect(
      validateCapabilityProjection({ ...anonymous, capabilities }).capabilities
    ).toEqual(capabilities)
})
