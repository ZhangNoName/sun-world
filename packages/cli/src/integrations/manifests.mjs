import {
  integrationAdapterRegistry,
  registerIntegrationAdapter,
} from './builtin-registry.mjs'
import { projectIntegrationConnector } from './public-projection.mjs'

export {
  defineIntegrationAdapter,
  validateIntegrationManifest,
} from './adapter-contract.mjs'
export { registerIntegrationAdapter }
export { createIntegrationAdapterRegistry } from './registry.mjs'
export { projectIntegrationConnector } from './public-projection.mjs'

export function listIntegrationManifests() {
  return integrationAdapterRegistry.listManifests()
}

export function getIntegrationManifest(adapterId) {
  return integrationAdapterRegistry.getManifest(adapterId)
}

export function listIntegrationConnectors() {
  return integrationAdapterRegistry
    .listManifests()
    .map(projectIntegrationConnector)
}

export function getIntegrationConnector(adapterId) {
  return projectIntegrationConnector(
    integrationAdapterRegistry.getManifest(adapterId)
  )
}

export function getCapability(adapterId, capabilityId) {
  return integrationAdapterRegistry.getCapability(adapterId, capabilityId)
}
