import { useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'

import { SunIcon } from '@sun-world/icons/react'
import { Button } from '@sun-world/base-ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@sun-world/ui/sw-dropdown-menu'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarProvider,
} from '@sun-world/ui/sw-sidebar'

import { useAuthStore } from '@/store/auth'
import ThemeSwitch from '@/components/ThemeSwitch'
import { useManageCopy, type ManageCopy } from '../manageCopy'
import { AdminRouteGuard } from './AdminRouteGuard'
import { ManageLanguageSwitch } from './ManageLanguageSwitch'
import './manage-layout.css'

type ManageIconName =
  | 'home'
  | 'list'
  | 'file-text'
  | 'message-circle'
  | 'settings'
  | 'calendar'
  | 'tag'
  | 'user'
  | 'panel-left'
  | 'panel-left-open'
  | 'menu'
  | 'chevron-down'
  | 'chevron-right'
  | 'x'
  | 'arrow'
  | 'refresh-cw'

export interface ManageNavItem {
  labelKey: keyof ManageCopy['nav']
  icon: ManageIconName
  route?: string
  children?: ManageNavItem[]
}

export const manageNavTree: ManageNavItem[] = [
  {
    labelKey: 'workbench',
    icon: 'home',
    children: [
      { labelKey: 'overview', icon: 'home', route: '/manage' },
      { labelKey: 'requestMetrics', icon: 'list', route: '/manage/metrics' },
    ],
  },
  {
    labelKey: 'content',
    icon: 'file-text',
    children: [
      {
        labelKey: 'blog',
        icon: 'file-text',
        route: '/manage/content/blog',
      },
    ],
  },
  {
    labelKey: 'ai',
    icon: 'message-circle',
    children: [
      {
        labelKey: 'models',
        icon: 'list',
        route: '/manage/ai/models',
      },
    ],
  },
  {
    labelKey: 'system',
    icon: 'settings',
    children: [
      {
        labelKey: 'dictionaries',
        icon: 'tag',
        route: '/manage/system/dictionaries',
      },
      { labelKey: 'auditLogs', icon: 'calendar', route: '/manage/system/logs' },
    ],
  },
]

const COLLAPSED_STORAGE_KEY = 'sun-world.manage.sidebar.collapsed'
const HIDDEN_STORAGE_KEY = 'sun-world.manage.sidebar.hidden'
const LEGACY_MANAGE_REDIRECTS: Record<string, string> = {
  '/manage/blog': '/manage/content/blog',
  '/manage/aigc': '/manage/ai/models',
  '/manage/ai/providers': '/manage/ai/models',
  '/manage/logs': '/manage/system/logs',
}

function readPreference(key: string) {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(key) === 'true'
}

