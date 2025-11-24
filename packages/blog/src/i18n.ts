import { createI18n } from 'vue-i18n'
import en from '@/locales/en.json'
import zh from '@/locales/zh.json'

const i18n = createI18n({
  locale: 'zh', // 设置默认语言
  legacy: false,
  messages: {
    en,
    zh,
  },
})

export default i18n
