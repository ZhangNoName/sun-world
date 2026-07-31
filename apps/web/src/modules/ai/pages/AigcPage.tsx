import { AiWorkspace } from '@sun-world/ai-ui'

import { useAiChat } from '../composables/useAiChat'
import './ai.css'

const composerCommands = [
  {
    id: 'summarize',
    label: '总结内容',
    description: '提炼材料中的关键结论与行动项',
    keywords: ['summary', '摘要'],
  },
  {
    id: 'explain',
    label: '解释概念',
    description: '用清晰的层次解释复杂主题',
    keywords: ['explain', '说明'],
  },
  {
    id: 'visualize',
    label: '生成可视化',
    description: '把数据整理成适合展示的图表方案',
    keywords: ['chart', '图表'],
  },
  {
    id: 'rewrite',
    label: '润色文本',
    description: '改进表达、结构和可读性',
    keywords: ['rewrite', '改写'],
  },
]

export function AigcPage() {
  const chat = useAiChat()

  return (
    <AiWorkspace
      conversations={chat.conversations}
      activeConversationId={chat.activeConversationId}
      messages={chat.messages}
      runState={chat.runState}
      providers={chat.providers}
      providerProfiles={chat.providerProfiles}
      commands={composerCommands}
      onNewConversation={chat.startConversation}
      onSelectConversation={chat.selectConversation}
      onSend={chat.sendMessage}
      onStop={chat.stop}
      onEditMessage={chat.editMessage}
      onRegenerate={chat.regenerate}
      onRetry={chat.retryLast}
      onFeedback={chat.setFeedback}
      onSaveProvider={chat.saveProvider}
    />
  )
}

export default AigcPage
