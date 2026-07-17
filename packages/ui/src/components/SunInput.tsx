import { useId, type ChangeEvent, type InputHTMLAttributes } from 'react'

import { cn } from '../lib/cn'
import '../styles/base.css'

export interface SunInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'size'
> {
  value?: string
  onValueChange?: (value: string) => void
  onValueCommit?: (value: string) => void
  label?: string
  inputSize?: 'sm' | 'md' | 'lg'
  clearable?: boolean
}

export function SunInput({
  id,
  value = '',
  onValueChange,
  onValueCommit,
  label,
  inputSize = 'md',
  clearable = false,
  className,
  disabled,
  ...props
}: SunInputProps) {
  const generatedId = useId()
  const inputId = id ?? `sun-input-${generatedId}`
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (!disabled) onValueChange?.(event.target.value)
  }
  return (
    <span className="sun-ui-field">
      {label ? (
        <label className="sun-ui-label" htmlFor={inputId}>
          {label}
        </label>
      ) : null}
      <span className="sun-input-wrap">
        <input
          id={inputId}
          value={value}
          disabled={disabled}
          aria-label={props['aria-label'] ?? label}
          className={cn(
            'sun-input',
            `sun-input--${inputSize}`,
            disabled && 'sun-ui-disabled',
            className
          )}
          onChange={handleChange}
          onBlur={(event) => onValueCommit?.(event.currentTarget.value)}
          {...props}
        />
        {clearable && value ? (
          <button
            className="sun-input__clear"
            type="button"
            disabled={disabled}
            aria-label="Clear input"
            onClick={() => onValueChange?.('')}
          >
            ×
          </button>
        ) : null}
      </span>
    </span>
  )
}
