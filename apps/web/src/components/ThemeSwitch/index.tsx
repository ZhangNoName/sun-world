import { SunButton } from '@sun-world/ui/button'
import { SunIcon } from '@sun-world/icons/react'
import { useTheme, type ColorMode, type DesignFamily } from '@/shared/design'

const families: Array<{ value: DesignFamily; label: string }> = [
  { value: 'sun-world', label: 'Sun World' },
  { value: 'apple', label: 'Apple' },
]
const modes: Array<{ value: ColorMode; label: string }> = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
]

export function ThemeSwitch() {
  const { family, mode, toggleFamily, setFamily, setMode } = useTheme()
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
        <div className="theme-switch__panel">
          <fieldset role="radiogroup">
            <legend>设计风格</legend>
            {families.map((option) => (
              <label key={option.value}>
                <input
                  type="radio"
                  name="design-family"
                  value={option.value}
                  checked={family === option.value}
                  onChange={() => setFamily(option.value)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </fieldset>
          <fieldset role="radiogroup">
            <legend>明暗模式</legend>
            {modes.map((option) => (
              <label key={option.value}>
                <input
                  type="radio"
                  name="color-mode"
                  value={option.value}
                  checked={mode === option.value}
                  onChange={() => setMode(option.value)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </fieldset>
        </div>
      </details>
    </div>
  )
}

export default ThemeSwitch
