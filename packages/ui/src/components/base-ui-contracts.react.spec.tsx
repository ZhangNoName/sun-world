import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef, memo, useState, type ComponentProps } from 'react'
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
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
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
import { SunSelect } from '@sun-world/ui/select'
import { SelectField } from '../patterns/form-controls'

async function waitForPopupLifecycle(duration = 50) {
  await act(
    () => new Promise<void>((resolve) => window.setTimeout(resolve, duration))
  )
}

describe('Base UI migration contracts', () => {
  it('keeps the legacy Select adapter free of a separate visual language', () => {
    render(
      <SunSelect
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
      screen.getByRole('listbox').parentElement?.className
    ).toContain('w-(--anchor-width)')
  })

  it('uses the Base Nova Select visual slots', async () => {
    render(
      <Select defaultValue="newest">
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
    expect(screen.getByRole('listbox').parentElement?.className).toContain(
      'w-(--anchor-width)'
    )
    expect(screen.getByRole('option').className).toContain('rounded-md')
  })

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

  it('renders Select item labels without requiring Root.items', async () => {
    render(
      <Select defaultValue="newest">
        <SelectTrigger aria-label="Labelled sort">
          <SelectValue placeholder="Choose a sort" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="newest">Newest first</SelectItem>
          <SelectItem value="oldest">Oldest first</SelectItem>
        </SelectContent>
      </Select>
    )

    const trigger = screen.getByRole('combobox', { name: 'Labelled sort' })
    expect(trigger).toHaveTextContent('Newest first')
    expect(trigger).not.toHaveTextContent('newest')

    await userEvent.click(trigger)
    await userEvent.click(
      await screen.findByRole('option', { name: 'Oldest first' })
    )

    expect(trigger).toHaveTextContent('Oldest first')
    expect(trigger).not.toHaveTextContent('oldest')
  })

  it('recovers initial Select labels from prop-forwarding memo items', () => {
    const WrappedSelectItem = memo(function WrappedSelectItem(
      props: ComponentProps<typeof SelectItem>
    ) {
      return <SelectItem {...props} />
    })

    render(
      <Select defaultValue="newest">
        <SelectTrigger aria-label="Wrapped sort">
          <SelectValue placeholder="Choose a sort" />
        </SelectTrigger>
        <SelectContent>
          <WrappedSelectItem value="newest">Newest first</WrappedSelectItem>
          <WrappedSelectItem value="oldest">Oldest first</WrappedSelectItem>
        </SelectContent>
      </Select>
    )

    expect(
      screen.getByRole('combobox', { name: 'Wrapped sort' })
    ).toHaveTextContent('Newest first')
  })

  it('treats an empty Select value as no selection', () => {
    render(
      <Select value="">
        <SelectTrigger aria-label="Empty sort">
          <SelectValue placeholder="Choose a sort" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="newest">Newest first</SelectItem>
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

  it('exposes cancelable Dialog dismissal and close-auto-focus callbacks', async () => {
    let closeAutoFocusTarget: EventTarget | null = null
    let closeAutoFocusCurrentTarget: EventTarget | null = null
    let openAutoFocusTarget: EventTarget | null = null
    let openAutoFocusCurrentTarget: EventTarget | null = null
    const onCloseAutoFocus = vi.fn((event: Event) => event.preventDefault())
    const onOpenAutoFocus = vi.fn((event: Event) => {
      openAutoFocusTarget = event.target
      openAutoFocusCurrentTarget = event.currentTarget
      event.preventDefault()
    })
    const onEscapeKeyDown = vi.fn((event: KeyboardEvent) =>
      event.preventDefault()
    )
    const onPointerDownOutside = vi.fn(
      (event: CustomEvent<{ originalEvent: PointerEvent }>) =>
        event.preventDefault()
    )
    render(
      <>
        <button type="button">Outside dialog</button>
        <Dialog modal={false} defaultOpen>
          <DialogContent
            onCloseAutoFocus={onCloseAutoFocus}
            onEscapeKeyDown={onEscapeKeyDown}
            onOpenAutoFocus={onOpenAutoFocus}
            onPointerDownOutside={onPointerDownOutside}
          >
            <DialogTitle>Cancelable dialog</DialogTitle>
            <DialogClose>Finish</DialogClose>
          </DialogContent>
        </Dialog>
      </>
    )

    await waitFor(() => expect(onOpenAutoFocus).toHaveBeenCalled())
    expect(onOpenAutoFocus.mock.calls[0]?.[0]?.defaultPrevented).toBe(true)
    const dialog = screen.getByRole('dialog', { name: 'Cancelable dialog' })
    expect(openAutoFocusTarget).toBe(dialog)
    expect(openAutoFocusCurrentTarget).toBe(dialog)
    await userEvent.keyboard('{Escape}')
    expect(onEscapeKeyDown).toHaveBeenCalledWith(expect.any(KeyboardEvent))
    expect(
      screen.getByRole('dialog', { name: 'Cancelable dialog' })
    ).toBeVisible()

    const outside = screen.getByRole('button', { name: 'Outside dialog' })
    fireEvent.pointerDown(outside, { pointerType: 'mouse' })
    fireEvent.click(outside)
    expect(onPointerDownOutside).toHaveBeenCalledTimes(1)
    expect(
      onPointerDownOutside.mock.calls[0]?.[0]?.detail.originalEvent
    ).toBeInstanceOf(Event)
    expect(
      screen.getByRole('dialog', { name: 'Cancelable dialog' })
    ).toBeVisible()

    onCloseAutoFocus.mockImplementation((event: Event) => {
      closeAutoFocusTarget = event.target
      closeAutoFocusCurrentTarget = event.currentTarget
      event.preventDefault()
    })
    await userEvent.click(screen.getByRole('button', { name: 'Finish' }))
    await waitFor(() => expect(onCloseAutoFocus).toHaveBeenCalled())
    expect(onCloseAutoFocus.mock.calls[0]?.[0]?.defaultPrevented).toBe(true)
    expect(closeAutoFocusTarget).toBe(dialog)
    expect(closeAutoFocusCurrentTarget).toBe(dialog)
  })

  it('reports real Dialog outside targets even when Base suppresses dismissal', async () => {
    const pointerTargets: Array<[EventTarget | null, EventTarget | null]> = []
    const focusTargets: Array<[EventTarget | null, EventTarget | null]> = []
    const interactTargets: Array<[EventTarget | null, EventTarget | null]> = []
    const onPointerDownOutside = vi.fn(
      (event: CustomEvent<{ originalEvent: PointerEvent }>) => {
        pointerTargets.push([event.target, event.currentTarget])
        event.preventDefault()
      }
    )
    const onFocusOutside = vi.fn(
      (event: CustomEvent<{ originalEvent: FocusEvent }>) => {
        focusTargets.push([event.target, event.currentTarget])
        event.preventDefault()
      }
    )
    const onInteractOutside = vi.fn((event: Event) => {
      interactTargets.push([event.target, event.currentTarget])
    })

    render(
      <>
        <button type="button">Suppressed outside</button>
        <Dialog defaultOpen disablePointerDismissal>
          <DialogContent
            onFocusOutside={onFocusOutside}
            onInteractOutside={onInteractOutside}
            onPointerDownOutside={onPointerDownOutside}
          >
            <DialogTitle>Non-dismissible dialog</DialogTitle>
          </DialogContent>
        </Dialog>
      </>
    )

    const outside = screen
      .getByText('Suppressed outside')
      .closest('button') as HTMLButtonElement
    const dialog = screen.getByRole('dialog', {
      name: 'Non-dismissible dialog',
    })
    fireEvent.focusIn(outside, { relatedTarget: dialog })
    fireEvent.pointerDown(outside, { pointerType: 'mouse' })

    await waitFor(() => {
      expect(onPointerDownOutside).toHaveBeenCalledTimes(1)
      expect(onFocusOutside).toHaveBeenCalledTimes(1)
    })
    expect(pointerTargets[0]).toEqual([outside, outside])
    expect(focusTargets[0]).toEqual([outside, outside])
    expect(interactTargets).toEqual([
      [outside, outside],
      [outside, outside],
    ])
    expect(dialog).toBeVisible()
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

    const trigger = screen.getByRole('button', { name: 'Actions' })
    await userEvent.click(trigger)
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Archive' })
    )

    expect(onSelect).toHaveBeenCalledWith(expect.any(Event))
    expect(onSelect.mock.calls[0]?.[0]?.defaultPrevented).toBe(true)
    await waitForPopupLifecycle()
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(
      screen.getByRole('menuitem', { name: 'Archive' })
    ).toBeInTheDocument()
  })

  it('keeps the parent menu tree open when nested selection is canceled', async () => {
    const onSelect = vi.fn((event: Event) => event.preventDefault())
    const onPointerDownOutside = vi.fn()
    const onInteractOutside = vi.fn()
    render(
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button>Nested actions</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          onInteractOutside={onInteractOutside}
          onPointerDownOutside={onPointerDownOutside}
        >
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>More actions</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onSelect={onSelect}>
                Archive nested
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
    )

    const rootTrigger = screen.getByRole('button', { name: 'Nested actions' })
    await userEvent.click(rootTrigger)
    const subTrigger = await screen.findByRole('menuitem', {
      name: 'More actions',
    })
    await userEvent.hover(subTrigger)
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Archive nested' })
    )

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onPointerDownOutside).not.toHaveBeenCalled()
    expect(onInteractOutside).not.toHaveBeenCalled()
    await waitForPopupLifecycle()
    expect(rootTrigger).toHaveAttribute('aria-expanded', 'true')
    expect(subTrigger).toHaveAttribute('aria-expanded', 'true')
    expect(
      screen.getByRole('menuitem', { name: 'Archive nested' })
    ).toBeInTheDocument()
  })

  it('exposes a cancelable Dropdown Menu outside-pointer callback', async () => {
    const onPointerDownOutside = vi.fn(
      (event: CustomEvent<{ originalEvent: PointerEvent }>) =>
        event.preventDefault()
    )
    render(
      <>
        <button type="button">Outside menu</button>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button>Menu lifecycle</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent onPointerDownOutside={onPointerDownOutside}>
            <DropdownMenuItem>Archive</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </>
    )

    const trigger = screen.getByRole('button', { name: 'Menu lifecycle' })
    await userEvent.click(trigger)
    await waitForPopupLifecycle(550)
    const outside = screen.getByRole('button', { name: 'Outside menu' })
    fireEvent.pointerDown(outside, { pointerType: 'mouse' })
    fireEvent.click(outside)

    expect(onPointerDownOutside).toHaveBeenCalledTimes(1)
    await waitForPopupLifecycle()
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })

  it('preserves indeterminate Checkbox state and toggles even when selection is canceled', async () => {
    const onCheckedChange = vi.fn()
    const onSelect = vi.fn((event: Event) => event.preventDefault())
    render(
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button>Summary options</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuCheckboxItem
            checked="indeterminate"
            onCheckedChange={onCheckedChange}
            onSelect={onSelect}
          >
            Show summaries
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )

    const trigger = screen.getByRole('button', { name: 'Summary options' })
    await userEvent.click(trigger)
    const item = await screen.findByRole('menuitemcheckbox', {
      name: 'Show summaries',
    })
    expect(item).toHaveAttribute('aria-checked', 'mixed')
    expect(item).toHaveAttribute('data-state', 'indeterminate')
    expect(item.querySelector('svg')).toBeInTheDocument()

    await userEvent.click(item)

    expect(onCheckedChange).toHaveBeenCalledWith(true)
    await waitForPopupLifecycle()
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })

  it('closes Checkbox and Radio items by default while reporting their changes', async () => {
    const onCheckedChange = vi.fn()
    const onValueChange = vi.fn()
    render(
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button>Display options</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuCheckboxItem onCheckedChange={onCheckedChange}>
            Show summaries
          </DropdownMenuCheckboxItem>
          <DropdownMenuRadioGroup
            value="comfortable"
            onValueChange={onValueChange}
          >
            <DropdownMenuRadioItem value="compact">
              Compact
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="comfortable">
              Comfortable
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    )

    const trigger = screen.getByRole('button', { name: 'Display options' })
    await userEvent.click(trigger)
    await userEvent.click(
      await screen.findByRole('menuitemcheckbox', { name: 'Show summaries' })
    )
    expect(onCheckedChange).toHaveBeenCalledWith(true)
    await waitFor(() =>
      expect(trigger).toHaveAttribute('aria-expanded', 'false')
    )

    await userEvent.click(trigger)
    await userEvent.click(
      await screen.findByRole('menuitemradio', { name: 'Compact' })
    )
    expect(onValueChange).toHaveBeenCalledWith('compact')
    await waitFor(() =>
      expect(trigger).toHaveAttribute('aria-expanded', 'false')
    )
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

  it('leaves uncontrolled Tabs unselected when no default is provided', async () => {
    const onValueChange = vi.fn()
    render(
      <Tabs onValueChange={onValueChange}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">Overview panel</TabsContent>
        <TabsContent value="activity">Activity panel</TabsContent>
      </Tabs>
    )

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
        'aria-selected',
        'false'
      )
      expect(screen.getByRole('tab', { name: 'Activity' })).toHaveAttribute(
        'aria-selected',
        'false'
      )
    })
    expect(onValueChange).not.toHaveBeenCalled()
  })

  it('retains an uncontrolled Tabs value when its tab disappears or is disabled', async () => {
    const onValueChange = vi.fn()
    function TabSet({
      disabled = false,
      includeActivity = true,
    }: {
      disabled?: boolean
      includeActivity?: boolean
    }) {
      return (
        <Tabs defaultValue="activity" onValueChange={onValueChange}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            {includeActivity && (
              <TabsTrigger value="activity" disabled={disabled}>
                Activity
              </TabsTrigger>
            )}
          </TabsList>
          <TabsContent value="overview">Overview panel</TabsContent>
          {includeActivity && (
            <TabsContent value="activity">Activity panel</TabsContent>
          )}
        </Tabs>
      )
    }

    const { rerender } = render(<TabSet />)
    expect(screen.getByRole('tab', { name: 'Activity' })).toHaveAttribute(
      'aria-selected',
      'true'
    )

    rerender(<TabSet includeActivity={false} />)
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
        'aria-selected',
        'false'
      )
    })
    expect(onValueChange).not.toHaveBeenCalled()

    rerender(<TabSet disabled />)
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Activity' })).toHaveAttribute(
        'aria-selected',
        'true'
      )
      expect(screen.getByRole('tab', { name: 'Activity' })).toHaveAttribute(
        'aria-disabled',
        'true'
      )
    })
    expect(onValueChange).not.toHaveBeenCalled()
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

  it('exposes a cancelable Tooltip Escape callback', async () => {
    const onEscapeKeyDown = vi.fn((event: KeyboardEvent) =>
      event.preventDefault()
    )
    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button>Tooltip lifecycle</Button>
          </TooltipTrigger>
          <TooltipContent onEscapeKeyDown={onEscapeKeyDown}>
            Persistent help
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )

    await userEvent.hover(
      screen.getByRole('button', { name: 'Tooltip lifecycle' })
    )
    expect(await screen.findByRole('tooltip')).toBeVisible()
    await userEvent.keyboard('{Escape}')

    expect(onEscapeKeyDown).toHaveBeenCalledWith(expect.any(KeyboardEvent))
    await waitForPopupLifecycle()
    expect(screen.getByRole('tooltip')).toBeVisible()
  })

  it('exposes cancelable Select dismissal and close-auto-focus callbacks', async () => {
    const onCloseAutoFocus = vi.fn((event: Event) => event.preventDefault())
    const onEscapeKeyDown = vi.fn((event: KeyboardEvent) =>
      event.preventDefault()
    )
    render(
      <Select>
        <SelectTrigger aria-label="Select lifecycle">
          <SelectValue placeholder="Choose" />
        </SelectTrigger>
        <SelectContent
          onCloseAutoFocus={onCloseAutoFocus}
          onEscapeKeyDown={onEscapeKeyDown}
        >
          <SelectItem value="newest">Newest</SelectItem>
        </SelectContent>
      </Select>
    )

    const trigger = screen.getByRole('combobox', { name: 'Select lifecycle' })
    await userEvent.click(trigger)
    await waitFor(() =>
      expect(trigger).toHaveAttribute('aria-expanded', 'true')
    )
    await userEvent.keyboard('{Escape}')
    expect(onEscapeKeyDown).toHaveBeenCalledWith(expect.any(KeyboardEvent))
    await waitForPopupLifecycle()
    expect(trigger).toHaveAttribute('aria-expanded', 'true')

    await userEvent.click(await screen.findByRole('option', { name: 'Newest' }))
    await waitFor(() => expect(onCloseAutoFocus).toHaveBeenCalled())
    expect(onCloseAutoFocus.mock.calls[0]?.[0]?.defaultPrevented).toBe(true)
  })

  it('force mounts closed Select, Menu, Dialog, and Tooltip content', async () => {
    render(
      <>
        <Select>
          <SelectTrigger aria-label="Force-mounted select">
            <SelectValue placeholder="Choose" />
          </SelectTrigger>
          <SelectContent forceMount>
            <SelectItem value="newest">Newest</SelectItem>
          </SelectContent>
        </Select>
        <DropdownMenu>
          <DropdownMenuTrigger>Force-mounted menu</DropdownMenuTrigger>
          <DropdownMenuContent forceMount>
            <DropdownMenuItem>Archive</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Dialog>
          <DialogContent forceMount>
            <DialogTitle>Force-mounted dialog</DialogTitle>
          </DialogContent>
        </Dialog>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>Force-mounted tooltip</TooltipTrigger>
            <TooltipContent forceMount>Persistent help</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </>
    )

    expect(
      document.querySelector('[data-slot="select-content"]')
    ).toBeInTheDocument()
    expect(
      document.querySelector('[data-slot="dropdown-menu-content"]')
    ).toBeInTheDocument()
    expect(
      document.querySelector('[data-slot="dialog-content"]')
    ).toBeInTheDocument()
    expect(
      document.querySelector('[data-slot="tooltip-content"]')
    ).toBeInTheDocument()

    const selectTrigger = screen.getByRole('combobox', {
      name: 'Force-mounted select',
    })
    await userEvent.click(selectTrigger)
    await userEvent.click(await screen.findByRole('option', { name: 'Newest' }))
    expect(selectTrigger).toHaveTextContent('Newest')
  })

  it('retains force-mounted Select popup identity across open and close', async () => {
    const contentRef = createRef<HTMLDivElement>()
    render(
      <Select>
        <SelectTrigger aria-label="Stable force-mounted select">
          <SelectValue placeholder="Choose" />
        </SelectTrigger>
        <SelectContent forceMount ref={contentRef}>
          <SelectItem value="newest">Newest</SelectItem>
        </SelectContent>
      </Select>
    )

    const trigger = screen.getByRole('combobox', {
      name: 'Stable force-mounted select',
    })
    const initialPopup = document.querySelector('[data-slot="select-content"]')
    const initialOption = document.querySelector('[data-slot="select-item"]')
    expect(contentRef.current).toBe(initialPopup)

    await userEvent.click(trigger)
    expect(document.querySelector('[data-slot="select-content"]')).toBe(
      initialPopup
    )
    expect(document.querySelector('[data-slot="select-item"]')).toBe(
      initialOption
    )
    expect(contentRef.current).toBe(initialPopup)

    await userEvent.click(await screen.findByRole('option', { name: 'Newest' }))
    await waitForPopupLifecycle()
    expect(document.querySelector('[data-slot="select-content"]')).toBe(
      initialPopup
    )
    expect(document.querySelector('[data-slot="select-item"]')).toBe(
      initialOption
    )
    expect(contentRef.current).toBe(initialPopup)
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('keeps a force-mounted Select inside its modal Dialog lifecycle', async () => {
    render(
      <Dialog defaultOpen>
        <DialogContent initialFocus={false} showCloseButton={false}>
          <DialogTitle>Preferences</DialogTitle>
          <Select>
            <SelectTrigger aria-label="Dialog sort">
              <SelectValue placeholder="Choose" />
            </SelectTrigger>
            <SelectContent forceMount>
              <SelectItem value="newest">Newest</SelectItem>
            </SelectContent>
          </Select>
        </DialogContent>
      </Dialog>
    )

    const dialog = screen.getByRole('dialog', { name: 'Preferences' })
    const popup = document.querySelector<HTMLElement>(
      '[data-slot="select-content"]'
    )
    const trigger = screen.getByRole('combobox', { name: 'Dialog sort' })
    expect(popup).not.toBeNull()
    expect(dialog).toContainElement(popup)
    expect(popup?.closest('[aria-hidden="true"]')).toBeNull()

    await userEvent.click(trigger)
    await userEvent.click(await screen.findByRole('option', { name: 'Newest' }))

    expect(dialog).toBeVisible()
    expect(popup?.closest('[aria-hidden="true"]')).toBeNull()
    await waitFor(() => expect(trigger).toHaveFocus())
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
