import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { Badge } from '@sun-world/base-ui/badge'
import { Button } from '@sun-world/base-ui/button'
import { Checkbox } from '@sun-world/base-ui/checkbox'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
  DialogTitle,
} from '@sun-world/base-ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@sun-world/base-ui/dropdown-menu'
import { Label } from '@sun-world/base-ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sun-world/base-ui/select'
import { Separator } from '@sun-world/base-ui/separator'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@sun-world/base-ui/tabs'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sun-world/base-ui/tooltip'
import { SwSelect } from '@sun-world/ui/sw-select'
import { SelectField } from '../patterns/form-controls'

describe('Base UI migration contracts', () => {
  it('keeps the legacy Select adapter free of a separate visual language', () => {
    render(
      <SwSelect
        label="Legacy sort"
        options={[{ value: 'newest', label: 'Newest first' }]}
      />
    )

    const trigger = screen.getByRole('combobox', { name: 'Legacy sort' })
    expect(trigger).toHaveAttribute('data-slot', 'select-trigger')
    expect(trigger.className).not.toContain('sun-select')
  })

  it('anchors form Select popups to their trigger width', async () => {
    render(
      <SelectField
        label="Sort articles"
        options={[{ value: 'newest', label: 'Newest first' }]}
      />
    )

    const trigger = screen.getByRole('combobox', { name: 'Sort articles' })
    expect(trigger.className).toContain('w-full')
    await userEvent.click(trigger)

    expect(
      document.querySelector('[data-slot="select-content"]')?.className
    ).toContain('w-(--anchor-width)')
  })

  it('uses the Base Nova Select visual slots', async () => {
    render(
      <Select
        defaultValue="newest"
        items={[{ value: 'newest', label: 'Newest first' }]}
      >
        <SelectTrigger aria-label="Base Nova sort">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="newest">Newest first</SelectItem>
        </SelectContent>
      </Select>
    )

    const trigger = screen.getByRole('combobox', { name: 'Base Nova sort' })
    expect(trigger.className).toContain('rounded-lg')
    await userEvent.click(trigger)
    expect(
      (await screen.findByRole('listbox')).parentElement?.className
    ).toContain('w-(--anchor-width)')
    expect(screen.getByRole('option').className).toContain('rounded-md')
  })

  it('renders Button and Badge child links through the Base UI render prop', () => {
    const buttonRef = createRef<HTMLAnchorElement>()
    const badgeRef = createRef<HTMLAnchorElement>()
    render(
      <>
        <Button
          nativeButton={false}
          render={<a ref={buttonRef} href="/publish" />}
        >
          Publish
        </Button>
        <Badge render={<a ref={badgeRef} href="/preview" />}>Preview</Badge>
      </>
    )

    const buttonLink = screen.getByRole('button', { name: 'Publish' })
    const badgeLink = screen.getByRole('link', { name: 'Preview' })
    expect(buttonLink).toHaveAttribute('data-slot', 'button')
    expect(badgeLink).toHaveAttribute('data-slot', 'badge')
    expect(buttonRef.current).toBe(buttonLink)
    expect(badgeRef.current).toBe(badgeLink)
  })

  it('preserves the controlled Select value and event details', async () => {
    const onValueChange = vi.fn()
    render(
      <Select
        value="newest"
        items={[
          { value: 'archived', label: 'Archived' },
          { value: 'oldest', label: 'Oldest' },
        ]}
        onValueChange={onValueChange}
      >
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

    expect(onValueChange).toHaveBeenCalledWith(
      'oldest',
      expect.objectContaining({ reason: 'item-press' })
    )
  })

  it('reports Checkbox state with Base UI event details', async () => {
    const onCheckedChange = vi.fn()
    render(
      <Checkbox
        aria-label="Publish article"
        defaultChecked={false}
        onCheckedChange={onCheckedChange}
      />
    )

    const checkbox = screen.getByRole('checkbox', { name: 'Publish article' })
    await userEvent.click(checkbox)

    expect(onCheckedChange).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ reason: 'none' })
    )
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

  it('exposes Separator orientation to assistive technology', () => {
    render(<Separator orientation="vertical" />)

    const separator = screen.getByRole('separator')
    expect(separator).toHaveAttribute('aria-orientation', 'vertical')
    expect(separator).toHaveAttribute('data-orientation', 'vertical')
  })

  it('supports controlled Select keyboard access', async () => {
    const onValueChange = vi.fn()
    render(
      <Select
        value="newest"
        items={[
          { value: 'archived', label: 'Archived' },
          { value: 'oldest', label: 'Oldest' },
        ]}
        onValueChange={onValueChange}
      >
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

    const trigger = screen.getByRole('combobox', { name: 'Sort by keyboard' })
    await userEvent.click(trigger)
    await waitFor(() =>
      expect(trigger).toHaveAttribute('aria-expanded', 'true')
    )
    expect(screen.getByRole('option', { name: 'Oldest' })).toBeVisible()

    await userEvent.keyboard('{Escape}')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('treats an empty Select value as no selection', () => {
    render(
      <Select value="">
        <SelectTrigger aria-label="Empty sort">
          <SelectValue placeholder="Choose a sort" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="newest">Newest</SelectItem>
        </SelectContent>
      </Select>
    )

    const trigger = screen.getByRole('combobox', { name: 'Empty sort' })
    expect(trigger).toHaveTextContent('Choose a sort')
    expect(trigger).toHaveAttribute('data-placeholder', '')
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

    expect(onOpenChange).toHaveBeenCalledWith(
      false,
      expect.objectContaining({ reason: 'escape-key' })
    )
  })

  it('keeps closed Dialog content unmounted by default', () => {
    render(
      <Dialog>
        <DialogContent>
          <DialogTitle>Persistent dialog</DialogTitle>
        </DialogContent>
      </Dialog>
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('dismisses Dialog through its Base UI render-prop trigger', async () => {
    render(
      <Dialog>
        <DialogContent>
          <DialogTitle>Edit article</DialogTitle>
        </DialogContent>
        <DialogTrigger render={<Button>Open editor</Button>} />
      </Dialog>
    )

    const trigger = screen.getByRole('button', { name: 'Open editor' })
    await userEvent.click(trigger)
    expect(screen.getByRole('dialog', { name: 'Edit article' })).toBeVisible()

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('preserves Dropdown Menu item clicks and closes the menu', async () => {
    const onClick = vi.fn()
    render(
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button>Actions</Button>} />
        <DropdownMenuContent>
          <DropdownMenuItem onClick={onClick}>Archive</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )

    const trigger = screen.getByRole('button', { name: 'Actions' })
    await userEvent.click(trigger)
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Archive' })
    )

    expect(onClick).toHaveBeenCalledWith(expect.anything())
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('preserves controlled Tabs value changes and event details', async () => {
    const onValueChange = vi.fn()
    render(
      <Tabs value="one" onValueChange={onValueChange}>
        <TabsList>
          <TabsTrigger value="one">One</TabsTrigger>
          <TabsTrigger value="two">Two</TabsTrigger>
        </TabsList>
        <TabsContent value="one">First panel</TabsContent>
        <TabsContent value="two">Second panel</TabsContent>
      </Tabs>
    )

    await userEvent.click(screen.getByRole('tab', { name: 'Two' }))

    expect(onValueChange).toHaveBeenCalledWith(
      'two',
      expect.objectContaining({ reason: 'none' })
    )
  })

  it('exposes Tooltip content through the Base UI popup slot', async () => {
    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger render={<Button>Help</Button>} />
          <TooltipContent>Keyboard shortcuts</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )

    await userEvent.hover(screen.getByRole('button', { name: 'Help' }))
    const tooltipContent = await screen.findByText('Keyboard shortcuts')
    expect(
      tooltipContent.closest('[data-slot="tooltip-content"]')
    ).toBeInTheDocument()
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
