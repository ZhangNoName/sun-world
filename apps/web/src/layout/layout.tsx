import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation, useMatches } from 'react-router'
import { SunIcon } from '@sun-world/icons/react'
import { SunButton } from '@sun-world/ui/button'
import { SunDialog } from '@sun-world/ui/dialog'

import LanguageSwitch from '@/components/LanguageSwitch'
import ThemeSwitch from '@/components/ThemeSwitch'
import { useDeviceStore } from '@/store/tg'
import type { RouteMeta } from '@/modules/types'
import Footer from './footer'
import Header from './header'
import './layout.css'

const mobileLinks = [
  ['home', '/home', '首页'],
  ['canvas', '/canvas', '画布'],
  ['message-circle', '/aigc', 'AI'],
  ['user', '/me', '我的'],
] as const

export function AppLayout() {
  const mobile = useDeviceStore((state) => state.isMobile)
  const matches = useMatches()
  const location = useLocation()
  const meta =
    (matches.at(-1)?.handle as { meta?: RouteMeta } | undefined)?.meta ?? {}
  const [drawer, setDrawer] = useState(false)
  useEffect(() => {
    setDrawer(false)
  }, [location.pathname])

  if (!mobile) {
    return (
      <div className="app-container">
        <div className="desk-layout">
          {meta.hideHeader ? null : <Header />}
          <div className={`content ${meta.className ?? ''}`}>
            <Outlet />
          </div>
          {meta.hideFooter ? null : <Footer />}
        </div>
      </div>
    )
  }

  return (
    <div className="app-container">
      <div className="mob-layout">
        {meta.hideHeader ? null : (
          <header className="mob-header theme-chrome">
            <Link to="/">
              <img src="/logo.svg" alt="Sun World" />
            </Link>
            <SunDialog
              title="导航菜单"
              open={drawer}
              onOpenChange={setDrawer}
              overlayClassName="drawer-overlay"
              contentClassName="mob-drawer"
              trigger={
                <SunButton variant="icon" size="icon" aria-label="菜单">
                  <SunIcon name="menu" />
                </SunButton>
              }
            >
              <nav>
                {[
                  '/home',
                  '/blog',
                  '/canvas',
                  '/aigc',
                  '/tools',
                  '/video',
                  '/me',
                ].map((path) => (
                  <Link key={path} to={path}>
                    {path.slice(1) || 'home'}
                  </Link>
                ))}
              </nav>
              <ThemeSwitch />
              <LanguageSwitch />
            </SunDialog>
          </header>
        )}
        <div className={`main-container ${meta.className ?? ''}`}>
          <Outlet />
        </div>
        {meta.hideFooter ? null : (
          <nav className="mob-footer theme-chrome" aria-label="移动导航">
            {mobileLinks.map(([icon, path, label]) => (
              <Link
                key={path}
                to={path}
                aria-current={location.pathname === path ? 'page' : undefined}
              >
                <SunIcon name={icon} />
                <span>{label}</span>
              </Link>
            ))}
          </nav>
        )}
      </div>
    </div>
  )
}

export default AppLayout
