import { useId } from 'react'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select'
import { SunLabel } from '../label'
import '../../styles/base.css'

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
      <Select
        value={value || undefined}
        defaultValue={defaultValue}
        onValueChange={onValueChange}
        disabled={disabled}
        items={options}
      >
        <SelectTrigger id={id} aria-label={label}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent position="popper">
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
    </span>
  )
}
