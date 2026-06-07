/**
 * Public runtime configuration.
 *
 * Exposes safe, non-secret constants derived from Vite env variables.
 * Never expose API keys, tokens, or private URLs here.
 */

/** Base URL for the backend API (from Vite env). */
export const API_BASE_URL: string = import.meta.env.VITE_BASE_URL ?? ''

/** Current application version (from package.json injected at build time). */
export const APP_VERSION: string = import.meta.env.VITE_APP_VERSION ?? '0.0.1'

/** Whether the app is running in production mode. */
export const IS_PRODUCTION: boolean = import.meta.env.PROD

/** Whether the app is running in development mode. */
export const IS_DEVELOPMENT: boolean = import.meta.env.DEV

/** Canonical public site URL. */
export const SITE_URL = 'https://sunworld.site'
