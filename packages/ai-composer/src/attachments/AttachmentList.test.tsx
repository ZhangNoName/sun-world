import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'

import { AttachmentList } from './AttachmentList'

describe('AttachmentList', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:preview'),
      revokeObjectURL: vi.fn(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders image thumbnails and typed file icons without file sizes', () => {
    const photo = new File(['photo'], 'photo.png', { type: 'image/png' })
    const report = new File(['report'], 'report.pdf', { type: 'application/pdf' })

    const { unmount } = render(
      <AttachmentList files={[photo, report]} onRemove={vi.fn()} />
    )

    expect(screen.getByRole('img', { name: 'photo.png' })).toHaveAttribute(
      'src',
      'blob:preview'
    )
    expect(screen.getByTestId('attachment-icon-file-pdf')).toBeInTheDocument()
    expect(screen.queryByText(/KB|MB| B$/)).not.toBeInTheDocument()

    unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview')
  })
})
