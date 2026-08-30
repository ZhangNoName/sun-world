import assert from 'node:assert/strict'
import test from 'node:test'

import { run } from '../src/cli.mjs'
import {
  buildAdapterCommand,
  createAdapterCommandBuilder,
  commandPreview,
} from '../src/integrations/adapters.mjs'
import {
  defineIntegrationAdapter,
  getCapability,
  getIntegrationConnector,
  getIntegrationManifest,
  listIntegrationConnectors,
  listIntegrationManifests,
  validateIntegrationManifest,
} from '../src/integrations/manifests.mjs'
import { createIntegrationAdapterRegistry } from '../src/integrations/registry.mjs'

test('registers and discovers a new adapter through the unified interface', () => {
  const registry = createIntegrationAdapterRegistry()
  const adapter = defineIntegrationAdapter({
    manifest: sampleManifest(),
    buildCommand({ capability, input, options }) {
      assert.equal(capability.id, 'record.read')
      const argumentsList = ['records', 'read', '--id', input.id]
      if (options.dryRun) argumentsList.push('--dry-run')
      return {
        argumentsList,
        previewArgumentsList: [
          'records',
          'read',
          '--id',
          '<id>',
          ...(options.dryRun ? ['--dry-run'] : []),
        ],
      }
    },
  })

  registry.register(adapter)
  assert.deepEqual(
    registry.listManifests().map((manifest) => manifest.adapterId),
    ['sample']
  )
  assert.deepEqual(
    registry.listCapabilities().map((item) => item.qualifiedId),
    ['sample.record.read']
  )

  const builder = createAdapterCommandBuilder(registry)
  const command = builder.buildAdapterCommand(
    'sample',
    'record.read',
    { id: 'private-record' },
    { binaryPath: '/opt/sample-cli' }
  )
  assert.deepEqual(command.argumentsList, [
    'records',
    'read',
    '--id',
    'private-record',
  ])
  assert.deepEqual(commandPreview(command).argumentNames, [
    'records',
    'read',
    '--id',
    '<id>',
  ])
})

test('requires unique adapter and capability identifiers', () => {
  const adapter = defineIntegrationAdapter({
    manifest: sampleManifest(),
    buildCommand: () => ({ argumentsList: [], previewArgumentsList: [] }),
  })
  const registry = createIntegrationAdapterRegistry([adapter])
  assert.throws(
    () => registry.register(adapter),
    /Duplicate integration adapter: sample/
  )

  const duplicateCapabilityManifest = sampleManifest()
  duplicateCapabilityManifest.capabilities.push({
    ...duplicateCapabilityManifest.capabilities[0],
  })
  assert.throws(
    () =>
      defineIntegrationAdapter({
        manifest: duplicateCapabilityManifest,
        buildCommand: () => ({ argumentsList: [], previewArgumentsList: [] }),
      }),
    /Duplicate capability identifier for sample: record\.read/
  )
})

test('validates the complete manifest boundary before registration', () => {
  const invalidVersion = sampleManifest()
  invalidVersion.schemaVersion = '2'
  assert.throws(
    () => validateIntegrationManifest(invalidVersion),
    /schemaVersion must be 1/
  )

  const invalidTransport = sampleManifest()
  invalidTransport.transport = 'shell'
  assert.throws(
    () => validateIntegrationManifest(invalidTransport),
    /transport must be cli/
  )

  const invalidSource = sampleManifest()
  invalidSource.binary.officialSource = 'http://example.com/cli'
  assert.throws(
    () => validateIntegrationManifest(invalidSource),
    /officialSource must use HTTPS/
  )
})

test('keeps existing manifest and command imports compatible', () => {
  assert.deepEqual(
    listIntegrationManifests().map((manifest) => manifest.adapterId),
    ['feishu', 'zhihu']
  )
  assert.equal(getIntegrationManifest('feishu').adapterId, 'feishu')
  assert.equal(getCapability('zhihu', 'hot.list').effect, 'read')
})

