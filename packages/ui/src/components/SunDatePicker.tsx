import { useId, type ChangeEvent } from 'react'

import '../styles/base.css'
import '../styles/date-picker.css'

export type SunDateRangeValue = [string, string]
export type SunDatePickerValue = string | SunDateRangeValue | null

export interface SunDatePickerProps {
  value?: SunDatePickerValue
  onValueChange?: (value: SunDatePickerValue) => void
  type?: 'date' | 'daterange'
  label?: string
  placeholder?: string
  disabled?: boolean
  clearable?: boolean
}

export function SunDatePicker({
  value = null,
  onValueChange,
  type = 'date',
  label,
  placeholder,
  disabled,
  clearable,
}: SunDatePickerProps) {
  const id = useId()
  const update = (next: SunDatePickerValue) => {
    if (!disabled) onValueChange?.(next)
  }
  if (type === 'daterange') {
    const range: SunDateRangeValue = Array.isArray(value) ? value : ['', '']
    return (
      <span className="sun-ui-field">
        {label ? <span className="sun-ui-label">{label}</span> : null}
        <span className="sun-date-picker sun-date-picker--range">
          {([0, 1] as const).map((index) => (
            <input
              key={index}
              className="sun-date-picker__input"
              type="date"
              value={range[index]}
              disabled={disabled}
              aria-label={
                index === 0
                  ? `${label ?? 'Date'} start`
                  : `${label ?? 'Date'} end`
              }
              onChange={(event) => {
                const next: SunDateRangeValue = [...range]
                next[index] = event.target.value
                update(next)
              }}
            />
          ))}
        </span>
      </span>
    )
  }
  const stringValue = typeof value === 'string' ? value : ''
  const handleChange = (event: ChangeEvent<HTMLInputElement>) =>
    update(event.target.value || null)
  return (
    <span className="sun-ui-field">
      {label ? (
        <label className="sun-ui-label" htmlFor={id}>
          {label}
        </label>
      ) : null}
      <span className="sun-date-picker">
        <input
          id={id}
          className="sun-date-picker__input"
          type="date"
          value={stringValue}
          placeholder={placeholder}
          disabled={disabled}
          aria-label={label}
          onChange={handleChange}
        />
        {clearable && stringValue ? (
          <button
            type="button"
            aria-label="Clear date"
            onClick={() => update(null)}
          >
            ×
          </button>
        ) : null}
      </span>
    </span>
  )
}
