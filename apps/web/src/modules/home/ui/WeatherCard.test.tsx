import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

import { ensureWeatherIconStyles } from '../data/weather-icon-styles'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
import { WeatherCard } from './WeatherCard'

describe('WeatherCard', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.getElementById('qweather-icon-styles')?.remove()
  })

  it('does not request geolocation before the user asks for weather', () => {
    const loadWeather = vi.fn()
    render(<WeatherCard loadWeather={loadWeather} />)

    expect(loadWeather).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'weather.load' })).toBeVisible()
    expect(
      document.getElementById('qweather-icon-styles')
    ).not.toBeInTheDocument()
  })

  it('renders weather after an explicit user action', async () => {
    const loadWeather = vi.fn().mockResolvedValue({
      cachedAt: Date.now(),
      locationLabel: '中国 河南省 郑州市',
      fxLink: 'https://example.com/weather',
      weather: {
        temp: '26',
        feelsLike: '27',
        icon: '100',
        text: '晴',
        windDir: '东风',
        windScale: '2级',
        windSpeed: '8',
      },
    })
    render(<WeatherCard loadWeather={loadWeather} />)

    await userEvent.click(screen.getByRole('button', { name: 'weather.load' }))

    const metrics = await screen.findByLabelText('weather.details')
    expect(metrics.children).toHaveLength(4)
    expect(screen.getByText('26 °C')).toBeVisible()
    expect(screen.getByText('中国 河南省 郑州市')).toBeVisible()
    expect(loadWeather).toHaveBeenCalledTimes(1)
    expect(document.getElementById('qweather-icon-styles')).toHaveAttribute(
      'href',
      'https://cdn.jsdelivr.net/npm/qweather-icons@1.8.0/font/qweather-icons.css'
    )
  })

  it('shows an actionable error without empty units', async () => {
    const loadWeather = vi.fn().mockRejectedValue(new Error('denied'))
    render(<WeatherCard loadWeather={loadWeather} />)

    await userEvent.click(screen.getByRole('button', { name: 'weather.load' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'weather.unavailable'
    )
    expect(screen.queryByText('°C')).not.toBeInTheDocument()
  })

  it('injects the weather icon stylesheet idempotently', () => {
    const first = ensureWeatherIconStyles()
    const second = ensureWeatherIconStyles()

    expect(second).toBe(first)
    expect(document.querySelectorAll('#qweather-icon-styles')).toHaveLength(1)
  })
})
