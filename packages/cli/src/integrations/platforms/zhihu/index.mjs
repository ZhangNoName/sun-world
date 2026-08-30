import { defineIntegrationAdapter } from '../../adapter-contract.mjs'
import { buildZhihuCommand } from './commands.mjs'
import { zhihuManifest } from './manifest.mjs'

export const zhihuAdapter = defineIntegrationAdapter({
  manifest: zhihuManifest,
  buildCommand: buildZhihuCommand,
})
