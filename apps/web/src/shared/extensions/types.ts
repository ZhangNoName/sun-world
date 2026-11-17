import type { ComponentType } from 'react'

export interface ContributionScope {
  projectId: string
  accountKey: string
  sessionKey: string
}
export type CapabilityState =
  | { status: 'unknown' | 'loading' | 'error' }
  | { status: 'ready'; grants: readonly string[] }
export interface ContributionProps<Context> {
  context: Readonly<Context>
  scope: Readonly<ContributionScope>
  signal: AbortSignal
}
export interface SlotDefinition<Context> {
  id: string
  version: string
  ownerModuleId: string
  maxContributions: number
  validateContext: (value: unknown) => value is Context
}
export interface Contribution<Context> {
  id: string
  moduleId: string
  slot: string
  slotVersion: string
  order: number
  requires: readonly string[]
  projectIds: readonly string[]
  load: () => Promise<{ default: ComponentType<ContributionProps<Context>> }>
}
export interface ContributionModule<Context> {
  id: string
  version: string
  dependencies: readonly { id: string; version: string }[]
  contributions: readonly Contribution<Context>[]
}
