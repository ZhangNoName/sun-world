export const DEFAULT_BASE_URL = 'http://127.0.0.1:8000'
export const DEFAULT_SESSION_ID = 'agent-local'

export const AI_CAPABILITIES = {
  inspect: {
    name: 'inspect',
    description: 'Print curated Sun World AI CLI capabilities.',
  },
  chat: {
    name: 'chat',
    method: 'POST',
    path: '/ai/chat',
    body: 'chat-request',
    description: 'Send one chat message and print response data as JSON.',
  },
  stream: {
    name: 'stream',
    method: 'POST',
    path: '/ai/chat_stream',
    body: 'chat-request',
    stream: true,
    description: 'Stream one chat response from the Sun World API.',
  },
  'generate-image': {
    name: 'generate-image',
    method: 'POST',
    path: '/ai/generate-image',
    body: 'chat-request',
    description: 'Request image generation through the AI image endpoint.',
  },
  'read-image': {
    name: 'read-image',
    method: 'POST',
    path: '/ai/read-image',
    body: 'read-image-query',
    description: 'Ask the image-reading endpoint to describe an image URL.',
  },
}

export function listCapabilities() {
  return Object.values(AI_CAPABILITIES)
}
