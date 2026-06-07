import { ElMessage } from 'element-plus'
import axios, { AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from '@/store/auth'
import { getDeviceId } from '@/util/auth'
import { trackApiError, trackApiTiming } from '@/shared/telemetry'
//基础URL，axios将会自动拼接在url前
//process.env.NODE_ENV 判断是否为开发环境 根据不同环境使用不同的baseURL 方便调试
// console.log('当前环境下的变量', import.meta.env)

const baseURL = import.meta.env.VITE_BASE_URL
//默认请求超时时间
const timeout = 30000
//创建axios实例
const service = axios.create({
  timeout,
  baseURL,
  //如需要携带cookie 该值需设为true
  withCredentials: true,
})

//统一请求拦截 可配置自定义headers 例如 language、token等
service.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    // const authStore = useAuthStore()

    // 如果 token 即将过期，自动刷新（token 从 cookie 自动带过去）
    // 跳过登录、注册和刷新 token 的请求
    // if (
    //   !config.url?.includes('/auth/login') &&
    //   !config.url?.includes('/auth/register') &&
    //   !config.url?.includes('/auth/refresh_token')
    // ) {
    //   try {
    //     await authStore.refreshTokensIfNeeded()
    //   } catch (error) {
    //     console.error('刷新 token 失败', error)
    //     // 刷新失败时抛出错误，让响应拦截器处理
    //     throw error
    //   }
    // }

    //配置自定义请求头（不包含 token，token 从 cookie 自动带过去）
    config.headers = {
      'Content-Type': 'application/json',
      ...config.headers,
      withCredentials: true, // 允许携带 cookie
    } as any
    return config
  },
  (error) => {
    console.log(error)
    return Promise.reject(error)
  }
)

//统一响应拦截 可以格式化返回的数据，针对返回code做出统一处理
service.interceptors.response.use(
  function (response) {
    // token 在 cookie 中，不需要手动处理
    const authStore = useAuthStore()
    authStore.syncExpireFromCookie?.()

    const body = response.data
    // 检测是否为统一 envelope 响应（包含 code 字段）
    if (body && typeof body === 'object' && 'code' in body) {
      const isSuccess = body.code === 1 || body.code === '1'
      if (isSuccess) {
        // 业务成功：解包 data 字段，替换 response.data 为业务数据
        response.data = body.data
        return response
      }
      // 业务失败：构造 ApiError 并拒绝
      const msg = body.msg || body.message || '请求失败'
      const apiError = new ApiError(body.code, msg, response.status, body)
      notifyApiError(apiError)
      return Promise.reject(apiError)
    }
    // 非 envelope 响应（如 SSE、文件流）原样返回
    return response
  },
  async (error) => {
    // 对响应错误做点什么
    if (error && error.response) {
      const data = error.response.data
      // 如果后端已返回 envelope 格式的错误响应，使用它
      if (data && typeof data === 'object' && 'code' in data) {
        const msg = data.msg || data.message || '请求失败'
        const apiError = new ApiError(data.code, msg, error.response.status, data)
        notifyApiError(apiError)
        return Promise.reject(apiError)
      }
      // HTTP 状态码错误转换为 ApiError
      const apiError = new ApiError(
        error.response.status,
        getHttpStatusMessage(error.response.status),
        error.response.status,
        data
      )
      notifyApiError(apiError)
      return Promise.reject(apiError)
    }
    // 网络错误（无响应）
    if (error && error.message) {
      const apiError = new ApiError(-1, error.message, undefined, null)
      notifyApiError(apiError)
      return Promise.reject(apiError)
    }
    const apiError = new ApiError(-1, '网络发生错误，请检查', undefined, null)
    notifyApiError(apiError)
    return Promise.reject(apiError)
  }
)
// axios返回格式
interface AxiosTypes<T> {
  data: T
  status: number
  statusText: string
}

