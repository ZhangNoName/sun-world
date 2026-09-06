import { AiComposerSubmitError } from '@sun-world/ai-composer'

const commandDefinitions = [
  {
    id: 'summarize',
    label: '总结内容',
    description: '提炼材料中的关键结论与行动项',
    keywords: ['summary', '摘要'],
    instruction:
      '请总结以下内容，提炼关键结论与行动项，不要补充材料中没有的事实。',
  },
  {
    id: 'explain',
    label: '解释概念',
    description: '用清晰的层次解释复杂主题',
    keywords: ['explain', '说明'],
    instruction:
      '请解释以下概念或问题，先给出直观理解，再分层说明，并提供具体例子。',
  },
  {
    id: 'visualize',
    label: '生成可视化',
    description: '把数据整理成适合展示的图表方案',
    keywords: ['chart', '图表'],
    instruction:
      '请分析以下数据，推荐合适的图表方案，说明维度、指标和主要趋势；缺少数据时明确说明，不要编造数值。',
  },
  {
    id: 'rewrite',
    label: '润色文本',
    description: '改进表达、结构和可读性',
    keywords: ['rewrite', '改写'],
    instruction:
      '请润色以下文本，保留原意和事实，改进表达、结构和可读性，直接给出修改后的文本。',
  },
]

export const composerCommands = commandDefinitions.map(
  ({ instruction: _instruction, ...command }) => command
)

export function buildAiCommandPrompt(markdown: string, commandId?: string) {
  if (!commandId) return markdown
  const command = commandDefinitions.find((item) => item.id === commandId)
  if (!command) {
    throw new AiComposerSubmitError(
      '当前服务暂不支持此命令，请移除命令后重试。'
    )
  }
  if (!markdown.trim()) {
    throw new AiComposerSubmitError('请先输入需要处理的内容。')
  }
  return `${command.instruction}\n\n${markdown.trim()}`
}
