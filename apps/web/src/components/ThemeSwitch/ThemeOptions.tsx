import { Button } from '@sun-world/ui/button'
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

export default function ThemeOptions() {
  const { family, mode, setFamily, setMode } = useTheme()
  return (
    <div className="theme-switch__panel">
      <fieldset>
        <legend>设计风格</legend>
        <div role="radiogroup" aria-label="设计风格">
          {families.map((option) => (
            <Button
              key={option.value}
              role="radio"
              aria-checked={family === option.value}
              variant={family === option.value ? 'default' : 'outline'}
              onClick={() => setFamily(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>明暗模式</legend>
        <div role="radiogroup" aria-label="明暗模式">
          {modes.map((option) => (
            <Button
              key={option.value}
              role="radio"
              aria-checked={mode === option.value}
              variant={mode === option.value ? 'default' : 'outline'}
              onClick={() => setMode(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </fieldset>
    </div>
  )
}
