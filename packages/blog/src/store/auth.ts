// stores/auth.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  login as loginApi,
  logout as logoutApi,
  refreshToken as refreshTokenApi,
} from '@/service/auth.api'
import { v4 as uuidv4 } from 'uuid'

export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref<string | null>(null)
  const refreshToken = ref<string | null>(null)
  const accessTokenExpire = ref<number | null>(null)
  const refreshTokenExpire = ref<number | null>(null)
  const deviceId = ref<string>(localStorage.getItem('device_id') || uuidv4())

  // 首次运行时写入 deviceId
  if (!localStorage.getItem('device_id')) {
    localStorage.setItem('device_id', deviceId.value)
  }

  /** 设置 token 信息 */
  function setTokens({
    token,
    refresh,
    tokenExpire,
    refreshExpire,
  }: {
    token: string
    refresh: string
    tokenExpire: number
    refreshExpire: number
  }) {
    accessToken.value = token
    refreshToken.value = refresh
    accessTokenExpire.value = tokenExpire
    refreshTokenExpire.value = refreshExpire

    // 本地缓存 token 信息为对象
    localStorage.setItem(
      'auth_tokens',
      JSON.stringify({
        accessToken: token,
        refreshToken: refresh,
        accessTokenExpire: tokenExpire,
        refreshTokenExpire: refreshExpire,
      })
    )
  }

  // 启动时自动读取本地 token
  const cachedTokens = localStorage.getItem('auth_tokens')
  if (cachedTokens) {
    try {
      const parsed = JSON.parse(cachedTokens)
      accessToken.value = parsed.accessToken || null
      refreshToken.value = parsed.refreshToken || null
      accessTokenExpire.value = parsed.accessTokenExpire || null
      refreshTokenExpire.value = parsed.refreshTokenExpire || null
    } catch (e) {
      // 解析失败时清空本地缓存
      localStorage.removeItem('auth_tokens')
    }
  }

  // 清空 token 时也清空本地缓存
  function clearTokens() {
    accessToken.value = null
    refreshToken.value = null
    accessTokenExpire.value = null
    refreshTokenExpire.value = null
    localStorage.removeItem('auth_tokens')
  }

  /** 判断 accessToken 是否过期 */
  function isAccessTokenExpired() {
    return !accessTokenExpire.value || Date.now() > accessTokenExpire.value
  }

  /** 刷新 token */
  async function refreshTokensIfNeeded() {
    if (!isAccessTokenExpired()) return accessToken.value

    if (
      !refreshToken.value ||
      !refreshTokenExpire.value ||
      Date.now() > refreshTokenExpire.value
    ) {
      clearTokens()
      throw new Error('Refresh token 已过期，需要重新登录')
    }

    const res = await refreshTokenApi(refreshToken.value)
    setTokens({
      token: res.access_token,
      refresh: res.refresh_token,
      tokenExpire: Date.parse(res.access_token_expire),
      refreshExpire: Date.parse(res.refresh_token_expire),
    })
    return accessToken.value
  }

  /** 登录 */
  async function login(username: string, password: string) {
    const res = await loginApi({
      username,
      password,
      deviceId: deviceId.value,
    })
    console.log(res)
    setTokens({
      token: res.access_token,
      refresh: res.refresh_token,
      tokenExpire: Date.parse(res.access_token_expire),
      refreshExpire: Date.parse(res.refresh_token_expire),
    })
    return res
  }

  /** 登出（只清当前设备的 token） */
  async function logout() {
    if (accessToken.value) {
      await logoutApi()
    }
    clearTokens()
  }

  return {
    accessToken,
    refreshToken,
    accessTokenExpire,
    refreshTokenExpire,
    deviceId,
    setTokens,
    clearTokens,
    isAccessTokenExpired,
    refreshTokensIfNeeded,
    login,
    logout,
  }
})
