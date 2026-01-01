import { defineStore } from 'pinia'
import { onMounted, ref } from 'vue'
import {
  postLogin,
  postLogout,
  postRefreshToken,
  postRegister,
} from '@/service/auth.req'
import { getDeviceId } from '@/util/auth'
import {
  getAccessTokenExpire,
  getRefreshTokenExpire,
  getCookie,
} from '@/util/cookie'
import type { TokenType } from '@/type'
import { getUserMe } from '@/service/user.req'
import { UserInfo } from '@/types/user.type'

export const useAuthStore = defineStore('auth', () => {
  // 只存储过期时间，token 本身存储在 cookie 中
  const accessTokenExpire = ref<number | null>(null)
  const refreshTokenExpire = ref<number | null>(null)
  const deviceId = ref<string>(getDeviceId())
  const user = ref<UserInfo | null>(null)
  // 从 cookie 同步过期时间
  function syncExpireFromCookie() {
    const accessExpire = getAccessTokenExpire()
    const refreshExpire = getRefreshTokenExpire()
    if (accessExpire) accessTokenExpire.value = accessExpire
    if (refreshExpire) refreshTokenExpire.value = refreshExpire
  }

  /** 更新 token 过期时间（token 本身在 cookie 中，不需要存储） */
  function updateTokenExpire(data: TokenType) {
    // 优先从 cookie 读取过期时间，如果没有则解析返回的时间字符串
    const accessExpire =
      getAccessTokenExpire() || new Date(data.access_token_expire).getTime()
    const refreshExpire =
      getRefreshTokenExpire() || new Date(data.refresh_token_expire).getTime()

    accessTokenExpire.value = accessExpire
    refreshTokenExpire.value = refreshExpire
  }

  // 启动时从 cookie 同步过期时间
  syncExpireFromCookie()

  // 清空 token 过期时间和用户信息（cookie 由后端清除）
  function clearTokens() {
    accessTokenExpire.value = null
    refreshTokenExpire.value = null
    user.value = null
  }

  /** 判断 accessToken 是否过期 */
  function isAccessTokenExpired() {
    // 同步 cookie 中的过期时间
    syncExpireFromCookie()
    return !accessTokenExpire.value || Date.now() > accessTokenExpire.value
  }

  /** 判断 accessToken 是否即将过期（提前 5 分钟刷新） */
  function isAccessTokenExpiringSoon() {
    syncExpireFromCookie()
    if (!accessTokenExpire.value) return true
    const fiveMinutes = 5 * 60 * 1000 // 5 分钟
    return Date.now() + fiveMinutes >= accessTokenExpire.value
  }

  /** 判断 refreshToken 是否过期 */
  function isRefreshTokenExpired() {
    syncExpireFromCookie()
    return !refreshTokenExpire.value || Date.now() > refreshTokenExpire.value
  }

  /** 刷新 token（refresh_token 从 cookie 自动带过去） */
  async function refreshTokensIfNeeded() {
    // 如果 token 未过期且未即将过期，则不需要刷新
    if (!isAccessTokenExpiringSoon()) {
      return
    }

    // 检查 refresh token 是否过期
    if (isRefreshTokenExpired()) {
      clearTokens()
      throw new Error('Refresh token 已过期，需要重新登录')
    }

    try {
      // 调用刷新接口，refresh_token 会从 cookie 自动带过去
      // 刷新成功后，新的 token 会设置到 cookie，只需要更新过期时间
      // const res = await postRefreshToken()
      // updateTokenExpire(res)
    } catch (error) {
      clearTokens()
      throw error
    }
  }

  /** 登录 */
  async function login(username: string, password: string) {
    const res = await postLogin({
      username,
      password,
    })
    // token 会自动设置到 cookie，只需要更新过期时间
    updateTokenExpire(res)
    const user = await getUser()
    console.log('user', user)
    return res
  }

  /** 注册 */
  async function register(data: {
    name: string
    phone: string
    email: string
    password: string
  }) {
    const res = await postRegister(data)
    // 注册成功后 token 会自动设置到 cookie，只需要更新过期时间
    updateTokenExpire(res)
    return res
  }

  /** 登出 */
  async function logout() {
    try {
      // await postLogout()
    } catch (error) {
      console.error('登出失败', error)
    }
    // 清空过期时间（cookie 由后端清除）
    clearTokens()
  }

  /** 获取用户信息 */
  async function getUser() {
    try {
      const res = await getUserMe()
      user.value = res
      return res
    } catch (error) {
      console.error('获取用户信息失败', error)
      return null
    }
  }
  onMounted(() => {
    // 只有在有 token cookie 时才获取用户信息
    getUser()
  })

  return {
    accessTokenExpire,
    refreshTokenExpire,
    deviceId,
    syncExpireFromCookie,
    clearTokens,
    isAccessTokenExpired,
    isAccessTokenExpiringSoon,
    isRefreshTokenExpired,
    refreshTokensIfNeeded,
    login,
    register,
    logout,
    user,
  }
})
