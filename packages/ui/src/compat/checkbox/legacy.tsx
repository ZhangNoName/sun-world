import { useId } from 'react'

import { Checkbox } from '@sun-world/base-ui/checkbox'
import { SunLabel } from '../label'
import { cn } from '../../lib/cn'
import '../../styles/base.css'

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
        onCheckedChange={(nextChecked) => onCheckedChange?.(nextChecked)}
      />
      <SunLabel htmlFor={id}>{label}</SunLabel>
    </span>
  )
}
