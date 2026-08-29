#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const sourceRoots = [
  'apps/web/src',
  'packages/ui/src',
  'packages/ai-ui/src',
  'packages/ai-composer/src',
]
const canonicalTokenPath = 'apps/web/src/styles/design-tokens.css'
const canonicalKeyframePath = 'apps/web/src/style.css'
const motionModulePath = 'apps/web/src/shared/design/motion.ts'
const routeIndicatorPath = 'apps/web/src/app/router/RouteLoadingIndicator.tsx'
const appRouterPath = 'apps/web/src/app/router/create-router.ts'
const appLayoutPath = 'apps/web/src/layout/layout.tsx'
const requiredMotionTokens = [
  '--motion-duration-reduced',
  '--motion-duration-fast',
  '--motion-duration',
  '--motion-duration-normal',
  '--motion-duration-slow',
  '--motion-duration-loop',
  '--motion-delay-pending',
  '--motion-ease-standard',
  '--motion-ease-emphasized',
]
const failures = []

function normalize(path) {
  return path.split(sep).join('/')
}

function formatPath(path) {
  return normalize(relative(repoRoot, path))
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function readSource(repoPath) {
  const absolutePath = join(repoRoot, repoPath)
  if (!existsSync(absolutePath)) {
    failures.push(`${repoPath} is missing`)
    return null
  }
  return readFileSync(absolutePath, 'utf8')
}

function walkFiles(directory) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...walkFiles(path))
    else if (entry.isFile()) files.push(path)
  }
  return files
}

function withoutBlockComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, (comment) =>
    comment.replace(/[^\r\n]/g, ' ')
  )
}

function lineNumber(source, index) {
  return source.slice(0, index).split(/\r?\n/).length
}

function reportMatches(path, source, pattern, messageFor) {
  for (const match of source.matchAll(pattern)) {
    failures.push(
      `${formatPath(path)}:${lineNumber(source, match.index)} ${messageFor(match)}`
    )
  }
}

function checkMotionFoundation() {
  const tokenSource = readSource(canonicalTokenPath)
  if (tokenSource !== null) {
    for (const token of requiredMotionTokens) {
      const tokenPattern = new RegExp(
        `(?:^|\\n)\\s*${escapeRegExp(token)}\\s*:\\s*[^;]+;`
      )
      if (!tokenPattern.test(tokenSource)) {
        failures.push(`${canonicalTokenPath} must define ${token}`)
      }
    }
    if (
      !/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*:root\s*\{[^}]*--motion-duration-fast:\s*var\(--motion-duration-reduced\);[^}]*--motion-duration:\s*var\(--motion-duration-reduced\);[^}]*--motion-duration-slow:\s*var\(--motion-duration-reduced\);[^}]*--motion-duration-loop:\s*var\(--motion-duration-reduced\);[^}]*--motion-delay-pending:\s*0s;[^}]*\}\s*\}/s.test(
        tokenSource
      )
    ) {
      failures.push(
        `${canonicalTokenPath} must collapse motion tokens under prefers-reduced-motion`
      )
    }
  }

  const keyframeSource = readSource(canonicalKeyframePath)
  if (
    keyframeSource !== null &&
    !/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*\*,\s*\*::before,\s*\*::after\s*\{[^}]*scroll-behavior:\s*auto\s*!important;[^}]*transition-duration:\s*var\(--motion-duration-reduced\)\s*!important;[^}]*animation-duration:\s*var\(--motion-duration-reduced\)\s*!important;[^}]*animation-iteration-count:\s*1\s*!important;[^}]*\}\s*\}/s.test(
      keyframeSource
    )
  ) {
    failures.push(
      `${canonicalKeyframePath} must retain the global reduced-motion fallback`
    )
  }

  const motionSource = readSource(motionModulePath)
  if (motionSource !== null) {
    if (
      !/\b(?:export\s+)?const\s+ROUTE_PENDING_DELAY_MS\s*=\s*150\b/.test(
        motionSource
      )
    ) {
      failures.push(
        `${motionModulePath} must define ROUTE_PENDING_DELAY_MS = 150`
      )
    }
    if (
      !/\b(?:export\s+)?const\s+ROUTE_PENDING_MIN_VISIBLE_MS\s*=\s*180\b/.test(
        motionSource
      )
    ) {
      failures.push(
        `${motionModulePath} must define ROUTE_PENDING_MIN_VISIBLE_MS = 180`
      )
    }
  }

  const indicatorSource = readSource(routeIndicatorPath)
  if (indicatorSource !== null) {
    if (!/\buseRouteLoading\s*\(\s*\)/.test(indicatorSource)) {
      failures.push(`${routeIndicatorPath} must call useRouteLoading directly`)
    }
    if (!indicatorSource.includes('ROUTE_PENDING_DELAY_MS')) {
      failures.push(`${routeIndicatorPath} must use ROUTE_PENDING_DELAY_MS`)
    }
    if (!indicatorSource.includes('ROUTE_PENDING_MIN_VISIBLE_MS')) {
      failures.push(
        `${routeIndicatorPath} must use ROUTE_PENDING_MIN_VISIBLE_MS`
      )
    }
    if (!indicatorSource.includes('registerRouteFallback')) {
      failures.push(
        `${routeIndicatorPath} must register lazy-route fallback activity`
      )
    }
  }

  const layoutSource = readSource(appLayoutPath)
  if (layoutSource !== null) {
    if (!/<RouteLoadingIndicator\b/.test(layoutSource)) {
      failures.push(`${appLayoutPath} must render RouteLoadingIndicator`)
    }
    if (!/<RouteLoadingFallback\b/.test(layoutSource)) {
      failures.push(`${appLayoutPath} must use RouteLoadingFallback`)
    }
  }

  const appRouterSource = readSource(appRouterPath)
  if (
    appRouterSource !== null &&
    !/HydrateFallback\s*:\s*InitialRouteLoadingFallback\b/.test(appRouterSource)
  ) {
    failures.push(
      `${appRouterPath} must wire InitialRouteLoadingFallback on the root route`
    )
  }
}

