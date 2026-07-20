import type { ReactNode } from 'react'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '../../components/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/tabs'

export function DialogPanel({
  trigger,
  title,
  contentClassName,
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
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className={contentClassName}>
        <DialogTitle>{title}</DialogTitle>
        {children}
      </DialogContent>
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
