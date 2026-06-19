/**
 * Theme controller composable.
 *
 * Encapsulates theme storage, DOM application, and cross-tab synchronisation.
 * Components and layouts consume the theme ref through provide/inject
 * (key: 'theme') as before, but the logic lives here instead of App.vue.
 *
 * Usage:
 *   const { theme, toggleTheme } = useTheme()
 *   provide('theme', theme)
 */

import { ref, watch, onMounted, onUnmounted, type Ref } from 'vue'

export type ThemeName = 'sun-light' | 'sun-dark'

const STORAGE_KEY = 'theme'
const DEFAULT: ThemeName = 'sun-light'

function isThemeName(value: unknown): value is ThemeName {
  return value === 'sun-light' || value === 'sun-dark'
}

function getStoredTheme(): ThemeName | null {
  const stored = localStorage.getItem(STORAGE_KEY)
  return isThemeName(stored) ? stored : null
}

/**
 * Core theme composable.
 *
 * Returns a reactive theme ref and helpers. Reads the initial value from
 * localStorage and keeps it in sync with the `<html>` class list.
 * Listens for cross-tab changes via the `storage` event.
 */
export function useTheme(initial?: ThemeName): {
  theme: Ref<ThemeName>
  toggleTheme: () => void
} {
  const theme = ref<ThemeName>(getStoredTheme() || initial || DEFAULT)

  /** Apply the current theme to the document root. */
  const apply = () => {
    const html = document.documentElement
    html.classList.remove('sun-light', 'sun-dark')
    html.classList.add(theme.value)
    html.style.colorScheme = theme.value === 'sun-dark' ? 'dark' : 'light'
  }

  /** Toggle between sun-light and sun-dark. */
  const toggleTheme = () => {
    theme.value = theme.value === 'sun-light' ? 'sun-dark' : 'sun-light'
  }

  // Persist to localStorage and sync DOM whenever theme changes
  watch(theme, (newTheme) => {
    apply()
    localStorage.setItem(STORAGE_KEY, newTheme)
  }, { immediate: true })

  /** Cross-tab synchronisation */
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      const next = e.newValue
      if (isThemeName(next)) theme.value = next
    }
  }

  onMounted(() => {
    window.addEventListener('storage', onStorage)
  })

  onUnmounted(() => {
    window.removeEventListener('storage', onStorage)
  })

  return { theme, toggleTheme }
}