function checkCssFile(path) {
  const source = withoutBlockComments(readFileSync(path, 'utf8'))
  const repoPath = formatPath(path)

  if (repoPath !== canonicalTokenPath) {
    reportMatches(
      path,
      source,
      /(?<![\w.-])(?:\d+(?:\.\d+)?|\.\d+)(?:ms|s)\b/gi,
      (match) =>
        `hard-codes CSS timing "${match[0]}"; use a canonical motion token`
    )
  }

  if (repoPath !== canonicalKeyframePath) {
    reportMatches(
      path,
      source,
      /@keyframes\s+[\w-]+/gi,
      (match) =>
        `${match[0]} is component-local; reuse a shared motion keyframe`
    )
  }

  reportMatches(
    path,
    source,
    /\btransition(?:-property)?\s*:\s*all\b/gi,
    () => 'uses transition: all; list the animated properties explicitly'
  )
}

function checkTsxFile(path) {
  if (/\.(?:test|spec)\.tsx$/.test(path)) return
  const source = withoutBlockComments(readFileSync(path, 'utf8'))

  reportMatches(
    path,
    source,
    /\b(?:duration|delay)-\d+(?:\.\d+)?\b/g,
    (match) =>
      `uses hard-coded utility "${match[0]}"; use the shared motion contract`
  )
  reportMatches(
    path,
    source,
    /\btransition-all\b/g,
    () => 'uses transition-all; list the animated properties explicitly'
  )
  reportMatches(
    path,
    source,
    /\btransition(?:-property|Property)?\s*:\s*(?:['"`]\s*)?all\b/gi,
    () =>
      'uses an inline transition: all; list the animated properties explicitly'
  )
}

checkMotionFoundation()

for (const sourceRoot of sourceRoots) {
  const absoluteRoot = join(repoRoot, sourceRoot)
  if (!existsSync(absoluteRoot)) {
    failures.push(`${sourceRoot} is missing`)
    continue
  }
  for (const path of walkFiles(absoluteRoot).sort()) {
    if (/\.(?:css|scss|sass|less)$/.test(path)) checkCssFile(path)
    else if (/\.tsx$/.test(path)) checkTsxFile(path)
  }
}

if (failures.length) {
  console.error('Frontend motion contract check failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('Frontend motion contract check passed.')
