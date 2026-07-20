import { useId, type ChangeEvent, type TextareaHTMLAttributes } from 'react'

import { cn } from '../../lib/cn'
import '../../styles/base.css'
import '../input/input.css'
import './textarea.css'

export interface SunTextareaProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'value' | 'onChange'
> {
  value?: string
  onValueChange?: (value: string) => void
  label?: string
}

export function SunTextarea({
  id,
  value = '',
  onValueChange,
  label,
  disabled,
  className,
  ...props
}: SunTextareaProps) {
  const generatedId = useId()
  const inputId = id ?? `sun-textarea-${generatedId}`
  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    if (!disabled) onValueChange?.(event.target.value)
  }
  return (
    <span className="sun-ui-field">
      {label ? (
        <label className="sun-ui-label" htmlFor={inputId}>
          {label}
        </label>
      ) : null}
      <textarea
        id={inputId}
        value={value}
        disabled={disabled}
        aria-label={props['aria-label'] ?? label}
        className={cn('sun-input sun-input--textarea', className)}
        onChange={handleChange}
        {...props}
      />
    </span>
  )
}
