import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu'
import type { ReactNode } from 'react'
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
  return (
    <DropdownPrimitive.Root>
      <DropdownPrimitive.Trigger asChild>
        {typeof trigger === 'string' ? (
          <button type="button">{trigger}</button>
        ) : (
          trigger
        )}
      </DropdownPrimitive.Trigger>
      <DropdownPrimitive.Portal>
        <DropdownPrimitive.Content className="sun-dropdown-menu" sideOffset={4}>
          {items.map((item) => (
            <DropdownPrimitive.Item
              key={item.value}
              disabled={item.disabled}
              className={
                item.destructive ? 'sun-dropdown-menu__item--danger' : undefined
              }
              onSelect={() => onSelect?.(item.value)}
            >
              {item.label}
            </DropdownPrimitive.Item>
          ))}
        </DropdownPrimitive.Content>
      </DropdownPrimitive.Portal>
    </DropdownPrimitive.Root>
  )
}
