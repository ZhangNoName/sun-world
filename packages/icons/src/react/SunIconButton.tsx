import type { ButtonHTMLAttributes } from 'react'

import type { UiIconName } from '../data'
import { SunIcon, type SunIconSize } from './SunIcon'

export interface SunIconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'aria-label'
> {
  icon: UiIconName
  label: string
  size?: SunIconSize
}

export function SunIconButton({
  icon,
  label,
  size = 'lg',
  type = 'button',
  ...props
}: SunIconButtonProps) {
  return (
    <button
      className="sun-icon-button"
      type={type}
      aria-label={label}
      title={label}
      {...props}
    >
      <SunIcon name={icon} size={size} />
    </button>
  )
}
