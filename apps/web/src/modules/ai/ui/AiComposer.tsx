import { useState } from 'react'
import { SunChatComposer } from '@sun-world/ui/chat-composer'
export function AiComposer({
  loading,
  onSend,
  onAbort,
}: {
  loading: boolean
  onSend: (value: string) => void
  onAbort: () => void
}) {
  const [value, setValue] = useState('')
  return (
    <div className="ai-composer">
      <SunChatComposer
        value={value}
        onValueChange={setValue}
        onSubmit={onSend}
        loading={loading}
        placeholder="给 Sun World AI 发送消息"
      />
      {loading ? <button onClick={onAbort}>停止生成</button> : null}
    </div>
  )
}
