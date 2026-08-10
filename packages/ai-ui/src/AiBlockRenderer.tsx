import { lazy, Suspense } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import type { AiContentBlock } from '@sun-world/contracts'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@sun-world/base-ui/table'

import type { AiRendererRegistry } from './types'

const AiChart = lazy(() => import('./AiChart'))

export function AiBlockRenderer({
  block,
  renderers = {},
}: {
  block: AiContentBlock
  renderers?: AiRendererRegistry
}) {
  if (block.type === 'text') {
    return block.format === 'plain' ? (
      <p className="sw-ai-text">{block.text}</p>
    ) : (
      <div className="sw-ai-markdown">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeSanitize]}
        >
          {block.text}
        </ReactMarkdown>
      </div>
    )
  }

  if (block.type === 'table') {
    return (
      <div className="sw-ai-table-wrap">
        <Table aria-label={block.caption || 'AI 生成表格'}>
          {block.caption ? <TableCaption>{block.caption}</TableCaption> : null}
          <TableHeader>
            <TableRow>
              {block.columns.map((column) => (
                <TableHead scope="col" key={column.key}>
                  {column.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {block.rows.map((row, rowIndex) => (
              <TableRow key={rowIndex}>
                {block.columns.map((column) => (
                  <TableCell key={column.key}>
                    {formatCell(row[column.key])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )
  }

  if (block.type === 'chart') {
    return (
      <Suspense fallback={<p role="status">正在加载图表…</p>}>
        <AiChart option={block.option} summary={block.summary} />
      </Suspense>
    )
  }

  if (block.type === 'link') {
    if (!isSafeLink(block.url)) return <UnsupportedBlock label="不安全链接" />
    return (
      <a
        className="sw-ai-link-card"
        href={block.url}
        target="_blank"
        rel="noreferrer noopener"
      >
        <strong>{block.label}</strong>
        {block.description ? <span>{block.description}</span> : null}
      </a>
    )
  }

  if (block.type === 'record') {
    return (
      <article className="sw-ai-record">
        <small>{block.record_type}</small>
        <strong>{block.title}</strong>
        <span>{block.record_id}</span>
      </article>
    )
  }

  const renderer = renderers[block.name]
  return renderer ? (
    <>{renderer(block)}</>
  ) : (
    <UnsupportedBlock label={`暂不支持组件 ${block.name}`} />
  )
}

function UnsupportedBlock({ label }: { label: string }) {
  return <div className="sw-ai-unsupported">{label}</div>
}

function isSafeLink(value: string) {
  try {
    return ['http:', 'https:', 'mailto:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

function formatCell(value: unknown) {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
