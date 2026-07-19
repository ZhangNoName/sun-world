import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '../../lib/cn'
import '../../styles/base.css'
import './button.css'

export const buttonVariants = cva('sun-button', {
  variants: {
    variant: {
      primary: 'sun-button--primary',
      secondary: 'sun-button--secondary',
      danger: 'sun-button--danger',
      ghost: 'sun-button--ghost',
      link: 'sun-button--link',
      icon: 'sun-button--icon',
    },
    size: {
      sm: 'sun-button--sm',
      md: 'sun-button--md',
      lg: 'sun-button--lg',
      icon: 'sun-button--icon',
    },
  },
  defaultVariants: { variant: 'primary', size: 'md' },
})

export interface SunButtonProps
  extends
    ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  label?: string
  loading?: boolean
  children?: ReactNode
}

export function SunButton({
  variant,
  size,
  label,
  loading = false,
  disabled,
  className,
  children,
  ...props
}: SunButtonProps) {
  const isDisabled = disabled || loading
  return (
    <span className={cn('sun-ui-field', label && 'sun-ui-field--labeled')}>
      {label ? <span className="sun-ui-label">{label}</span> : null}
      <button
        className={cn(
          buttonVariants({ variant, size }),
          isDisabled && 'sun-ui-disabled',
          loading && 'is-loading',
          className
        )}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        {...props}
      >
        {children}
      </button>
    </span>
  )
}
