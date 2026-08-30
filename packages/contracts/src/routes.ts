export const API_ROUTES = {
  health: {
    health: '/healthz',
    ready: '/readyz',
  },
  base: {
    summary: '/base/',
    categories: '/base/blog/category',
    tags: '/base/blog/tag',
  },
  blog: {
    list: '/blogs/',
    detail: '/blogs/{blog_id}',
    create: '/blogs/',
    delete: '/blogs/{blog_id}',
    update: '/blogs/{blog_id}',
  },
  auth: {
    login: '/auth/login',
    register: '/auth/register',
    logout: '/auth/logout',
    refreshToken: '/auth/refresh_token',
    session: '/auth/session',
    resetPasswordRequest: '/auth/reset_password/request',
    resetPassword: '/auth/reset_password',
    methods: '/auth/methods',
    verificationRequest: '/auth/verification/request',
    verificationComplete: '/auth/verification/complete',
    oauthStart: '/auth/oauth/{provider}/start',
    oauthCallback: '/auth/oauth/{provider}/callback',
    connections: '/auth/connections',
    connectionVerificationRequest: '/auth/connections/verification/request',
    connectionVerificationComplete: '/auth/connections/verification/complete',
  },
  user: {
    me: '/user/me',
  },
  admin: {
    metrics: '/admin/metrics',
    metricsHistory: '/admin/metrics/history',
    telemetry: '/admin/telemetry',
    alerts: '/admin/alerts',
    logs: '/admin/logs',
    aiProviders: '/admin/ai/providers',
    aiProvider: '/admin/ai/providers/{provider_id}',
    dictionaryTypes: '/admin/dictionaries/types',
    dictionaryType: '/admin/dictionaries/types/{type_id}',
    dictionaryItems: '/admin/dictionaries/types/{type_id}/items',
    dictionaryItem: '/admin/dictionaries/types/{type_id}/items/{item_id}',
  },
  dictionaries: {
    read: '/dictionaries/{code}',
  },
  ai: {
    chat: '/ai/chat',
    chatStream: '/ai/chat_stream',
    chatChunkStream: '/ai/chat-chunk-stream',
    generateImage: '/ai/generate-image',
    readImage: '/ai/read-image',
    providers: '/ai/v1/providers',
    providerProfiles: '/ai/v1/provider-profiles',
    personas: '/ai/v1/personas',
    persona: '/ai/v1/personas/{persona_id}',
    skills: '/ai/v1/skills',
    skill: '/ai/v1/skills/{skill_id}',
    conversations: '/ai/v1/conversations',
    conversation: '/ai/v1/conversations/{conversation_id}',
    message: '/ai/v1/messages/{message_id}',
    messageFeedback: '/ai/v1/messages/{message_id}/feedback',
    runStream: '/ai/v1/runs/stream',
    mcpConnections: '/ai/v1/mcp/connections',
    mcpConnection: '/ai/v1/mcp/connections/{connection_id}',
    mcpDiscover: '/ai/v1/mcp/connections/{connection_id}/discover',
    mcpTools: '/ai/v1/mcp/connections/{connection_id}/tools',
    mcpToolCall:
      '/ai/v1/mcp/connections/{connection_id}/tools/{tool_name}/call',
  },
  telemetry: {
    events: '/telemetry/events',
  },
} as const

export const API_ROUTE_GROUPS = {
  public: [
    API_ROUTES.health.health,
    API_ROUTES.health.ready,
    API_ROUTES.base.summary,
    API_ROUTES.base.categories,
    API_ROUTES.base.tags,
    API_ROUTES.blog.list,
    API_ROUTES.blog.detail,
    API_ROUTES.auth.methods,
    API_ROUTES.auth.verificationRequest,
    API_ROUTES.auth.verificationComplete,
    API_ROUTES.auth.oauthStart,
    API_ROUTES.auth.oauthCallback,
    API_ROUTES.ai.chat,
    API_ROUTES.ai.chatStream,
    API_ROUTES.ai.chatChunkStream,
    API_ROUTES.ai.providers,
    API_ROUTES.ai.runStream,
    API_ROUTES.telemetry.events,
    API_ROUTES.dictionaries.read,
  ],
  authRequired: [
    API_ROUTES.auth.logout,
    API_ROUTES.auth.refreshToken,
    API_ROUTES.auth.session,
    API_ROUTES.auth.connections,
    API_ROUTES.auth.connectionVerificationRequest,
    API_ROUTES.auth.connectionVerificationComplete,
    API_ROUTES.user.me,
    API_ROUTES.admin.metrics,
    API_ROUTES.admin.metricsHistory,
    API_ROUTES.admin.telemetry,
    API_ROUTES.admin.alerts,
    API_ROUTES.admin.logs,
    API_ROUTES.admin.aiProviders,
    API_ROUTES.admin.aiProvider,
    API_ROUTES.admin.dictionaryTypes,
    API_ROUTES.admin.dictionaryType,
    API_ROUTES.admin.dictionaryItems,
    API_ROUTES.admin.dictionaryItem,
    API_ROUTES.blog.delete,
    API_ROUTES.blog.update,
    API_ROUTES.ai.providerProfiles,
    API_ROUTES.ai.personas,
    API_ROUTES.ai.persona,
    API_ROUTES.ai.skills,
    API_ROUTES.ai.skill,
    API_ROUTES.ai.conversations,
    API_ROUTES.ai.conversation,
    API_ROUTES.ai.message,
    API_ROUTES.ai.messageFeedback,
    API_ROUTES.ai.mcpConnections,
    API_ROUTES.ai.mcpConnection,
    API_ROUTES.ai.mcpDiscover,
    API_ROUTES.ai.mcpTools,
    API_ROUTES.ai.mcpToolCall,
  ],
} as const

