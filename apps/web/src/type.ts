export type {
  BlogCardProps,
  CatalogItemType,
  MarkdownHeadingItem,
} from '@/modules/blog/types'

export interface CurrentAdress {
  addressComponent: {
    city: string[]
    province: string
    adcode: string
    district: string
    towncode: string
    streetNumber: {
      number: string
      location: string
      direction: string
      distance: string
      street: string
    }
    country: string
    township: string
    businessAreas: {
      location: string
      name: string
      id: string
    }[]
    building: {
      name: string[]
      type: string[]
    }
    neighborhood: {
      name: string[]
      type: string[]
    }
    citycode: string
  }
  formatted_address: string
}

export interface WeatherInfo {
  province: string
  city: string
  adcode: string
  weather: string
  temperature: string
  winddirection: string
  windpower: string
  humidity: string
  reporttime: string
  temperature_float: string
  humidity_float: string
}

export interface HeFengWeather {
  updateTime: string
  fxLink: string
  now: {
    obsTime: string
    temp: string
    feelsLike: string
    icon: string
    text: string
    wind360: string
    windDir: string
    windScale: string
    windSpeed: string
    humidity: string
    precip: string
    pressure: string
    vis: string
    cloud?: string
    dew?: string
  }

  refer: {
    sources?: string[]
    license?: string[]
  }
}

export interface TokenType {
  id?: number | string | null
  access_token?: string | null
  refresh_token?: string | null
  access_token_expire?: string | null
  refresh_token_expire?: string | null
}
