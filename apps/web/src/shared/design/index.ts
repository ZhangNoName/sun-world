/**
 * Design system re-exports.
 *
 * Centralises design tokens, breakpoints, and motion presets so that
 * every module and component can reference a single source of truth.
 *
 * Phase 1: re-exports existing project breakpoint constants.
 * Phase 2+: extend with token maps, theme registry, motion presets.
 */

export { breakpoint as BREAKPOINTS } from '@/hooks/breakpoint/breakpoint'
