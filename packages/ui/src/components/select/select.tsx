import * as SelectPrimitive from '@radix-ui/react-select'
import { useId } from 'react'

import { SunLabel } from '../label'
import '../../styles/base.css'
import './select.css'

export interface SunSelectOption {
  value: string
  label: string
  disabled?: boolean
}
export interface SunSelectProps {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  options: SunSelectOption[]
  label?: string
  placeholder?: string
  disabled?: boolean
}

export function SunSelect({
  value,
  defaultValue,
  onValueChange,
  options,
  label,
  placeholder = 'Select…',
  disabled,
}: SunSelectProps) {
  const id = useId()
  return (
    <span className="sun-ui-field">
      {label ? <SunLabel htmlFor={id}>{label}</SunLabel> : null}
      <SelectPrimitive.Root
        value={value || undefined}
        defaultValue={defaultValue}
        onValueChange={onValueChange}
        disabled={disabled}
      >
        <SelectPrimitive.Trigger
          id={id}
          className="sun-select"
          aria-label={label}
        >
          <SelectPrimitive.Value placeholder={placeholder} />
          <SelectPrimitive.Icon>⌄</SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            className="sun-select__content"
            position="popper"
          >
            <SelectPrimitive.Viewport>
              {options.map((option) => (
                <SelectPrimitive.Item
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  className="sun-select__item"
                >
                  <SelectPrimitive.ItemText>
                    {option.label}
                  </SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator>
                    ✓
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    </span>
  )
}
