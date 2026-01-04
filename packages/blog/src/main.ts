import { createApp } from 'vue'
import './style.css'
import './text.css'
import App from './App.vue'
import i18n from '@/i18n.ts'
import router from '@/router'

import {
  getAdressByLocation,
  getCurrentLocation,
  getWeatherByHeFeng,
  InterceptLocalStorage,
} from '@/util'
import lazy from '@/directives/lazy'
import 'element-plus/theme-chalk/src/index.scss'
// import 'qweather-icons/font/qweather-icons.css'
import { createPinia } from 'pinia'
import 'virtual:svg-icons-register'
const pinia = createPinia()
InterceptLocalStorage()
// 使用示例
getCurrentLocation().then((res) => {
  getAdressByLocation().then((res) => {
    getWeatherByHeFeng()
  })
})
const app = createApp(App)
app.directive('lazy', lazy)
// 将实例挂载到全局属性
// app.config.globalProperties.$elMessage = elMessage;
app.use(i18n)
app.use(router)
app.use(pinia)
app.mount('#app')
