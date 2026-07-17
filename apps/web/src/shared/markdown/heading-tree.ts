import type { SunMarkdownHeading } from './types'

export function slugifyHeading(value: string) {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export function flattenMarkdownHeadings(content: string): SunMarkdownHeading[] {
  const counts = new Map<string, number>()
  let fenced = false
  return content.split(/\r?\n/).flatMap((line) => {
    if (/^\s*```/.test(line)) {
      fenced = !fenced
      return []
    }
    if (fenced) return []
    const match = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/)
    if (!match) return []
    const text = match[2]?.trim() ?? ''
    const slug = slugifyHeading(text) || 'heading'
    const count = (counts.get(slug) ?? 0) + 1
    counts.set(slug, count)
    return [{ id: `${slug}-${count}`, text, level: match[1]!.length }]
  })
}

export function buildHeadingTree(content: string): SunMarkdownHeading[] {
  const roots: SunMarkdownHeading[] = []
  const stack: SunMarkdownHeading[] = []
  for (const heading of flattenMarkdownHeadings(content)) {
    const node = { ...heading, children: [] }
    while (stack.length && stack.at(-1)!.level >= node.level) stack.pop()
    const parent = stack.at(-1)
    if (parent) parent.children!.push(node)
    else roots.push(node)
    stack.push(node)
  }
  return roots
}
