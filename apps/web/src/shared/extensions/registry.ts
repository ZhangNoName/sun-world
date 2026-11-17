import type {
  CapabilityState,
  Contribution,
  ContributionModule,
  ContributionScope,
  SlotDefinition,
} from './types'

function invalid(): never {
  throw new Error('页面贡献配置无效')
}
let registrySequence = 0
const identifier = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 128 &&
  /^[A-Za-z0-9]/.test(value) &&
  !/[^A-Za-z0-9._-]/.test(value)
function identifiers(values: readonly string[], maximum = 128) {
  if (
    !Array.isArray(values) ||
    values.length > maximum ||
    values.some((value) => !identifier(value)) ||
    new Set(values).size !== values.length
  )
    invalid()
}

// Context is data, never a reference to a module store or a mutable host object.
function contextCopy(
  value: unknown,
  depth = 0,
  budget = { nodes: 0 }
): unknown {
  if (++budget.nodes > 256 || depth > 8) invalid()
  if (value === null || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.length <= 4096) return value
  if (Array.isArray(value))
    return Object.freeze(
      value.map((item) => contextCopy(item, depth + 1, budget))
    )
  if (
    !value ||
    typeof value !== 'object' ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    invalid()
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(value).sort()) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype')
      invalid()
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !('value' in descriptor)) invalid()
    result[key] = contextCopy(descriptor.value, depth + 1, budget)
  }
  return Object.freeze(result)
}

export interface ContributionSelection<Context> {
  key: string
  context: Readonly<Context>
  scope: Readonly<ContributionScope>
  contributions: readonly Readonly<Contribution<Context>>[]
}
export interface ContributionRegistry<Context> {
  select(input: {
    slotId: string
    context: unknown
    scope: ContributionScope
    enabledModuleIds: readonly string[]
    capabilities: CapabilityState
  }): ContributionSelection<Context> | null
}

export function createContributionRegistry<Context>(options: {
  slots: readonly SlotDefinition<Context>[]
  modules: readonly ContributionModule<Context>[]
  knownCapabilities: readonly string[]
}): ContributionRegistry<Context> {
  const registryId = ++registrySequence
  identifiers(options.knownCapabilities)
  if (
    !Array.isArray(options.modules) ||
    options.modules.length > 128 ||
    !Array.isArray(options.slots) ||
    options.slots.length > 128
  )
    invalid()
  const modules = new Map<string, ContributionModule<Context>>()
  const slots = new Map<string, Readonly<SlotDefinition<Context>>>()
  const contributions: Readonly<Contribution<Context>>[] = []
  const ids = new Set<string>()
  for (const module of options.modules) {
    if (
      !identifier(module.id) ||
      !identifier(module.version) ||
      modules.has(module.id) ||
      !Array.isArray(module.dependencies) ||
      module.dependencies.length > 128 ||
      !Array.isArray(module.contributions)
    )
      invalid()
    identifiers(
      module.dependencies.map(
        (dependency: { id: string; version: string }) => dependency.id
      )
    )
    modules.set(
      module.id,
      Object.freeze({
        ...module,
        dependencies: Object.freeze(
          module.dependencies.map(
            (dependency: { id: string; version: string }) =>
              Object.freeze({ ...dependency })
          )
        ),
      })
    )
  }
  const visit = (
    id: string,
    path = new Set<string>(),
    visited = new Set<string>()
  ) => {
    if (path.has(id)) invalid()
    if (visited.has(id)) return
    const module = modules.get(id)!
    path.add(id)
    for (const dependency of module.dependencies) {
      if (
        !identifier(dependency.version) ||
        modules.get(dependency.id)?.version !== dependency.version
      )
        invalid()
      visit(dependency.id, path, visited)
    }
    path.delete(id)
    visited.add(id)
  }
  const visited = new Set<string>()
  for (const id of modules.keys()) visit(id, new Set(), visited)
  for (const slot of options.slots) {
    if (
      !identifier(slot.id) ||
      !identifier(slot.version) ||
      slots.has(slot.id) ||
      !modules.has(slot.ownerModuleId) ||
      !Number.isSafeInteger(slot.maxContributions) ||
      slot.maxContributions < 1 ||
      slot.maxContributions > 128 ||
      typeof slot.validateContext !== 'function'
    )
      invalid()
    slots.set(slot.id, Object.freeze({ ...slot }))
  }
  for (const module of options.modules) {
    for (const contribution of module.contributions) {
      if (
        !identifier(contribution.id) ||
        ids.has(contribution.id) ||
        contribution.moduleId !== module.id ||
        !slots.has(contribution.slot) ||
        contribution.slotVersion !== slots.get(contribution.slot)?.version ||
        !Number.isFinite(contribution.order) ||
        typeof contribution.load !== 'function'
      )
        invalid()
      identifiers(contribution.requires)
      identifiers(contribution.projectIds)
      if (
        contribution.projectIds.length === 0 ||
        contribution.requires.some(
          (capability: string) =>
            !options.knownCapabilities.includes(capability)
        )
      )
        invalid()
      ids.add(contribution.id)
      contributions.push(
        Object.freeze({
          ...contribution,
          requires: Object.freeze([...contribution.requires]),
          projectIds: Object.freeze([...contribution.projectIds]),
        })
      )
      if (contributions.length > 1024) invalid()
    }
  }
  for (const slot of slots.values())
    if (
      contributions.filter((item) => item.slot === slot.id).length >
      slot.maxContributions
    )
      invalid()
  contributions.sort(
    (a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  )
  return Object.freeze({
    select(
      input: Parameters<ContributionRegistry<Context>['select']>[0]
    ): ContributionSelection<Context> | null {
      try {
        const slot = slots.get(input.slotId)
        if (!slot) return null
        const scope = input.scope
        if (
          !scope ||
          !Object.values(scope).every(
            (value) =>
              typeof value === 'string' &&
              value.length > 0 &&
              value.length <= 256 &&
              !/[\x00-\x1f\x7f]/.test(value)
          ) ||
          Object.keys(scope).sort().join(',') !==
            'accountKey,projectId,sessionKey'
        )
          return null
        identifiers(input.enabledModuleIds)
        const context = contextCopy(input.context)
        if (slot.validateContext(context) !== true) return null
        const contextKey = JSON.stringify(context)
        if (contextKey.length > 8192) return null
        const enabled = new Set(input.enabledModuleIds)
        if (!enabled.has(slot.ownerModuleId)) return null
        const availability = new Map<string, boolean>()
        const available = (id: string): boolean => {
          if (availability.has(id)) return availability.get(id)!
          const value =
            enabled.has(id) &&
            modules
              .get(id)!
              .dependencies.every((dependency) => available(dependency.id))
          availability.set(id, value)
          return value
        }
        if (!available(slot.ownerModuleId)) return null
        const grants =
          input.capabilities.status === 'ready' &&
          Array.isArray(input.capabilities.grants)
            ? new Set(input.capabilities.grants)
            : new Set<string>()
        return Object.freeze({
          key: JSON.stringify([
            registryId,
            scope.projectId,
            scope.accountKey,
            scope.sessionKey,
            contextKey,
          ]),
          context: context as Readonly<Context>,
          scope: Object.freeze({ ...scope }),
          contributions: Object.freeze(
            contributions.filter(
              (item) =>
                item.slot === slot.id &&
                available(item.moduleId) &&
                item.projectIds.includes(scope.projectId) &&
                item.requires.every((capability) => grants.has(capability))
            )
          ),
        })
      } catch {
        return null
      }
    },
  })
}
