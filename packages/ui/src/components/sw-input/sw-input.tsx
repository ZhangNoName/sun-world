import * as React from 'react'

import { cn } from '../../lib/cn'
import { Input } from '@sun-world/base-ui/input'
import { Label } from '@sun-world/base-ui/label'

export type SwInputProps = Omit<
  React.ComponentProps<'input'>,
  'id' | 'value' | 'onChange' | 'onBlur' | 'aria-describedby'
> & {
  id?: string
  value?: string
  onValueChange?: (value: string) => void
  onValueCommit?: (value: string) => void
  onChange?: React.ChangeEventHandler<HTMLInputElement>
  onBlur?: React.FocusEventHandler<HTMLInputElement>
  label?: React.ReactNode
  hideVisibleLabel?: boolean
  inputSize?: 'sm' | 'md' | 'lg'
  clearable?: boolean
  description?: React.ReactNode
  error?: React.ReactNode
}

const SwInput = React.forwardRef<HTMLInputElement, SwInputProps>(
  function SwInput(
    {
      id,
      value,
      label,
      hideVisibleLabel = false,
      inputSize = 'md',
      clearable = false,
      description,
      error,
      onValueChange,
      onValueCommit,
      className,
      disabled,
      'aria-label': ariaLabel,
      ...props
    },
    ref
  ) {
    const generatedId = React.useId()
    const inputId = id ?? generatedId
    const descriptionId =
      description || error ? `${inputId}-description` : undefined

    return (
      <div className="sun-ui-field">
        {label && !hideVisibleLabel ? (
          <Label htmlFor={inputId}>{label}</Label>
        ) : null}
        <div className="relative">
          <Input
            ref={ref}
            id={inputId}
            value={value}
            disabled={disabled}
            data-size={inputSize}
            className={cn(
              inputSize === 'sm' && 'h-8',
              inputSize === 'lg' && 'h-10',
              clearable && value ? 'pr-9' : undefined,
              className
            )}
            aria-label={
              ariaLabel ?? (typeof label === 'string' ? label : undefined)
            }
            aria-describedby={descriptionId}
            aria-invalid={error ? true : undefined}
            onChange={(event) => {
              props.onChange?.(event)
              onValueChange?.(event.currentTarget.value)
            }}
            onBlur={(event) => {
              props.onBlur?.(event)
              onValueCommit?.(event.currentTarget.value)
            }}
            {...props}
          />
          {clearable && value ? (
            <button
              className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground disabled:cursor-not-allowed"
              type="button"
              disabled={disabled}
              aria-label="Clear input"
              onClick={() => onValueChange?.('')}
            >
              ×
            </button>
          ) : null}
        </div>
        {description || error ? (
          <p
            id={descriptionId}
            className={error ? 'text-destructive' : undefined}
          >
            {error ?? description}
          </p>
        ) : null}
      </div>
    )
  }
)

export { SwInput }
