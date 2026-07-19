import { describe, expect, it } from 'vitest'

import { Button, SunButton, buttonVariants } from './button'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  SunCard,
  SunCardContent,
  SunCardFooter,
  SunCardHeader,
} from './card'

describe('project-owned shadcn aliases', () => {
  it('keeps canonical aliases identical to compatibility exports', () => {
    expect(Button).toBe(SunButton)
    expect(Card).toBe(SunCard)
    expect(CardHeader).toBe(SunCardHeader)
    expect(CardContent).toBe(SunCardContent)
    expect(CardFooter).toBe(SunCardFooter)
  })

  it('exports button variants for local composition', () => {
    expect(buttonVariants({ variant: 'ghost', size: 'sm' })).toContain(
      'sun-button--ghost'
    )
  })
})
