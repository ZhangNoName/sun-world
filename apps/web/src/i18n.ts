import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from '@/locales/en.json'
import zh from '@/locales/zh.json'

export type AppLocale = 'zh' | 'en'

const storedLocale =
  typeof window === 'undefined' ? null : window.localStorage.getItem('locale')
const initialLocale: AppLocale = storedLocale === 'en' ? 'en' : 'zh'

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, zh: { translation: zh } },
  lng: initialLocale,
  fallbackLng: 'zh',
  interpolation: { escapeValue: false },
})

if (typeof document !== 'undefined') {
  document.documentElement.lang = initialLocale === 'zh' ? 'zh-CN' : 'en'
}

export async function setLocale(locale: AppLocale) {
  await i18n.changeLanguage(locale)
  if (typeof window !== 'undefined')
    window.localStorage.setItem('locale', locale)
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
  }
}

export default i18n