test('projects list and inspect output to the safe backend wire contract', async () => {
  const connectors = listIntegrationConnectors()
  assert.deepEqual(connectors[0], {
    schema_version: '1',
    adapter_id: 'feishu',
    display_name: '飞书 / Lark',
    transport: 'cli',
    execution: 'local_cli',
    official_source: 'https://github.com/larksuite/cli',
    capabilities: [
      {
        id: 'auth.status',
        description: '检查飞书 CLI 的当前认证状态。',
        effect: 'read',
        required_fields: [],
        confirmation: 'never',
      },
      {
        id: 'calendar.agenda',
        description: '读取当前身份的日程。',
        effect: 'read',
        required_fields: [],
        confirmation: 'never',
      },
      {
        id: 'message.send',
        description: '向指定飞书会话发送文本消息。',
        effect: 'write',
        required_fields: ['chat_id', 'text'],
        confirmation: 'write',
      },
      {
        id: 'document.create',
        description: '从 Markdown 内容创建飞书文档。',
        effect: 'write',
        required_fields: ['content'],
        confirmation: 'write',
      },
    ],
  })
  assert.deepEqual(getIntegrationConnector('zhihu'), connectors[1])

  const listOutput = []
  const inspectOutput = []
  await run(['integrations', 'list'], captureStdout(listOutput))
  await run(['integrations', 'inspect', 'feishu'], captureStdout(inspectOutput))
  assert.deepEqual(JSON.parse(listOutput.join('')).data, connectors)
  assert.deepEqual(JSON.parse(inspectOutput.join('')).data, connectors[0])

  for (const output of [listOutput.join(''), inspectOutput.join('')]) {
    assert.equal(output.includes('binary'), false)
    assert.equal(output.includes('environmentVariable'), false)
    assert.equal(output.includes('doctorArguments'), false)
    assert.equal(output.includes('argumentsList'), false)
  }
})

test('builds fixed Zhihu argv and removes sensitive values from previews', () => {
  const query = 'private query; rm -rf /'
  const command = buildAdapterCommand(
    'zhihu',
    'content.search',
    { query, count: 5 },
    { binaryPath: '/opt/zhihu-cli' }
  )
  assert.deepEqual(command.argumentsList, [
    'search',
    'zhihu',
    '--query',
    query,
    '--count',
    '5',
  ])
  const preview = commandPreview(command)
  assert.deepEqual(preview.argumentNames, [
    'search',
    'zhihu',
    '--query',
    '<query>',
    '--count',
    '<count>',
  ])
  assert.equal(JSON.stringify(preview).includes(query), false)
  assert.equal(preview.executable, '/opt/zhihu-cli')
})

test('matches the official Zhihu count and hot-list boundaries', () => {
  const zhihuSearch = buildAdapterCommand(
    'zhihu',
    'content.search',
    { query: 'query' },
    { binaryPath: '/opt/zhihu-cli' }
  )
  assert.deepEqual(zhihuSearch.argumentsList.slice(-2), ['--count', '10'])
  assert.throws(
    () =>
      buildAdapterCommand(
        'zhihu',
        'content.search',
        { query: 'query', count: 11 },
        { binaryPath: '/opt/zhihu-cli' }
      ),
    /integer between 1 and 10/
  )

  const globalSearch = buildAdapterCommand(
    'zhihu',
    'global.search',
    { query: 'query', count: 20 },
    { binaryPath: '/opt/zhihu-cli' }
  )
  assert.deepEqual(globalSearch.argumentsList.slice(-2), ['--count', '20'])
  assert.throws(
    () =>
      buildAdapterCommand(
        'zhihu',
        'global.search',
        { query: 'query', count: 21 },
        { binaryPath: '/opt/zhihu-cli' }
      ),
    /integer between 1 and 20/
  )

  const hotList = buildAdapterCommand(
    'zhihu',
    'hot.list',
    {},
    { binaryPath: '/opt/zhihu-cli' }
  )
  assert.deepEqual(hotList.argumentsList, ['hot', '--limit', '30'])
  assert.throws(
    () =>
      buildAdapterCommand(
        'zhihu',
        'hot.list',
        { limit: 31 },
        { binaryPath: '/opt/zhihu-cli' }
      ),
    /integer between 1 and 30/
  )
})

