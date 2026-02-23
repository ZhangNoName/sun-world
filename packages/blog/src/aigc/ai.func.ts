// AI 聊天相关函数
// 适配 Vue + Vite 项目，使用 VITE_ 环境变量和项目 http 服务

import { request } from '@/service/http'

/** 获取 AI 服务 base URL，优先使用 VITE_AI_URL，否则使用 VITE_BASE_URL */
function getAiBaseUrl(): string {
  const url = (import.meta.env.VITE_AI_URL || import.meta.env.VITE_BASE_URL)?.trim()
  if (!url) {
    throw new Error('VITE_AI_URL 或 VITE_BASE_URL 环境变量未设置')
  }
  return url.replace(/\/$/, '') // 移除末尾斜杠
}

export interface StreamMessage {
  token?: string
  done?: boolean
  error?: string
}

export interface StreamOptions {
  onMessage: (content: string) => void
  onComplete: () => void
  onError: (error: Error) => void
}

export interface ChatResponse {
  code: number
  data: string
  message: string
}

export async function sendMessage(
  message: string,
  sessionId: string
): Promise<string> {
  try {
    return await request.post<string>(
      '/ai/chat',
      { question: message, session_id: sessionId },
      { baseURL: getAiBaseUrl() }
    )
  } catch {
    return '抱歉，发生了错误，请重试。'
  }
}

/**
 * 发送消息并接收流式响应
 */
export async function sendStreamMessage(
  message: string,
  sessionId: string,
  options: StreamOptions
) {
  const { onMessage, onComplete, onError } = options

  try {
    const aiUrl = getAiBaseUrl()
    const response = await fetch(`${aiUrl}/ai/chat_stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', // 与项目 axios 一致，携带 cookie
      body: JSON.stringify({
        question: message,
        session_id: sessionId,
      }),
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const reader = response.body?.getReader()
    const decoder = new TextDecoder()

    if (!reader) {
      throw new Error('No response body')
    }

    // 读取流式数据
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value, { stream: true })
      const lines = chunk.split('\n')

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          if (line.includes('[DONE]')) {
            onComplete()
            return
          }
          try {
            const data: StreamMessage = JSON.parse(line.slice(6))
            if (data.error) {
              throw new Error(data.error)
            }
            if (data.done) {
              onComplete()
              return
            }
            if (data.token) {
              onMessage(data.token)
            }
          } catch (e) {
            console.error('Failed to parse stream data:', e)
          }
        }
      }
    }
    onComplete()
  } catch (error) {
    console.error('Stream message error:', error)
    onError(error as Error)
  }
}

/**
 * 分块流式响应（备用方案）
 */
export async function ChunkTransfer(
  message: string,
  sessionId: string,
  onMessage: (content: string) => void
): Promise<void> {
  const aiUrl = getAiBaseUrl()
  try {
    const response = await fetch(`${aiUrl}/ai/chat-chunk-stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        question: message,
        session_id: sessionId,
      }),
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const reader = response.body?.getReader()
    const decoder = new TextDecoder()

    if (!reader) {
      throw new Error('No response body')
    }

    while (true) {
      const { done, value } = await reader.read()

      if (done) break

      const rawChunk = decoder.decode(value, { stream: true })
      const lines = rawChunk.split('\n')

      for (const line of lines) {
        if (!line.trim()) continue

        if (line.startsWith('data: ')) {
          try {
            const jsonStr = line.slice(6)
            if (jsonStr.trim() === '[DONE]') {
              return
            }
            const data = JSON.parse(jsonStr)
            if (data.token) {
              onMessage(data.token)
            }
          } catch (e) {
            console.error('解析失败', e, { line })
          }
        } else {
          try {
            const data = JSON.parse(line)
            if (data.token) {
              onMessage(data.token)
            } else if (data.text) {
              onMessage(data.text)
            }
          } catch (e) {
            console.error('解析失败', e, { line })
          }
        }
      }
    }
  } catch (error) {
    console.error('ChunkTransfer error:', error)
    throw error
  }
}
