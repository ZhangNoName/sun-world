import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const layoutStyles = readFileSync(
  resolve(process.cwd(), 'src/layout/layout.css'),
  'utf8'
)
const blogStyles = readFileSync(
  resolve(process.cwd(), 'src/modules/blog/styles/blog-experience.css'),
  'utf8'
)

describe('mobile layout style contract', () => {
  it('keeps the shared app container as the only ordinary page scroll root', () => {
    expect(layoutStyles).toMatch(/\.app-container\s*\{[^}]*overflow:\s*auto/)
    expect(layoutStyles).toMatch(
      /\.main-container\s*\{[^}]*overflow:\s*visible/
    )
  })

  it('keeps mobile chrome available with safe-area spacing', () => {
    expect(layoutStyles).toMatch(
      /\.mob-header\s*\{[^}]*position:\s*sticky[^}]*top:\s*0/
    )
    expect(layoutStyles).toMatch(
      /\.mob-footer\s*\{[^}]*position:\s*sticky[^}]*bottom:\s*0/
    )
    expect(layoutStyles).toContain('env(safe-area-inset-top)')
    expect(layoutStyles).toContain('env(safe-area-inset-bottom)')
  })

  it('anchors the mobile drawer to the full left viewport edge', () => {
    expect(layoutStyles).toMatch(
      /\[data-slot='dialog-content'\]\.mob-drawer\s*\{[^}]*inset:\s*0 auto auto 0[^}]*height:\s*100dvh[^}]*transform:\s*none[^}]*translate:\s*none/
    )
  })

  it('reserves a global back-to-top offset above mobile navigation', () => {
    expect(layoutStyles).toContain('.shell-back-to-top')
    expect(layoutStyles).toContain('--shell-back-to-top-bottom')
  })

  it('collapses the article authoring form to one column on phones', () => {
    expect(blogStyles).toContain('.article-page')
    expect(blogStyles).toMatch(
      /@media \(max-width: 695px\)[\s\S]*?\.title-container\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/
    )
  })
})
