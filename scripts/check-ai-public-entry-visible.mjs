#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const root = resolve(import.meta.dirname, '..')
const header = readFileSync(
  resolve(root, 'apps/web/src/layout/header/index.tsx'),
  'utf8'
)
const mobile = readFileSync(
  resolve(root, 'apps/web/src/layout/layout.tsx'),
  'utf8'
)
const module = readFileSync(
  resolve(root, 'apps/web/src/modules/ai/index.ts'),
  'utf8'
)
if (!header.includes("'/aigc'") || !header.includes("'message-circle'"))
  throw new Error('Desktop header must expose AI.')
if (!mobile.includes("'/aigc'") || !mobile.includes("'message-circle'"))
  throw new Error('Mobile navigation must expose AI.')
if (!module.includes("path: '/aigc'") || !module.includes("label: 'AI'"))
  throw new Error('AI module navigation is missing.')
console.log('AI public entry visible check passed.')
