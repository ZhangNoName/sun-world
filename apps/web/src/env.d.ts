/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BASE_URL?: string
  readonly VITE_DEV_API_TARGET?: string
  readonly VITE_AI_URL?: string
  readonly VITE_TELEMETRY_ENDPOINT?: string
}
interface ImportMeta { readonly env: ImportMetaEnv }
declare const QC: { Login: { showPopup(options: { appId: string; redirectURI: string }): void } }
