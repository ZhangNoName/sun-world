import { Button } from '@sun-world/base-ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@sun-world/ui/sw-dropdown-menu'

import { setLocale } from '@/i18n'
import { useManageCopy, useManageLocale } from '../manageCopy'

export function ManageLanguageSwitch({ collapsed }: { collapsed: boolean }) {
  const copy = useManageCopy()
  const locale = useManageLocale()

  return (
    <div className="manage-language-switch">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            className="manage-language-trigger"
            variant="ghost"
            aria-label={copy.language.trigger}
            title={copy.language.trigger}
          >
            <span className="manage-language-trigger__label">
              {copy.language.label}
            </span>
            <span className="manage-language-trigger__value">
              {collapsed
                ? locale === 'zh'
                  ? '中'
                  : 'EN'
                : locale === 'zh'
                  ? copy.language.chinese
                  : copy.language.english}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="top"
          align={collapsed ? 'center' : 'start'}
          aria-label={copy.language.choose}
          className="manage-language-menu"
        >
          <DropdownMenuItem
            aria-current={locale === 'zh' ? 'true' : undefined}
            onClick={() => void setLocale('zh')}
          >
            {copy.language.chinese}
          </DropdownMenuItem>
          <DropdownMenuItem
            aria-current={locale === 'en' ? 'true' : undefined}
            onClick={() => void setLocale('en')}
          >
            {copy.language.english}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export default ManageLanguageSwitch
