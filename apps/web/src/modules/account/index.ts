import type { AppModule } from '../types'

const LoginPage = () => import('@/pages/login/login.vue')
const RegisterPage = () => import('@/pages/login/register.vue')
const MePage = () => import('@/pages/me/me.vue')
const QqCallbackPage = () => import('@/pages/login/qqCb.vue')

export const accountModule: AppModule = {
  id: 'account',
  name: '账户',
  routes: [
    {
      path: '/login',
      component: LoginPage,
      meta: {
        module: 'account',
        title: '登录 - Sun World',
        hideHeader: true,
        hideFooter: true,
        className: 'auth-page-wrapper',
      },
    },
    {
      path: '/register',
      component: RegisterPage,
      meta: {
        module: 'account',
        title: '注册 - Sun World',
        hideHeader: true,
        hideFooter: true,
        className: 'auth-page-wrapper',
      },
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
  nav: [{ label: 'nav.account', path: '/me', icon: 'me' }],
  seo: {
    title: '账户 - Sun World',
    description: '管理 Sun World 登录、个人资料和第三方授权。',
    noIndex: true,
  },
}
