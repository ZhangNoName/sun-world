import { Link } from 'react-router'
import { buttonVariants } from '@sun-world/base-ui/button'

import type { ContributionProps } from '@/shared/extensions'
import type { AiToolsContext } from '@/modules/ai/extension-contract'

export function BlogQaEntry({ context }: ContributionProps<AiToolsContext>) {
  const compact = context.presentation === 'rail'
  return (
    <Link
      to="/aigc/blog-qa"
      aria-label="博客问答"
      title={compact ? '博客问答' : undefined}
      className={buttonVariants({
        variant: 'ghost',
        ...(compact ? { size: 'sm' } : {}),
      })}
    >
      {compact ? '问答' : '博客问答'}
    </Link>
  )
}
