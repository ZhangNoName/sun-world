import { lazy, Suspense, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Outlet, useLocation, useMatches } from 'react-router'
import { SunIcon } from '@sun-world/icons/react'
import { Button } from '@sun-world/base-ui/button'

import { DialogPanel } from '@sun-world/ui/compound-controls'
import {
  RouteLoadingFallback,
  RouteLoadingIndicator,
} from '@/app/router/RouteLoadingIndicator'
import { useRouteLoading } from '@/app/router/use-route-loading'
import LanguageSwitch from '@/components/LanguageSwitch'
import ThemeSwitch from '@/components/ThemeSwitch'
import i18n from '@/i18n'
import { useDeviceStore } from '@/store/tg'
import type { RouteMeta } from '@/modules/types'
import { BackToTopButton } from './BackToTopButton'
import Footer from './footer'
import Header from './header'
import './layout.css'

const ManageLayout = lazy(
  () => import('@/modules/admin/components/ManageLayout')
)

const mobileLinks = [
  ['home', '/home', '首页'],
  ['canvas', '/canvas', '画布'],
  ['message-circle', '/aigc', 'AI'],
  ['user', '/me', '我的'],
] as const

export function AppLayout() {
  const { t } = useTranslation()
  const { isLoading } = useRouteLoading()
  const mobile = useDeviceStore((state) => state.isMobile)
  const matches = useMatches()
  const location = useLocation()
  const meta =
    (matches.at(-1)?.handle as { meta?: RouteMeta } | undefined)?.meta ?? {}
  const [drawer, setDrawer] = useState(false)
  const showBackToTop = !(meta.hideHeader && meta.hideFooter)
  const loadingLabel = t('status.loadingPage')
  useEffect(() => {
    setDrawer(false)
  }, [location.pathname])
  if (
    location.pathname === '/manage' ||
    location.pathname.startsWith('/manage/')
  ) {
    return (
      <>
        <RouteLoadingIndicator label={loadingLabel} />
        <Suspense
          fallback={
            <RouteLoadingFallback
              label={
                i18n.language?.startsWith('en')
                  ? 'Loading management center…'
                  : '正在加载管理中心…'
              }
            />
          }
        >
          <ManageLayout />
        </Suspense>
      </>
    )
  }

  if (!mobile) {
    return (
      <div className="app-container">
        <RouteLoadingIndicator label={loadingLabel} />
        <div className="desk-layout">
          {meta.hideHeader ? null : <Header />}
          <div
            className={`content ${meta.className ?? ''}`}
            aria-busy={isLoading || undefined}
          >
            <Suspense fallback={<RouteLoadingFallback label={loadingLabel} />}>
              <Outlet />
            </Suspense>
          </div>
          {showBackToTop ? (
            <BackToTopButton resetKey={location.pathname} />
          ) : null}
          {/* {meta.hideFooter ? null : <Footer />} */}
        </div>
      </div>
    )
  }

  return (
    <div className="app-container">
      <RouteLoadingIndicator label={loadingLabel} />
      <div className="mob-layout">
        {meta.hideHeader ? null : (
          <header className="mob-header theme-chrome">
            <Link to="/">
              <img src="/logo.svg" alt="Sun World" />
            </Link>
            <DialogPanel
              title="导航菜单"
              open={drawer}
              onOpenChange={setDrawer}
              overlayClassName="drawer-overlay"
              contentClassName="mob-drawer"
              trigger={
                <Button variant="ghost" size="icon" aria-label="菜单">
                  <SunIcon name="menu" />
                </Button>
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
                  <Link
                    key={path}
                    to={path}
                    aria-current={
                      location.pathname === path ? 'page' : undefined
                    }
                  >
                    {path.slice(1) || 'home'}
                  </Link>
                ))}
              </nav>
              <ThemeSwitch />
              <LanguageSwitch />
            </DialogPanel>
          </header>
        )}
        <div
          className={`main-container ${meta.className ?? ''}`}
          aria-busy={isLoading || undefined}
        >
          <Suspense fallback={<RouteLoadingFallback label={loadingLabel} />}>
            <Outlet />
          </Suspense>
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
        {showBackToTop ? (
          <BackToTopButton resetKey={location.pathname} />
        ) : null}
      </div>
    </div>
  )
}

export default AppLayout
