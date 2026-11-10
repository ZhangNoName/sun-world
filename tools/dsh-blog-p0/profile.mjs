import { readFileSync } from 'node:fs'

const skill = readFileSync(new URL('./blog-qa.md', import.meta.url), 'utf8')

const row = (id, config) => ({
  id,
  name: `@deepseek-ai/dsh-${id}`,
  ...(config && { config }),
})

// This profile has no parent bundle. The filesystem service is used by SDK
// workspace setup; no filesystem, shell, MCP, or other execution tool is mounted.
export function profile(plugin) {
  return [
    {
      insert: [
        { ...row('sdk-app', { profile: 'blog-p0' }), id: 'sdk-app-startup' },
        {
          ...row('sdk-jsonrpc-server', { maxTokensAsSuccess: false }),
          inject: ['sdkAppStartup', 'loader'],
        },
        row('llm-deepseek-api-key', {
          apiKeyEnv: 'DEEPSEEK_API_KEY',
          streamIdleTimeoutMs: 45_000,
        }),
        { ...row('fs-local'), id: 'filesystem' },
        row('working-directory'),
        row('session-projection'),
        { id: 'timer', name: '@deepseek-ai/cordis-plugin-timer' },
        row('llm'),
        row('session'),
        row('session-title'),
        row('system-prompt', {
          includeHarnessIdentity: false,
          includeRuntimeContext: false,
          personaPrefix: skill,
        }),
        row('tools'),
        row('tool-executor-native'),
        row('agent'),
        row('agent-loop', { agents: [] }),
        { id: 'blog-tools', name: plugin },
      ],
    },
  ]
}
