import axios from 'axios'

import { GaoDeMapWebKey, HeFengWeatherKey } from '@/constant'

const WEATHER_CACHE_KEY = 'sun-world:local-weather:v1'
const WEATHER_CACHE_TTL_MS = 15 * 60 * 1000

export interface LocalWeatherSnapshot {
  cachedAt: number
  locationLabel: string
  fxLink: string
  weather: {
    temp: string
    feelsLike: string
    icon: string
    text: string
    windDir: string
    windScale: string
    windSpeed: string
  }
}

function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('geolocation-unavailable'))
      return
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      maximumAge: WEATHER_CACHE_TTL_MS,
      timeout: 10_000,
    })
  })
}

export function readCachedLocalWeather(): LocalWeatherSnapshot | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(WEATHER_CACHE_KEY)
    if (!raw) return null
    const cached = JSON.parse(raw) as LocalWeatherSnapshot
    if (
      !cached.cachedAt ||
      !cached.weather?.temp ||
      Date.now() - cached.cachedAt > WEATHER_CACHE_TTL_MS
    ) {
      return null
    }
    return cached
  } catch {
    return null
  }
}

export async function fetchLocalWeather(
  signal?: AbortSignal
): Promise<LocalWeatherSnapshot> {
  const cached = readCachedLocalWeather()
  if (cached) return cached

  const { coords } = await getCurrentPosition()
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  const location = `${coords.longitude},${coords.latitude}`
  const [addressResponse, weatherResponse] = await Promise.all([
    axios.get('https://restapi.amap.com/v3/geocode/regeo', {
      params: { key: GaoDeMapWebKey, location },
      signal,
    }),
    axios.get('https://devapi.qweather.com/v7/weather/now', {
      params: {
        key: HeFengWeatherKey,
        location,
        lang:
          typeof window === 'undefined'
            ? 'zh'
            : window.localStorage.getItem('locale') || 'zh',
      },
      signal,
    }),
  ])

  const address = addressResponse.data?.regeocode?.addressComponent
  const weather = weatherResponse.data?.now
  if (!address || !weather?.temp) throw new Error('weather-response-invalid')

  const snapshot: LocalWeatherSnapshot = {
    cachedAt: Date.now(),
    locationLabel: [address.country, address.province, address.city]
      .flat()
      .filter(
        (value, index, values) => value && values.indexOf(value) === index
      )
      .join(' '),
    fxLink: weatherResponse.data?.fxLink || '',
    weather: {
      temp: String(weather.temp),
      feelsLike: String(weather.feelsLike ?? weather.temp),
      icon: String(weather.icon ?? ''),
      text: String(weather.text ?? ''),
      windDir: String(weather.windDir ?? ''),
      windScale: String(weather.windScale ?? ''),
      windSpeed: String(weather.windSpeed ?? ''),
    },
  }

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(snapshot))
  }
  return snapshot
}