// 后台响应 envelope 格式
// 用于表示后端统一返回的 { code, data, msg } 结构
//
// code can be a number (legacy contracts) or a string (new error-code map).
// Both are valid at runtime; the interceptor normalises success checks.
export interface ApiEnvelope<T = unknown> {
  code: number | string
  data: T | null
  msg: string
  message?: string // 临时兼容旧版 message 字段
}

// ApiError: 统一业务/网络错误类型
export class ApiError extends Error {
  code: number | string
  msg: string
  status?: number
  payload: unknown

  constructor(
    code: number | string,
    msg: string,
    status?: number,
    payload?: unknown
  ) {
    super(msg)
    this.name = 'ApiError'
    this.code = code
    this.msg = msg
    this.status = status
    this.payload = payload
  }
}

function notifyApiError(error: ApiError) {
  if (error.code === 401 || error.code === '401' || error.status === 401) {
    ElMessage.warning(error.msg || '您的账号已登出或超时，即将登出...')
    return
  }
  ElMessage.error(error.msg || '请求失败')
}

// HTTP 状态码默认文案
function getHttpStatusMessage(status: number): string {
  const map: Record<number, string> = {
    307: '307 临时重定向',
    400: '错误请求',
    401: '未授权，请重新登录',
    403: '拒绝访问',
    404: '请求错误，未找到资源',
    405: '请求方法未允许',
    408: '请求超时',
    500: '服务端出错',
    501: '网络未实现',
    502: '网络错误',
    503: '服务不可用',
    504: '网络超时',
    505: 'HTTP 版本不支持该请求',
  }
  return map[status] || `连接错误 ${status}`
}

// 兼容旧版 ResponseType（保留 message 字段以适配可能未更新的调用处）
export interface ResponseType<T = any> {
  code: number
  message: string
  msg: string
  data: T
}

// 核心处理代码 — interceptor 已完成 envelope 解包与 ApiError 转换
const requestHandler = <T>(
  method: 'get' | 'post' | 'put' | 'delete',
  url: string,
  params: object = {},
  config: AxiosRequestConfig = {}
): Promise<T> => {
  const startedAt = performance.now()
  let response: Promise<AxiosTypes<T>>
  switch (method) {
    case 'get':
      response = service.get(url, { params: { ...params }, ...config })
      break
    case 'post':
      response = service.post(url, { ...params }, { ...config })
      break
    case 'put':
      response = service.put(url, { ...params }, { ...config })
      break
    case 'delete':
      response = service.delete(url, { params: { ...params }, ...config })
      break
    default:
      throw new Error('Invalid method')
  }

  return new Promise<T>((resolve, reject) => {
    response
      .then((res) => {
        trackApiTiming({
          method,
          url,
          duration: performance.now() - startedAt,
          status: res.status,
        })
        // interceptor 已将 envelope.data 解包到 res.data
        resolve(res.data as T)
      })
      .catch((error) => {
        trackApiError(error, {
          method,
          url,
          duration: performance.now() - startedAt,
          status: error instanceof ApiError ? error.status : undefined,
          code: error instanceof ApiError ? error.code : undefined,
        })
        // interceptor 已将错误转换为 ApiError
        // 仅在非 ApiError 时补充兜底消息
        if (!(error instanceof ApiError)) {
          console.error('网络错误：', error)
          ElMessage.warning('网络发生错误，请检查')
        }
        reject(error)
      })
  })
}

// 使用 request 统一调用，包括封装的get、post、put、delete等方法
const request = {
  get: <T>(url: string, params?: object, config?: AxiosRequestConfig) =>
    requestHandler<T>('get', url, params, config),
  post: <T>(url: string, params?: object, config?: AxiosRequestConfig) =>
    requestHandler<T>('post', url, params, config),
  put: <T>(url: string, params?: object, config?: AxiosRequestConfig) =>
    requestHandler<T>('put', url, params, config),
  delete: <T>(url: string, params?: object, config?: AxiosRequestConfig) =>
    requestHandler<T>('delete', url, params, config),
}

// 导出至外层，方便统一使用
export { request }
