import { useEffect } from 'react'

import { API_BASE_URL, SITE_URL } from '@/shared/config'

const DEFAULTS = {
  title: 'Sun World',
  description:
    '个人技术博客，记录前端、后端、React Native、Python、AIGC 与编辑器工程实践。',
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

type JsonLdObject = Record<string, unknown>

export function canonicalUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

export function buildPageMetaFromRouteMeta(
  meta: Record<string, unknown>,
  path = '/'
): NormalizedPageMeta {
  return {
    title: typeof meta.title === 'string' ? meta.title : DEFAULTS.title,
    description:
      typeof meta.description === 'string'
        ? meta.description
        : DEFAULTS.description,
    canonical:
      typeof meta.canonical === 'string' ? meta.canonical : canonicalUrl(path),
    ogImage: typeof meta.ogImage === 'string' ? meta.ogImage : undefined,
    ogType: typeof meta.ogType === 'string' ? meta.ogType : 'website',
    noIndex: Boolean(meta.noIndex),
  }
}

function upsertElement<K extends 'meta' | 'link'>(
  tag: K,
  selector: string,
  attributes: Record<string, string>
) {
  const current = document.head.querySelector<HTMLElement>(selector)
  const element = current ?? document.createElement(tag)
  Object.entries(attributes).forEach(([name, value]) =>
    element.setAttribute(name, value)
  )
  if (!current) document.head.appendChild(element)
}

export function syncDocumentHeadFromRouteMeta(
  meta: Record<string, unknown>,
  path = window.location.pathname
) {
  const page = buildPageMetaFromRouteMeta(meta, path)
  document.title = page.title

  const metaEntries: Array<[string, string, string]> = [
    ['name', 'description', page.description],
    ['property', 'og:title', page.title],
    ['property', 'og:description', page.description],
    ['property', 'og:type', page.ogType],
    ['property', 'og:url', page.canonical],
    ['property', 'og:site_name', DEFAULTS.siteName],
    ['property', 'og:locale', DEFAULTS.locale],
    ['name', 'twitter:card', 'summary'],
    ['name', 'twitter:title', page.title],
    ['name', 'twitter:description', page.description],
  ]
  for (const [attribute, name, content] of metaEntries) {
    upsertElement('meta', `meta[${attribute}="${name}"]`, {
      [attribute]: name,
      content,
    })
  }

  upsertElement('link', 'link[rel="canonical"]', {
    rel: 'canonical',
    href: page.canonical,
  })

  if (page.ogImage) {
    upsertElement('meta', 'meta[property="og:image"]', {
      property: 'og:image',
      content: page.ogImage,
    })
  } else {
    document.head.querySelector('meta[property="og:image"]')?.remove()
  }

  if (page.noIndex) {
    upsertElement('meta', 'meta[name="robots"]', {
      name: 'robots',
      content: 'noindex',
    })
  } else {
    document.head.querySelector('meta[name="robots"]')?.remove()
  }
}

export const syncHeadFromRouteMeta = syncDocumentHeadFromRouteMeta

export function usePageMeta(input: PageMetaInput | (() => PageMetaInput) = {}) {
  const value = typeof input === 'function' ? input() : input
  const signature = JSON.stringify(value)
  useEffect(() => {
    syncDocumentHeadFromRouteMeta({ ...value }, window.location.pathname)
  }, [signature])
}

export function useJsonLd(
  input:
    | JsonLdObject
    | null
    | undefined
    | (() => JsonLdObject | null | undefined),
  key = 'structured-data'
) {
  const value = typeof input === 'function' ? input() : input
  const signature = JSON.stringify(value)
  useEffect(() => {
    const selector = `script[data-json-ld="${CSS.escape(key)}"]`
    document.head.querySelector(selector)?.remove()
    if (!value) return

    const script = document.createElement('script')
    script.type = 'application/ld+json'
    script.dataset.jsonLd = key
    script.textContent = JSON.stringify(value)
    document.head.appendChild(script)
    return () => script.remove()
  }, [key, signature])
}

function toOrigin(url: string) {
  try {
    return new URL(url, SITE_URL).origin
  } catch {
    return null
  }
}

export function installSeoResourceHints() {
  for (const origin of new Set([toOrigin(SITE_URL), toOrigin(API_BASE_URL)])) {
    if (!origin || origin === window.location.origin) continue
    upsertElement('link', `link[rel="preconnect"][href="${origin}"]`, {
      rel: 'preconnect',
      href: origin,
      crossorigin: '',
    })
    upsertElement('link', `link[rel="dns-prefetch"][href="${origin}"]`, {
      rel: 'dns-prefetch',
      href: origin,
    })
  }
}

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
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: input.title,
    mainEntityOfPage: { '@type': 'WebPage', '@id': input.canonicalUrl },
    publisher: {
      '@type': 'Organization',
      name: DEFAULTS.siteName,
      url: SITE_URL,
    },
    ...(input.description ? { description: input.description } : {}),
    ...(input.author
      ? { author: { '@type': 'Person', name: input.author } }
      : {}),
    ...(input.datePublished ? { datePublished: input.datePublished } : {}),
    ...(input.dateModified ? { dateModified: input.dateModified } : {}),
    ...(input.image ? { image: input.image } : {}),
    ...(input.wordCount ? { wordCount: input.wordCount } : {}),
  }
}
