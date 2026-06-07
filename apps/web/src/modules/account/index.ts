import type { AppModule } from '../types'

export * from './api'
export * from './errors'
export type * from './types'

const LoginPage = () => import('@/pages/login/login.vue')
const RegisterPage = () => import('@/pages/login/register.vue')
const MePage = () => import('@/pages/me/me.vue')
const QqCallbackPage = () => import('@/pages/login/qqCb.vue')

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
      component: LoginPage,
      meta: { module: 'account', title: '登录 - Sun World' },
    },
    {
      path: '/register',
      component: RegisterPage,
      meta: { module: 'account', title: '注册 - Sun World' },
    },
    {
      path: '/me',
      component: MePage,
      meta: { module: 'account', title: '个人中心 - Sun World' },
    },
    {
      path: '/qq',
      component: QqCallbackPage,
      meta: { module: 'account', title: 'QQ 登录 - Sun World' },
    },
  ],
  nav: [
    { label: 'nav.account', path: '/me', icon: 'me' },
  ],
  seo: {
    title: '账户 - Sun World',
    description: '管理 Sun World 登录、个人资料和第三方授权。',
    noIndex: true,
  },
  preload: () =>
    Promise.all([LoginPage(), RegisterPage(), MePage(), QqCallbackPage()]),
}
