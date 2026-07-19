import { SunButton } from '@sun-world/ui/button'
import { SunIcon } from '@sun-world/icons/react'
import { lazy, Suspense } from 'react'
import { useTheme } from '@/shared/design'

const ThemeOptions = lazy(() => import('./ThemeOptions'))

export function ThemeSwitch() {
  const { family, toggleFamily } = useTheme()
  const destination = family === 'sun-world' ? 'Apple' : 'Sun World'

  return (
    <div className="theme-switch">
      <SunButton
        className="theme-switch__quick"
        variant="icon"
        size="icon"
        aria-label={`切换到 ${destination} 风格`}
        onClick={toggleFamily}
      >
        <SunIcon name={family === 'apple' ? 'sun' : 'moon'} />
      </SunButton>
      <details className="theme-switch__details">
        <summary aria-label="打开主题选项">主题选项</summary>
        <Suspense
          fallback={<span className="theme-switch__loading">加载中</span>}
        >
          <ThemeOptions />
        </Suspense>
      </details>
    </div>
  )
}

export default ThemeSwitch
