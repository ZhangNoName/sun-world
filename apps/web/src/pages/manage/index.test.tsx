import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { ManagePage } from './index'

vi.mock('./blog', () => ({ default: () => <div>博客管理内容</div> }))
vi.mock('./aigc', () => ({ default: () => <div>AIGC 配置内容</div> }))

describe('ManagePage', () => {
  it('switches management tabs without navigating away', () => {
    render(
      <MemoryRouter>
        <ManagePage />
      </MemoryRouter>
    )
    expect(screen.getByText('博客管理内容')).toBeVisible()
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'AIGC' }))
    fireEvent.click(screen.getByRole('tab', { name: 'AIGC' }))
    expect(screen.getByText('AIGC 配置内容')).toBeVisible()
  })
})
