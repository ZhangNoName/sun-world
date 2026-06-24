#!/usr/bin/env node
import assert from 'node:assert/strict'
import {
  buildArticleCanonicalPath,
  extractApiData,
  renderArticlePageHtml,
  renderSitemapXml,
} from './web-ssg-utils.mjs'

const baseIndexHtml = `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="description" content="old description" />
    <meta property="og:title" content="old title" />
    <meta property="og:description" content="old og description" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://sunworld.site/" />
    <link rel="canonical" href="https://sunworld.site/" />
    <title>Old title</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/assets/index.js"></script>
  </body>
</html>`

const article = {
  id: 42,
  title: 'Static <Article>',
  abstract: 'A useful "summary" for crawlers.',
  author: 'Sun & World',
  content: '# Heading\n\nBody with <script>alert(1)</script> and **markdown**.',
  created_at: '2026-06-20T10:00:00+08:00',
  updated_at: '2026-06-21T11:00:00+08:00',
  byte_num: 128,
  comment_num: 3,
}

assert.equal(buildArticleCanonicalPath(42), '/blog/42')
assert.equal(buildArticleCanonicalPath('abc'), '/blog/abc')

assert.deepEqual(extractApiData({ code: 1, data: { ok: true }, msg: 'ok' }), {
  ok: true,
})
assert.deepEqual(extractApiData({ code: '1', data: [1, 2] }), [1, 2])
assert.deepEqual(extractApiData([1, 2, 3]), [1, 2, 3])

const articleHtml = renderArticlePageHtml(baseIndexHtml, article)
assert.match(articleHtml, /<title>Static &lt;Article&gt; - Sun World<\/title>/)
assert.match(
  articleHtml,
  /<meta name="description" content="A useful &quot;summary&quot; for crawlers\." \/>/
)
assert.match(
  articleHtml,
  /<link rel="canonical" href="https:\/\/sunworld\.site\/blog\/42" \/>/
)
assert.match(articleHtml, /"@type":"BlogPosting"/)
assert.match(articleHtml, /<article class="ssg-article"/)
assert.match(articleHtml, /Static &lt;Article&gt;/)
assert.match(articleHtml, /Body with &lt;script&gt;alert\(1\)&lt;\/script&gt;/)
assert.doesNotMatch(articleHtml, /<script>alert\(1\)<\/script>/)

const sitemap = renderSitemapXml([
  { loc: 'https://sunworld.site/' },
  {
    loc: 'https://sunworld.site/blog/42',
    lastmod: '2026-06-21T11:00:00+08:00',
  },
])
assert.match(sitemap, /<loc>https:\/\/sunworld\.site\/<\/loc>/)
assert.match(sitemap, /<loc>https:\/\/sunworld\.site\/blog\/42<\/loc>/)
assert.match(sitemap, /<lastmod>2026-06-21<\/lastmod>/)
assert.doesNotMatch(sitemap, /\/manage/)
assert.doesNotMatch(sitemap, /\/new_article/)

console.log('Web SSG contract check passed.')
