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
  '.view-config',
  '.view-config__button',
  '.z-blog-card',
  '.loader-btn',
  '.empty-state',
  '.back-to-top',
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

  it('does not let a descendant button selector override view controls', () => {
    expect(homeStyles).not.toMatch(/\.view-config\s+button/)
    expect(blogStyles).toContain('.view-config__button')
  })

  it('keeps canonical toolbar controls full width without legacy selectors', () => {
    expect(blogStyles).toMatch(
      /\.blog-toolbar \[data-slot='select-trigger'\][^{]*\{[^}]*width:\s*100%/
    )
    expect(blogStyles).toMatch(
      /@media \(max-width: 695px\)[\s\S]*?\.blog-toolbar > \[data-slot='button'\][^{]*\{[^}]*width:\s*100%/
    )
    expect(blogStyles).not.toContain('.blog-toolbar .sun-select')
    expect(blogStyles).not.toContain('.blog-toolbar .sun-button')
  })
})
