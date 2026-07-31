import { render, screen } from '@testing-library/react'

import { MarkdownPreview } from './MarkdownPreview'

describe('MarkdownPreview', () => {
  it('renders GFM tables and removes unsafe HTML', () => {
    const { container } = render(
      <MarkdownPreview
        markdown={'| Name | Value |\n| --- | --- |\n| Safe | Yes |\n\n<script>alert(1)</script>'}
      />
    )
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByText('Safe')).toBeInTheDocument()
    expect(container.querySelector('script')).not.toBeInTheDocument()
  })

  it('does not emit navigable unsafe links', () => {
    const { container } = render(
      <MarkdownPreview markdown="[unsafe](javascript:alert(1))" />
    )
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull()
  })
})
