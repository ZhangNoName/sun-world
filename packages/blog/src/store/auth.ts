// stores/auth.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { refreshTokenApi } from '@/api/auth' // 你需要实现这个接口

export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref<string | null>(null)
  const refreshToken = ref<string | null>(null)
  const accessTokenExpire = ref<number | null>(null) // 时间戳 (ms)
  const refreshTokenExpire = ref<number | null>(null)

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
  }

  /** 清空 token */
  function clearTokens() {
    accessToken.value = null
    refreshToken.value = null
    accessTokenExpire.value = null
    refreshTokenExpire.value = null
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
    setTokens(res)
    return accessToken.value
  }

  return {
    accessToken,
    refreshToken,
    accessTokenExpire,
    refreshTokenExpire,
    setTokens,
    clearTokens,
    isAccessTokenExpired,
    refreshTokensIfNeeded,
  }
})
