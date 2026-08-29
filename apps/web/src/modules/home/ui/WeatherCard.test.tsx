import { act, render } from '@testing-library/react'
import { vi } from 'vitest'

const axiosGet = vi.hoisted(() => vi.fn())

vi.mock('axios', () => ({ default: { get: axiosGet } }))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

import { HeFengWeatherData, getWeatherByHeFeng } from '@/util'
import { ensureWeatherIconStyles } from '../data/weather-icon-styles'
import { WeatherCard } from './WeatherCard'

const initialWeather = JSON.stringify(HeFengWeatherData)

function resetWeather() {
  Object.assign(HeFengWeatherData, JSON.parse(initialWeather))
}

describe('WeatherCard icon styles', () => {
  beforeEach(() => {
    resetWeather()
    axiosGet.mockReset()
    localStorage.removeItem('hfWeather')
    document.getElementById('qweather-icon-styles')?.remove()
  })

  afterEach(() => {
    resetWeather()
    document.getElementById('qweather-icon-styles')?.remove()
  })

  it('loads the icon stylesheet only after network weather succeeds', async () => {
    axiosGet.mockResolvedValue({
      data: {
        updateTime: new Date().toISOString(),
        fxLink: 'https://example.com/weather',
        now: {
          icon: '100',
          text: '晴',
          temp: '26',
          feelsLike: '27',
          windDir: '东风',
          windScale: '2',
          windSpeed: '8',
        },
        refer: { sources: [], license: [] },
      },
    })
    render(<WeatherCard />)

    expect(
      document.getElementById('qweather-icon-styles')
    ).not.toBeInTheDocument()

    await act(async () => {
      await getWeatherByHeFeng()
    })

    expect(axiosGet).toHaveBeenCalledTimes(1)
    expect(document.getElementById('qweather-icon-styles')).toHaveAttribute(
      'href',
      'https://cdn.jsdelivr.net/npm/qweather-icons@1.8.0/font/qweather-icons.css'
    )
  })

  it('injects the icon stylesheet idempotently', () => {
    const first = ensureWeatherIconStyles()
    const second = ensureWeatherIconStyles()

    expect(second).toBe(first)
    expect(document.querySelectorAll('#qweather-icon-styles')).toHaveLength(1)
  })
})
