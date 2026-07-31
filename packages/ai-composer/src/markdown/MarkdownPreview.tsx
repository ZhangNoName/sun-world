import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'

export function MarkdownPreview({ markdown }: { markdown: string }) {
  return (
    <div className="sw-ai-composer__markdown" aria-label="Markdown 预览">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        urlTransform={(url) => safeUrl(url)}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
}

function safeUrl(url: string) {
  const value = url.trim()
  if (/^(?:https?:|mailto:|tel:|\/|#)/i.test(value)) {
    return defaultUrlTransform(value)
  }
  return ''
}
