import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const blogStyles = readFileSync(
  resolve(process.cwd(), 'src/modules/blog/styles/blog-experience.css'),
  'utf8'
)
const homeStyles = readFileSync(
  resolve(process.cwd(), 'src/modules/home/pages/home-react.css'),
  'utf8'
)

const BLOG_OWNED_SELECTORS = [
  '.blog-feed',
  '.blog-toolbar',
  '.summary-card',
  '.query-panel',
  '.blog-list',
  '.blog-meta',
  '.blog-tags',
  '.blog-toolbar__action',
  '.z-blog-card',
  '.blog-feed__load-sentinel',
  '.empty-state',
  '.waterfall-grid',
  '.waterfall-item',
]

describe('homepage style ownership', () => {
  it('keeps feed and article-card selectors in the blog stylesheet only', () => {
    for (const selector of BLOG_OWNED_SELECTORS) {
      expect(
        blogStyles,
        `${selector} must be owned by blog-experience.css`
      ).toContain(selector)
      expect(
        homeStyles,
        `${selector} must not be redefined by home-react.css`
      ).not.toContain(selector)
    }
  })

  it('leaves all shared application shell selectors to layout.css', () => {
    for (const selector of [
      '.app-container',
      '.desk-layout',
      '.z-header',
      '.mob-layout',
      '.mob-header',
      '.mob-footer',
      '.main-container',
      '.drawer-overlay',
      '.mob-drawer',
    ]) {
      expect(homeStyles, `${selector} belongs to layout.css`).not.toContain(
        selector
      )
    }
  })

  it('does not let a descendant button selector override toolbar controls', () => {
    expect(homeStyles).not.toMatch(/\.blog-toolbar\s+button/)
    expect(blogStyles).toContain('.blog-toolbar__action')
  })

  it('keeps compact toolbar controls responsive without legacy selectors', () => {
    expect(blogStyles).toMatch(
      /\.blog-toolbar__actions\s*\{[^}]*display:\s*flex/
    )
    expect(blogStyles).toMatch(
      /@media \(max-width: 695px\)[\s\S]*?\.blog-toolbar__action\s*\{[^}]*flex:\s*1\s+1\s+0/
    )
    expect(blogStyles).not.toContain('.blog-toolbar .sun-select')
    expect(blogStyles).not.toContain("[data-slot='select-trigger']")
  })

  it('uses a contained focus state for the animated search field', () => {
    expect(blogStyles).toContain(
      ".blog-toolbar__search [data-slot='input']:focus-visible"
    )
    expect(blogStyles).toMatch(
      /\.blog-toolbar__search \[data-slot='input'\]:focus-visible\s*\{[^}]*box-shadow:\s*none/
    )
  })

  it('keeps article cards stable and inexpensive while scrolling', () => {
    expect(blogStyles).not.toMatch(/\.z-blog-card:hover\s*\{[^}]*transform\s*:/)
    expect(blogStyles).not.toMatch(
      /[^{}]*\.z-blog-card[^{}]*\{[^}]*backdrop-filter\s*:/
    )
  })
})
