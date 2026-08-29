#!/usr/bin/env node
import assert from 'node:assert/strict'
import {
  buildArticleCanonicalPath,
  extractApiData,
  renderArticlePageHtml,
  renderHomePageHtml,
  renderPrivacyPolicyPageHtml,
  renderSitemapXml,
  routeToSsgOutputPath,
  toSitemapEntries,
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
assert.equal(routeToSsgOutputPath('/home'), 'home.html')
assert.equal(routeToSsgOutputPath('/blog/42'), 'blog/42.html')
assert.equal(routeToSsgOutputPath('/privacy'), 'privacy.html')

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

const homeHtml = renderHomePageHtml(baseIndexHtml)
assert.match(homeHtml, /<a href="\/privacy">隐私政策<\/a>/)
assert.match(
  homeHtml,
  /Google 登录仅使用姓名、头像、已验证邮箱和账号标识来创建或登录 Sun World 账号，不用于广告或 AI 训练。/
)

const privacyHtml = renderPrivacyPolicyPageHtml(baseIndexHtml)
assert.match(privacyHtml, /<title>隐私政策 - Sun World<\/title>/)
assert.match(privacyHtml, /datetime="2026-08-30"/)
assert.match(
  privacyHtml,
  /<link rel="canonical" href="https:\/\/sunworld\.site\/privacy" \/>/
)
assert.match(privacyHtml, /姓名、邮箱地址、头像/)
assert.match(privacyHtml, /账号唯一标识符（sub）/)
assert.match(privacyHtml, /此前已连接该 Google 身份的 Sun World 账号/)
assert.match(privacyHtml, /OAuth 授权码、Google access token 和 ID token/)
assert.match(privacyHtml, /不将这些授权码或 token 写入数据库/)
assert.match(privacyHtml, /<h2>共享、转移与披露<\/h2>/)
assert.match(privacyHtml, /不会向其他第三方转移或披露这些资料/)
assert.match(privacyHtml, /<h2>保护措施<\/h2>/)
assert.match(privacyHtml, /HttpOnly 且 Secure 的会话 Cookie/)
assert.match(privacyHtml, /<h2>保留期限<\/h2>/)
assert.match(privacyHtml, /仅在对应身份关联或 Sun World 账号仍存在/)
assert.match(privacyHtml, /不会用于恢复已删除的登录资料/)
assert.match(
  privacyHtml,
  /https:\/\/github\.com\/ZhangNoName\/sun-world\/issues\/new/
)
assert.match(privacyHtml, /https:\/\/policies\.google\.com\/privacy/)

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

const publicSitemap = renderSitemapXml(toSitemapEntries([]))
assert.match(publicSitemap, /<loc>https:\/\/sunworld\.site\/privacy<\/loc>/)

console.log('Web SSG contract check passed.')
