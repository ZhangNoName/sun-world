import { useId } from 'react'

import { Checkbox } from './checkbox'
import { SunLabel } from '../label'
import { cn } from '../../lib/cn'
import '../../styles/base.css'
import './checkbox.css'

export interface SunCheckboxProps {
  checked?: boolean
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
  label: string
  disabled?: boolean
}

export function SunCheckbox({
  checked,
  defaultChecked,
  onCheckedChange,
  label,
  disabled,
}: SunCheckboxProps) {
  const id = useId()
  return (
    <span className="sun-checkbox-field">
      <Checkbox
        id={id}
        className={cn('sun-checkbox', disabled && 'sun-ui-disabled')}
        checked={checked}
        defaultChecked={defaultChecked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
      <SunLabel htmlFor={id}>{label}</SunLabel>
    </span>
  )
}
