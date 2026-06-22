import { describe, expect, it } from 'vitest'

import { getUiIcon, uiIconNames, uiIcons } from './ui'

describe('ui icon data', () => {
  it('stores framework-neutral Lucide-style nodes', () => {
    const search = getUiIcon('search')

    expect(search).toMatchObject({
      name: 'search',
      viewBox: '0 0 24 24',
    })
    expect(search.nodes).toEqual([
      ['circle', { cx: 11, cy: 11, r: 8 }],
      ['path', { d: 'm21 21-4.3-4.3' }],
    ])
  })

  it('exposes a stable list of supported icon names', () => {
    expect(uiIconNames).toContain('panel-left-open')
    expect(Object.keys(uiIcons)).toEqual([...uiIconNames])
  })
})
