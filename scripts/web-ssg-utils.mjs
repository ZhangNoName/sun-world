const SITE_URL = 'https://sunworld.site'
const DEFAULT_DESCRIPTION =
  'Sun World 是一个记录全栈开发、AI、图形编辑器和工程实践的个人技术博客。'

export function buildArticleCanonicalPath(id) {
  return `/blog/${encodeURIComponent(String(id))}`
}

export function routeToSsgOutputPath(routePath) {
  const normalized = String(routePath || '/').replace(/^\/+/, '')
  if (!normalized) return 'index.html'
  return `${normalized.replace(/\/+$/, '')}.html`
}

export function extractApiData(payload) {
  if (
    payload &&
    typeof payload === 'object' &&
    !Array.isArray(payload) &&
    'data' in payload &&
    (payload.code === 1 || payload.code === '1')
  ) {
    return payload.data
  }

  return payload
}

export function renderArticlePageHtml(indexHtml, article) {
  const id = article.id
  const canonicalPath = buildArticleCanonicalPath(id)
  const canonicalUrl = `${SITE_URL}${canonicalPath}`
  const title = `${textValue(article.title, 'Sun World Article')} - Sun World`
  const description = textValue(
    article.abstract,
    textValue(article.title, DEFAULT_DESCRIPTION)
  )
  const bodyHtml = renderArticleFallbackHtml(article, canonicalUrl)
  const jsonLd = buildBlogPostingJsonLd(article, canonicalUrl, description)

  return injectPage(indexHtml, {
    title,
    description,
    canonicalUrl,
    ogType: 'article',
    appHtml: bodyHtml,
    jsonLd,
  })
}

export function renderHomePageHtml(indexHtml) {
  return injectPage(indexHtml, {
    title: 'Sun World',
    description: DEFAULT_DESCRIPTION,
    canonicalUrl: `${SITE_URL}/`,
    ogType: 'website',
    appHtml: `<main class="ssg-home" aria-label="Sun World">
      <h1>Sun World</h1>
      <p>${escapeHtml(DEFAULT_DESCRIPTION)}</p>
      <p>Google 登录仅使用姓名、头像、已验证邮箱和账号标识来创建或登录 Sun World 账号，不用于广告或 AI 训练。</p>
      <p><a href="/privacy">隐私政策</a></p>
    </main>`,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'Sun World',
      url: SITE_URL,
      description: DEFAULT_DESCRIPTION,
      inLanguage: 'zh-CN',
    },
  })
}

