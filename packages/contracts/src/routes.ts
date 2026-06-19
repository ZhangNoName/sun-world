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
  },
  auth: {
    login: '/auth/login',
    register: '/auth/register',
    logout: '/auth/logout',
    refreshToken: '/auth/refresh_token',
    resetPasswordRequest: '/auth/reset_password/request',
    resetPassword: '/auth/reset_password',
  },
  user: {
    me: '/user/me',
  },
  admin: {
    metrics: '/admin/metrics',
    metricsHistory: '/admin/metrics/history',
    telemetry: '/admin/telemetry',
    alerts: '/admin/alerts',
  },
  ai: {
    chat: '/ai/chat',
    chatStream: '/ai/chat_stream',
    chatChunkStream: '/ai/chat-chunk-stream',
    generateImage: '/ai/generate-image',
    readImage: '/ai/read-image',
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
    API_ROUTES.ai.chat,
    API_ROUTES.ai.chatStream,
    API_ROUTES.ai.chatChunkStream,
    API_ROUTES.telemetry.events,
  ],
  authRequired: [
    API_ROUTES.auth.logout,
    API_ROUTES.auth.refreshToken,
    API_ROUTES.user.me,
    API_ROUTES.admin.metrics,
    API_ROUTES.admin.metricsHistory,
    API_ROUTES.admin.telemetry,
    API_ROUTES.admin.alerts,
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
