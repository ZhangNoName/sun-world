import { appModules } from '@/modules/registry'
import { aiWorkspaceToolsSlot } from '@/modules/ai/extension-contract'
import {
  createPageContributionRegistry,
  pageContributionRegistry,
} from './registry'

const input = {
  slotId: aiWorkspaceToolsSlot.id,
  context: { scene: 'chat', presentation: 'sidebar' },
  scope: { projectId: 'sun-world', accountKey: 'anonymous', sessionKey: '0' },
  enabledModuleIds: appModules.map((module) => module.id),
  capabilities: { status: 'unknown' as const },
}

it('assembles the real public blog entry without granting Agent execution', () => {
  const selected = pageContributionRegistry.select(input)
  expect(selected?.contributions.map((entry) => entry.id)).toEqual([
    'blog.qa-entry',
  ])
  expect(selected?.contributions[0].requires).toEqual([])
  expect(
    pageContributionRegistry.select({
      ...input,
      scope: { ...input.scope, projectId: 'other' },
    })?.contributions
  ).toEqual([])
})

it('rejects incompatible real contribution metadata before loading pages', () => {
  const modules = appModules.map((module) => ({
    ...module,
    contributions: module.contributions?.map((entry) => ({
      ...entry,
      slotVersion: '2',
    })),
  }))
  expect(() => createPageContributionRegistry(modules)).toThrow('配置无效')
})

it('rejects missing real host dependencies and ambiguous module identity', () => {
  expect(() =>
    createPageContributionRegistry(
      appModules.filter((module) => module.id !== 'ai')
    )
  ).toThrow('配置无效')
  expect(() =>
    createPageContributionRegistry([...appModules, appModules[0]])
  ).toThrow('配置无效')
})

it('fails closed for unsupported host context, extra data and unknown slot', () => {
  for (const context of [
    { scene: 'chat', presentation: 'elsewhere' },
    { scene: 'private-history', presentation: 'sidebar' },
    { ...input.context, messages: ['private content is not a slot prop'] },
  ])
    expect(pageContributionRegistry.select({ ...input, context })).toBeNull()
  expect(
    pageContributionRegistry.select({ ...input, slotId: 'blog.detail.aside' })
  ).toBeNull()
})
