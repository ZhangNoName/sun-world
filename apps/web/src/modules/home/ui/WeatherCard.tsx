import { useTranslation } from 'react-i18next'

import { CurrentLocationArea, HeFengWeatherData } from '@/util'

export function WeatherCard() {
  const { t } = useTranslation()
  const weather = HeFengWeatherData.now
  return (
    <section className="weather-card" aria-label="当前天气">
      <a href={HeFengWeatherData.fxLink} target="_blank" rel="noreferrer">
        <i className={`qi qi-${weather.icon}`} title={weather.text} />
      </a>
      <p>
        {CurrentLocationArea.addressComponent.country}{' '}
        {CurrentLocationArea.addressComponent.province}
      </p>
      <dl>
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
