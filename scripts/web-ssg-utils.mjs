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
