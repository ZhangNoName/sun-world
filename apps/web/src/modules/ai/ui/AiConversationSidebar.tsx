import { Button } from '@sun-world/ui/button'
import type { AiConversation } from '../types'

export function AiConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
}: {
  conversations: AiConversation[]
  activeId: string
  onSelect: (id: string) => void
  onNew: () => void
}) {
  return (
    <aside className="conversation-sidebar">
      <Button onClick={onNew}>新聊天</Button>
      <nav>
        {conversations.map((item) => (
          <Button
            variant="ghost"
            key={item.id}
            aria-current={item.id === activeId ? 'page' : undefined}
            onClick={() => onSelect(item.id)}
          >
            {item.title}
          </Button>
        ))}
      </nav>
    </aside>
  )
}
