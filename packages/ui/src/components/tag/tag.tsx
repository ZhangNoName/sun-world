import type { CSSProperties } from 'react'

import { cn } from '../../lib/cn'
import '../../styles/base.css'
import './tag.css'

export interface SunTagProps {
  label: string | number
  href?: string
  color?: string
  disabled?: boolean
  className?: string
}

export function SunTag({
  label,
  href,
  color,
  disabled,
  className,
}: SunTagProps) {
  const style = color
    ? ({ backgroundColor: color } as CSSProperties)
    : undefined
  if (href && !disabled) {
    return (
      <a
        data-sun-tag
        className={cn('sun-tag', className)}
        style={style}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
      >
        {label}
      </a>
    )
  }
  return (
    <span
      data-sun-tag
      className={cn('sun-tag', disabled && 'sun-ui-disabled', className)}
      style={style}
      aria-disabled={disabled || undefined}
    >
      {label}
    </span>
  )
}
