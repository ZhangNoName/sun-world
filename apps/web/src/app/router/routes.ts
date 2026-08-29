import { lazy } from 'react'
import type { AppRouteObject } from '@/modules/types'

const GameTilesPage = lazy(() => import('@/pages/gameTiles'))
const ToolsPage = lazy(() => import('@/pages/tools/tools.page'))
const KeepPage = lazy(() => import('@/pages/keep/keep'))
const PrivacyPolicyPage = lazy(
  () => import('@/pages/privacy/PrivacyPolicyPage')
)
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
    path: '/privacy',
    Component: PrivacyPolicyPage,
    meta: {
      title: '隐私政策 - Sun World',
      description: 'Sun World Google 登录基础身份资料的使用与删除说明。',
      canonical: 'https://sunworld.site/privacy',
    },
  },
  {
    path: '*',
    id: 'not-found',
    Component: NotFound,
    meta: { title: '页面未找到 - Sun World', noIndex: true },
  },
]
