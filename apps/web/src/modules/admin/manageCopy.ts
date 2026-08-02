import { useSyncExternalStore } from 'react'

import i18n from '@/i18n'

export type ManageLocale = 'zh' | 'en'

export interface ManageCopy {
  language: {
    label: string
    trigger: string
    chinese: string
    english: string
    choose: string
  }
  brand: string
  nav: {
    workbench: string
    overview: string
    requestMetrics: string
    content: string
    blog: string
    ai: string
    providers: string
    system: string
    dictionaries: string
    auditLogs: string
  }
  aria: {
    openNavigation: string
    restoreSidebar: string
    expandSidebar: string
    collapseSidebar: string
    hideSidebar: string
    closeNavigation: string
    navigation: string
    breadcrumb: string
  }
  breadcrumb: {
    manage: string
    overview: string
  }
  account: {
    menu: (name: string) => string
    profile: string
    settings: string
    publicSite: string
    signOut: string
    adminRole: string
  }
  search: {
    title: string
    moreFilters: string
    collapse: string
    submit: string
    reset: string
  }
  table: {
    loading: string
    retry: string
    empty: string
    selectAll: string
    selectRow: (value: string) => string
    pageNavigation: string
    pageSizeLabel: string
    pageSizeOption: (value: number) => string
    yes: string
    no: string
    loadError: string
  }
  form: {
    ariaLabel: string
    save: string
    selectPlaceholder: string
    dictionaryError: string
    required: (label: string) => string
  }
  guard: {
    checking: string
    signInRequired: string
    signInMessage: string
    signIn: string
    adminRequired: string
    forbiddenMessage: string
  }
  overview: {
    eyebrow: string
    title: string
    description: string
    averageDuration: string
    retry: string
    empty: string
  }
  metrics: {
    eyebrow: string
    title: string
    description: string
    updated: (value: string) => string
    notLoaded: string
    refresh: string
    activeAlerts: string
    noActiveAlerts: string
    statusCodes: string
    noStatusData: string
    requests: string
    routeLatency: string
    noRouteMetrics: string
    errors: string
    webVitals: string
    noBrowserPerformance: string
    samples: string
    poor: string
    recentRum: string
    noRecentEvents: string
    metricsOverview: string
    threshold: string
    average: string
    totalRequests: string
    currentProcessRequests: string
    errorRequests: string
    errorRate: string
    avgDuration: string
    p95Duration: string
    peakDuration: string
    latencyCaption: string
    rumEvents: string
    browserTelemetry: string
    webVitalsKinds: string
    rejectedEvents: string
    rejectedByContract: string
    browserErrors: string
    browserErrorsCaption: string
    alerts: string
    severitySummary: (critical: number, warning: number) => string
    requestHistory: string
    rumHistory: string
    snapshots: (limit: number) => string
  }
  blog: {
    title: string
    keyword: string
    searchTitle: string
    category: string
    tags: string
    words: string
    comments: string
    views: string
    updated: string
    actions: string
    edit: string
    delete: string
    editorTitle: (editing: boolean) => string
    description: string
    editorDescription: (editing: boolean) => string
    newArticle: string
    createArticle: string
    saveChanges: string
    confirmDelete: (title: string) => string
    abstract: string
    content: string
    categoryId: string
    author: string
    tagsPlaceholder: string
    untitled: string
  }
  providers: {
    provider: string
    name: string
    searchProvider: string
    id: string
    defaultModel: string
    baseUrl: string
    status: string
    order: string
    updated: string
    actions: string
    edit: string
    delete: string
    providerId: string
    displayName: string
    defaultBaseUrl: string
    sortOrder: string
    enabled: string
    title: string
    description: string
    newProvider: string
    editorTitle: (editing: boolean) => string
    editorDescription: string
    saveChanges: string
    createProvider: string
    confirmDelete: (name: string) => string
  }
  logs: {
    eyebrow: string
    level: string
    allLevels: string
    applyFilters: string
    count: string
    retry: string
    empty: string
    auditEvents: string
    retention: (files: number, maxBytes: string) => string
    time: string
    severity: string
    eventType: string
    eventPlaceholder: string
    method: string
    route: string
    status: string
    duration: string
    requestId: string
    title: string
    description: string
    refresh: string
    severityLabels: Record<string, string>
  }
  dictionaries: {
    code: string
    name: string
    searchCode: string
    searchName: string
    description: string
    status: string
    enabled: string
    updated: string
    actions: string
    items: string
    edit: string
    delete: string
    value: string
    label: string
    color: string
    order: string
    title: string
    pageDescription: string
    newDictionary: string
    itemTitle: (code: string) => string
    itemDescription: (name: string) => string
    backToTypes: string
    newItem: string
    dictionaryItem: string
    dictionaryType: string
    changesApplied: string
    save: string
    confirmTypeDelete: (code: string) => string
    confirmItemDelete: (value: string) => string
  }
}

