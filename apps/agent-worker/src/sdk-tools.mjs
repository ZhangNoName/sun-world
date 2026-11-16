import { defineTool } from '@deepseek-ai/dsh-tools'
import { toolCatalog } from './rpc-validation.mjs'

export const name = 'sun-world-blog-v2'
export const inject = ['tools']

export function apply(ctx) {
  const tools = toolCatalog.modules.find(
    (module) => module.id === 'blog-content'
  )?.tools
  if (
    !tools ||
    tools.length !== 2 ||
    new Set(tools.map((tool) => tool.id)).size !== 2
  )
    throw new Error('AGENT_PROFILE_MISMATCH')
  for (const tool of tools) {
    if (!['blog.read_public', 'blog.search_public'].includes(tool.id))
      throw new Error('AGENT_PROFILE_MISMATCH')
    const schema = toolCatalog.schemas[tool.input_schema_ref]
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
            ? '用单个简短核心词匹配公开标题或摘要，不用空格拼接多词；搜索和读取合计最多四次。'
            : '读取公开正文，引用使用返回的source_id。',
        parameters,
        output: {
          schema: { type: 'string' },
          render: (_args, value) => [{ type: 'text', text: value }],
        },
        async execute(args, { signal }) {
          // Only the trusted parent loopback bridge holds service credentials.
          const response = await fetch(
            `${process.env.BLOG_QA_BRIDGE}/tools/${tool.id}`,
            {
              method: 'POST',
              redirect: 'error',
              signal,
              headers: {
                'content-type': 'application/json',
                'x-api-key': process.env.BLOG_QA_BRIDGE_TOKEN,
              },
              body: JSON.stringify(args),
            }
          )
          if (!response.ok) throw new Error('AGENT_TOOL_FAILED')
          const raw = await response.text()
          if (Buffer.byteLength(raw) > 65536)
            throw new Error('AGENT_TOOL_FAILED')
          return raw
        },
      })
    )
  }
}
