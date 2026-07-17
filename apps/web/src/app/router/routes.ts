import { lazy } from 'react'
import type { AppRouteObject } from '@/modules/types'

const GameTilesPage = lazy(() => import('@/pages/gameTiles'))
const ToolsPage = lazy(() => import('@/pages/tools/tools.page'))
const KeepPage = lazy(() => import('@/pages/keep/keep'))
const NotFound = lazy(() => import('@/router/NotFound'))
export const routes: AppRouteObject[] = [
  {
    path: '/game_tiles',
    Component: GameTilesPage,
    meta: { title: '游戏瓦片 - Sun World' },
  },
  { path: '/tools', Component: ToolsPage, meta: { title: '工具 - Sun World' } },
  {
    path: '/keep',
    Component: KeepPage,
    meta: { title: 'TCX 生成器 - Sun World', noIndex: true },
  },
  {
    path: '*',
    id: 'not-found',
    Component: NotFound,
    meta: { title: '页面未找到 - Sun World', noIndex: true },
  },
]
