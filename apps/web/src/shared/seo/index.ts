/**
 * SEO / head management helpers.
 *
 * These utilities work with `@unhead/vue` to set page-level meta tags
 * from route metadata, component lifecycle hooks, or module defaults.
 *
 * Usage (in a page component):
 *   import { usePageMeta } from '@/shared/seo'
 *   usePageMeta({ title: 'My Page', description: '...' })
 */

import { useHead } from '@unhead/vue'
import { toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import { API_BASE_URL, SITE_URL } from '@/shared/config'

/** Default site-wide SEO values. */
const DEFAULTS = {
  title: 'Sun World',
  description:
    '尝试全栈开发, 精通vue ,react, 擅长React Native, Python, 熟练AIGC实践及代码编辑器深度解析的个人技术博客。',
  siteName: 'Sun World',
  locale: 'zh_CN',
}

export interface PageMetaInput {
  title?: string
  description?: string
  canonical?: string
  ogImage?: string
  ogType?: string
  noIndex?: boolean
}

interface NormalizedPageMeta {
  title: string
  description: string
  canonical: string
  ogImage?: string
  ogType: string
  noIndex: boolean
}

type PageMetaInputSource = MaybeRefOrGetter<PageMetaInput | undefined>
type JsonLdObject = Record<string, unknown>
type JsonLdInputSource = MaybeRefOrGetter<JsonLdObject | null | undefined>

/**
 * Set page-level head metadata.
 *
 * Call from any component or composable. Values not provided fall back
 * to site-wide defaults.
 */
export function usePageMeta(input: PageMetaInputSource = {}) {
  useHead(() => {
    const source = toValue(input) ?? {}
    const title = source.title || DEFAULTS.title
    const description = source.description || DEFAULTS.description
    const canonical = source.canonical ?? SITE_URL
    const ogType = source.ogType ?? 'website'

    return {
      title,
      meta: [
        { name: 'description', content: description },
        // Open Graph
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:type', content: ogType },
        { property: 'og:url', content: canonical },
        { property: 'og:site_name', content: DEFAULTS.siteName },
        { property: 'og:locale', content: DEFAULTS.locale },
        ...(source.ogImage
          ? [{ property: 'og:image', content: source.ogImage }]
          : []),
        // Twitter Card
        { name: 'twitter:card', content: 'summary' },
        { name: 'twitter:title', content: title },
        { name: 'twitter:description', content: description },
        // Robots
        ...(source.noIndex ? [{ name: 'robots', content: 'noindex' }] : []),
      ],
      link: [{ rel: 'canonical', href: canonical }],
    }
  })
}

/**
 * Build a canonical URL for a given path.
 */
export function canonicalUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path

  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${SITE_URL}${normalized}`
}

export function buildPageMetaFromRouteMeta(
  meta: Record<string, unknown>,
  path = '/'
): NormalizedPageMeta {
  return {
    title: (meta.title as string) || DEFAULTS.title,
    description: (meta.description as string) || DEFAULTS.description,
    canonical: (meta.canonical as string) || canonicalUrl(path),
    ogImage: meta.ogImage as string | undefined,
    ogType: (meta.ogType as string) || 'website',
    noIndex: Boolean(meta.noIndex),
  }
}

function upsertMeta(selector: string, attributes: Record<string, string>) {
  const current = document.head.querySelector<HTMLMetaElement>(selector)
  const element = current ?? document.createElement('meta')

  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value)
  }

  if (!current) document.head.appendChild(element)
}

function upsertCanonical(href: string) {
  upsertLink('link[rel="canonical"]', {
    rel: 'canonical',
    href,
  })
}

function upsertLink(selector: string, attributes: Record<string, string>) {
  const current = document.head.querySelector<HTMLLinkElement>(selector)
  const element = current ?? document.createElement('link')

  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value)
  }

  if (!current) document.head.appendChild(element)
}

function upsertResourceHint(rel: 'preconnect' | 'dns-prefetch', href: string) {
  const current = Array.from(
    document.head.querySelectorAll<HTMLLinkElement>(`link[rel="${rel}"]`)
  ).find((element) => element.href === href)
  const element = current ?? document.createElement('link')

  element.setAttribute('rel', rel)
  element.setAttribute('href', href)
  if (rel === 'preconnect') {
    element.setAttribute('crossorigin', '')
  }

  if (!current) document.head.appendChild(element)
}

function removeMeta(selector: string) {
  document.head.querySelector<HTMLMetaElement>(selector)?.remove()
}

/**
 * Synchronise document head from Vue Router metadata.
 *
 * This is safe to call from router guards. Component code should still prefer
 * `usePageMeta`, which integrates with Unhead's reactive lifecycle.
 */
export function syncDocumentHeadFromRouteMeta(
  meta: Record<string, unknown>,
  path = window.location.pathname
) {
  const pageMeta = buildPageMetaFromRouteMeta(meta, path)

  document.title = pageMeta.title

  upsertMeta('meta[name="description"]', {
    name: 'description',
    content: pageMeta.description,
  })
  upsertMeta('meta[property="og:title"]', {
    property: 'og:title',
    content: pageMeta.title,
  })
  upsertMeta('meta[property="og:description"]', {
    property: 'og:description',
    content: pageMeta.description,
  })
  upsertMeta('meta[property="og:type"]', {
    property: 'og:type',
    content: pageMeta.ogType,
  })
  upsertMeta('meta[property="og:url"]', {
    property: 'og:url',
    content: pageMeta.canonical,
  })
  upsertMeta('meta[property="og:site_name"]', {
    property: 'og:site_name',
    content: DEFAULTS.siteName,
  })
  upsertMeta('meta[property="og:locale"]', {
    property: 'og:locale',
    content: DEFAULTS.locale,
  })
  upsertMeta('meta[name="twitter:card"]', {
    name: 'twitter:card',
    content: 'summary',
  })
  upsertMeta('meta[name="twitter:title"]', {
    name: 'twitter:title',
    content: pageMeta.title,
  })
  upsertMeta('meta[name="twitter:description"]', {
    name: 'twitter:description',
    content: pageMeta.description,
  })
  upsertCanonical(pageMeta.canonical)

  if (pageMeta.ogImage) {
    upsertMeta('meta[property="og:image"]', {
      property: 'og:image',
      content: pageMeta.ogImage,
    })
    upsertMeta('meta[name="twitter:image"]', {
      name: 'twitter:image',
      content: pageMeta.ogImage,
    })
  } else {
    removeMeta('meta[property="og:image"]')
    removeMeta('meta[name="twitter:image"]')
  }

  const robots = document.head.querySelector<HTMLMetaElement>(
    'meta[name="robots"]'
  )

  if (pageMeta.noIndex) {
    upsertMeta('meta[name="robots"]', {
      name: 'robots',
      content: 'noindex',
    })
  } else if (robots) {
    robots.remove()
  }
}

export function syncHeadFromRouteMeta(
  meta: Record<string, unknown>,
  path = window.location.pathname
) {
  syncDocumentHeadFromRouteMeta(meta, path)
}

function toOrigin(url: string): string | null {
  if (!url) return null

  try {
    return new URL(url, SITE_URL).origin
  } catch {
    return null
  }
}

/**
 * Install stable site-wide resource hints.
 *
 * These hints are intentionally conservative and derived from public runtime
 * config only. They do not expose secrets and do not force-load heavy assets.
 */
export function installSeoResourceHints() {
  const origins = new Set([toOrigin(SITE_URL), toOrigin(API_BASE_URL)])

  for (const origin of origins) {
    if (!origin || origin === window.location.origin) continue

    upsertResourceHint('preconnect', origin)
    upsertResourceHint('dns-prefetch', origin)
  }
}

// ---- Structured data ----

export interface WebsiteJsonLdInput {
  name?: string
  url?: string
  description?: string
  inLanguage?: string
}

export interface BlogPostingJsonLdInput {
  title: string
  canonicalUrl: string
  description?: string
  author?: string | null
  datePublished?: string | null
  dateModified?: string | null
  image?: string | null
  wordCount?: number | null
}

export function useJsonLd(input: JsonLdInputSource, key = 'structured-data') {
  useHead(() => {
    const json = toValue(input)

    return {
      script: json
        ? [
            {
              key,
              type: 'application/ld+json',
              textContent: JSON.stringify(json),
            },
          ]
        : [],
    }
  })
}

export function buildWebsiteJsonLd(
  input: WebsiteJsonLdInput = {}
): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: input.name ?? DEFAULTS.siteName,
    url: input.url ?? SITE_URL,
    description: input.description ?? DEFAULTS.description,
    inLanguage: input.inLanguage ?? 'zh-CN',
  }
}

export function buildBlogPostingJsonLd(
  input: BlogPostingJsonLdInput
): JsonLdObject {
  const json: JsonLdObject = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: input.title,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': input.canonicalUrl,
    },
    publisher: {
      '@type': 'Organization',
      name: DEFAULTS.siteName,
      url: SITE_URL,
    },
  }

  if (input.description) json.description = input.description
  if (input.datePublished) json.datePublished = input.datePublished
  if (input.dateModified) json.dateModified = input.dateModified
  if (input.image) json.image = input.image
  if (input.wordCount) json.wordCount = input.wordCount

  if (input.author) {
    json.author = {
      '@type': 'Person',
      name: input.author,
    }
  }

  return json
}
