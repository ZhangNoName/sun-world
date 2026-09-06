import { AiWorkspace } from '@sun-world/ai-ui'

import { ThemeSwitch } from '@/components/ThemeSwitch'
import { AiCapabilitySettings } from '../components/AiCapabilitySettings'
import { AiMcpSettings } from '../components/AiMcpSettings'
import { useAiChat } from '../composables/useAiChat'
import { composerCommands } from '../composer-commands'
import './ai.css'

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