export function renderPrivacyPolicyPageHtml(indexHtml) {
  const canonicalUrl = `${SITE_URL}/privacy`
  const description =
    'Sun World Google 登录基础身份资料的使用、服务端保存、撤销与删除说明。'

  return injectPage(indexHtml, {
    title: '隐私政策 - Sun World',
    description,
    canonicalUrl,
    ogType: 'website',
    appHtml: `<main class="ssg-privacy-policy" data-ssg-route="${canonicalUrl}">
      <article>
        <h1>隐私政策</h1>
        <p><time datetime="2026-08-30">最后更新：2026 年 8 月 30 日</time></p>
        <h2>访问的信息</h2>
        <p>Sun World 使用 Google 登录时，仅访问姓名、邮箱地址、头像和 Google 账号唯一标识符（sub）。不请求 Gmail、Google Drive、日历、通讯录、相册或 Google 账号密码的访问权限。</p>
        <h2>使用目的</h2>
        <p>这些资料只用于确认 Google 账号身份、创建新的 Sun World 账号，或登录此前已连接该 Google 身份的 Sun World 账号，以及显示基础名称和头像。</p>
        <h2>服务端保存</h2>
        <p>Sun World 保存 Google 提供方、签发方和账号唯一标识符与站内账号之间的身份映射，以及登录所需的姓名、头像链接和已验证邮箱；不会仅因邮箱地址相同而自动合并账号。</p>
        <p>OAuth 授权码、Google access token 和 ID token 仅在登录回调期间用于令牌交换、校验身份和读取上述基础资料；Sun World 不将这些授权码或 token 写入数据库，也不作持久化保存。</p>
        <h2>共享、转移与披露</h2>
        <p>Sun World 不出售 Google 账号资料，也不会将其提供给广告商、数据经纪商、信息转售商、征信或借贷机构；这些资料不用于定向广告、再营销、用户画像，或训练 AI / ML 模型。</p>
        <p>这些资料仅在运行和保护 Sun World 所必需的服务端基础设施中处理，并仅由履行运维与安全职责所必需的维护者访问。除提供本政策所述登录功能、保护服务安全或履行适用法律要求外，Sun World 不会向其他第三方转移或披露这些资料；依法披露时仅限必要范围。</p>
        <h2>保护措施</h2>
        <p>Sun World 使用 HTTPS 传输、仅服务端执行的授权码交换和身份校验、HttpOnly 且 Secure 的会话 Cookie、应用访问控制及最小化保存来保护 Google 账号资料。页面脚本不会接收 Google access token 或 ID token。</p>
        <h2>保留期限</h2>
        <p>Google 身份映射、姓名、头像链接和已验证邮箱仅在对应身份关联或 Sun World 账号仍存在且这些资料仍是登录所必需时保留。身份关联或账号被删除，或经核验的删除请求处理完成后，Sun World 会从活动服务数据中删除不再需要的 Google 账号资料。</p>
        <p>为防止欺诈、调查安全事件或履行法律义务而确有必要的最少记录，可在实现该目的所必需的期限内单独保留；这些记录不会用于恢复已删除的登录资料、广告或 AI 训练。</p>
        <h2>撤销访问与删除数据</h2>
        <p><a href="https://support.google.com/accounts/answer/13533235">撤销 Google 第三方连接</a></p>
        <p><a href="https://github.com/ZhangNoName/sun-world/issues/new">Sun World 数据删除请求入口</a>。请在公开 Issue 中只说明“申请删除 Google 登录数据”，不要提交完整邮箱、sub 或其他账号资料；维护者会另行提供非公开的身份核验方式。</p>
        <h2>Google 的隐私政策</h2>
        <p><a href="https://policies.google.com/privacy">Google 隐私政策</a></p>
      </article>
    </main>`,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: '隐私政策 - Sun World',
      url: canonicalUrl,
      description,
      inLanguage: 'zh-CN',
    },
  })
}

