import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { SunButton } from './button'
import { SunCheckbox } from './checkbox'
import { SunDialog } from './dialog'
import { SunDropdownMenu } from './dropdown-menu'
import { SunInput } from './input'
import { SunLoadingSkeleton } from './loading-skeleton'
import { SunSelect } from './select'
import { SunTabs } from './tabs'
import { SunTag } from './tag'
import { SunTooltip } from './tooltip'
import { SunTextarea } from './textarea'
import { SunChatComposer } from '../patterns/chat-composer'
import { SunDatePicker } from '../patterns/date-picker'
import { SunList } from '../patterns/list'
import { SunPagination } from '../patterns/pagination'
import { SunThemeProvider } from '../patterns/theme-provider'

describe('@sun-world/ui React contracts', () => {
  it('renders and invokes an enabled button', async () => {
    const onClick = vi.fn()
    render(<SunButton onClick={onClick}>Save</SunButton>)
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('blocks disabled button interaction and exposes its label', async () => {
    const onClick = vi.fn()
    render(
      <SunButton disabled label="Primary action" onClick={onClick}>
        Save
      </SunButton>
    )
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onClick).not.toHaveBeenCalled()
    expect(screen.getByText('Primary action')).toBeVisible()
  })

  it('associates input labels and reports controlled changes', async () => {
    const onValueChange = vi.fn()
    render(<SunInput label="Title" value="" onValueChange={onValueChange} />)
    await userEvent.type(screen.getByLabelText('Title'), 'Sun')
    expect(onValueChange).toHaveBeenCalled()
  })

  it('submits trimmed chat text with Enter and preserves Shift+Enter', async () => {
    const onSubmit = vi.fn()
    const onValueChange = vi.fn()
    const { rerender } = render(
      <SunChatComposer
        value=" Hello Sun "
        onValueChange={onValueChange}
        onSubmit={onSubmit}
      />
    )
    const textarea = screen.getByRole('textbox')
    await userEvent.type(textarea, '{shift>}{enter}{/shift}')
    expect(onSubmit).not.toHaveBeenCalled()
    rerender(
      <SunChatComposer
        value=" Hello Sun "
        onValueChange={onValueChange}
        onSubmit={onSubmit}
      />
    )
    await userEvent.type(textarea, '{enter}')
    expect(onSubmit).toHaveBeenCalledWith('Hello Sun')
  })

  it('opens a dialog with keyboard semantics and restores focus', async () => {
    render(
      <SunDialog trigger="Open settings" title="Settings">
        Dialog content
      </SunDialog>
    )
    const trigger = screen.getByRole('button', { name: 'Open settings' })
    trigger.focus()
    await userEvent.click(trigger)
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeVisible()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('supports controlled state and custom surface classes', async () => {
    function ControlledDialog() {
      const [open, setOpen] = useState(false)
      return (
        <SunDialog
          trigger={<button type="button">Open navigation</button>}
          title="Navigation"
          open={open}
          onOpenChange={setOpen}
          overlayClassName="drawer-overlay"
          contentClassName="mob-drawer"
        >
          Navigation content
        </SunDialog>
      )
    }
    render(<ControlledDialog />)
    await userEvent.click(
      screen.getByRole('button', { name: 'Open navigation' })
    )
    expect(screen.getByRole('dialog', { name: 'Navigation' })).toHaveClass(
      'mob-drawer'
    )
    expect(document.querySelector('.drawer-overlay')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('selects an option using the keyboard', async () => {
    const onValueChange = vi.fn()
    render(
      <SunSelect
        label="Category"
        value=""
        options={[
          { value: 'tech', label: 'Tech' },
          { value: 'life', label: 'Life' },
        ]}
        onValueChange={onValueChange}
      />
    )
    const trigger = screen.getByRole('combobox', { name: 'Category' })
    trigger.focus()
    await userEvent.keyboard('{Enter}{ArrowDown}{Enter}')
    expect(onValueChange).toHaveBeenCalled()
  })

  it('changes checkbox and tabs through accessible controls', async () => {
    const onCheckedChange = vi.fn()
    const onValueChange = vi.fn()
    render(
      <>
        <SunCheckbox label="Publish" onCheckedChange={onCheckedChange} />
        <SunTabs
          value="one"
          onValueChange={onValueChange}
          items={[
            { value: 'one', label: 'One', content: 'First panel' },
            { value: 'two', label: 'Two', content: 'Second panel' },
          ]}
        />
      </>
    )
    await userEvent.click(screen.getByRole('checkbox', { name: 'Publish' }))
    await userEvent.click(screen.getByRole('tab', { name: 'Two' }))
    expect(onCheckedChange).toHaveBeenCalledWith(true)
    expect(onValueChange).toHaveBeenCalledWith('two')
  })

  it('supports textarea, dropdown and tooltip interaction', async () => {
    const onValueChange = vi.fn()
    const onSelect = vi.fn()
    render(
      <>
        <SunTextarea label="Summary" value="" onValueChange={onValueChange} />
        <SunDropdownMenu
          trigger="Actions"
          items={[{ label: 'Delete', value: 'delete' }]}
          onSelect={onSelect}
        />
        <SunTooltip content="Helpful hint">
          <button type="button">Help</button>
        </SunTooltip>
      </>
    )
    await userEvent.type(screen.getByLabelText('Summary'), 'Hello')
    await userEvent.click(screen.getByRole('button', { name: 'Actions' }))
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Delete' })
    )
    await userEvent.hover(screen.getByRole('button', { name: 'Help' }))
    expect(onValueChange).toHaveBeenCalled()
    expect(onSelect).toHaveBeenCalledWith('delete')
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Helpful hint')
  })

  it('renders date, list, pagination, tag, skeleton and theme protocols', async () => {
    const onDateChange = vi.fn()
    const onSelect = vi.fn()
    const onPageChange = vi.fn()
    render(
      <SunThemeProvider theme={{ primaryColor: '#14b8a6', radius: '12px' }}>
        <SunDatePicker label="Publish date" onValueChange={onDateChange} />
        <SunList
          label="Articles"
          items={[{ id: 1, title: 'First' }]}
          columns={[{ key: 'title', label: 'Title' }]}
          onSelect={onSelect}
        />
        <SunPagination
          page={1}
          pageSize={10}
          total={30}
          onPageChange={onPageChange}
        />
        <SunTag label="React" />
        <SunLoadingSkeleton lines={2} />
      </SunThemeProvider>
    )
    await userEvent.type(screen.getByLabelText('Publish date'), '2026-07-17')
    await userEvent.click(screen.getByRole('button', { name: /First/ }))
    await userEvent.click(screen.getByRole('button', { name: '2' }))
    expect(onDateChange).toHaveBeenCalledWith('2026-07-17')
    expect(onSelect).toHaveBeenCalledWith({ id: 1, title: 'First' })
    expect(onPageChange).toHaveBeenCalledWith(2)
    expect(screen.getByText('React')).toBeVisible()
    expect(screen.getAllByTestId('sun-skeleton-line')).toHaveLength(4)
    expect(screen.getByTestId('sun-theme-provider')).toHaveStyle({
      '--sun-ui-color-primary': '#14b8a6',
      '--sun-ui-radius': '12px',
    })
  })
})
