import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react'

export type ThemeName = 'sun-light' | 'sun-dark'

interface ThemeContextValue {
  theme: ThemeName
  setTheme: (theme: ThemeName) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function isThemeName(value: unknown): value is ThemeName {
  return value === 'sun-light' || value === 'sun-dark'
}

function initialTheme(): ThemeName {
  const stored = localStorage.getItem('theme')
  return isThemeName(stored) ? stored : 'sun-light'
}

function applyTheme(theme: ThemeName) {
  document.documentElement.classList.remove('sun-light', 'sun-dark')
  document.documentElement.classList.add(theme)
  document.documentElement.style.colorScheme =
    theme === 'sun-dark' ? 'dark' : 'light'
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const [theme, setTheme] = useState<ThemeName>(initialTheme)

  useEffect(() => {
    applyTheme(theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    const syncTheme = (event: StorageEvent) => {
      if (event.key === 'theme' && isThemeName(event.newValue)) {
        setTheme(event.newValue)
      }
    }
    window.addEventListener('storage', syncTheme)
    return () => window.removeEventListener('storage', syncTheme)
  }, [])

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      toggleTheme: () =>
        setTheme((current) =>
          current === 'sun-light' ? 'sun-dark' : 'sun-light'
        ),
    }),
    [theme]
  )

  return createElement(ThemeContext.Provider, { value }, children)
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within ThemeProvider')
  return context
}
