import { Skeleton } from '@sun-world/base-ui/skeleton'

import { cn } from '../../lib/cn'
import '../../styles/base.css'

interface SunLoadingSkeletonProps extends React.ComponentProps<'div'> {
  label?: string
  lines?: number
}

export function SunLoadingSkeleton({
  className,
  label = '正在加载',
  lines = 3,
  ...props
}: SunLoadingSkeletonProps) {
  return (
    <div
      className={cn('grid gap-3', className)}
      role="status"
      aria-busy="true"
      aria-label={label}
      {...props}
    >
      {Array.from({ length: lines + 2 }, (_, index) => (
        <Skeleton
          key={index}
          data-testid="sun-skeleton-line"
          data-sun-skeleton-line
          aria-hidden="true"
          className={cn(
            'h-3 w-full motion-reduce:animate-none',
            index === 0 && 'h-5 w-2/5',
            index === lines + 1 && 'w-3/4'
          )}
        />
      ))}
    </div>
  )
}
