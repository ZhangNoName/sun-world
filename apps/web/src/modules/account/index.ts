import type { AppModule } from '../types'

const login = () =>
  import('@/pages/login/login').then((module) => ({
    Component: module.LoginPage,
  }))
const register = () =>
  import('@/pages/login/register').then((module) => ({
    Component: module.RegisterPage,
  }))
const me = () =>
  import('@/pages/me/me').then((module) => ({ Component: module.MePage }))
const qq = () =>
  import('@/pages/login/qqCb').then((module) => ({
    Component: module.QqCallbackPage,
  }))

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
      lazy: login,
      meta: { module: 'account', title: '登录 - Sun World', ...authMeta },
    },
    {
      path: '/register',
      lazy: register,
      meta: { module: 'account', title: '注册 - Sun World', ...authMeta },
    },
    {
      path: '/me',
      lazy: me,
      meta: { module: 'account', title: '个人中心 - Sun World' },
    },
    {
      path: '/qq',
      lazy: qq,
      meta: { module: 'account', title: 'QQ 登录 - Sun World' },
    },
  ],
  nav: [{ label: 'nav.account', path: '/me', icon: 'me' }],
  seo: { title: '账户 - Sun World', noIndex: true },
}
