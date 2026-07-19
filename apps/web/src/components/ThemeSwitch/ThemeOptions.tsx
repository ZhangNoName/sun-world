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
  )
}
