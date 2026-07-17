import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { SunIcon, SunIconButton } from './index'

describe('@sun-world/icons React renderer', () => {
  it('renders named icon data with size and stroke attributes', () => {
    const { container } = render(
      <SunIcon name="search" size="lg" strokeWidth={1.5} title="Search" />
    )
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('width', '24')
    expect(svg).toHaveAttribute('stroke-width', '1.5')
    expect(screen.getByRole('img', { name: 'Search' })).toBeVisible()
  })

  it('renders unknown runtime names with a safe fallback', () => {
    const { container } = render(
      <SunIcon name={'not-real' as 'search'} decorative />
    )
    expect(container.querySelector('svg')).toHaveAttribute(
      'data-icon-name',
      'square'
    )
  })

  it('provides an accessible icon button', async () => {
    const onClick = vi.fn()
    render(<SunIconButton icon="plus" label="Add" onClick={onClick} />)
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(onClick).toHaveBeenCalledOnce()
  })
})
