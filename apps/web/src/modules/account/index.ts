import type { AppModule } from '../types'

/**
 * Account module - authentication, profile, and user settings.
 *
 * Phase 1 references existing login/register/me pages.
 * Future phases will add profile management and OAuth flows.
 */
export const accountModule: AppModule = {
  id: 'account',
  name: '账户',
  routes: [
    {
      path: '/login',
      component: () => import('@/pages/login/login.vue'),
      meta: { module: 'account', title: '登录 - Sun World' },
    },
    {
      path: '/register',
      component: () => import('@/pages/login/register.vue'),
      meta: { module: 'account', title: '注册 - Sun World' },
    },
    {
      path: '/me',
      component: () => import('@/pages/me/me.vue'),
      meta: { module: 'account', title: '个人中心 - Sun World' },
    },
    {
      path: '/qq',
      component: () => import('@/pages/login/qqCb.vue'),
      meta: { module: 'account', title: 'QQ 登录 - Sun World' },
    },
  ],
  nav: [
    { label: 'nav.account', path: '/me', icon: 'me' },
  ],
  seo: {
    title: '账户 - Sun World',
  },
}
