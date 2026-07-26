import { AiWorkspace } from '@sun-world/ai-ui'

import { useAiChat } from '../composables/useAiChat'
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
