import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { Button } from './button'
import { Checkbox } from './checkbox'
import { Dialog, DialogClose, DialogContent, DialogTitle } from './dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select'
import { Tabs, TabsList, TabsTrigger } from './tabs'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './tooltip'

describe('Base UI migration contracts', () => {
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
    await userEvent.click(screen.getByRole('option', { name: 'Oldest' }))

    expect(onValueChange).toHaveBeenCalledWith('oldest')
  })

  it('reports Checkbox state as a boolean', async () => {
    const onCheckedChange = vi.fn()
    render(
      <Checkbox
        aria-label="Publish article"
        checked={false}
        onCheckedChange={onCheckedChange}
      />
    )

    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Publish article' })
    )

    expect(onCheckedChange).toHaveBeenCalledWith(true)
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
    expect(dialog.parentElement).toBe(document.body)

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('selects a Dropdown Menu item once', async () => {
    const onSelect = vi.fn()
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
    await userEvent.click(screen.getByRole('menuitem', { name: 'Archive' }))

    expect(onSelect).toHaveBeenCalledOnce()
  })

  it('preserves controlled Tabs value changes', async () => {
    const onValueChange = vi.fn()
    render(
      <Tabs value="overview" onValueChange={onValueChange}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
      </Tabs>
    )

    await userEvent.click(screen.getByRole('tab', { name: 'Activity' }))

    expect(onValueChange).toHaveBeenCalledWith('activity')
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
