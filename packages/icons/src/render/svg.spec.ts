import { describe, expect, it } from 'vitest'

import { renderIconToSvg } from './svg'

describe('renderIconToSvg', () => {
  it('renders a framework-neutral svg string using currentColor', () => {
    const svg = renderIconToSvg('plus', {
      className: 'sun-icon',
      size: 20,
      strokeWidth: 1.75,
    })

    expect(svg).toContain('<svg')
    expect(svg).toContain('class="sun-icon"')
    expect(svg).toContain('width="20"')
    expect(svg).toContain('height="20"')
    expect(svg).toContain('viewBox="0 0 24 24"')
    expect(svg).toContain('fill="none"')
    expect(svg).toContain('stroke="currentColor"')
    expect(svg).toContain('stroke-width="1.75"')
    expect(svg).toContain('<path d="M5 12h14"></path>')
  })
})
