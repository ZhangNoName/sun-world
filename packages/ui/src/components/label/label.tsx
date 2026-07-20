import * as React from 'react'
import { useRender } from '@base-ui/react/use-render'

import { cn } from '../../lib/cn'

const Label = React.forwardRef<HTMLLabelElement, React.ComponentProps<'label'>>(
  function Label({ className, children, ...props }, ref) {
    return useRender({
      ref,
      defaultTagName: 'label',
      props: {
        ...props,
        'data-slot': 'label',
        className: cn(
          'flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
          className
        ),
        children,
      },
    })
  }
)

export { Label }
