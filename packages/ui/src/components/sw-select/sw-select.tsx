import * as React from 'react'

import { Label } from '@sun-world/base-ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sun-world/base-ui/select'
import { cn } from '../../lib/cn'

export type SwOption = {
  value: string
  label: React.ReactNode
  disabled?: boolean
}

export type SwSelectProps = {
  id?: string
  label?: React.ReactNode
  hideVisibleLabel?: boolean
  description?: React.ReactNode
  error?: React.ReactNode
  placeholder?: string
  options: SwOption[]
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  disabled?: boolean
  name?: string
  required?: boolean
  surface?: 'default' | 'modal'
  className?: string
  'aria-label'?: string
}

export type SwNativeSelectProps = Omit<
  React.ComponentProps<'select'>,
  'id' | 'value' | 'defaultValue' | 'onChange' | 'aria-describedby'
> & {
  id?: string
  label?: React.ReactNode
  description?: React.ReactNode
  error?: React.ReactNode
  options: SwOption[]
  value?: string | number | string[]
  defaultValue?: string | number | string[]
  onValueChange?: (value: string | string[]) => void
  onChange?: React.ChangeEventHandler<HTMLSelectElement>
}

export function SwSelect({
  id,
  label,
  hideVisibleLabel = false,
  description,
  error,
  placeholder,
  options,
  value,
  defaultValue,
  onValueChange,
  disabled,
  name,
  required,
  surface = 'default',
  className,
  'aria-label': ariaLabel,
}: SwSelectProps) {
  const generatedId = React.useId()
  const selectId = id ?? generatedId
  const descriptionId =
    description || error ? `${selectId}-description` : undefined

  return (
    <div className="sun-ui-field">
      {label && !hideVisibleLabel ? (
        <Label htmlFor={selectId}>{label}</Label>
      ) : null}
      <Select
        items={options}
        value={value}
        defaultValue={defaultValue}
        onValueChange={(nextValue) => {
          if (nextValue !== null) onValueChange?.(nextValue)
        }}
        disabled={disabled}
        name={name}
        required={required}
      >
        <SelectTrigger
          id={selectId}
          className={className ?? 'w-full'}
          aria-label={
            ariaLabel ?? (typeof label === 'string' ? label : undefined)
          }
          aria-describedby={descriptionId}
          aria-invalid={error ? true : undefined}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent
          className={
            surface === 'modal' ? 'sun-select-content--modal' : undefined
          }
        >
          {options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              disabled={option.disabled}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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

export function SwNativeSelect({
  id,
  label,
  description,
  error,
  options,
  value,
  defaultValue,
  onValueChange,
  onChange,
  className,
  multiple = false,
  'aria-label': ariaLabel,
  ...props
}: SwNativeSelectProps) {
  const generatedId = React.useId()
  const selectId = id ?? generatedId
  const descriptionId =
    description || error ? `${selectId}-description` : undefined

  return (
    <div className="sun-ui-field">
      {label ? <Label htmlFor={selectId}>{label}</Label> : null}
      <select
        id={selectId}
        value={value}
        defaultValue={defaultValue}
        multiple={multiple}
        aria-label={
          ariaLabel ?? (typeof label === 'string' ? label : undefined)
        }
        aria-describedby={descriptionId}
        aria-invalid={error ? true : undefined}
        className={cn(
          'border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50',
          className
        )}
        onChange={(event) => {
          onChange?.(event)
          onValueChange?.(
            multiple
              ? Array.from(
                  event.currentTarget.selectedOptions,
                  (option) => option.value
                )
              : event.currentTarget.value
          )
        }}
        {...props}
      >
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </option>
        ))}
      </select>
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
