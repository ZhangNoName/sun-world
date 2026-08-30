import { isAbsolute } from 'node:path'

import { integrationAdapterRegistry } from './builtin-registry.mjs'

export function createAdapterCommandBuilder(
  registry,
  { environment = process.env } = {}
) {
  if (!registry || typeof registry.getAdapter !== 'function') {
    throw new Error('An integration adapter registry is required.')
  }

  return Object.freeze({
    buildAdapterCommand(adapterId, capabilityId, input = {}, options = {}) {
      const adapter = registry.getAdapter(adapterId)
      const capability = adapter.getCapability(capabilityId)
      const command = adapter.buildCommand(capabilityId, input, options)
      return {
        manifest: adapter.manifest,
        capability,
        binaryPath: resolveBinaryPath(
          adapter.manifest,
          options.binaryPath,
          environment
        ),
        environmentVariables: [
          ...(adapter.manifest.binary.runtimeEnvironment ?? []),
        ],
        argumentsList: command.argumentsList,
        previewArgumentsList: command.previewArgumentsList,
        isDryRun: command.isDryRun,
      }
    },
    buildDoctorCommand(adapterId, binaryPath) {
      const adapter = registry.getAdapter(adapterId)
      return {
        manifest: adapter.manifest,
        binaryPath: resolveBinaryPath(
          adapter.manifest,
          binaryPath,
          environment
        ),
        environmentVariables: [
          ...(adapter.manifest.binary.runtimeEnvironment ?? []),
        ],
        argumentsList: [...adapter.manifest.binary.doctorArguments],
      }
    },
  })
}

const defaultCommandBuilder = createAdapterCommandBuilder(
  integrationAdapterRegistry
)

export function buildAdapterCommand(
  adapterId,
  capabilityId,
  input = {},
  options = {}
) {
  return defaultCommandBuilder.buildAdapterCommand(
    adapterId,
    capabilityId,
    input,
    options
  )
}

export function buildDoctorCommand(adapterId, binaryPath) {
  return defaultCommandBuilder.buildDoctorCommand(adapterId, binaryPath)
}

export function commandPreview(command) {
  return {
    protocolVersion: '1',
    adapterId: command.manifest.adapterId,
    capabilityId: command.capability.id,
    effect: command.capability.effect,
    executable: command.binaryPath,
    argumentNames: [...command.previewArgumentsList],
  }
}

function resolveBinaryPath(manifest, explicitPath, environment) {
  const value = explicitPath || environment[manifest.binary.environmentVariable]
  if (!value) {
    throw new Error(
      `${manifest.adapterId} CLI path is required through --binary or ${manifest.binary.environmentVariable}.`
    )
  }
  if (value.includes('\0') || !isAbsolute(value)) {
    throw new Error(`${manifest.adapterId} CLI path must be absolute.`)
  }
  return value
}
