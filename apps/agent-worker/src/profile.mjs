const row = (id, config) => ({
  id,
  name: `@deepseek-ai/dsh-${id}`,
  ...(config && { config }),
})

export function profile(plugin, skill) {
  return [
    {
      insert: [
        { ...row('sdk-app', { profile: 'blog-local' }), id: 'sdk-app-startup' },
        {
          ...row('sdk-jsonrpc-server', { maxTokensAsSuccess: false }),
          inject: ['sdkAppStartup', 'loader'],
        },
        row('llm-deepseek-api-key', {
          apiKeyEnv: 'DEEPSEEK_API_KEY',
          streamIdleTimeoutMs: 30_000,
        }),
        { ...row('fs-local'), id: 'filesystem' },
        row('working-directory'),
        row('session-projection'),
        { id: 'timer', name: '@deepseek-ai/cordis-plugin-timer' },
        row('llm'),
        row('session'),
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
