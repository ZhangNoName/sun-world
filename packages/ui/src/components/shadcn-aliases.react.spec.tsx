import { render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it } from 'vitest'

import { Button, buttonVariants } from '@sun-world/base-ui/button'
import { SunButton } from '../compat/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@sun-world/base-ui/card'

describe('native shadcn primitives', () => {
  it('uses canonical variants and forwards the button ref', () => {
    const ref = createRef<HTMLButtonElement>()
    render(
      <Button ref={ref} variant="outline" size="sm">
        Save
      </Button>
    )
    expect(ref.current).toBe(screen.getByRole('button', { name: 'Save' }))
    expect(buttonVariants({ variant: 'ghost', size: 'sm' })).toContain(
      'hover:bg-muted'
    )
    expect(buttonVariants({ variant: 'ghost', size: 'sm' })).toContain(
      'select-none'
    )
    expect(Button).not.toBe(SunButton)
  })

  it('exports the complete canonical card composition', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Title</CardTitle>
          <CardDescription>Description</CardDescription>
          <CardAction>Action</CardAction>
        </CardHeader>
        <CardContent>Content</CardContent>
        <CardFooter>Footer</CardFooter>
      </Card>
    )
    expect(screen.getByText('Title')).toBeVisible()
    expect(screen.getByText('Description')).toBeVisible()
    expect(screen.getByText('Action')).toBeVisible()
    expect(screen.getByText('Content')).toBeVisible()
    expect(screen.getByText('Footer')).toBeVisible()
  })
})
