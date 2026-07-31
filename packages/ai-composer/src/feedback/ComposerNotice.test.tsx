import { render, screen } from '@testing-library/react'

import { ComposerNotice } from './ComposerNotice'

describe('ComposerNotice', () => {
  it('renders an error alert with the error tone', () => {
    render(
      <ComposerNotice tone="error" role="alert">
        发送失败
      </ComposerNotice>
    )

    expect(screen.getByRole('alert')).toHaveTextContent('发送失败')
    expect(screen.getByRole('alert')).toHaveClass(
      'sw-ai-composer__notice',
      'sw-ai-composer__notice--error'
    )
  })

  it('renders warning status feedback', () => {
    render(
      <ComposerNotice tone="warning" role="status">
        文件未添加
      </ComposerNotice>
    )

    expect(screen.getByRole('status')).toHaveClass(
      'sw-ai-composer__notice--warning'
    )
  })
})
