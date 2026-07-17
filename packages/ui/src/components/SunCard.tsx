import type { HTMLAttributes } from 'react'

import { cn } from '../lib/cn'

export function SunCard({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('sun-card', className)} {...props} />
}

export function SunCardHeader({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('sun-card__header', className)} {...props} />
}

export function SunCardContent({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('sun-card__content', className)} {...props} />
}

export function SunCardFooter({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('sun-card__footer', className)} {...props} />
}
