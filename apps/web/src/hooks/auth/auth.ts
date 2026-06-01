// useAuth.ts
import { ref } from 'vue'
import axios from 'axios'

const accessToken = ref<string>('')
const refreshToken = ref<string>('')
const accessTokenExpire = ref<number>(0) // 时间戳（秒）
const refreshTokenExpire = ref<number>(0)

let isRefreshing = false
let requestQueue: (() => void)[] = [] // 存放待执行的请求

export function useAuth() {
  function setTokens(at: string, rt: string, atExp: number, rtExp: number) {
    accessToken.value = at
    refreshToken.value = rt
    accessTokenExpire.value = atExp
    refreshTokenExpire.value = rtExp
  }

  async function refreshTokens() {
    if (isRefreshing) {
      return new Promise((resolve) => {
        requestQueue.push(() => resolve(true)) // 等待刷新完
      })
    }

    isRefreshing = true
    try {
      const res = await axios.post('/api/refresh', {
        refreshToken: refreshToken.value,
      })
      setTokens(
        res.data.accessToken,
        res.data.refreshToken,
        res.data.atExp,
        res.data.rtExp
      )

      // 通知队列继续
      requestQueue.forEach((cb) => cb())
      requestQueue = []
      return true
    } catch (e) {
      console.error('刷新失败', e)
      logout()
      return false
    } finally {
      isRefreshing = false
    }
  }

  function logout() {
    accessToken.value = ''
    refreshToken.value = ''
    accessTokenExpire.value = 0
    refreshTokenExpire.value = 0
    window.location.href = '/login'
  }

  return {
    accessToken,
    refreshToken,
    accessTokenExpire,
    refreshTokenExpire,
    setTokens,
    refreshTokens,
    logout,
  }
}
