import { Button } from '@sun-world/ui/button'
import { useTranslation } from 'react-i18next'
import { setLocale } from '@/i18n'

export function LanguageSwitch() {
  const { i18n } = useTranslation()
  const next = i18n.language === 'en' ? 'zh' : 'en'
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label="切换语言"
      onClick={() => void setLocale(next)}
    >
      {next.toUpperCase()}
    </Button>
  )
}

export default LanguageSwitch
