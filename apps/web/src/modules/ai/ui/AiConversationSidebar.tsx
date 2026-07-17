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
      <button onClick={onNew}>新聊天</button>
      <nav>
        {conversations.map((item) => (
          <button
            key={item.id}
            aria-current={item.id === activeId ? 'page' : undefined}
            onClick={() => onSelect(item.id)}
          >
            {item.title}
          </button>
        ))}
      </nav>
    </aside>
  )
}
