import type { ReactNode } from 'react'
import { SwDialogContent } from '../../components/sw-dialog'
import { Dialog, DialogTitle, DialogTrigger } from '@sun-world/base-ui/dialog'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@sun-world/base-ui/tabs'

export function DialogPanel({
  trigger,
  title,
  contentClassName,
  overlayClassName,
  children,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  trigger: ReactNode
  title: string
  contentClassName?: string
  overlayClassName?: string
  children: ReactNode
}) {
  return (
    <Dialog {...props}>
      <DialogTrigger render={trigger as React.ReactElement} />
      <SwDialogContent
        className={contentClassName}
        overlayClassName={overlayClassName}
      >
        <DialogTitle>{title}</DialogTitle>
        {children}
      </SwDialogContent>
    </Dialog>
  )
}

export function TabsView({
  items,
  ...props
}: React.ComponentProps<typeof Tabs> & {
  items: Array<{ value: string; label: string; content: ReactNode }>
}) {
  return (
    <Tabs {...props}>
      <TabsList>
        {items.map((item) => (
          <TabsTrigger key={item.value} value={item.value}>
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
