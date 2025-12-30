/**
 * Cookie 工具函数
 */

/**
 * 设置 cookie
 * @param name cookie 名称
 * @param value cookie 值
 * @param days 过期天数
 */
export function setCookie(name: string, value: string, days?: number) {
  let expires = ''
  if (days) {
    const date = new Date()
    date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000)
    expires = '; expires=' + date.toUTCString()
  }
  document.cookie = name + '=' + (value || '') + expires + '; path=/'
}

/**
 * 获取 cookie
 * @param name cookie 名称
 * @returns cookie 值或 null
 */
export function getCookie(name: string): string | null {
  const nameEQ = name + '='
  const ca = document.cookie.split(';')
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i]
    while (c.charAt(0) === ' ') c = c.substring(1, c.length)
    if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length)
  }
  return null
}

/**
 * 删除 cookie
 * @param name cookie 名称
 */
export function deleteCookie(name: string) {
  document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;'
}

/**
 * 获取 access_token 的过期时间（从 cookie）
 * @returns 过期时间戳（毫秒）或 null
 */
export function getAccessTokenExpire(): number | null {
  const expireStr = getCookie('access_token_expire')
  if (!expireStr) return null
  try {
    // 如果是 ISO 字符串格式
    const expire = new Date(expireStr).getTime()
    return isNaN(expire) ? null : expire
  } catch {
    return null
  }
}

/**
 * 获取 refresh_token 的过期时间（从 cookie）
 * @returns 过期时间戳（毫秒）或 null
 */
export function getRefreshTokenExpire(): number | null {
  const expireStr = getCookie('refresh_token_expire')
  if (!expireStr) return null
  try {
    const expire = new Date(expireStr).getTime()
    return isNaN(expire) ? null : expire
  } catch {
    return null
  }
}
