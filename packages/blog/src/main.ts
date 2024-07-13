import { createApp } from 'vue'
import './style.scss'
import App from './App.vue'
import i18n from './i18n.ts';
import { getCurrentLocation, InterceptLocalStorage } from '@/util/index.ts';
import 'element-plus/theme-chalk/src/index.scss'

InterceptLocalStorage()
// 使用示例
getCurrentLocation()
const app = createApp(App)
// 将实例挂载到全局属性
// app.config.globalProperties.$elMessage = elMessage;
app.use(i18n)
app.mount('#app')
