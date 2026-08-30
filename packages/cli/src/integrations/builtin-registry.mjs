import { feishuAdapter } from './platforms/feishu/index.mjs'
import { zhihuAdapter } from './platforms/zhihu/index.mjs'
import { createIntegrationAdapterRegistry } from './registry.mjs'

export const integrationAdapterRegistry = createIntegrationAdapterRegistry()

export function registerIntegrationAdapter(adapter) {
  return integrationAdapterRegistry.register(adapter)
}

registerIntegrationAdapter(feishuAdapter)
registerIntegrationAdapter(zhihuAdapter)
