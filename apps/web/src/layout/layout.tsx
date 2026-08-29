import { lazy, Suspense, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Outlet, useLocation, useMatches } from 'react-router'
import { SunIcon } from '@sun-world/icons/react'
import { Button } from '@sun-world/base-ui/button'

import { DialogPanel } from '@sun-world/ui/compound-controls'
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

const navigationLinks = [
  ['/home', 'navigation.home'],
  ['/blog', 'navigation.blog'],
  ['/canvas', 'navigation.canvas'],
  ['/aigc', 'navigation.ai'],
  ['/tools', 'navigation.tools'],
  ['/video', 'navigation.video'],
  ['/me', 'navigation.account'],
] as const

const mobileLinks = [
  ['home', '/home', 'navigation.home'],
  ['canvas', '/canvas', 'navigation.canvas'],
  ['message-circle', '/aigc', 'navigation.ai'],
  ['user', '/me', 'navigation.account'],
] as const

export function AppLayout() {
  const { t } = useTranslation()
  const mobile = useDeviceStore((state) => state.isMobile)
  const matches = useMatches()
  const location = useLocation()
  const meta =
    (matches.at(-1)?.handle as { meta?: RouteMeta } | undefined)?.meta ?? {}
  const [drawer, setDrawer] = useState(false)
  const showBackToTop = !(meta.hideHeader && meta.hideFooter)
  useEffect(() => {
    setDrawer(false)
  }, [location.pathname])
  if (
    location.pathname === '/manage' ||
    location.pathname.startsWith('/manage/')
  ) {
    return (
      <Suspense
        fallback={
          <main className="manage-route-loading" role="status">
            {i18n.language?.startsWith('en')
              ? 'Loading management center…'
              : '正在加载管理中心…'}
          </main>
        }
      >
        <ManageLayout />
      </Suspense>
    )
  }

  if (!mobile) {
    return (
      <div className="app-container">
        <div className="desk-layout">
          {meta.hideHeader ? null : <Header />}
          <div className={`content ${meta.className ?? ''}`}>
            <Outlet />
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
      <div className="mob-layout">
        {meta.hideHeader ? null : (
          <header className="mob-header theme-chrome">
            <Link to="/">
              <img src="/logo.svg" alt="Sun World" />
            </Link>
            <DialogPanel
              title={t('navigation.menu')}
              open={drawer}
              onOpenChange={setDrawer}
              overlayClassName="drawer-overlay"
              contentClassName="mob-drawer"
              trigger={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('navigation.openMenu')}
                >
                  <SunIcon name="menu" />
                </Button>
              }
            >
              <nav>
                {navigationLinks.map(([path, labelKey]) => (
                  <Link
                    key={path}
                    to={path}
                    aria-current={
                      location.pathname === path ? 'page' : undefined
                    }
                  >
                    {t(labelKey)}
                  </Link>
                ))}
              </nav>
              <div
                className="mob-drawer-preferences"
                aria-label={t('navigation.preferences')}
              >
                <ThemeSwitch />
                <LanguageSwitch />
              </div>
            </DialogPanel>
          </header>
        )}
        <div className={`main-container ${meta.className ?? ''}`}>
          <Outlet />
        </div>
        {meta.hideFooter ? null : (
          <nav
            className="mob-footer theme-chrome"
            aria-label={t('navigation.mobile')}
          >
            {mobileLinks.map(([icon, path, labelKey]) => (
              <Link
                key={path}
                to={path}
                aria-label={t(labelKey)}
                aria-current={location.pathname === path ? 'page' : undefined}
              >
                <SunIcon name={icon} />
                <span>{t(labelKey)}</span>
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
