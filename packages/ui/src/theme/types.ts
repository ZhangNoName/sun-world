export interface SunTheme {
  primaryColor?: string
  dangerColor?: string
  successColor?: string
  warningColor?: string
  radius?: string
}

export interface SunThemeProviderProps {
  theme?: SunTheme
}

export type SunThemeVars = Record<string, string>
