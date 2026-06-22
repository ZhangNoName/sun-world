import { getUiIcon, type UiIconName } from '../data'

export interface RenderIconToSvgOptions {
  size?: number | string
  strokeWidth?: number | string
  className?: string
  title?: string
}

const DEFAULT_SIZE = 24
const DEFAULT_STROKE_WIDTH = 2

function escapeAttr(value: string | number): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function renderIconToSvg(
  name: UiIconName,
  options: RenderIconToSvgOptions = {}
): string {
  const icon = getUiIcon(name)
  const size = options.size ?? DEFAULT_SIZE
  const strokeWidth = options.strokeWidth ?? DEFAULT_STROKE_WIDTH
  const classAttr = options.className
    ? ` class="${escapeAttr(options.className)}"`
    : ''
  const title = options.title
    ? `<title>${escapeAttr(options.title)}</title>`
    : ''
  const nodes = icon.nodes
    .map(([tag, attrs]) => {
      const attrText = Object.entries(attrs)
        .map(([key, value]) => ` ${key}="${escapeAttr(value)}"`)
        .join('')
      return `<${tag}${attrText}></${tag}>`
    })
    .join('')

  return `<svg${classAttr} width="${escapeAttr(size)}" height="${escapeAttr(size)}" viewBox="${icon.viewBox}" fill="none" stroke="currentColor" stroke-width="${escapeAttr(strokeWidth)}" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">${title}${nodes}</svg>`
}
