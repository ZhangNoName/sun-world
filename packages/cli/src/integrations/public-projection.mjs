import { validateIntegrationManifest } from './adapter-contract.mjs'

export function projectIntegrationConnector(manifest) {
  validateIntegrationManifest(manifest)

  return {
    schema_version: manifest.schemaVersion,
    adapter_id: manifest.adapterId,
    display_name: manifest.displayName,
    transport: manifest.transport,
    execution: 'local_cli',
    official_source: manifest.binary.officialSource,
    capabilities: manifest.capabilities.map((capability) => ({
      id: capability.id,
      description: capability.description,
      effect: capability.effect,
      required_fields: [...capability.required],
      confirmation:
        capability.confirmation ??
        (capability.effect === 'read' ? 'never' : 'write'),
    })),
  }
}
