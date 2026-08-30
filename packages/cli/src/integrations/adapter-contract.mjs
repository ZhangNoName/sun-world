const ADAPTER_ID_PATTERN = /^[a-z][a-z0-9-]*$/
const CAPABILITY_ID_PATTERN = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$/
const INPUT_FIELD_PATTERN = /^[a-z][a-z0-9_]*$/
const ENVIRONMENT_VARIABLE_PATTERN = /^[A-Z][A-Z0-9_]*$/
const CAPABILITY_EFFECTS = new Set(['read', 'write', 'delete'])
const CONFIRMATION_POLICIES = new Set(['never', 'write', 'always'])

export function defineIntegrationAdapter({
  manifest: sourceManifest,
  buildCommand,
}) {
  if (typeof buildCommand !== 'function') {
    throw new Error('Integration adapter must provide a command builder.')
  }

  validateIntegrationManifest(sourceManifest)
  const manifest = structuredClone(sourceManifest)
  deepFreeze(manifest)
  const capabilityById = new Map(
    manifest.capabilities.map((capability) => [capability.id, capability])
  )
  const getCapability = (capabilityId) => {
    const capability = capabilityById.get(capabilityId)
    if (!capability) {
      throw new Error(
        `Unknown ${manifest.adapterId} capability: ${capabilityId}`
      )
    }
    return capability
  }

  return Object.freeze({
    manifest,
    getCapability,
    buildCommand(capabilityId, input = {}, options = {}) {
      const capability = getCapability(capabilityId)
      validateCapabilityInput(capability, input)
      if (options.dryRun && capability.supportsDryRun !== true) {
        throw new Error(
          `${manifest.adapterId}.${capabilityId} does not support dry-run execution.`
        )
      }
      return validateBuiltCommand(
        buildCommand({ capability, input, options }),
        manifest.adapterId,
        capabilityId,
        { requireDryRun: Boolean(options.dryRun) }
      )
    },
  })
}

export function validateIntegrationManifest(manifest) {
  if (!isRecord(manifest)) throw new Error('Invalid integration manifest.')
  if (manifest.schemaVersion !== '1') {
    throw new Error('Integration manifest schemaVersion must be 1.')
  }
  if (!ADAPTER_ID_PATTERN.test(manifest.adapterId || '')) {
    throw new Error('Integration manifest adapterId is invalid.')
  }
  if (!nonEmptyString(manifest.displayName)) {
    throw new Error(`${manifest.adapterId} manifest displayName is required.`)
  }
  if (manifest.transport !== 'cli') {
    throw new Error(`${manifest.adapterId} manifest transport must be cli.`)
  }
  validateBinaryManifest(manifest)
  validateCapabilityManifest(manifest)
  return manifest
}

export function validateCapabilityInput(capability, input) {
  if (!isRecord(input))
    throw new Error('Integration input must be a JSON object.')
  for (const field of capability.required) {
    if (
      typeof input[field] !== 'string' ||
      !input[field].trim() ||
      input[field].includes('\0')
    ) {
      throw new Error(`${capability.id} requires a non-empty ${field} value.`)
    }
  }
}

function validateBinaryManifest(manifest) {
  const binary = manifest.binary
  if (!isRecord(binary)) {
    throw new Error(
      `${manifest.adapterId} manifest binary definition is required.`
    )
  }
  if (!ENVIRONMENT_VARIABLE_PATTERN.test(binary.environmentVariable || '')) {
    throw new Error(
      `${manifest.adapterId} binary environmentVariable is invalid.`
    )
  }
  if (!isHttpsUrl(binary.officialSource)) {
    throw new Error(
      `${manifest.adapterId} binary officialSource must use HTTPS.`
    )
  }
  if (
    !Array.isArray(binary.doctorArguments) ||
    binary.doctorArguments.length === 0 ||
    binary.doctorArguments.some(
      (argument) => !nonEmptyString(argument) || argument.includes('\0')
    )
  ) {
    throw new Error(`${manifest.adapterId} binary doctorArguments are invalid.`)
  }
  const runtimeEnvironment = binary.runtimeEnvironment ?? []
  if (
    !Array.isArray(runtimeEnvironment) ||
    runtimeEnvironment.some(
      (name) => !ENVIRONMENT_VARIABLE_PATTERN.test(name || '')
    ) ||
    new Set(runtimeEnvironment).size !== runtimeEnvironment.length
  ) {
    throw new Error(
      `${manifest.adapterId} binary runtimeEnvironment is invalid.`
    )
  }
}

