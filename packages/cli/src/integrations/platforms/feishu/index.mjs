import { defineIntegrationAdapter } from '../../adapter-contract.mjs'
import { buildFeishuCommand } from './commands.mjs'
import { feishuManifest } from './manifest.mjs'

export const feishuAdapter = defineIntegrationAdapter({
  manifest: feishuManifest,
  buildCommand: buildFeishuCommand,
})
