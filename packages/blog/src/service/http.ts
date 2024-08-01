import { ElMessage } from 'element-plus'
import axios, { AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios'

//基础URL，axios将会自动拼接在url前
//process.env.NODE_ENV 判断是否为开发环境 根据不同环境使用不同的baseURL 方便调试
// console.log('当前环境下的变量', import.meta.env)

const baseURL = import.meta.env.VITE_BASE_URL
//默认请求超时时间
const timeout = 30000
let token: string | null = ''
//创建axios实例
const service = axios.create({
  timeout,
  baseURL,
  //如需要携带cookie 该值需设为true
  withCredentials: true,
})

//统一请求拦截 可配置自定义headers 例如 language、token等
service.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (!token) {
      token = localStorage.getItem('token')
    }
    //配置自定义请求头
    config.headers = {
      'Content-Type': 'application/json',
      Authorization: token,
      ...config.headers,
    } as any
    config.withCredentials = false
    return config
  },
  (error) => {
    console.log(error)
    Promise.reject(error)
  },
)

//统一响应拦截 可以格式化返回的数据，针对返回code做出统一处理
service.interceptors.response.use(
  function (response) {
    // console.log('请求返回数据', response);
    // console.log('返回过来的响应头', response.headers);
    if (response.headers.authorization) {
      // console.log('接收到的新token', response.headers.authorization);
      localStorage.setItem('token', response.headers.authorization)
      token = response.headers.authorization
    } else {
      // console.log('没有token', Object.keys(response.headers));
    }
    // 对响应数据做点什么
    return response
  },
  function (error) {
    // 对响应错误做点什么
    if (error && error.response) {
      switch (error.response.status) {
        case 307:
          ElMessage.error('307临时重定向')
          console.log(error)
          break
        case 400:
          ElMessage.error('错误请求')
          break
        case 401:
          ElMessage.warning('登录超时，请重新登录')

          localStorage.removeItem('token')
          token = null
          break
        case 403:
          ElMessage.info('拒绝访问')
          break
        case 404:
          ElMessage.info('请求错误，未找到资源')
          break
        case 405:
          ElMessage.info('请求方法未允许')
          break
        case 408:
          ElMessage.info('请求超时')
          break
        case 500:
          ElMessage.info('服务端出错')
          break
        case 501:
          ElMessage.info('网络未实现')
          break
        case 502:
          ElMessage.info('网络错误')
          break
        case 503:
          ElMessage.info('服务不可用')
          break
        case 504:
          ElMessage.info('网络超时')
          break
        case 505:
          ElMessage.info('http版本不支持该请求')
          break
        default:
          ElMessage.info(`连接错误${error.response.status}`)
      }
    }
    return Promise.reject(error)
  },
)
//axios返回格式
interface axiosTypes<T> {
  data: T
  status: number
  statusText: string
}

//后台响应数据格式
//###该接口用于规定后台返回的数据格式，意为必须携带code、msg以及result
//###而result的数据格式 由外部提供。如此即可根据不同需求，定制不同的数据格式
interface responseTypes<T> {
  code: number
  ElMessage: string
  params: T
}

//核心处理代码 将返回一个promise 调用then将可获取响应的业务数据
const requestHandler = <T>(
  method: 'get' | 'post' | 'put' | 'delete',
  url: string,
  params: object = {},
  config: AxiosRequestConfig = {},
): Promise<T> => {
  let response: Promise<axiosTypes<responseTypes<T>>>
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
  }

  return new Promise<T>((resolve, reject) => {
    response
      .then((res) => {
        //业务代码 可根据需求自行处理

        const data = res.data
        // resolve(data as any);
        // console.log('当前数据', data);
        if (data.code !== 0) {
          //特定状态码 处理特定的需求
          if (data.code == 401) {
            ElMessage.warning('您的账号已登出或超时，即将登出...')
            console.log('登录异常，执行登出...')
            // TODO:退出登录之后清空cookie，并且跳转到登录界面
            // window.location.href = '/login';
            // navigate('/login');
          }

          const e = JSON.stringify(data)
          // ElMessage.warning(`请求错误`)
          console.error(`请求错误：${e}`)
          ElMessage.error(data.ElMessage)
          //数据请求错误 使用reject将错误返回
          reject({
            status: false,
            data: res,
          } as any)
        } else {
          //数据请求正确 使用resolve将结果返回
          // console.log('请求成功', data.params);
          resolve(data.params)
        }
      })
      .catch((error) => {
        const e = JSON.stringify(error)
        ElMessage.warning(`网络发生错误，请检查`)
        console.error(`网络错误：${e}`)
        // reject(error);
        reject({
          status: false,
          data: error,
        } as any)
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
