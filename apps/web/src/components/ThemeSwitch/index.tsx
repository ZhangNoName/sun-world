import { SunButton } from '@sun-world/ui/button'
import { SunIcon } from '@sun-world/icons/react'
import { useTheme } from '@/shared/design'

export function ThemeSwitch() {
  const { theme, toggleTheme } = useTheme()
  return (
    <SunButton
      variant="icon"
      size="icon"
      aria-label="切换主题"
      onClick={toggleTheme}
    >
      <SunIcon name={theme === 'sun-dark' ? 'sun' : 'moon'} />
    </SunButton>
  )
}

export default ThemeSwitch
