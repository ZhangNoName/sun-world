import { GaoDeMapWebKey, GithubAdress, HeFengWeatherKey } from "@/constant";
import { CurrentAdress, HeFengWeather, WeatherInfo } from "@/type";
import axios from "axios";
import { reactive } from "vue";

/**
 * 拦截localStorage变化事件
 * 普通的localStorage无法监听到同tab变化事件，导致其他组件更改了localStorage值，无法在app.vue中监听到变化
 */
export function InterceptLocalStorage() {
  const originalSetItem = localStorage.setItem;
  localStorage.setItem = function (key: string, newValue: string) {
    const event = new Event('localestorageChange') as CustomEvent;
    (event as any).key = key;
    (event as any).newValue = newValue;
    window.dispatchEvent(event);
    originalSetItem.apply(this, [key, newValue]);
  };

}
/**
 * 储存当前地址经纬度
 *  longitude:经度
 *  latitude:纬度
 */
export const CurrentLocation = {
  latitude: 0,
  longitude: 0,
}


/**
 * 储存当前经纬度的区划信息
 */
export const CurrentLocationArea: CurrentAdress = reactive({
  addressComponent: {
    city: [],
    province: "",
    adcode: "",
    district: "",
    towncode: "",
    streetNumber: {
      number: "",
      location: "",
      direction: "",
      distance: "",
      street: ""
    },
    country: "",
    township: "",
    businessAreas: [
    ],
    building: {
      name: [],
      type: []
    },
    neighborhood: {
      name: [],
      type: []
    },
    citycode: ""
  },
  formatted_address: ""
})


/**
 * 在标签页打开github
 */
export const openGithub = () => {
  window.open(GithubAdress, '_blank')
}


/**
 * 获取当前地址经纬度
 * returns Promise<{latitude: number, longitude: number}>
 */
export const getCurrentLocation = (): Promise<{ latitude: number, longitude: number }> => {
  return new Promise((resolve, reject) => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const latitude = position.coords.latitude;
          const longitude = position.coords.longitude;
          CurrentLocation.latitude = latitude;
          CurrentLocation.longitude = longitude;
          resolve({ latitude, longitude });
        },
        (error) => {
          reject(new Error("获取位置信息失败: " + error.message));
        }
      );
    } else {
      reject(new Error("您的浏览器不支持地理位置功能。"));
    }
  });
}

/**
 * 根据经纬度获取地址
 */
export const getAdressByLocation = (): Promise<void> => {
  // console.log('当前经纬度', CurrentLocation)
  return axios.get('https://restapi.amap.com/v3/geocode/regeo', {
    params: {
      key: GaoDeMapWebKey,
      location: CurrentLocation.longitude + ',' + CurrentLocation.latitude,
    }
  }).then((res) => {

    CurrentLocationArea.addressComponent = res.data.regeocode.addressComponent;
    CurrentLocationArea.formatted_address = res.data.regeocode.formatted_address;
    console.log('当前位置', CurrentLocationArea)
  }).catch((err) => {
    console.log(err);
  })
}

/**
 * 检查是否需要重新获取天气数据
 * @returns {boolean} 是否需要重新获取数据
 */
function shouldFetchWeatherData() {
  const hfWeather = localStorage.getItem('hfWeather');

  if (hfWeather) {
    const weatherData = JSON.parse(hfWeather);
    const updateTime = new Date(weatherData.updateTime).getTime();
    const now = new Date().getTime();
    const fifteenMinutes = 15 * 60 * 1000;

    // 检查时间差是否超过15分钟
    if (now - updateTime <= fifteenMinutes) {
      return false; // 不需要重新获取数据
    }
  }

  return true; // 需要重新获取数据
}

/**
 * 天气信息
 */
export const CurrentWeather: WeatherInfo = {
  province: "",
  city: "",
  adcode: "",
  weather: "",
  temperature: "",
  winddirection: "",
  windpower: "",
  humidity: "",
  reporttime: "",
  temperature_float: "",
  humidity_float: ""
};
/**
 * 根据位置获取天气信息
 */
export const getWeatherByLocation = (): Promise<void> => {
  return axios.get('https://restapi.amap.com/v3/weather/weatherInfo', {
    params: {
      key: GaoDeMapWebKey,
      city: CurrentLocationArea.addressComponent.adcode
    }
  }).then((res) => {
    Object.assign(CurrentWeather, res.data.lives[0]);
    localStorage.setItem('gdWeather', JSON.stringify(CurrentWeather))
  }).catch((err) => {
    console.log(err);
  })
}

/**
 * 和风天气信息
 */

export const HeFengWeatherData: HeFengWeather = reactive({
  updateTime: "", // 当前API的最近更新时间
  fxLink: "", // 当前数据的响应式页面，便于嵌入网站或应用
  now: {
    obsTime: "", // 数据观测时间
    temp: "", // 温度，默认单位：摄氏度
    feelsLike: "", // 体感温度，默认单位：摄氏度
    icon: "", // 天气状况的图标代码
    text: "", // 天气状况的文字描述
    wind360: "", // 风向360角度
    windDir: "", // 风向
    windScale: "", // 风力等级
    windSpeed: "", // 风速，公里/小时
    humidity: "", // 相对湿度，百分比数值
    precip: "", // 当前小时累计降水量，默认单位：毫米
    pressure: "", // 大气压强，默认单位：百帕
    vis: "", // 能见度，默认单位：公里
    cloud: "", // 云量，百分比数值。可能为空
    dew: "" // 露点温度。可能为空
  },
  refer: {
    sources: [], // 原始数据来源，可能为空
    license: [] // 数据许可或版权声明，可能为空
  }
})


/**
 * 和风天气根据经纬度获取天气情况及图标
 */

export const getWeatherByHeFeng = (): Promise<void> => {
  if (!shouldFetchWeatherData()) {
    const nowWeather = localStorage.getItem('hfWeather');
    if (nowWeather) {
      const weatherData = JSON.parse(nowWeather);
      Object.assign(HeFengWeatherData, weatherData);
      // HeFengWeatherData.now = weatherData.now;
      console.log('从内存中读取出和风天气', HeFengWeatherData);
      return Promise.resolve();
    }
    return Promise.resolve();
  }
  return axios.get('https://devapi.qweather.com/v7/weather/now', {
    params: {
      key: HeFengWeatherKey,
      location: CurrentLocation.longitude + ',' + CurrentLocation.latitude,
      lang: localStorage.getItem('locale'),

    }
  }).then((res) => {
    Object.assign(HeFengWeatherData, res.data);
    console.log('重新获取和风天气', HeFengWeatherData);
    localStorage.setItem('hfWeather', JSON.stringify(HeFengWeatherData))
  }).catch((err) => {
    console.log(err);
  })
}


