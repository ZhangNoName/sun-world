import { createApp } from 'vue'
import './style.scss'
import App from './App.vue'
import i18n from './i18n.ts';
import { InterceptLocalStorage } from '@/util/index.ts';

InterceptLocalStorage()
const app = createApp(App)
app.use(i18n)
app.mount('#app')
