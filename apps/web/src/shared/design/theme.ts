import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react'

export type DesignFamily = 'sun-world' | 'apple'
export type ColorMode = 'light' | 'dark' | 'system'
export type ResolvedColorMode = Exclude<ColorMode, 'system'>
export interface ThemePreference {
  family: DesignFamily
  mode: ColorMode
}

interface ThemeContextValue extends ThemePreference {
  resolvedMode: ResolvedColorMode
  setFamily: (family: DesignFamily) => void
  setMode: (mode: ColorMode) => void
  toggleFamily: () => void
}

const STORAGE_KEY = 'sun-world-theme'
const LEGACY_STORAGE_KEY = 'theme'
const DEFAULT_PREFERENCE: ThemePreference = {
  family: 'sun-world',
  mode: 'system',
}
const ThemeContext = createContext<ThemeContextValue | null>(null)

function isFamily(value: unknown): value is DesignFamily {
  return value === 'sun-world' || value === 'apple'
}

function isMode(value: unknown): value is ColorMode {
  return value === 'light' || value === 'dark' || value === 'system'
}

function parsePreference(value: string | null): ThemePreference | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as Partial<ThemePreference>
    return isFamily(parsed.family) && isMode(parsed.mode)
      ? { family: parsed.family, mode: parsed.mode }
      : null
  } catch {
    return null
  }
}

function initialPreference(): ThemePreference {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_PREFERENCE
    const stored = parsePreference(localStorage.getItem(STORAGE_KEY))
    if (stored) return stored
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (legacy === 'sun-light' || legacy === 'sun-dark') {
      return { family: 'sun-world', mode: legacy === 'sun-dark' ? 'dark' : 'light' }
    }
  } catch {
    return DEFAULT_PREFERENCE
  }
  return DEFAULT_PREFERENCE
}

function systemMode(): ResolvedColorMode {
  return typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

function applyTheme(family: DesignFamily, mode: ResolvedColorMode) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.dataset.design = family
  root.dataset.colorMode = mode
  root.classList.toggle('sun-light', mode === 'light')
  root.classList.toggle('sun-dark', mode === 'dark')
  root.style.colorScheme = mode
}

function persistTheme(preference: ThemePreference) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preference))
    localStorage.removeItem(LEGACY_STORAGE_KEY)
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const [preference, setPreference] = useState(initialPreference)
  const [systemPreference, setSystemPreference] = useState(systemMode)
  const resolvedMode =
    preference.mode === 'system' ? systemPreference : preference.mode

  useEffect(() => {
    applyTheme(preference.family, resolvedMode)
    persistTheme(preference)
  }, [preference, resolvedMode])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const syncSystem = (event: MediaQueryListEvent) =>
      setSystemPreference(event.matches ? 'dark' : 'light')
    query.addEventListener('change', syncSystem)
    return () => query.removeEventListener('change', syncSystem)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const syncTheme = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return
      const next = parsePreference(event.newValue)
      if (next) setPreference(next)
    }
    window.addEventListener('storage', syncTheme)
    return () => window.removeEventListener('storage', syncTheme)
  }, [])

  const setFamily = useCallback(
    (family: DesignFamily) => setPreference((current) => ({ ...current, family })),
    []
  )
  const setMode = useCallback(
    (mode: ColorMode) => setPreference((current) => ({ ...current, mode })),
    []
  )
  const toggleFamily = useCallback(
    () =>
      setPreference((current) => ({
        ...current,
        family: current.family === 'sun-world' ? 'apple' : 'sun-world',
      })),
    []
  )

  const value = useMemo(
    () => ({
      ...preference,
      resolvedMode,
      setFamily,
      setMode,
      toggleFamily,
    }),
    [preference, resolvedMode, setFamily, setMode, toggleFamily]
  )

  return createElement(ThemeContext.Provider, { value }, children)
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within ThemeProvider')
  return context
}