export function renderSitemapXml(entries) {
  const uniqueEntries = []
  const seen = new Set()

  for (const entry of entries) {
    if (!entry?.loc || seen.has(entry.loc)) continue
    seen.add(entry.loc)
    uniqueEntries.push(entry)
  }

  const urls = uniqueEntries
    .map((entry) => {
      const lastmod = formatDateOnly(entry.lastmod)
      return [
        '  <url>',
        `    <loc>${escapeHtml(entry.loc)}</loc>`,
        lastmod ? `    <lastmod>${escapeHtml(lastmod)}</lastmod>` : null,
        entry.changefreq
          ? `    <changefreq>${escapeHtml(entry.changefreq)}</changefreq>`
          : null,
        entry.priority
          ? `    <priority>${escapeHtml(entry.priority)}</priority>`
          : null,
        '  </url>',
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`
}

export function normalizeApiBaseUrl(value) {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return 'https://api.sunworld.site'
  return trimmed.replace(/\/+$/, '')
}

export function buildApiUrl(baseUrl, path, query = {}) {
  const url = new URL(path, `${normalizeApiBaseUrl(baseUrl)}/`)

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    url.searchParams.set(key, String(value))
  }

  return url
}

export function safeArticleId(article) {
  const id = article?.id
  if (id === undefined || id === null || id === '') return ''
  return String(id)
}

export function toSitemapEntries(articles) {
  const staticEntries = [
    {
      loc: `${SITE_URL}/`,
      changefreq: 'daily',
      priority: '1.0',
    },
    {
      loc: `${SITE_URL}/home`,
      changefreq: 'daily',
      priority: '0.9',
    },
    {
      loc: `${SITE_URL}/privacy`,
      changefreq: 'yearly',
      priority: '0.3',
    },
    {
      loc: `${SITE_URL}/tools`,
      changefreq: 'monthly',
      priority: '0.5',
    },
    {
      loc: `${SITE_URL}/game_tiles`,
      changefreq: 'monthly',
      priority: '0.5',
    },
    {
      loc: `${SITE_URL}/video`,
      changefreq: 'monthly',
      priority: '0.4',
    },
  ]

  const articleEntries = articles
    .map((article) => {
      const id = safeArticleId(article)
      if (!id) return null

      return {
        loc: `${SITE_URL}${buildArticleCanonicalPath(id)}`,
        lastmod: article.updated_at || article.created_at,
        changefreq: 'weekly',
        priority: '0.8',
      }
    })
    .filter(Boolean)

  return [...staticEntries, ...articleEntries]
}

function injectPage(
  indexHtml,
  { title, description, canonicalUrl, ogType, appHtml, jsonLd }
) {
  let html = indexHtml
  const escapedTitle = escapeHtml(title)
  const escapedDescription = escapeHtml(description)
  const escapedCanonical = escapeHtml(canonicalUrl)
  const escapedOgType = escapeHtml(ogType)

  html = replaceOrInsertTitle(html, escapedTitle)
  html = replaceOrInsertMeta(html, 'meta[name="description"]', {
    name: 'description',
    content: escapedDescription,
  })
  html = replaceOrInsertMeta(html, 'meta[property="og:title"]', {
    property: 'og:title',
    content: escapedTitle,
  })
  html = replaceOrInsertMeta(html, 'meta[property="og:description"]', {
    property: 'og:description',
    content: escapedDescription,
  })
  html = replaceOrInsertMeta(html, 'meta[property="og:type"]', {
    property: 'og:type',
    content: escapedOgType,
  })
  html = replaceOrInsertMeta(html, 'meta[property="og:url"]', {
    property: 'og:url',
    content: escapedCanonical,
  })
  html = replaceOrInsertMeta(html, 'meta[property="og:site_name"]', {
    property: 'og:site_name',
    content: 'Sun World',
  })
  html = replaceOrInsertMeta(html, 'meta[property="og:locale"]', {
    property: 'og:locale',
    content: 'zh_CN',
  })
  html = replaceOrInsertMeta(html, 'meta[name="twitter:card"]', {
    name: 'twitter:card',
    content: 'summary',
  })
  html = replaceOrInsertMeta(html, 'meta[name="twitter:title"]', {
    name: 'twitter:title',
    content: escapedTitle,
  })
  html = replaceOrInsertMeta(html, 'meta[name="twitter:description"]', {
    name: 'twitter:description',
    content: escapedDescription,
  })
  html = replaceOrInsertLink(html, 'link[rel="canonical"]', {
    rel: 'canonical',
    href: escapedCanonical,
  })
  html = replaceJsonLd(html, jsonLd)
  html = html.replace(
    /<div\s+id="app"\s*>[\s\S]*?<\/div>/,
    `<div id="app">${appHtml}</div>`
  )

  return html
}

function renderArticleFallbackHtml(article, canonicalUrl) {
  const title = textValue(article.title, 'Sun World Article')
  const description = textValue(article.abstract, '')
  const contentText = markdownToPlainText(textValue(article.content, ''))
  const createdAt = formatDateOnly(article.created_at)
  const updatedAt = formatDateOnly(article.updated_at)

  return `<article class="ssg-article" data-ssg-route="${escapeHtml(canonicalUrl)}">
      <header>
        <h1>${escapeHtml(title)}</h1>
        ${description ? `<p>${escapeHtml(description)}</p>` : ''}
        <p>
          ${createdAt ? `<time datetime="${escapeHtml(createdAt)}">${escapeHtml(createdAt)}</time>` : ''}
          ${updatedAt && updatedAt !== createdAt ? `<span> Updated ${escapeHtml(updatedAt)}</span>` : ''}
        </p>
      </header>
      <pre>${escapeHtml(contentText)}</pre>
    </article>`
}

function buildBlogPostingJsonLd(article, canonicalUrl, description) {
  const json = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: textValue(article.title, 'Sun World Article'),
    description,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': canonicalUrl,
    },
    publisher: {
      '@type': 'Organization',
      name: 'Sun World',
      url: SITE_URL,
    },
  }

  if (article.author) {
    json.author = {
      '@type': 'Person',
      name: String(article.author),
    }
  }
  if (article.created_at) json.datePublished = String(article.created_at)
  if (article.updated_at) json.dateModified = String(article.updated_at)
  if (article.byte_num) json.wordCount = Number(article.byte_num)

  return json
}

function markdownToPlainText(markdown) {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[>\s-]+/gm, ' ')
    .replace(/[*_~]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function replaceOrInsertTitle(html, title) {
  if (/<title>[\s\S]*?<\/title>/i.test(html)) {
    return html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`)
  }

  return insertBeforeHeadClose(html, `    <title>${title}</title>`)
}

function replaceOrInsertMeta(html, selector, attributes) {
  const source = renderTag('meta', attributes)
  const matcher = metaSelectorToRegex(selector)

  if (matcher.test(html)) {
    return html.replace(matcher, source)
  }

  return insertBeforeHeadClose(html, `    ${source}`)
}

function replaceOrInsertLink(html, selector, attributes) {
  const source = renderTag('link', attributes)
  const matcher = linkSelectorToRegex(selector)

  if (matcher.test(html)) {
    return html.replace(matcher, source)
  }

  return insertBeforeHeadClose(html, `    ${source}`)
}

function replaceJsonLd(html, jsonLd) {
  const source = `    <script type="application/ld+json" data-ssg="true">${escapeScriptJson(jsonLd)}</script>`
  const matcher =
    /\s*<script\b(?=[^>]*type=["']application\/ld\+json["'])(?=[^>]*data-ssg=["']true["'])[^>]*>[\s\S]*?<\/script>/i

  if (matcher.test(html)) {
    return html.replace(matcher, `\n${source}`)
  }

  return insertBeforeHeadClose(html, source)
}

function renderTag(name, attributes) {
  const attrs = Object.entries(attributes)
    .map(([key, value]) => `${key}="${value}"`)
    .join(' ')
  return `<${name} ${attrs} />`
}

function metaSelectorToRegex(selector) {
  const nameMatch = selector.match(/meta\[name="([^"]+)"]/)
  if (nameMatch) {
    return new RegExp(
      `<meta\\b(?=[^>]*\\bname=["']${escapeRegex(nameMatch[1])}["'])[^>]*>`,
      'i'
    )
  }

  const propertyMatch = selector.match(/meta\[property="([^"]+)"]/)
  if (propertyMatch) {
    return new RegExp(
      `<meta\\b(?=[^>]*\\bproperty=["']${escapeRegex(propertyMatch[1])}["'])[^>]*>`,
      'i'
    )
  }

  throw new Error(`Unsupported meta selector: ${selector}`)
}

function linkSelectorToRegex(selector) {
  const relMatch = selector.match(/link\[rel="([^"]+)"]/)
  if (!relMatch) throw new Error(`Unsupported link selector: ${selector}`)
  return new RegExp(
    `<link\\b(?=[^>]*\\brel=["']${escapeRegex(relMatch[1])}["'])[^>]*>`,
    'i'
  )
}

function insertBeforeHeadClose(html, source) {
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${source}\n  </head>`)
  }

  return `${source}\n${html}`
}

function escapeScriptJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function textValue(value, fallback) {
  const text = String(value ?? '').trim()
  return text || fallback
}

function formatDateOnly(value) {
  if (!value) return ''
  const text = String(value)
  const match = text.match(/^\d{4}-\d{2}-\d{2}/)
  return match ? match[0] : ''
}
