import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'sun-world-blog-p0'
export const inject = ['tools']

export function apply(ctx) {
  for (const [operation, field, description] of [
    ['search', 'query', 'Search published Sun World articles by keyword.'],
    ['read', 'id', 'Read the published article returned by search.'],
  ]) {
    ctx.tools.register(
      defineTool({
        name: `blog_${operation}_public`,
        description,
        parameters: { [field]: { type: 'string', required: true } },
        output: {
          schema: { type: 'string' },
          render: (_args, value) => [{ type: 'text', text: value }],
        },
        async execute(args, { signal }) {
          const response = await fetch(
            `${process.env.P0_ORIGIN}/tools/${operation}`,
            {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${process.env.P0_RUN_TOKEN}`,
              },
              body: JSON.stringify({ [field]: args[field] }),
              redirect: 'error',
              signal,
            }
          )
          if (!response.ok) throw new Error('Blog tool request rejected')
          return response.text()
        },
      })
    )
  }
}
