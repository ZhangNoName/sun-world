import { validateIntegrationManifest } from './adapter-contract.mjs'

export function createIntegrationAdapterRegistry(initialAdapters = []) {
  const adapters = new Map()
  const qualifiedCapabilityIds = new Set()
  const getAdapter = (adapterId) => {
    const adapter = adapters.get(adapterId)
    if (!adapter) throw new Error(`Unknown integration adapter: ${adapterId}`)
    return adapter
  }

  const registry = Object.freeze({
    register(adapter) {
      validateAdapter(adapter)
      const { adapterId, capabilities } = adapter.manifest
      if (adapters.has(adapterId)) {
        throw new Error(`Duplicate integration adapter: ${adapterId}`)
      }
      for (const capability of capabilities) {
        const qualifiedId = `${adapterId}.${capability.id}`
        if (qualifiedCapabilityIds.has(qualifiedId)) {
          throw new Error(
            `Duplicate qualified capability identifier: ${qualifiedId}`
          )
        }
      }
      adapters.set(adapterId, adapter)
      for (const capability of capabilities) {
        qualifiedCapabilityIds.add(`${adapterId}.${capability.id}`)
      }
      return adapter
    },
    listAdapters() {
      return [...adapters.values()]
    },
    listManifests() {
      return [...adapters.values()].map((adapter) => adapter.manifest)
    },
    listCapabilities() {
      return [...adapters.values()].flatMap((adapter) =>
        adapter.manifest.capabilities.map((capability) => ({
          adapterId: adapter.manifest.adapterId,
          qualifiedId: `${adapter.manifest.adapterId}.${capability.id}`,
          capability,
        }))
      )
    },
    getAdapter,
    getManifest(adapterId) {
      return getAdapter(adapterId).manifest
    },
    getCapability(adapterId, capabilityId) {
      return getAdapter(adapterId).getCapability(capabilityId)
    },
  })

  for (const adapter of initialAdapters) registry.register(adapter)
  return registry
}

function validateAdapter(adapter) {
  if (!adapter || typeof adapter !== 'object') {
    throw new Error('Invalid integration adapter.')
  }
  validateIntegrationManifest(adapter.manifest)
  if (
    typeof adapter.getCapability !== 'function' ||
    typeof adapter.buildCommand !== 'function'
  ) {
    throw new Error(
      `${adapter.manifest.adapterId} adapter does not implement the unified interface.`
    )
  }
}
