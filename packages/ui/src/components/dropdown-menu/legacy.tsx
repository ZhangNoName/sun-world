import type { ReactNode } from 'react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './dropdown-menu'
import '../../styles/base.css'
import './dropdown-menu.css'

export interface SunDropdownMenuItem {
  value: string
  label: string
  disabled?: boolean
  destructive?: boolean
}
export interface SunDropdownMenuProps {
  trigger: ReactNode
  items: SunDropdownMenuItem[]
  onSelect?: (value: string) => void
}

export function SunDropdownMenu({
  trigger,
  items,
  onSelect,
}: SunDropdownMenuProps) {
  const triggerIsElement = typeof trigger !== 'string'
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild={triggerIsElement}>
        {trigger}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="sun-dropdown-menu" sideOffset={4}>
        {items.map((item) => (
          <DropdownMenuItem
            key={item.value}
            disabled={item.disabled}
            className={
              item.destructive ? 'sun-dropdown-menu__item--danger' : undefined
            }
            onSelect={() => onSelect?.(item.value)}
          >
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
