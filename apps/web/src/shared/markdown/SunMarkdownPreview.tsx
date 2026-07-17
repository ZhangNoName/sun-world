import {
  createElement,
  useEffect,
  useMemo,
  useRef,
  type HTMLAttributes,
} from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSlug from 'rehype-slug'
import rehypeSanitize from 'rehype-sanitize'

import { buildHeadingTree, flattenMarkdownHeadings } from './heading-tree'
import type { SunMarkdownHeading } from './types'

export interface SunMarkdownPreviewProps {
  content: string
  onCatalog?: (headings: SunMarkdownHeading[]) => void
  onRendered?: (html: string) => void
  className?: string
}

export function SunMarkdownPreview({
  content,
  onCatalog,
  onRendered,
  className,
}: SunMarkdownPreviewProps) {
  const container = useRef<HTMLDivElement>(null)
  const tree = useMemo(() => buildHeadingTree(content), [content])
  const flat = useMemo(() => flattenMarkdownHeadings(content), [content])
  const components = useMemo<Components>(() => {
    let cursor = 0
    const heading = (tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6') =>
      function MarkdownHeading({
        children,
        ...props
      }: HTMLAttributes<HTMLHeadingElement>) {
        const heading = flat[cursor++]
        return createElement(tag, { ...props, id: heading?.id }, children)
      }
    return {
      h1: heading('h1'),
      h2: heading('h2'),
      h3: heading('h3'),
      h4: heading('h4'),
      h5: heading('h5'),
      h6: heading('h6'),
    }
  }, [flat])

  useEffect(() => {
    onCatalog?.(tree)
  }, [onCatalog, tree])
  useEffect(() => {
    onRendered?.(container.current?.innerHTML ?? '')
  }, [content, onRendered])

  return (
    <div ref={container} className={`sun-markdown-preview ${className ?? ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug, rehypeSanitize]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

export default SunMarkdownPreview
