import type { ReactNode } from 'react'

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@sun-world/base-ui/tabs'
import '../../styles/base.css'

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
    <Tabs
      value={value}
      defaultValue={defaultValue ?? items[0]?.value}
      onValueChange={(nextValue) => onValueChange?.(nextValue)}
    >
      <TabsList className="sun-tabs__list">
        {items.map((item) => (
          <TabsTrigger
            key={item.value}
            value={item.value}
            disabled={item.disabled}
            className="sun-tabs__trigger"
          >
            {item.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {items.map((item) => (
        <TabsContent key={item.value} value={item.value}>
          {item.content}
        </TabsContent>
      ))}
    </Tabs>
  )
}
