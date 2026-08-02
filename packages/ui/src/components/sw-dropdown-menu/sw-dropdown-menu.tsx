import * as React from 'react'

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger as BaseDropdownMenuTrigger,
} from '@sun-world/base-ui/dropdown-menu'

type DropdownMenuTriggerProps = React.ComponentProps<
  typeof BaseDropdownMenuTrigger
> & {
  asChild?: boolean
}

function DropdownMenuTrigger({
  asChild = false,
  children,
  ...props
}: DropdownMenuTriggerProps) {
  return (
    <BaseDropdownMenuTrigger
      {...props}
      render={
        asChild
          ? (React.Children.only(children) as React.ReactElement)
          : undefined
      }
    >
      {asChild ? undefined : children}
    </BaseDropdownMenuTrigger>
  )
}

export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
}