const manageCopies: Record<ManageLocale, ManageCopy> = {
  zh: {
    language: {
      label: '语言',
      trigger: '语言：中文',
      chinese: '中文',
      english: 'English',
      choose: '选择语言',
    },
    brand: '太阳世界管理',
    nav: {
      workbench: '工作台',
      overview: '概览',
      requestMetrics: '请求指标',
      content: '内容管理',
      blog: '博客管理',
      ai: 'AI 管理',
      providers: '供应商管理',
      system: '系统管理',
      dictionaries: '字典管理',
      auditLogs: '审计日志',
    },
    aria: {
      openNavigation: '打开管理导航',
      restoreSidebar: '恢复侧栏',
      expandSidebar: '展开侧栏',
      collapseSidebar: '收起侧栏',
      hideSidebar: '隐藏侧栏',
      closeNavigation: '关闭管理导航',
      navigation: '管理导航',
      breadcrumb: '面包屑',
    },
    breadcrumb: { manage: '管理', overview: '概览' },
    account: {
      menu: (name) => `${name} 的账户菜单`,
      profile: '个人资料',
      settings: '账号设置',
      publicSite: '返回前台',
      signOut: '退出登录',
      adminRole: '管理员',
    },
    search: {
      title: '搜索',
      moreFilters: '更多筛选',
      collapse: '收起',
      submit: '搜索',
      reset: '重置',
    },
    table: {
      loading: '正在加载数据…',
      retry: '重试',
      empty: '暂无数据',
      selectAll: '选择全部行',
      selectRow: (value) => `选择 ${value}`,
      pageNavigation: '管理页面导航',
      pageSizeLabel: '每页条数',
      pageSizeOption: (value) => `${value} 条/页`,
      yes: '是',
      no: '否',
      loadError: '无法加载数据',
    },
    form: {
      ariaLabel: '表单',
      save: '保存',
      selectPlaceholder: '请选择',
      dictionaryError: '字典选项加载失败',
      required: (label) => `${label} 为必填项`,
    },
    guard: {
      checking: '正在检查管理员权限…',
      signInRequired: '需要登录',
      signInMessage: '登录后才能访问管理中心。',
      signIn: '前往登录',
      adminRequired: '需要管理员权限',
      forbiddenMessage: '当前账号没有管理员权限。',
    },
    overview: {
      eyebrow: '概览',
      title: '运营概览',
      description: '按路由对比平均请求耗时。',
      averageDuration: '平均耗时',
      retry: '重试',
      empty: '暂无路由数据。',
    },
    metrics: {
      eyebrow: '运营',
      title: '请求指标',
      description: '请求、错误、延迟和浏览器遥测的实时快照。',
      updated: (value) => `更新于 ${value}`,
      notLoaded: '尚未加载',
      refresh: '刷新',
      activeAlerts: '活动告警',
      noActiveAlerts: '暂无活动告警。',
      statusCodes: '状态码',
      noStatusData: '暂无状态数据。',
      requests: '请求',
      routeLatency: '路由延迟',
      noRouteMetrics: '暂无路由指标。',
      errors: '错误',
      webVitals: 'Web Vitals',
      noBrowserPerformance: '暂无浏览器性能数据。',
      samples: '样本',
      poor: '较差',
      recentRum: '近期 RUM 事件',
      noRecentEvents: '暂无近期事件。',
      metricsOverview: '指标概览',
      threshold: '阈值',
      average: '平均',
      totalRequests: '总请求',
      currentProcessRequests: '当前进程累计请求数',
      errorRequests: '错误请求',
      errorRate: '错误率',
      avgDuration: '平均耗时',
      p95Duration: 'P95 耗时',
      peakDuration: '峰值耗时',
      latencyCaption: '当前窗口响应耗时',
      rumEvents: 'RUM 事件',
      browserTelemetry: '浏览器遥测事件',
      webVitalsKinds: '浏览器性能指标种类',
      rejectedEvents: '拒绝事件',
      rejectedByContract: '被契约拒绝',
      browserErrors: '浏览器错误',
      browserErrorsCaption: '全局、Promise 与 API 错误',
      alerts: '活动告警',
      severitySummary: (critical, warning) =>
        `${critical} 严重 / ${warning} 警告`,
      requestHistory: '请求历史',
      rumHistory: 'RUM 历史',
      snapshots: (limit) => `最近 ${limit} 个快照`,
    },
    blog: {
      title: '标题',
      keyword: '关键词',
      searchTitle: '搜索标题',
      category: '分类',
      tags: '标签',
      words: '字数',
      comments: '评论',
      views: '浏览量',
      updated: '更新时间',
      actions: '操作',
      edit: '编辑',
      delete: '删除',
      editorTitle: (editing) => (editing ? '编辑文章' : '新建文章'),
      description: '搜索、审核已发布内容，并进入文章编辑流程。',
      editorDescription: (editing) =>
        editing ? '更新文章元数据和内容。' : '创建包含必要元数据的文章草稿。',
      newArticle: '新建文章',
      createArticle: '创建文章',
      saveChanges: '保存修改',
      confirmDelete: (title) => `确定删除博客“${title}”？`,
      abstract: '摘要',
      content: '内容',
      categoryId: '分类 ID',
      author: '作者',
      tagsPlaceholder: '标签一, 标签二',
      untitled: '无标题',
    },
    providers: {
      provider: '供应商',
      name: '名称',
      searchProvider: '搜索供应商',
      id: 'ID',
      defaultModel: '默认模型',
      baseUrl: '基础 URL',
      status: '状态',
      order: '排序',
      updated: '更新时间',
      actions: '操作',
      edit: '编辑',
      delete: '删除',
      providerId: '供应商 ID',
      displayName: '显示名称',
      defaultBaseUrl: '默认基础 URL',
      sortOrder: '排序值',
      enabled: '启用',
      title: 'AI 供应商',
      description: '维护 AI 工作流使用的供应商目录，密钥始终保留在服务端。',
      newProvider: '新建供应商',
      editorTitle: (editing) => (editing ? '编辑供应商' : '新建供应商'),
      editorDescription: '供应商凭据不会在此目录表单中填写。',
      saveChanges: '保存修改',
      createProvider: '创建供应商',
      confirmDelete: (name) => `确定删除供应商“${name}”？`,
    },
    logs: {
      eyebrow: '安全',
      level: '级别',
      allLevels: '全部级别',
      applyFilters: '应用筛选',
      count: '数量',
      retry: '重试',
      empty: '暂无审计事件',
      auditEvents: '审计事件',
      retention: (files, maxBytes) =>
        `保留 ${files} 个日志文件，单文件上限 ${maxBytes}`,
      time: '时间',
      severity: '严重程度',
      eventType: '事件类型',
      eventPlaceholder: '例如 request_completed',
      method: '方法',
      route: '路由',
      status: '状态',
      duration: '耗时',
      requestId: '请求 ID',
      title: '审计日志',
      description: '只读查看经过脱敏的事件，用于运营审查和请求追踪。',
      refresh: '刷新',
      severityLabels: {
        debug: '调试',
        info: '信息',
        warning: '警告',
        error: '错误',
        critical: '严重',
      },
    },
    dictionaries: {
      code: '编码',
      name: '名称',
      searchCode: '搜索编码',
      searchName: '搜索名称',
      description: '描述',
      status: '状态',
      enabled: '启用',
      updated: '更新时间',
      actions: '操作',
      items: '字典项',
      edit: '编辑',
      delete: '删除',
      value: '值',
      label: '标签',
      color: '颜色',
      order: '排序',
      title: '字典类型',
      pageDescription: '管理供后台表格和表单复用的启用值。',
      newDictionary: '新建字典',
      itemTitle: (code) => `字典项：${code}`,
      itemDescription: (name) => `${name} 的启用值。`,
      backToTypes: '返回字典类型',
      newItem: '新建字典项',
      dictionaryItem: '字典项',
      dictionaryType: '字典类型',
      changesApplied: '保存后立即生效。',
      save: '保存',
      confirmTypeDelete: (code) => `确定删除字典 ${code}？`,
      confirmItemDelete: (value) => `确定删除字典项 ${value}？`,
    },
  },
  en: {
    language: {
      label: 'Language',
      trigger: 'Language: English',
      chinese: '中文',
      english: 'English',
      choose: 'Choose language',
    },
    brand: 'Sun World Manage',
    nav: {
      workbench: 'Workbench',
      overview: 'Overview',
      requestMetrics: 'Request metrics',
      content: 'Content management',
      blog: 'Blog management',
      ai: 'AI management',
      providers: 'Provider management',
      system: 'System management',
      dictionaries: 'Dictionaries',
      auditLogs: 'Audit logs',
    },
    aria: {
      openNavigation: 'Open management navigation',
      restoreSidebar: 'Restore sidebar',
      expandSidebar: 'Expand sidebar',
      collapseSidebar: 'Collapse sidebar',
      hideSidebar: 'Hide sidebar',
      closeNavigation: 'Close management navigation',
      navigation: 'Management navigation',
      breadcrumb: 'Breadcrumb',
    },
    breadcrumb: { manage: 'Manage', overview: 'Overview' },
    account: {
      menu: (name) => `Account menu for ${name}`,
      profile: 'Personal profile',
      settings: 'Account settings',
      publicSite: 'Return to public site',
      signOut: 'Sign out',
      adminRole: 'Admin',
    },
    search: {
      title: 'Search',
      moreFilters: 'More filters',
      collapse: 'Collapse',
      submit: 'Search',
      reset: 'Reset',
    },
    table: {
      loading: 'Loading data…',
      retry: 'Retry',
      empty: 'No data',
      selectAll: 'Select all rows',
      selectRow: (value) => `Select ${value}`,
      pageNavigation: 'Manage page navigation',
      pageSizeLabel: 'Items per page',
      pageSizeOption: (value) => `${value} / page`,
      yes: 'Yes',
      no: 'No',
      loadError: 'Could not load data',
    },
    form: {
      ariaLabel: 'Schema form',
      save: 'Save',
      selectPlaceholder: 'Select an option',
      dictionaryError: 'Dictionary options could not be loaded',
      required: (label) => `${label} is required`,
    },
    guard: {
      checking: 'Checking administrator access…',
      signInRequired: 'Sign in required',
      signInMessage: 'Sign in to access the management center.',
      signIn: 'Go to sign in',
      adminRequired: 'Administrator access required',
      forbiddenMessage: 'This account does not have administrator permissions.',
    },
    overview: {
      eyebrow: 'Overview',
      title: 'Operations overview',
      description: 'Compare average request duration by route.',
      averageDuration: 'Average duration',
      retry: 'Retry',
      empty: 'No route data available.',
    },
    metrics: {
      eyebrow: 'Operations',
      title: 'Request metrics',
      description:
        'Live snapshots for requests, errors, latency, and browser telemetry.',
      updated: (value) => `Updated ${value}`,
      notLoaded: 'Not loaded yet',
      refresh: 'Refresh',
      activeAlerts: 'Active alerts',
      noActiveAlerts: 'No active alerts.',
      statusCodes: 'Status codes',
      noStatusData: 'No status data.',
      requests: 'requests',
      routeLatency: 'Route latency',
      noRouteMetrics: 'No route metrics.',
      errors: 'errors',
      webVitals: 'Web Vitals',
      noBrowserPerformance: 'No browser performance data.',
      samples: 'samples',
      poor: 'poor',
      recentRum: 'Recent RUM events',
      noRecentEvents: 'No recent events.',
      metricsOverview: 'Metrics overview',
      threshold: 'threshold',
      average: 'avg',
      totalRequests: 'Total requests',
      currentProcessRequests: 'Requests accumulated by the current process',
      errorRequests: 'Error requests',
      errorRate: 'error rate',
      avgDuration: 'Average duration',
      p95Duration: 'P95 duration',
      peakDuration: 'Peak duration',
      latencyCaption: 'Response duration in the current window',
      rumEvents: 'RUM events',
      browserTelemetry: 'Browser telemetry events',
      webVitalsKinds: 'Browser performance metric types',
      rejectedEvents: 'Rejected events',
      rejectedByContract: 'rejected by contract',
      browserErrors: 'Browser errors',
      browserErrorsCaption: 'Global, Promise, and API errors',
      alerts: 'Active alerts',
      severitySummary: (critical, warning) =>
        `${critical} critical / ${warning} warning`,
      requestHistory: 'Request history',
      rumHistory: 'RUM history',
      snapshots: (limit) => `Last ${limit} snapshots`,
    },
    blog: {
      title: 'Title',
      keyword: 'Keyword',
      searchTitle: 'Search title',
      category: 'Category',
      tags: 'Tags',
      words: 'Words',
      comments: 'Comments',
      views: 'Views',
      updated: 'Updated',
      actions: 'Actions',
      edit: 'Edit',
      delete: 'Delete',
      editorTitle: (editing) => (editing ? 'Edit article' : 'New article'),
      description:
        'Search, review, and open the authoring workflow for published content.',
      editorDescription: (editing) =>
        editing
          ? 'Update the article metadata and content.'
          : 'Create an article draft with the required metadata.',
      newArticle: 'New article',
      createArticle: 'Create article',
      saveChanges: 'Save changes',
      confirmDelete: (title) => `Delete blog “${title}”?`,
      abstract: 'Abstract',
      content: 'Content',
      categoryId: 'Category ID',
      author: 'Author',
      tagsPlaceholder: 'tag-a, tag-b',
      untitled: 'Untitled',
    },
    providers: {
      provider: 'Provider',
      name: 'Name',
      searchProvider: 'Search provider',
      id: 'ID',
      defaultModel: 'Default model',
      baseUrl: 'Base URL',
      status: 'Status',
      order: 'Order',
      updated: 'Updated',
      actions: 'Actions',
      edit: 'Edit',
      delete: 'Delete',
      providerId: 'Provider ID',
      displayName: 'Display name',
      defaultBaseUrl: 'Default base URL',
      sortOrder: 'Sort order',
      enabled: 'Enabled',
      title: 'AI providers',
      description:
        'Maintain the provider catalog used by AI workflows. Secrets remain server-side.',
      newProvider: 'New provider',
      editorTitle: (editing) => (editing ? 'Edit provider' : 'New provider'),
      editorDescription:
        'Provider credentials are never entered in this catalog form.',
      saveChanges: 'Save changes',
      createProvider: 'Create provider',
      confirmDelete: (name) => `Delete provider “${name}”?`,
    },
    logs: {
      eyebrow: 'Security',
      level: 'Level',
      allLevels: 'All levels',
      applyFilters: 'Apply filters',
      count: 'Count',
      retry: 'Retry',
      empty: 'No audit events',
      auditEvents: 'Audit events',
      retention: (files, maxBytes) =>
        `Retaining ${files} log files, ${maxBytes} per file maximum`,
      time: 'Time',
      severity: 'Severity',
      eventType: 'Event type',
      eventPlaceholder: 'request_completed',
      method: 'Method',
      route: 'Route',
      status: 'Status',
      duration: 'Duration',
      requestId: 'Request ID',
      title: 'Audit logs',
      description:
        'Read-only sanitized events for operational review and request tracing.',
      refresh: 'Refresh',
      severityLabels: {
        debug: 'Debug',
        info: 'Info',
        warning: 'Warning',
        error: 'Error',
        critical: 'Critical',
      },
    },
    dictionaries: {
      code: 'Code',
      name: 'Name',
      searchCode: 'Search code',
      searchName: 'Search name',
      description: 'Description',
      status: 'Status',
      enabled: 'Enabled',
      updated: 'Updated',
      actions: 'Actions',
      items: 'Items',
      edit: 'Edit',
      delete: 'Delete',
      value: 'Value',
      label: 'Label',
      color: 'Color',
      order: 'Order',
      title: 'Dictionary types',
      pageDescription:
        'Manage reusable enabled values used by administrative tables and forms.',
      newDictionary: 'New dictionary',
      itemTitle: (code) => `Items: ${code}`,
      itemDescription: (name) => `Enabled values for ${name}.`,
      backToTypes: 'Back to types',
      newItem: 'New item',
      dictionaryItem: 'Dictionary item',
      dictionaryType: 'Dictionary type',
      changesApplied: 'Changes are applied immediately after saving.',
      save: 'Save',
      confirmTypeDelete: (code) => `Delete dictionary ${code}?`,
      confirmItemDelete: (value) => `Delete dictionary item ${value}?`,
    },
  },
}

export function useManageCopy() {
  return manageCopies[useManageLocale()]
}

export function useManageLocale(): ManageLocale {
  const language = useSyncExternalStore(
    (onStoreChange) => {
      i18n.on('languageChanged', onStoreChange)
      return () => i18n.off('languageChanged', onStoreChange)
    },
    () => i18n.language,
    () => i18n.language
  )
  return language?.startsWith('en') ? 'en' : 'zh'
}

export function getManageCopy(locale: ManageLocale) {
  return manageCopies[locale]
}
