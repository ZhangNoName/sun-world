import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const baseStyles = readFileSync(
  resolve(import.meta.dirname, 'base.css'),
  'utf8'
)

describe('shared base styles', () => {
  it('does not add a legacy brand focus outline to controls', () => {
    expect(baseStyles).not.toContain('outline: 2px solid var(--color-brand')
  })

  it('keeps fallback semantic colors from overriding a mounted app theme', () => {
    expect(baseStyles).toContain(':root:not([data-color-mode])')
    expect(baseStyles).not.toMatch(/(^|\n):root\s*\{\n\s*--background:/)
  })
})
