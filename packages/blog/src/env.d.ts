/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LANGCHAIN_TRACING_V2: string
  readonly VITE_LANGCHAIN_ENDPOINT: string
  readonly VITE_LANGCHAIN_API_KEY: string
  readonly VITE_LANGCHAIN_PROJECT: string
  readonly VITE_BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
