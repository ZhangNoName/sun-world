const QWEATHER_ICON_STYLES_ID = 'qweather-icon-styles'
const QWEATHER_ICON_STYLES_URL =
  'https://cdn.jsdelivr.net/npm/qweather-icons@1.8.0/font/qweather-icons.css'

export function ensureWeatherIconStyles(): HTMLLinkElement | null {
  if (typeof document === 'undefined') return null

  const existing = document.getElementById(QWEATHER_ICON_STYLES_ID)
  if (existing instanceof HTMLLinkElement) return existing

  const stylesheet = document.createElement('link')
  stylesheet.id = QWEATHER_ICON_STYLES_ID
  stylesheet.rel = 'stylesheet'
  stylesheet.href = QWEATHER_ICON_STYLES_URL
  document.head.append(stylesheet)
  return stylesheet
}
