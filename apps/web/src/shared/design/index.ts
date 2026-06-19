/**
 * Design system re-exports.
 *
 * Centralises design tokens, breakpoints, motion presets, and the theme
 * controller so that every module and component can reference a single
 * source of truth.
 *
 * Phase 1: re-exports existing project breakpoint constants.
 * Phase 2: added theme controller composable and token helpers.
 */

export { BREAKPOINTS } from '@/hooks/breakpoint/breakpoint.data'
export type { BreakpointKey } from '@/hooks/breakpoint/breakpoint.data'
export { useTheme } from './theme'
export type { ThemeName } from './theme'
