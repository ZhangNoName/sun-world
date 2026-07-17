import { createElement, type SVGProps } from 'react'

import { uiIcons, type UiIconName } from '../data'

const iconSizes = { xs: 16, sm: 18, md: 20, lg: 24, xl: 28 } as const
export type SunIconSize = keyof typeof iconSizes | number | string

export interface SunIconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: UiIconName
  size?: SunIconSize
  strokeWidth?: number | string
  title?: string
  decorative?: boolean
}

function reactSvgAttributes(attributes: Record<string, string | number>) {
  return Object.fromEntries(
    Object.entries(attributes).map(([key, value]) => [
      key.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()),
      value,
    ])
  )
}

export function SunIcon({
  name,
  size = 'md',
  strokeWidth = 2,
  title,
  decorative = true,
  ...props
}: SunIconProps) {
  const icon = uiIcons[name] ?? uiIcons.square
  const resolvedSize =
    typeof size === 'string' && size in iconSizes
      ? iconSizes[size as keyof typeof iconSizes]
      : size
  const hidden = decorative && !title
  return (
    <svg
      className="sun-icon"
      width={resolvedSize}
      height={resolvedSize}
      viewBox={icon.viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={hidden || undefined}
      role={hidden ? undefined : 'img'}
      data-icon-name={icon.name}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      {icon.nodes.map(([tag, attributes], index) =>
        createElement(tag, { key: index, ...reactSvgAttributes(attributes) })
      )}
    </svg>
  )
}
