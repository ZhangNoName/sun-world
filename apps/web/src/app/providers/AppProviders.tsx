import { useEffect, type PropsWithChildren } from 'react'
import { I18nextProvider } from 'react-i18next'
import { ToastProvider } from '@sun-world/ui/toast'

import i18n, { setLocale, type AppLocale } from '@/i18n'
import { ThemeProvider } from '@/shared/design/theme'
import { useAuthStore } from '@/store/auth'
import { installDeviceListener } from '@/store/tg'
import { AppErrorBoundary } from '../errors/AppErrorBoundary'

export function AppProviders({ children }: PropsWithChildren) {
  const restoreSession = useAuthStore((state) => state.restoreSession)

  useEffect(() => installDeviceListener(), [])

  useEffect(() => {
    void restoreSession()
  }, [restoreSession])

  useEffect(() => {
    const syncLocale = (event: StorageEvent) => {
      if (event.key === 'locale') {
        void setLocale(event.newValue === 'en' ? 'en' : ('zh' as AppLocale))
      }
    }
    window.addEventListener('storage', syncLocale)
    return () => window.removeEventListener('storage', syncLocale)
  }, [])

  return (
    <AppErrorBoundary>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider>
          {children}
          <ToastProvider />
        </ThemeProvider>
      </I18nextProvider>
    </AppErrorBoundary>
  )
}
