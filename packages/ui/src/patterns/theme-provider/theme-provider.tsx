import type { CSSProperties, ReactNode } from 'react'

import type { SunTheme } from '../../theme/types'
import { createSunThemeVars } from '../../theme/createSunThemeVars'
import '../../styles/base.css'
import './theme-provider.css'

export function SunThemeProvider({
  theme = {},
  children,
}: {
  theme?: SunTheme
  children?: ReactNode
}) {
  return (
    <div
      data-testid="sun-theme-provider"
      className="sun-theme-provider"
      style={createSunThemeVars(theme) as CSSProperties}
    >
      {children}
    </div>
  )
}
