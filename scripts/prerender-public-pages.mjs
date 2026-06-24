#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import {
  buildApiUrl,
  extractApiData,
  renderArticlePageHtml,
  renderHomePageHtml,
  renderSitemapXml,
  routeToSsgOutputPath,
  safeArticleId,
  toSitemapEntries,
} from './web-ssg-utils.mjs'

const repoRoot = resolve(import.meta.dirname, '..')
const distDir = join(repoRoot, 'apps/web/dist')
const distIndexPath = join(distDir, 'index.html')
const apiBaseUrl =
  process.env.SUN_WORLD_SSG_API_BASE_URL ||
  process.env.VITE_BASE_URL ||
  'https://api.sunworld.site'

async function main() {
  const indexHtml = await readFile(distIndexPath, 'utf8')
  const articles = await loadPublicArticles().catch((error) => {
    console.warn(
      `[ssg] Public article prerender skipped: ${formatError(error)}`
    )
    return []
  })

  await writeHomepage(indexHtml)
  await writeArticlePages(indexHtml, articles)
  await writeSitemap(articles)

  console.log(
    `[ssg] Generated public pages: home, /home, ${articles.length} article page(s), sitemap.xml`
  )
}

async function writeHomepage(indexHtml) {
  const homeHtml = renderHomePageHtml(indexHtml)
  await writeFile(distIndexPath, homeHtml)
  await writeNestedFile(join(distDir, routeToSsgOutputPath('/home')), homeHtml)
}

async function writeArticlePages(indexHtml, articles) {
  for (const article of articles) {
    const id = safeArticleId(article)
    if (!id) continue

    const html = renderArticlePageHtml(indexHtml, article)
    await writeNestedFile(
      join(distDir, routeToSsgOutputPath(`/blog/${id}`)),
      html
    )
  }
}

async function writeSitemap(articles) {
  const sitemap = renderSitemapXml(toSitemapEntries(articles))
  await writeFile(join(distDir, 'sitemap.xml'), sitemap)
}

async function loadPublicArticles() {
  const listUrl = buildApiUrl(apiBaseUrl, '/blogs/', {
    page: 1,
    pageSize: process.env.SUN_WORLD_SSG_PAGE_SIZE || 200,
    sortBy: 'updated_at',
    sortOrder: 'desc',
  })
  const listPayload = extractApiData(await fetchJson(listUrl))
  const list = Array.isArray(listPayload) ? listPayload : listPayload?.list
  if (!Array.isArray(list)) return []

  const detailResults = await Promise.allSettled(
    list.map(async (item) => {
      const id = safeArticleId(item)
      if (!id) return null

      const detailUrl = buildApiUrl(
        apiBaseUrl,
        `/blogs/${encodeURIComponent(id)}`
      )
      const detail = extractApiData(await fetchJson(detailUrl))
      return {
        ...item,
        ...detail,
        id,
      }
    })
  )

  return detailResults
    .map((result, index) => {
      if (result.status === 'fulfilled') return result.value

      const fallback = list[index]
      const id = safeArticleId(fallback)
      console.warn(
        `[ssg] Skipping article detail ${id || index}: ${formatError(result.reason)}`
      )
      return id ? fallback : null
    })
    .filter(Boolean)
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
    },
    signal: AbortSignal.timeout(15000),
  })

  if (!response.ok) {
    throw new Error(
      `GET ${url.pathname}${url.search} returned ${response.status}`
    )
  }

  return response.json()
}

async function writeNestedFile(path, contents) {
  await mkdir(resolve(path, '..'), { recursive: true })
  await writeFile(path, contents)
}

function formatError(error) {
  if (error instanceof Error) return error.message
  return String(error)
}

main().catch((error) => {
  console.error(`[ssg] Failed to generate public pages: ${formatError(error)}`)
  process.exit(1)
})
