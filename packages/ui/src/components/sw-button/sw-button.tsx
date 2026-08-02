import * as React from 'react'

import { Button as BaseButton } from '@sun-world/base-ui/button'

export type SwButtonProps = React.ComponentProps<typeof BaseButton> & {
  loading?: boolean
}

export const SwButton = React.forwardRef<HTMLButtonElement, SwButtonProps>(
  function SwButton({ loading = false, disabled, ...props }, ref) {
    return (
      <BaseButton
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      />
    )
  }
)
