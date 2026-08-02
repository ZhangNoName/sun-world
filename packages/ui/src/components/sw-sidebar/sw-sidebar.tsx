import * as React from 'react'

import {
  Sidebar as BaseSidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton as BaseSidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from '@sun-world/base-ui/sidebar'

type SidebarProps = React.ComponentProps<typeof BaseSidebar> & {
  mobileOpen?: boolean
}

function Sidebar({ mobileOpen, ...props }: SidebarProps) {
  const { setOpenMobile } = useSidebar()

  React.useEffect(() => {
    if (mobileOpen !== undefined) setOpenMobile(mobileOpen)
  }, [mobileOpen, setOpenMobile])

  return <BaseSidebar {...props} />
}

type SidebarMenuButtonProps = React.ComponentProps<
  typeof BaseSidebarMenuButton
> & {
  asChild?: boolean
}

function SidebarMenuButton({
  asChild = false,
  children,
  render,
  ...props
}: SidebarMenuButtonProps) {
  return (
    <BaseSidebarMenuButton
      {...props}
      render={
        asChild ? (React.Children.only(children) as React.ReactElement) : render
      }
    >
      {asChild ? undefined : children}
    </BaseSidebarMenuButton>
  )
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
}