function validateCapabilityManifest(manifest) {
  if (
    !Array.isArray(manifest.capabilities) ||
    manifest.capabilities.length === 0
  ) {
    throw new Error(`${manifest.adapterId} manifest must declare capabilities.`)
  }
  const identifiers = new Set()
  for (const capability of manifest.capabilities) {
    if (
      !isRecord(capability) ||
      !CAPABILITY_ID_PATTERN.test(capability.id || '')
    ) {
      throw new Error(`Invalid capability identifier: ${capability?.id}`)
    }
    if (identifiers.has(capability.id)) {
      throw new Error(
        `Duplicate capability identifier for ${manifest.adapterId}: ${capability.id}`
      )
    }
    if (!nonEmptyString(capability.description)) {
      throw new Error(
        `${manifest.adapterId}.${capability.id} description is required.`
      )
    }
    if (!CAPABILITY_EFFECTS.has(capability.effect)) {
      throw new Error(`Invalid capability effect: ${capability.effect}`)
    }
    if (
      capability.supportsDryRun !== undefined &&
      typeof capability.supportsDryRun !== 'boolean'
    ) {
      throw new Error(`Invalid capability dry-run support: ${capability.id}`)
    }
    if (capability.effect === 'read' && capability.supportsDryRun) {
      throw new Error(
        `${manifest.adapterId}.${capability.id} read capability must not declare dry-run support.`
      )
    }
    const confirmation =
      capability.confirmation ??
      (capability.effect === 'read' ? 'never' : 'write')
    if (!CONFIRMATION_POLICIES.has(confirmation)) {
      throw new Error(`Invalid capability confirmation: ${confirmation}`)
    }
    if (capability.effect === 'read' && confirmation !== 'never') {
      throw new Error(
        `${manifest.adapterId}.${capability.id} read capability confirmation must be never.`
      )
    }
    if (capability.effect !== 'read' && confirmation === 'never') {
      throw new Error(
        `${manifest.adapterId}.${capability.id} mutating capability must require confirmation.`
      )
    }
    if (
      !Array.isArray(capability.required) ||
      capability.required.some(
        (field) => !INPUT_FIELD_PATTERN.test(field || '')
      ) ||
      new Set(capability.required).size !== capability.required.length
    ) {
      throw new Error(
        `${manifest.adapterId}.${capability.id} required fields are invalid.`
      )
    }
    identifiers.add(capability.id)
  }
}

function validateBuiltCommand(
  command,
  adapterId,
  capabilityId,
  { requireDryRun }
) {
  if (!isRecord(command)) {
    throw new Error(
      `${adapterId}.${capabilityId} command builder returned an invalid command.`
    )
  }
  validateArguments(command.argumentsList, adapterId, capabilityId)
  validateArguments(command.previewArgumentsList, adapterId, capabilityId)
  if (command.argumentsList.length !== command.previewArgumentsList.length) {
    throw new Error(
      `${adapterId}.${capabilityId} command preview shape does not match argv.`
    )
  }
  if (requireDryRun && command.isDryRun !== true) {
    throw new Error(
      `${adapterId}.${capabilityId} command builder did not apply dry-run mode.`
    )
  }
  return Object.freeze({
    argumentsList: Object.freeze([...command.argumentsList]),
    previewArgumentsList: Object.freeze([...command.previewArgumentsList]),
    isDryRun: command.isDryRun === true,
  })
}

function validateArguments(values, adapterId, capabilityId) {
  if (
    !Array.isArray(values) ||
    values.some((value) => typeof value !== 'string' || value.includes('\0'))
  ) {
    throw new Error(
      `${adapterId}.${capabilityId} command builder returned invalid argv.`
    )
  }
}

function isHttpsUrl(value) {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password
  } catch {
    return false
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function nonEmptyString(value) {
  return typeof value === 'string' && Boolean(value.trim())
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value))
    return value
  for (const nested of Object.values(value)) deepFreeze(nested)
  return Object.freeze(value)
}
