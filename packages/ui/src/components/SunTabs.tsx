import * as TabsPrimitive from '@radix-ui/react-tabs'
import type { ReactNode } from 'react'

export interface SunTabItem {
  value: string
  label: string
  content: ReactNode
  disabled?: boolean
}
export interface SunTabsProps {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  items: SunTabItem[]
}

export function SunTabs({
  value,
  defaultValue,
  onValueChange,
  items,
}: SunTabsProps) {
  return (
    <TabsPrimitive.Root
      value={value}
      defaultValue={defaultValue ?? items[0]?.value}
      onValueChange={onValueChange}
    >
      <TabsPrimitive.List className="sun-tabs__list">
        {items.map((item) => (
          <TabsPrimitive.Trigger
            key={item.value}
            value={item.value}
            disabled={item.disabled}
            className="sun-tabs__trigger"
          >
            {item.label}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {items.map((item) => (
        <TabsPrimitive.Content key={item.value} value={item.value}>
          {item.content}
        </TabsPrimitive.Content>
      ))}
    </TabsPrimitive.Root>
  )
}
