import { createContributionRegistry } from './registry'
import type { ContributionModule, SlotDefinition } from './types'

interface Context {
  scene: 'chat'
  presentation: 'sidebar' | 'rail'
}
const context: Context = { scene: 'chat', presentation: 'sidebar' }
function options() {
  const load = vi.fn()
  const slots: SlotDefinition<Context>[] = [
    {
      id: 'tools',
      version: '1',
      ownerModuleId: 'host',
      maxContributions: 2,
      validateContext: (value): value is Context =>
        !!value &&
        typeof value === 'object' &&
        (value as Context).scene === 'chat' &&
        ['sidebar', 'rail'].includes((value as Context).presentation),
    },
  ]
  const modules: ContributionModule<Context>[] = [
    { id: 'host', version: '1', dependencies: [], contributions: [] },
    {
      id: 'feature',
      version: '1',
      dependencies: [{ id: 'host', version: '1' }],
      contributions: [
        {
          id: 'z',
          moduleId: 'feature',
          slot: 'tools',
          slotVersion: '1',
          order: 0,
          requires: [],
          projectIds: ['sun-world'],
          load,
        },
        {
          id: 'a',
          moduleId: 'feature',
          slot: 'tools',
          slotVersion: '1',
          order: 0,
          requires: ['read'],
          projectIds: ['sun-world'],
          load,
        },
      ],
    },
  ]
  return { slots, modules, knownCapabilities: ['read'], load }
}
const selection = {
  slotId: 'tools',
  context,
  scope: {
    projectId: 'sun-world',
    accountKey: 'same-local-id',
    sessionKey: 's1',
  },
  enabledModuleIds: ['host', 'feature'],
  capabilities: { status: 'ready' as const, grants: ['read'] },
}
it('validates without executing loaders and snapshots declarations in stable ID order', () => {
  const input = options(),
    registry = createContributionRegistry(input)
  input.modules[1].contributions[0].projectIds = ['changed']
  expect(input.load).not.toHaveBeenCalled()
  const selected = registry.select(selection)!
  expect(selected.contributions.map((item) => item.id)).toEqual(['a', 'z'])
  expect(Object.isFrozen(selected.context)).toBe(true)
  expect(selected.context).not.toBe(context)
  expect(Object.isFrozen(selected.scope)).toBe(true)
})
it.each([
  [
    'duplicate module',
    (o: ReturnType<typeof options>) => o.modules.push(o.modules[0]),
  ],
  [
    'duplicate slot',
    (o: ReturnType<typeof options>) => o.slots.push(o.slots[0]),
  ],
  [
    'duplicate contribution',
    (o: ReturnType<typeof options>) => {
      o.modules[1].contributions[1].id = 'z'
    },
  ],
  [
    'foreign owner',
    (o: ReturnType<typeof options>) => {
      o.modules[1].contributions[0].moduleId = 'host'
    },
  ],
  [
    'missing slot owner',
    (o: ReturnType<typeof options>) => {
      o.slots[0].ownerModuleId = 'missing'
    },
  ],
  [
    'unknown slot',
    (o: ReturnType<typeof options>) => {
      o.modules[1].contributions[0].slot = 'unknown'
    },
  ],
  [
    'slot version',
    (o: ReturnType<typeof options>) => {
      o.modules[1].contributions[0].slotVersion = '2'
    },
  ],
  [
    'unknown capability',
    (o: ReturnType<typeof options>) => {
      o.modules[1].contributions[0].requires = ['unknown']
    },
  ],
  [
    'missing dependency',
    (o: ReturnType<typeof options>) => {
      o.modules[1].dependencies = [{ id: 'missing', version: '1' }]
    },
  ],
  [
    'dependency version',
    (o: ReturnType<typeof options>) => {
      o.modules[1].dependencies = [{ id: 'host', version: '2' }]
    },
  ],
  [
    'dependency cycle',
    (o: ReturnType<typeof options>) => {
      o.modules[0].dependencies = [{ id: 'feature', version: '1' }]
    },
  ],
  [
    'slot maximum',
    (o: ReturnType<typeof options>) => {
      o.slots[0].maxContributions = 1
    },
  ],
  [
    'empty project list',
    (o: ReturnType<typeof options>) => {
      o.modules[1].contributions[0].projectIds = []
    },
  ],
  [
    'invalid order',
    (o: ReturnType<typeof options>) => {
      o.modules[1].contributions[0].order = NaN
    },
  ],
  [
    'invalid identifier',
    (o: ReturnType<typeof options>) => {
      o.modules[1].id = 'feature\n'
    },
  ],
] as const)('rejects %s before loading', (_name, mutate) => {
  const input = options()
  mutate(input)
  expect(() => createContributionRegistry(input)).toThrow('页面贡献配置无效')
  expect(input.load).not.toHaveBeenCalled()
})
it.each(['unknown', 'loading', 'error'] as const)(
  'keeps public contributions available while capability status is %s',
  (status) => {
    const registry = createContributionRegistry(options())
    expect(
      registry
        .select({ ...selection, capabilities: { status } })
        ?.contributions.map((item) => item.id)
    ).toEqual(['z'])
  }
)
it('requires every grant, explicit project membership and enabled dependencies', () => {
  const registry = createContributionRegistry(options())
  expect(
    registry
      .select({ ...selection, capabilities: { status: 'ready', grants: [] } })
      ?.contributions.map((item) => item.id)
  ).toEqual(['z'])
  expect(
    registry.select({
      ...selection,
      scope: { ...selection.scope, projectId: 'other' },
    })?.contributions
  ).toEqual([])
  expect(
    registry.select({ ...selection, enabledModuleIds: ['host'] })?.contributions
  ).toEqual([])
  expect(
    registry.select({ ...selection, enabledModuleIds: ['feature'] })
  ).toBeNull()
})
it('also requires the slot owner dependencies to be enabled', () => {
  const input = options()
  input.modules.push({
    id: 'base',
    version: '1',
    dependencies: [],
    contributions: [],
  })
  input.modules[0].dependencies = [{ id: 'base', version: '1' }]
  const registry = createContributionRegistry(input)
  expect(registry.select(selection)).toBeNull()
  expect(
    registry.select({
      ...selection,
      enabledModuleIds: [...selection.enabledModuleIds, 'base'],
    })?.contributions
  ).toHaveLength(2)
})
it('fails closed on unknown slots, invalid schema and mutable non-data contexts', () => {
  const registry = createContributionRegistry(options())
  expect(registry.select({ ...selection, slotId: 'unknown' })).toBeNull()
  expect(
    registry.select({ ...selection, context: { scene: 'wrong' } })
  ).toBeNull()
  const getter = vi.fn(() => 'chat')
  expect(
    registry.select({
      ...selection,
      context: {
        get scene() {
          return getter()
        },
      },
    })
  ).toBeNull()
  expect(getter).not.toHaveBeenCalled()
  expect(
    registry.select({
      ...selection,
      context: { ...context, secret: new Date() },
    })
  ).toBeNull()
})
