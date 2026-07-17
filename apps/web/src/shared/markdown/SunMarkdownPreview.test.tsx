import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'

import { SunMarkdownPreview } from './SunMarkdownPreview'

describe('SunMarkdownPreview', () => {
  it('does not execute raw html and reports the rendered catalog', () => {
    const onCatalog = vi.fn()
    render(
      <SunMarkdownPreview
        content={'<script>alert(1)</script>\n# Safe'}
        onCatalog={onCatalog}
      />
    )
    expect(document.querySelector('script')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Safe' })).toHaveAttribute(
      'id',
      'safe-1'
    )
    expect(onCatalog).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'safe-1', text: 'Safe' }),
    ])
  })
})
