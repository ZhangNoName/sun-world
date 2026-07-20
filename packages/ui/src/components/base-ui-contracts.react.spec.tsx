import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { Button } from '@sun-world/ui/button'
import { Badge } from '@sun-world/ui/badge'
import { Checkbox } from '@sun-world/ui/checkbox'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '@sun-world/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@sun-world/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sun-world/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@sun-world/ui/tabs'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sun-world/ui/tooltip'
import { Label } from '@sun-world/ui/label'
import { Separator } from '@sun-world/ui/separator'

describe('Base UI migration contracts', () => {
  it('renders Button and Badge child links through their compatibility prop', () => {
    const buttonRef = createRef<HTMLAnchorElement>()
    const badgeRef = createRef<HTMLAnchorElement>()
    render(
      <>
        <Button asChild ref={buttonRef}>
          <a href="/publish">Publish</a>
        </Button>
        <Badge asChild ref={badgeRef}>
          <a href="/preview">Preview</a>
        </Badge>
      </>
    )

    const buttonLink = screen.getByRole('link', { name: 'Publish' })
    const badgeLink = screen.getByRole('link', { name: 'Preview' })
    expect(buttonLink).toHaveAttribute('data-slot', 'button')
    expect(badgeLink).toHaveAttribute('data-slot', 'badge')
    expect(buttonRef.current).toBe(buttonLink)
    expect(badgeRef.current).toBe(badgeLink)
  })

  it('preserves the controlled Select value contract', async () => {
    const onValueChange = vi.fn()
    render(
      <Select value="newest" onValueChange={onValueChange}>
        <SelectTrigger aria-label="Sort">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="oldest">Oldest</SelectItem>
        </SelectContent>
      </Select>
    )

    await userEvent.click(screen.getByRole('combobox', { name: 'Sort' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Oldest' }))

    expect(onValueChange).toHaveBeenCalledWith('oldest')
  })

  it('reports Checkbox state as a boolean', async () => {
    const onCheckedChange = vi.fn()
    render(
      <Checkbox
        aria-label="Publish article"
        defaultChecked={false}
        onCheckedChange={onCheckedChange}
      />
    )

    const checkbox = screen.getByRole('checkbox', { name: 'Publish article' })
    checkbox.focus()
    await userEvent.keyboard(' ')

    expect(onCheckedChange).toHaveBeenCalledWith(true)
    expect(checkbox).toHaveAttribute('data-checked', '')
  })

  it('focuses the input associated with Label', async () => {
    render(
      <>
        <Label htmlFor="article-title">Article title</Label>
        <input id="article-title" />
      </>
    )

    const input = screen.getByRole('textbox', { name: 'Article title' })
    await userEvent.click(screen.getByText('Article title'))

    expect(input).toHaveFocus()
  })

  it('keeps decorative Separator hidden from assistive technology by default', () => {
    const { container } = render(<Separator orientation="vertical" />)

    expect(screen.queryByRole('separator')).not.toBeInTheDocument()
    expect(container.firstChild).toHaveAttribute('role', 'none')
    expect(container.firstChild).not.toHaveAttribute('aria-orientation')
  })

  it('exposes non-decorative Separator orientation to assistive technology', () => {
    render(<Separator decorative={false} orientation="vertical" />)

    const separator = screen.getByRole('separator')
    expect(separator).toHaveAttribute('aria-orientation', 'vertical')
    expect(separator).toHaveAttribute('data-orientation', 'vertical')
  })

  it('supports controlled Select keyboard selection', async () => {
    const onValueChange = vi.fn()
    render(
      <Select value="newest" onValueChange={onValueChange}>
        <SelectTrigger aria-label="Sort by keyboard">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="archived" disabled>
            Archived
          </SelectItem>
          <SelectItem value="oldest">Oldest</SelectItem>
        </SelectContent>
      </Select>
    )

    screen.getByRole('combobox', { name: 'Sort by keyboard' }).focus()
    await userEvent.keyboard('{Enter}')
    expect(screen.getByRole('option', { name: 'Archived' })).toHaveAttribute(
      'aria-disabled',
      'true'
    )
    await userEvent.keyboard('{ArrowDown}{Enter}')

    expect(onValueChange).toHaveBeenCalledWith('oldest')
  })

  it('reports Dialog close requests from its portal', async () => {
    const onOpenChange = vi.fn()
    render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogTitle>Delete article</DialogTitle>
          <DialogClose>Cancel</DialogClose>
        </DialogContent>
      </Dialog>
    )

    const dialog = screen.getByRole('dialog', { name: 'Delete article' })
    expect(dialog.closest('[data-base-ui-portal]')?.parentElement).toBe(
      document.body
    )

    await userEvent.keyboard('{Escape}')

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('keeps force-mounted Dialog content in its portal while closed', () => {
    render(
      <Dialog>
        <DialogContent forceMount>
          <DialogTitle>Persistent dialog</DialogTitle>
        </DialogContent>
      </Dialog>
    )

    const content = document.querySelector('[data-slot="dialog-content"]')
    expect(content).toBeInTheDocument()
    expect(content?.closest('[data-base-ui-portal]')?.parentElement).toBe(
      document.body
    )
  })

  it('dismisses Dialog on an outside press', async () => {
    render(
      <>
        <button type="button">Outside action</button>
        <Dialog modal={false}>
          <DialogTrigger asChild>
            <Button>Open editor</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>Edit article</DialogTitle>
          </DialogContent>
        </Dialog>
      </>
    )

    const trigger = screen.getByRole('button', { name: 'Open editor' })
    await userEvent.click(trigger)
    expect(screen.getByRole('dialog', { name: 'Edit article' })).toBeVisible()

    const outsideAction = screen.getByRole('button', {
      name: 'Outside action',
    })
    fireEvent.pointerDown(outsideAction, { pointerType: 'mouse' })
    fireEvent.click(outsideAction)

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('preserves the Dropdown Menu selection event payload', async () => {
    const onSelect = vi.fn((event: Event) => event.preventDefault())
    render(
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button>Actions</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={onSelect}>Archive</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )

    await userEvent.click(screen.getByRole('button', { name: 'Actions' }))
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Archive' })
    )

    expect(onSelect).toHaveBeenCalledWith(expect.any(Event))
    expect(onSelect.mock.calls[0]?.[0]?.defaultPrevented).toBe(true)
    expect(
      screen.getByRole('menuitem', { name: 'Archive' })
    ).toBeInTheDocument()
  })

  it('skips disabled Dropdown Menu items and reports checked item state', async () => {
    const onDisabledSelect = vi.fn()
    const onCheckedChange = vi.fn()
    render(
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button>View options</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem disabled onSelect={onDisabledSelect}>
            Hidden action
          </DropdownMenuItem>
          <DropdownMenuCheckboxItem checked onCheckedChange={onCheckedChange}>
            Show summaries
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )

    await userEvent.click(screen.getByRole('button', { name: 'View options' }))
    const disabledItem = await screen.findByRole('menuitem', {
      name: 'Hidden action',
    })
    const checkedItem = screen.getByRole('menuitemcheckbox', {
      name: 'Show summaries',
    })

    expect(disabledItem).toHaveAttribute('aria-disabled', 'true')
    expect(checkedItem).toHaveAttribute('aria-checked', 'true')
    expect(checkedItem).toHaveAttribute('data-checked', '')
    await userEvent.click(disabledItem)
    expect(onDisabledSelect).not.toHaveBeenCalled()

    await userEvent.click(checkedItem)
    expect(onCheckedChange).toHaveBeenCalledWith(false)
  })

  it('preserves controlled Tabs value changes', async () => {
    const onValueChange = vi.fn<(value: string) => void>()
    function ControlledTabs() {
      const [value, setValue] = useState('overview')
      return (
        <Tabs
          value={value}
          onValueChange={(nextValue) => {
            onValueChange(nextValue)
            setValue(nextValue)
          }}
        >
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">Overview panel</TabsContent>
          <TabsContent value="activity">Activity panel</TabsContent>
        </Tabs>
      )
    }
    render(<ControlledTabs />)

    await userEvent.click(screen.getByRole('tab', { name: 'Activity' }))

    expect(onValueChange).toHaveBeenCalledWith('activity')
    expect(screen.getByRole('tab', { name: 'Activity' })).toHaveAttribute(
      'data-active',
      ''
    )
    expect(screen.getByText('Activity panel')).toBeVisible()
  })

  it('exposes Tooltip content to assistive technology', async () => {
    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button>Help</Button>
          </TooltipTrigger>
          <TooltipContent>Keyboard shortcuts</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )

    await userEvent.hover(screen.getByRole('button', { name: 'Help' }))

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Keyboard shortcuts'
    )
  })

  it('composes Tooltip provider delay with a trigger and popup', async () => {
    render(
      <TooltipProvider delayDuration={50}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button>Formatting help</Button>
          </TooltipTrigger>
          <TooltipContent>Markdown shortcuts</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )

    await userEvent.hover(
      screen.getByRole('button', { name: 'Formatting help' })
    )
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveTextContent('Markdown shortcuts')
    expect(tooltip).toHaveAttribute('data-open', '')
  })

  it('forwards Button refs while preserving disabled interaction', async () => {
    const ref = createRef<HTMLButtonElement>()
    const onClick = vi.fn()
    render(
      <Button ref={ref} disabled onClick={onClick}>
        Publish
      </Button>
    )

    const button = screen.getByRole('button', { name: 'Publish' })
    await userEvent.click(button)

    expect(ref.current).toBe(button)
    expect(onClick).not.toHaveBeenCalled()
  })
})