export const API_ROUTE_METHODS = {
  'health.health': {
    path: API_ROUTES.health.health,
    method: 'GET',
  },
  'health.ready': {
    path: API_ROUTES.health.ready,
    method: 'GET',
  },
  'base.summary': {
    path: API_ROUTES.base.summary,
    method: 'GET',
  },
  'base.categories': {
    path: API_ROUTES.base.categories,
    method: 'GET',
  },
  'base.tags': {
    path: API_ROUTES.base.tags,
    method: 'GET',
  },
  'blog.list': {
    path: API_ROUTES.blog.list,
    method: 'GET',
  },
  'blog.detail': {
    path: API_ROUTES.blog.detail,
    method: 'GET',
  },
  'blog.create': {
    path: API_ROUTES.blog.create,
    method: 'POST',
  },
  'blog.delete': {
    path: API_ROUTES.blog.delete,
    method: 'DELETE',
  },
  'blog.update': {
    path: API_ROUTES.blog.update,
    method: 'PUT',
  },
  'auth.login': {
    path: API_ROUTES.auth.login,
    method: 'POST',
  },
  'auth.register': {
    path: API_ROUTES.auth.register,
    method: 'POST',
  },
  'auth.logout': {
    path: API_ROUTES.auth.logout,
    method: 'POST',
  },
  'auth.refreshToken': {
    path: API_ROUTES.auth.refreshToken,
    method: 'POST',
  },
  'auth.resetPasswordRequest': {
    path: API_ROUTES.auth.resetPasswordRequest,
    method: 'POST',
  },
  'auth.resetPassword': {
    path: API_ROUTES.auth.resetPassword,
    method: 'POST',
  },
  'auth.methods': {
    path: API_ROUTES.auth.methods,
    method: 'GET',
  },
  'auth.verificationRequest': {
    path: API_ROUTES.auth.verificationRequest,
    method: 'POST',
  },
  'auth.verificationComplete': {
    path: API_ROUTES.auth.verificationComplete,
    method: 'POST',
  },
  'auth.oauthStart': {
    path: API_ROUTES.auth.oauthStart,
    method: 'GET',
  },
  'auth.oauthCallback': {
    path: API_ROUTES.auth.oauthCallback,
    method: 'GET',
  },
  'auth.session': {
    path: API_ROUTES.auth.session,
    method: 'GET',
  },
  'auth.connections': {
    path: API_ROUTES.auth.connections,
    method: 'GET',
  },
  'auth.connectionVerificationRequest': {
    path: API_ROUTES.auth.connectionVerificationRequest,
    method: 'POST',
  },
  'auth.connectionVerificationComplete': {
    path: API_ROUTES.auth.connectionVerificationComplete,
    method: 'POST',
  },
  'user.me': {
    path: API_ROUTES.user.me,
    method: 'GET',
  },
  'admin.metrics': {
    path: API_ROUTES.admin.metrics,
    method: 'GET',
  },
  'admin.metricsHistory': {
    path: API_ROUTES.admin.metricsHistory,
    method: 'GET',
  },
  'admin.telemetry': {
    path: API_ROUTES.admin.telemetry,
    method: 'GET',
  },
  'admin.alerts': {
    path: API_ROUTES.admin.alerts,
    method: 'GET',
  },
  'admin.logs': {
    path: API_ROUTES.admin.logs,
    method: 'GET',
  },
  'admin.aiProviders.list': {
    path: API_ROUTES.admin.aiProviders,
    method: 'GET',
  },
  'admin.aiProviders.create': {
    path: API_ROUTES.admin.aiProviders,
    method: 'POST',
  },
  'admin.aiProvider.update': {
    path: API_ROUTES.admin.aiProvider,
    method: 'PUT',
  },
  'admin.aiProvider.delete': {
    path: API_ROUTES.admin.aiProvider,
    method: 'DELETE',
  },
  'admin.dictionaryTypes.list': {
    path: API_ROUTES.admin.dictionaryTypes,
    method: 'GET',
  },
  'admin.dictionaryTypes.create': {
    path: API_ROUTES.admin.dictionaryTypes,
    method: 'POST',
  },
  'admin.dictionaryType.update': {
    path: API_ROUTES.admin.dictionaryType,
    method: 'PUT',
  },
  'admin.dictionaryType.delete': {
    path: API_ROUTES.admin.dictionaryType,
    method: 'DELETE',
  },
  'admin.dictionaryItems.list': {
    path: API_ROUTES.admin.dictionaryItems,
    method: 'GET',
  },
  'admin.dictionaryItems.create': {
    path: API_ROUTES.admin.dictionaryItems,
    method: 'POST',
  },
  'admin.dictionaryItem.update': {
    path: API_ROUTES.admin.dictionaryItem,
    method: 'PUT',
  },
  'admin.dictionaryItem.delete': {
    path: API_ROUTES.admin.dictionaryItem,
    method: 'DELETE',
  },
  'dictionaries.read': {
    path: API_ROUTES.dictionaries.read,
    method: 'GET',
  },
  'ai.chat': {
    path: API_ROUTES.ai.chat,
    method: 'POST',
  },
  'ai.chatStream': {
    path: API_ROUTES.ai.chatStream,
    method: 'POST',
  },
  'ai.chatChunkStream': {
    path: API_ROUTES.ai.chatChunkStream,
    method: 'POST',
  },
  'ai.generateImage': {
    path: API_ROUTES.ai.generateImage,
    method: 'POST',
  },
  'ai.readImage': {
    path: API_ROUTES.ai.readImage,
    method: 'POST',
  },
  'ai.providers': {
    path: API_ROUTES.ai.providers,
    method: 'GET',
  },
  'ai.providerProfiles.list': {
    path: API_ROUTES.ai.providerProfiles,
    method: 'GET',
  },
  'ai.providerProfiles.save': {
    path: API_ROUTES.ai.providerProfiles,
    method: 'POST',
  },
  'ai.personas.list': {
    path: API_ROUTES.ai.personas,
    method: 'GET',
  },
  'ai.personas.create': {
    path: API_ROUTES.ai.personas,
    method: 'POST',
  },
  'ai.persona.get': {
    path: API_ROUTES.ai.persona,
    method: 'GET',
  },
  'ai.persona.update': {
    path: API_ROUTES.ai.persona,
    method: 'PUT',
  },
  'ai.persona.delete': {
    path: API_ROUTES.ai.persona,
    method: 'DELETE',
  },
  'ai.skills.list': {
    path: API_ROUTES.ai.skills,
    method: 'GET',
  },
  'ai.skills.create': {
    path: API_ROUTES.ai.skills,
    method: 'POST',
  },
  'ai.skill.get': {
    path: API_ROUTES.ai.skill,
    method: 'GET',
  },
  'ai.skill.update': {
    path: API_ROUTES.ai.skill,
    method: 'PUT',
  },
  'ai.skill.delete': {
    path: API_ROUTES.ai.skill,
    method: 'DELETE',
  },
  'ai.conversations.list': {
    path: API_ROUTES.ai.conversations,
    method: 'GET',
  },
  'ai.conversations.create': {
    path: API_ROUTES.ai.conversations,
    method: 'POST',
  },
  'ai.conversation': {
    path: API_ROUTES.ai.conversation,
    method: 'GET',
  },
  'ai.message': {
    path: API_ROUTES.ai.message,
    method: 'PATCH',
  },
  'ai.messageFeedback': {
    path: API_ROUTES.ai.messageFeedback,
    method: 'PUT',
  },
  'ai.runStream': {
    path: API_ROUTES.ai.runStream,
    method: 'POST',
  },
  'ai.mcpConnections.list': {
    path: API_ROUTES.ai.mcpConnections,
    method: 'GET',
  },
  'ai.mcpConnections.create': {
    path: API_ROUTES.ai.mcpConnections,
    method: 'POST',
  },
  'ai.mcpConnection.update': {
    path: API_ROUTES.ai.mcpConnection,
    method: 'PUT',
  },
  'ai.mcpConnection.delete': {
    path: API_ROUTES.ai.mcpConnection,
    method: 'DELETE',
  },
  'ai.mcpDiscover': {
    path: API_ROUTES.ai.mcpDiscover,
    method: 'POST',
  },
  'ai.mcpTools': {
    path: API_ROUTES.ai.mcpTools,
    method: 'GET',
  },
  'ai.mcpToolCall': {
    path: API_ROUTES.ai.mcpToolCall,
    method: 'POST',
  },
  'telemetry.events': {
    path: API_ROUTES.telemetry.events,
    method: 'POST',
  },
} as const

export type ApiRouteGroup = keyof typeof API_ROUTE_GROUPS
export type ApiRoute =
  | (typeof API_ROUTE_GROUPS.public)[number]
  | (typeof API_ROUTE_GROUPS.authRequired)[number]
  | typeof API_ROUTES.auth.login
  | typeof API_ROUTES.auth.register
  | typeof API_ROUTES.auth.resetPasswordRequest
  | typeof API_ROUTES.auth.resetPassword
  | typeof API_ROUTES.blog.create
  | typeof API_ROUTES.ai.generateImage
  | typeof API_ROUTES.ai.readImage