export function ManageLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const copy = useManageCopy()
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const [collapsed, setCollapsed] = useState(() =>
    readPreference(COLLAPSED_STORAGE_KEY)
  )
  const [hidden, setHidden] = useState(() => readPreference(HIDDEN_STORAGE_KEY))
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const target = LEGACY_MANAGE_REDIRECTS[location.pathname]
    if (target) navigate(target, { replace: true })
  }, [location.pathname, navigate])

  useEffect(() => {
    window.localStorage.setItem(COLLAPSED_STORAGE_KEY, String(collapsed))
  }, [collapsed])
  useEffect(() => {
    window.localStorage.setItem(HIDDEN_STORAGE_KEY, String(hidden))
  }, [hidden])
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  const activeItem = useMemo(
    () => findNavItem(manageNavTree, location.pathname),
    [location.pathname]
  )
  const pageLabel = activeItem
    ? copy.nav[activeItem.labelKey]
    : copy.breadcrumb.overview
  useEffect(() => {
    document.title = `${pageLabel} - ${copy.brand}`
  }, [copy.brand, pageLabel])
  const displayName = user?.name || user?.username || 'Administrator'
  const roleCode = String(user?.roles?.[0]?.code || '').toLowerCase()
  const roleLabel =
    roleCode === 'admin' || !roleCode ? copy.account.adminRole : roleCode
  const initials = getInitials(displayName)
  const sidebarCollapsed = collapsed && !mobileOpen

  const signOut = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <SidebarProvider
      className="manage-shell"
      open={!collapsed}
      onOpenChange={(open) => setCollapsed(!open)}
      data-sidebar-collapsed={sidebarCollapsed || undefined}
      data-sidebar-hidden={hidden || undefined}
    >
      {mobileOpen ? (
        <Button
          className="manage-mobile-backdrop"
          variant="ghost"
          type="button"
          aria-label={copy.aria.closeNavigation}
          onClick={() => setMobileOpen(false)}
        />
      ) : null}
      {!hidden ? (
        <Sidebar
          className="manage-sidebar"
          collapsible="icon"
          mobileOpen={mobileOpen}
          role="complementary"
          aria-label={copy.aria.navigation}
        >
          <SidebarHeader className="manage-sidebar__header">
            <div className="manage-sidebar__toolbar">
              <Button
                className="manage-sidebar-toggle"
                variant="ghost"
                type="button"
                aria-label={
                  mobileOpen
                    ? copy.aria.closeNavigation
                    : collapsed
                      ? copy.aria.expandSidebar
                      : copy.aria.collapseSidebar
                }
                title={
                  mobileOpen
                    ? copy.aria.closeNavigation
                    : collapsed
                      ? copy.aria.expandSidebar
                      : copy.aria.collapseSidebar
                }
                onClick={() => {
                  if (mobileOpen) {
                    setMobileOpen(false)
                    return
                  }
                  setCollapsed((current) => !current)
                }}
              >
                <SunIcon
                  name={
                    mobileOpen
                      ? 'x'
                      : collapsed
                        ? 'panel-left-open'
                        : 'panel-left'
                  }
                />
                <span className="manage-sidebar-toggle__label">
                  {mobileOpen
                    ? copy.aria.closeNavigation
                    : collapsed
                      ? copy.aria.expandSidebar
                      : copy.aria.collapseSidebar}
                </span>
              </Button>
              <Button
                className="manage-sidebar-hide"
                variant="ghost"
                size="icon"
                type="button"
                aria-label={copy.aria.hideSidebar}
                title={copy.aria.hideSidebar}
                onClick={() => setHidden(true)}
              >
                <SunIcon name="panel-left" />
              </Button>
            </div>
            <Link to="/manage" className="manage-brand-link">
              <span className="manage-brand-mark">SW</span>
              <span>{copy.brand}</span>
            </Link>
          </SidebarHeader>
          <SidebarContent className="manage-sidebar__scroll">
            <nav className="manage-nav">
              <ManageNavTree
                items={manageNavTree}
                collapsed={sidebarCollapsed}
                pathname={location.pathname}
                copy={copy}
              />
            </nav>
          </SidebarContent>
          <SidebarFooter className="manage-sidebar__footer">
            <div className="manage-theme-switch">
              <ThemeSwitch />
            </div>
            <ManageLanguageSwitch collapsed={sidebarCollapsed} />
            <ManageUserMenu
              collapsed={sidebarCollapsed}
              displayName={displayName}
              roleLabel={roleLabel}
              initials={initials}
              copy={copy}
              onProfile={() => navigate('/me')}
              onSettings={() => navigate('/me#settings')}
              onPublicSite={() => navigate('/')}
              onSignOut={() => void signOut()}
            />
          </SidebarFooter>
        </Sidebar>
      ) : null}

      <SidebarInset className="manage-main">
        {!hidden ? (
          <Button
            className="manage-mobile-menu"
            variant="ghost"
            size="icon"
            aria-label={copy.aria.openNavigation}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(true)}
          >
            <SunIcon name="menu" />
          </Button>
        ) : (
          <Button
            className="manage-sidebar-restore"
            variant="ghost"
            size="icon"
            aria-label={copy.aria.restoreSidebar}
            title={copy.aria.restoreSidebar}
            onClick={() => setHidden(false)}
          >
            <SunIcon name="panel-left-open" />
          </Button>
        )}

        <div className="manage-main__inner">
          <div className="manage-breadcrumbs" aria-label={copy.aria.breadcrumb}>
            <Link to="/manage">{copy.breadcrumb.manage}</Link>
            <span aria-hidden="true">/</span>
            <span>{pageLabel}</span>
          </div>
          <AdminRouteGuard>
            <Outlet />
          </AdminRouteGuard>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

function ManageNavTree({
  items,
  collapsed,
  pathname,
  copy,
  level = 0,
}: {
  items: ManageNavItem[]
  collapsed: boolean
  pathname: string
  copy: ManageCopy
  level?: number
}) {
  return (
    <SidebarMenu className="manage-nav-tree" role={level ? 'group' : undefined}>
      {items.map((item) => (
        <ManageNavNode
          key={`${item.labelKey}-${item.route ?? level}`}
          item={item}
          collapsed={collapsed}
          pathname={pathname}
          copy={copy}
          level={level}
        />
      ))}
    </SidebarMenu>
  )
}

