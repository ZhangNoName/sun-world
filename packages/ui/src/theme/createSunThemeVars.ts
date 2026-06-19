import type { SunTheme, SunThemeVars } from '../contracts/theme'

export function createSunThemeVars(theme: SunTheme = {}): SunThemeVars {
  const vars: SunThemeVars = {}

  if (theme.primaryColor) vars['--sun-ui-color-primary'] = theme.primaryColor
  if (theme.dangerColor) vars['--sun-ui-color-danger'] = theme.dangerColor
  if (theme.successColor) vars['--sun-ui-color-success'] = theme.successColor
  if (theme.warningColor) vars['--sun-ui-color-warning'] = theme.warningColor
  if (theme.radius) vars['--sun-ui-radius'] = theme.radius

  return vars
}
