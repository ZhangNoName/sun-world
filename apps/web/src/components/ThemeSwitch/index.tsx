import { Button } from '@sun-world/base-ui/button'
import { SunIcon } from '@sun-world/icons/react'
import { useTheme } from '@/shared/design'

export function ThemeSwitch() {
  const { resolvedMode, toggleMode } = useTheme()
  const dark = resolvedMode === 'dark'
  const destination = dark ? '浅色' : '深色'

  return (
    <div className="theme-switch">
      <Button
        className="theme-switch__quick"
        variant="ghost"
        size="icon"
        aria-label={`切换到${destination}模式`}
        onClick={toggleMode}
      >
        <SunIcon name={dark ? 'sun' : 'moon'} />
      </Button>
    </div>
  )
}

export default ThemeSwitch
