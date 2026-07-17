import { createPendingRouteComponent } from '@/app/router/route-pending'
import type { AppModule } from '../types'

const authMeta = {
  hideHeader: true,
  hideFooter: true,
  className: 'auth-page-wrapper',
}

export const accountModule: AppModule = {
  id: 'account',
  name: '账户',
  routes: [
    {
      path: '/login',
      Component: createPendingRouteComponent('登录'),
      meta: { module: 'account', title: '登录 - Sun World', ...authMeta },
    },
    {
      path: '/register',
      Component: createPendingRouteComponent('注册'),
      meta: { module: 'account', title: '注册 - Sun World', ...authMeta },
    },
    {
      path: '/me',
      Component: createPendingRouteComponent('个人中心'),
      meta: { module: 'account', title: '个人中心 - Sun World' },
    },
    {
      path: '/qq',
      Component: createPendingRouteComponent('QQ 登录'),
      meta: { module: 'account', title: 'QQ 登录 - Sun World' },
    },
  ],
  nav: [{ label: 'nav.account', path: '/me', icon: 'me' }],
  seo: { title: '账户 - Sun World', noIndex: true },
}
