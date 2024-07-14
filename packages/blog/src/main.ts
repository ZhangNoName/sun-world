import { createApp } from 'vue'
import './style.scss'
import App from './App.vue'
import i18n from './i18n.ts';
import router from './router/index.ts';
import { getAdressByLocation, getCurrentLocation, getWeatherByHeFeng, getWeatherByLocation, InterceptLocalStorage } from '@/util/index.ts';
import 'element-plus/theme-chalk/src/index.scss'
import 'qweather-icons/font/qweather-icons.css';

InterceptLocalStorage()
// 使用示例
getCurrentLocation().then(res => {
  getAdressByLocation().then(res => {
    // getWeatherByLocation()
    getWeatherByHeFeng()
  })
})
const app = createApp(App)
// 将实例挂载到全局属性
// app.config.globalProperties.$elMessage = elMessage;
app.use(i18n)
app.use(router)
app.mount('#app')