function ManageNavNode({
  item,
  collapsed,
  pathname,
  copy,
  level,
}: {
  item: ManageNavItem
  collapsed: boolean
  pathname: string
  copy: ManageCopy
  level: number
}) {
  const label = copy.nav[item.labelKey]
  const hasChildren = Boolean(item.children?.length)
  const isActive = item.route === pathname
  const hasActiveChild =
    item.children?.some(
      (child) =>
        child.route === pathname ||
        child.children?.some((nested) => nested.route === pathname)
    ) ?? false
  const [open, setOpen] = useState(hasActiveChild)

  useEffect(() => {
    if (hasActiveChild) setOpen(true)
  }, [hasActiveChild])

  if (hasChildren) {
    return (
      <SidebarMenuItem
        className={`manage-nav-node manage-nav-node--branch${open ? ' is-open' : ''}`}
      >
        <SidebarMenuButton
          type="button"
          className="manage-nav-item"
          aria-expanded={open}
          aria-label={collapsed ? label : undefined}
          style={{
            paddingInlineStart: collapsed
              ? undefined
              : `${0.75 + level * 0.75}rem`,
          }}
          onClick={() => setOpen((current) => !current)}
        >
          <SunIcon name={item.icon} />
          {!collapsed ? <span>{label}</span> : null}
          {!collapsed ? (
            <SunIcon
              className="manage-nav-item__chevron"
              name={open ? 'chevron-down' : 'chevron-right'}
              size="sm"
            />
          ) : null}
        </SidebarMenuButton>
        {open ? (
          <SidebarMenuSub className="manage-nav-sub">
            <ManageNavTree
              items={item.children!}
              collapsed={collapsed}
              pathname={pathname}
              copy={copy}
              level={level + 1}
            />
          </SidebarMenuSub>
        ) : null}
      </SidebarMenuItem>
    )
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        className={`manage-nav-item${isActive ? ' is-active' : ''}`}
        isActive={isActive}
      >
        <NavLink
          to={item.route!}
          end={item.route === '/manage'}
          aria-label={collapsed ? label : undefined}
          style={{
            paddingInlineStart: collapsed
              ? undefined
              : `${0.75 + level * 0.75}rem`,
          }}
        >
          <SunIcon name={item.icon} />
          {!collapsed ? <span>{label}</span> : null}
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

function ManageUserMenu({
  collapsed,
  displayName,
  roleLabel,
  initials,
  copy,
  onProfile,
  onSettings,
  onPublicSite,
  onSignOut,
}: {
  collapsed: boolean
  displayName: string
  roleLabel: string
  initials: string
  copy: ManageCopy
  onProfile: () => void
  onSettings: () => void
  onPublicSite: () => void
  onSignOut: () => void
}) {
  return (
    <div className="manage-user-menu">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            className="manage-user-trigger"
            variant="ghost"
            aria-label={copy.account.menu(displayName)}
          >
            <span className="manage-avatar" aria-hidden="true">
              {initials}
            </span>
            {!collapsed ? (
              <span className="manage-user-trigger__copy">
                <strong>{displayName}</strong>
                <small>{roleLabel}</small>
              </span>
            ) : null}
            {!collapsed ? (
              <SunIcon
                className="manage-user-trigger__chevron"
                name="chevron-down"
                size="sm"
              />
            ) : null}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="top"
          align={collapsed ? 'center' : 'start'}
          className="manage-account-menu"
        >
          <DropdownMenuItem onClick={onProfile}>
            <SunIcon name="user" />
            {copy.account.profile}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onSettings}>
            <SunIcon name="settings" />
            {copy.account.settings}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onPublicSite}>
            <SunIcon name="home" />
            {copy.account.publicSite}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={onSignOut}>
            <SunIcon name="arrow" />
            {copy.account.signOut}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function findNavItem(
  items: ManageNavItem[],
  pathname: string
): ManageNavItem | undefined {
  for (const item of items) {
    if (item.route === pathname) return item
    const match = item.children
      ? findNavItem(item.children, pathname)
      : undefined
    if (match) return match
  }
  return undefined
}

function getInitials(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'A'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts.at(-1)?.[0] ?? ''}`.toUpperCase()
}

export default ManageLayout
