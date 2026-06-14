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

declare const QC: {
  Login: {
    showPopup(options: {
      appId: string
      redirectURI: string
    }): void
  }
}

declare module '@vue/runtime-core' {
  interface ComponentCustomProperties {
    $t: import('vue-i18n').ComposerTranslation
  }
}

declare module 'virtual:svg-icons-register' {
  const register: void
  export default register
}

declare module 'virtual:svg-icons-names' {
  const icons: string[]
  export default icons
}
