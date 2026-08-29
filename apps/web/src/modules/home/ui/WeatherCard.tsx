import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@sun-world/base-ui/button'

import {
  fetchLocalWeather,
  readCachedLocalWeather,
  type LocalWeatherSnapshot,
} from '../data/local-weather'

type WeatherState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; snapshot: LocalWeatherSnapshot }
  | { status: 'error' }

interface WeatherCardProps {
  loadWeather?: typeof fetchLocalWeather
}

export function WeatherCard({
  loadWeather = fetchLocalWeather,
}: WeatherCardProps) {
  const { t } = useTranslation()
  const requestRef = useRef<AbortController | null>(null)
  const [state, setState] = useState<WeatherState>(() => {
    const cached = readCachedLocalWeather()
    return cached ? { status: 'loaded', snapshot: cached } : { status: 'idle' }
  })

  useEffect(
    () => () => {
      requestRef.current?.abort()
    },
    []
  )

  const handleLoadWeather = () => {
    requestRef.current?.abort()
    const request = new AbortController()
    requestRef.current = request
    setState({ status: 'loading' })
    void loadWeather(request.signal).then(
      (snapshot) => {
        if (!request.signal.aborted) setState({ status: 'loaded', snapshot })
      },
      () => {
        if (!request.signal.aborted) setState({ status: 'error' })
      }
    )
  }

  if (state.status !== 'loaded') {
    return (
      <section
        className="weather-card weather-card-status"
        aria-label={t('weather.current')}
      >
        <p role={state.status === 'error' ? 'alert' : 'status'}>
          {state.status === 'error'
            ? t('weather.unavailable')
            : t('weather.permissionHint')}
        </p>
        <Button
          type="button"
          variant="outline"
          disabled={state.status === 'loading'}
          onClick={handleLoadWeather}
        >
          {state.status === 'loading'
            ? t('weather.loading')
            : t('weather.load')}
        </Button>
      </section>
    )
  }

  const { snapshot } = state
  const { weather } = snapshot
  return (
    <section className="weather-card" aria-label={t('weather.current')}>
      <a href={snapshot.fxLink} target="_blank" rel="noreferrer">
        <i className={`qi qi-${weather.icon}`} title={weather.text} />
      </a>
      <p>{snapshot.locationLabel}</p>
      <dl className="weather-metrics" aria-label={t('weather.details')}>
        <div>
          <dt>{t('weather.temp')}</dt>
          <dd>{weather.temp} °C</dd>
        </div>
        <div>
          <dt>{t('weather.feelsLike')}</dt>
          <dd>{weather.feelsLike} °C</dd>
        </div>
        <div>
          <dt>{weather.windDir}</dt>
          <dd>{weather.windScale}</dd>
        </div>
        <div>
          <dt>{t('weather.windSpeed')}</dt>
          <dd>{weather.windSpeed} km/h</dd>
        </div>
      </dl>
    </section>
  )
}
