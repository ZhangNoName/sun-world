import type { AiMessage } from '../types'
export function AiMessageStream({ messages }: { messages: AiMessage[] }) {
  return (
    <section className="message-stream" aria-live="polite">
      {messages.length ? (
        messages.map((message) => (
          <article key={message.id} className={`message-${message.role}`}>
            <strong>{message.role === 'user' ? '你' : 'AI'}</strong>
            <p>
              {message.content ||
                (message.status === 'streaming' ? '正在思考…' : '')}
            </p>
          </article>
        ))
      ) : (
        <p>开始一次新对话</p>
      )}
    </section>
  )
}
