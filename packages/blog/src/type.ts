import { HeFengWeatherKey } from './constant';
import { CurrentLocation } from './util/index';
export interface BlogCardProps {
  id: string,
  title: string,
  content: string,
  publishTime: string,
  lastUpdateTime: string,
  tags: string[],
  category?: string,
  cover?: string,
  byteNum: number | string,
  commentNum: number | string,
}


export interface CurrentAdress {
  addressComponent: {
    city: string[];
    province: string;
    adcode: string;
    district: string;
    towncode: string;
    streetNumber: {
      number: string;
      location: string;
      direction: string;
      distance: string;
      street: string;
    };
    country: string;
    township: string;
    businessAreas: {
      location: string;
      name: string;
      id: string;
    }[];
    building: {
      name: string[];
      type: string[];
    };
    neighborhood: {
      name: string[];
      type: string[];
    };
    citycode: string;
  },
  formatted_address: string
}

export interface WeatherInfo {
  province: string;           // 省份
  city: string;               // 城市
  adcode: string;             // 行政区划代码
  weather: string;            // 天气情况
  temperature: string;        // 温度
  winddirection: string;      // 风向
  windpower: string;          // 风力
  humidity: string;           // 湿度
  reporttime: string;         // 报告时间
  temperature_float: string;  // 浮点型温度
  humidity_float: string;     // 浮点型湿度
}
/**
* 和风天气的接口信息
*/
export interface HeFengWeather {
  updateTime: string; // 当前API的最近更新时间
  fxLink: string; // 当前数据的响应式页面，便于嵌入网站或应用
  now: {
    obsTime: string; // 数据观测时间
    temp: string; // 温度，默认单位：摄氏度
    feelsLike: string; // 体感温度，默认单位：摄氏度
    icon: string; // 天气状况的图标代码
    text: string; // 天气状况的文字描述
    wind360: string; // 风向360角度
    windDir: string; // 风向
    windScale: string; // 风力等级
    windSpeed: string; // 风速，公里/小时
    humidity: string; // 相对湿度，百分比数值
    precip: string; // 当前小时累计降水量，默认单位：毫米
    pressure: string; // 大气压强，默认单位：百帕
    vis: string; // 能见度，默认单位：公里
    cloud?: string; // 云量，百分比数值。可能为空
    dew?: string; // 露点温度。可能为空
  };
  refer: {
    sources?: string[]; // 原始数据来源，可能为空
    license?: string[]; // 数据许可或版权声明，可能为空
  };


}