import { renderHook } from '@testing-library/react'

import { syncDocumentHeadFromRouteMeta, useJsonLd, usePageMeta } from './index'

describe('SEO writers', () => {
  it('writes route metadata without a framework head manager', () => {
    syncDocumentHeadFromRouteMeta(
      { title: 'Article', noIndex: true },
      '/blog/1'
    )

    expect(document.title).toBe('Article')
    expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://sunworld.site/blog/1'
    )
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex'
    )
  })

  it('cleans up component metadata and JSON-LD on unmount', () => {
    const page = renderHook(() => usePageMeta({ title: 'Hook page' }))
    const json = renderHook(() =>
      useJsonLd({ '@type': 'WebSite' }, 'test-json')
    )

    expect(document.title).toBe('Hook page')
    expect(
      document.querySelector('script[data-json-ld="test-json"]')
    ).toBeTruthy()

    json.unmount()
    page.unmount()
    expect(
      document.querySelector('script[data-json-ld="test-json"]')
    ).toBeNull()
  })
})
