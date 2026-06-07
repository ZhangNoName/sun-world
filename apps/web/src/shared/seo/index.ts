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
import { SITE_URL } from '@/shared/config'

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

/**
 * Set page-level head metadata.
 *
 * Call from any component or composable. Values not provided fall back
 * to site-wide defaults.
 */
export function usePageMeta(input: PageMetaInput = {}) {
  const title = input.title || DEFAULTS.title
  const description = input.description || DEFAULTS.description
  const canonical = input.canonical ?? SITE_URL
  const ogType = input.ogType ?? 'website'

  useHead({
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
      ...(input.ogImage
        ? [{ property: 'og:image', content: input.ogImage }]
        : []),
      // Twitter Card
      { name: 'twitter:card', content: 'summary' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
      // Robots
      ...(input.noIndex ? [{ name: 'robots', content: 'noindex' }] : []),
    ],
    link: [{ rel: 'canonical', href: canonical }],
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
  const selector = 'link[rel="canonical"]'
  const current = document.head.querySelector<HTMLLinkElement>(selector)
  const element = current ?? document.createElement('link')

  element.setAttribute('rel', 'canonical')
  element.setAttribute('href', href)

  if (!current) document.head.appendChild(element)
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
