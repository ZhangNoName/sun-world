import axios from 'axios'
import { GaoDeMapWebKey, GithubAdress, HeFengWeatherKey } from '@/constant'
import type { CurrentAdress, HeFengWeather, WeatherInfo } from '@/type'

const listeners = new Set<() => void>()
let weatherVersion = 0
const notifyWeather = () => {
  weatherVersion += 1
  listeners.forEach((listener) => listener())
}
export const subscribeWeather = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
export const getWeatherVersion = () => weatherVersion

export function InterceptLocalStorage() {
  const storage = localStorage as Storage & { __sunWorldPatched?: boolean }
  if (storage.__sunWorldPatched) return
  const originalSetItem = storage.setItem.bind(storage)
  storage.setItem = (key: string, newValue: string) => {
    originalSetItem(key, newValue)
    window.dispatchEvent(
      new CustomEvent('localestorageChange', { detail: { key, newValue } })
    )
  }
  storage.__sunWorldPatched = true
}

export const CurrentLocation = { latitude: 0, longitude: 0 }
export const CurrentLocationArea: CurrentAdress = {
  addressComponent: {
    city: [], province: '', adcode: '', district: '', towncode: '', country: '', township: '',
    streetNumber: { number: '', location: '', direction: '', distance: '', street: '' },
    businessAreas: [], building: { name: [], type: [] }, neighborhood: { name: [], type: [] }, citycode: '',
  },
  formatted_address: '',
}
export const CurrentWeather: WeatherInfo = {
  province: '', city: '', adcode: '', weather: '', temperature: '', winddirection: '', windpower: '', humidity: '', reporttime: '', temperature_float: '', humidity_float: '',
}
export const HeFengWeatherData: HeFengWeather = {
  updateTime: '', fxLink: '',
  now: { obsTime: '', temp: '', feelsLike: '', icon: '', text: '', wind360: '', windDir: '', windScale: '', windSpeed: '', humidity: '', precip: '', pressure: '', vis: '', cloud: '', dew: '' },
  refer: { sources: [], license: [] },
}

export const openGithub = () => window.open(GithubAdress, '_blank', 'noopener,noreferrer')

export function getCurrentLocation(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('当前浏览器不支持地理位置')); return }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        CurrentLocation.latitude = coords.latitude
        CurrentLocation.longitude = coords.longitude
        resolve({ latitude: coords.latitude, longitude: coords.longitude })
      },
      (error) => reject(new Error(`获取位置信息失败: ${error.message}`))
    )
  })
}

export async function getAdressByLocation() {
  const response = await axios.get('https://restapi.amap.com/v3/geocode/regeo', {
    params: { key: GaoDeMapWebKey, location: `${CurrentLocation.longitude},${CurrentLocation.latitude}` },
  })
  CurrentLocationArea.addressComponent = response.data.regeocode.addressComponent
  CurrentLocationArea.formatted_address = response.data.regeocode.formatted_address
  notifyWeather()
}

export async function getWeatherByLocation() {
  const response = await axios.get('https://restapi.amap.com/v3/weather/weatherInfo', {
    params: { key: GaoDeMapWebKey, city: CurrentLocationArea.addressComponent.adcode },
  })
  Object.assign(CurrentWeather, response.data.lives[0])
  localStorage.setItem('gdWeather', JSON.stringify(CurrentWeather))
  notifyWeather()
}

function readCachedWeather() {
  try {
    const raw = localStorage.getItem('hfWeather')
    if (!raw) return null
    const value = JSON.parse(raw) as HeFengWeather
    return Date.now() - new Date(value.updateTime).getTime() <= 15 * 60 * 1000 ? value : null
  } catch { return null }
}

export async function getWeatherByHeFeng() {
  const cached = readCachedWeather()
  if (cached) {
    Object.assign(HeFengWeatherData, cached)
    notifyWeather()
    return
  }
  const response = await axios.get('https://devapi.qweather.com/v7/weather/now', {
    params: { key: HeFengWeatherKey, location: `${CurrentLocation.longitude},${CurrentLocation.latitude}`, lang: localStorage.getItem('locale') || 'zh' },
  })
  Object.assign(HeFengWeatherData, response.data)
  localStorage.setItem('hfWeather', JSON.stringify(HeFengWeatherData))
  notifyWeather()
}
