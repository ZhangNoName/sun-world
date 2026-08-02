import { Button } from '@sun-world/base-ui/button'
import { useTheme, type ColorMode } from '@/shared/design'

const modes: Array<{ value: ColorMode; label: string }> = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
]

export default function ThemeOptions() {
  const { mode, setMode } = useTheme()
  return (
    <div className="theme-switch__panel">
      <fieldset>
        <legend>颜色模式</legend>
        <div role="radiogroup" aria-label="颜色模式">
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
