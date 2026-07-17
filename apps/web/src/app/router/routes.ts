import { createPendingRouteComponent } from '@/app/router/route-pending'
import type { AppRouteObject } from '@/modules/types'

export const routes: AppRouteObject[] = [
  {
    path: '/game_tiles',
    Component: createPendingRouteComponent('游戏切片'),
    meta: { title: '游戏 - Sun World' },
  },
  {
    path: '/tools',
    Component: createPendingRouteComponent('工具'),
    meta: { title: '工具 - Sun World' },
  },
  {
    path: '/keep',
    Component: createPendingRouteComponent('收藏'),
    meta: { title: '收藏 - Sun World' },
  },
  {
    path: '*',
    id: 'not-found',
    Component: createPendingRouteComponent('页面未找到'),
    meta: { title: '页面未找到 - Sun World', noIndex: true },
  },
]
