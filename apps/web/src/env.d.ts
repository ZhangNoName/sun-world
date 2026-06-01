/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LANGCHAIN_TRACING_V2: string
  readonly VITE_LANGCHAIN_ENDPOINT: string
  readonly VITE_LANGCHAIN_API_KEY: string
  readonly VITE_LANGCHAIN_PROJECT: string
  readonly VITE_BASE_URL: string
  /** AI 服务地址，不设置时使用 VITE_BASE_URL */
  readonly VITE_AI_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