test('retains absolute binary and required-input safety checks', () => {
  assert.throws(
    () =>
      buildAdapterCommand(
        'feishu',
        'message.send',
        { chat_id: 'chat', text: 'hello' },
        { binaryPath: 'relative/lark-cli' }
      ),
    /CLI path must be absolute/
  )
  assert.throws(
    () =>
      buildAdapterCommand(
        'feishu',
        'message.send',
        { chat_id: 'chat', text: '' },
        { binaryPath: '/opt/lark-cli' }
      ),
    /requires a non-empty text value/
  )
})

test('keeps write execution behind confirm while retaining dry-run argv', async () => {
  const input = JSON.stringify({ chat_id: 'chat', text: 'hello' })
  await assert.rejects(
    run([
      'integrations',
      'run',
      'feishu',
      'message.send',
      '--binary',
      '/opt/lark-cli',
      '--input-json',
      input,
    ]),
    /Write integrations require --confirm or --dry-run/
  )

  const dryRun = buildAdapterCommand(
    'feishu',
    'message.send',
    { chat_id: 'chat', text: 'hello' },
    { binaryPath: '/opt/lark-cli', dryRun: true }
  )
  assert.equal(dryRun.argumentsList.includes('--dry-run'), true)
})

test('does not authorize generic write adapters to fake dry-run support', () => {
  const manifest = sampleManifest()
  manifest.capabilities = [
    {
      id: 'record.write',
      description: 'Write one record.',
      effect: 'write',
      required: ['id'],
    },
  ]
  const unsupported = defineIntegrationAdapter({
    manifest,
    buildCommand: () => ({ argumentsList: [], previewArgumentsList: [] }),
  })
  const unsupportedRegistry = createIntegrationAdapterRegistry([unsupported])
  const unsupportedBuilder = createAdapterCommandBuilder(unsupportedRegistry)
  assert.throws(
    () =>
      unsupportedBuilder.buildAdapterCommand(
        'sample',
        'record.write',
        { id: 'record' },
        { binaryPath: '/opt/sample-cli', dryRun: true }
      ),
    /does not support dry-run execution/
  )

  const claimedManifest = structuredClone(manifest)
  claimedManifest.capabilities[0].supportsDryRun = true
  const claimed = defineIntegrationAdapter({
    manifest: claimedManifest,
    buildCommand: () => ({ argumentsList: [], previewArgumentsList: [] }),
  })
  const claimedRegistry = createIntegrationAdapterRegistry([claimed])
  const claimedBuilder = createAdapterCommandBuilder(claimedRegistry)
  assert.throws(
    () =>
      claimedBuilder.buildAdapterCommand(
        'sample',
        'record.write',
        { id: 'record' },
        { binaryPath: '/opt/sample-cli', dryRun: true }
      ),
    /did not apply dry-run mode/
  )
})

function sampleManifest() {
  return {
    schemaVersion: '1',
    adapterId: 'sample',
    displayName: 'Sample Platform',
    transport: 'cli',
    binary: {
      environmentVariable: 'SUN_WORLD_SAMPLE_CLI_PATH',
      officialSource: 'https://example.com/sample-cli',
      doctorArguments: ['--version'],
    },
    capabilities: [
      {
        id: 'record.read',
        description: 'Read one record.',
        effect: 'read',
        required: ['id'],
      },
    ],
  }
}

function captureStdout(output) {
  return {
    stdout: (value) => output.push(value),
    write: (value) => output.push(value),
  }
}
