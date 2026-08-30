import { AiWorkspace } from '@sun-world/ai-ui'

import { ThemeSwitch } from '@/components/ThemeSwitch'
import { AiCapabilitySettings } from '../components/AiCapabilitySettings'
import { AiMcpSettings } from '../components/AiMcpSettings'
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
      isAuthenticated={chat.isAuthenticated}
      accountHref={chat.isAuthenticated ? '/me' : '/login'}
      accountLabel={chat.isAuthenticated ? '个人中心' : '登录'}
      railBrand={
        <img src="/logo.svg" alt="" width={22} height={22} aria-hidden="true" />
      }
      railFooter={<ThemeSwitch />}
      toolbarActions={
        <>
          <AiCapabilitySettings
            isAuthenticated={chat.isAuthenticated}
            status={chat.capabilityStatus}
            error={chat.capabilityError}
            personas={chat.personas}
            skills={chat.skills}
            selectedPersonaId={chat.selectedPersonaId}
            selectedSkillIds={chat.selectedSkillIds}
            onSelectPersona={chat.selectPersona}
            onToggleSkill={chat.toggleSkill}
            onRefresh={chat.refreshCapabilities}
            onSavePersona={chat.savePersona}
            onDeletePersona={chat.removePersona}
            onSaveSkill={chat.saveSkill}
            onDeleteSkill={chat.removeSkill}
          />
          <AiMcpSettings
            isAuthenticated={chat.isAuthenticated}
            accountKey={chat.accountKey}
          />
        </>
      }
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
