import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { defineTool } from '@deepseek-ai/dsh-tools'

const catalog = JSON.parse(
  readFileSync(new URL('./tool-catalog.json', import.meta.url), 'utf8')
)
export const name = 'sun-world-blog-local'
export const inject = ['tools']

export function apply(ctx) {
  for (const tool of catalog.modules[0].tools) {
    const schema = catalog.schemas[tool.input_schema_ref]
    const parameters = Object.fromEntries(
      Object.entries(schema.properties).map(([key, value]) => [
        key,
        {
          type: value.type,
          description: value.description || value.title,
          ...(value.default !== undefined ? { default: value.default } : {}),
          ...(schema.required?.includes(key) ? { required: true } : {}),
        },
      ])
    )
    ctx.tools.register(
      defineTool({
        name: tool.model_name,
        description:
          tool.id === 'blog.search_public'
            ? '搜索文章标题或摘要，使用简短核心词，例如 React、分页、权限。读取正文前先搜索。'
            : '读取搜索返回的公开文章正文；只有实际读取的文章才可作为参考来源。',
        parameters,
        output: {
          schema: { type: 'string' },
          render: (_args, value) => [{ type: 'text', text: value }],
        },
        async execute(args, { signal }) {
          const callId = randomUUID()
          const base = `${process.env.BLOG_QA_ORIGIN}/internal/agent/v1/runs/${process.env.BLOG_QA_RUN_ID}`
          const headers = {
            'content-type': 'application/json',
            authorization: `Bearer ${process.env.BLOG_QA_RUN_TOKEN}`,
            'x-worker-service': process.env.BLOG_QA_SERVICE_TOKEN,
          }
          const response = await fetch(`${base}/tools/${tool.id}`, {
            method: 'POST',
            headers,
            redirect: 'error',
            signal,
            body: JSON.stringify({
              call_id: callId,
              generation: 1,
              tool_version: tool.version,
              arguments: args,
            }),
          })
          if (!response.ok) throw new Error('Blog tool request rejected')
          const payload = await response.json()
          const receipt = await fetch(`${base}/receipts`, {
            method: 'POST',
            headers,
            redirect: 'error',
            signal,
            body: JSON.stringify({
              call_id: callId,
              result_hash: payload.result_hash,
            }),
          })
          if (!receipt.ok) throw new Error('Blog tool receipt rejected')
          return JSON.stringify(payload.result)
        },
      })
    )
  }
}
