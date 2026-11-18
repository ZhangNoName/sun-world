import { AiWorkspace } from '@sun-world/ai-ui'
import { SwSelect } from '@sun-world/ui/sw-select'

import { ThemeSwitch } from '@/components/ThemeSwitch'
import { AiCapabilitySettings } from '../components/AiCapabilitySettings'
import { AiMcpSettings } from '../components/AiMcpSettings'
import { AiWorkspaceTools } from '../components/AiWorkspaceTools'
import { useAiChat, type AiReasoningEffort } from '../composables/useAiChat'
import { composerCommands } from '../composer-commands'
import './ai.css'

const reasoningOptions = [
  { value: 'low', label: '思考：低' },
  { value: 'medium', label: '思考：中' },
  { value: 'high', label: '思考：高' },
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
      composerModelControl={
        !chat.isAuthenticated && chat.providers.length > 0 ? (
          <div className="sw-ai-guest-model">
            <span>GPT-6.1 Sol</span>
            <SwSelect
              aria-label="思考程度"
              size="sm"
              value={chat.reasoningEffort}
              options={reasoningOptions}
              onValueChange={(value) =>
                chat.setReasoningEffort(value as AiReasoningEffort)
              }
            />
          </div>
        ) : undefined
      }
      commands={composerCommands}
      isAuthenticated={chat.isAuthenticated}
      accountHref={chat.isAuthenticated ? '/me' : '/login'}
      accountLabel={chat.isAuthenticated ? '个人中心' : '登录'}
      railBrand={
        <img src="/logo.svg" alt="" width={22} height={22} aria-hidden="true" />
      }
      sidebarNavigation={<AiWorkspaceTools presentation="sidebar" />}
      sidebarFooterActions={<ThemeSwitch />}
      railFooter={
        <>
          <AiWorkspaceTools presentation="rail" />
          <ThemeSwitch />
        </>
      }
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
