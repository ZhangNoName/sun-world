import { request, ResponseType } from './http'
/**
 * 测试接口
 * @returns {Promise<any>}
 */
export const testApi = async () => {
  const response: any = await request.get('')
  return response
}

/**
 * 保存博客内容
 * @param {Object} params - 请求的配置参数。
 * @param {string} params.title - 输入信息
 * @param {string } params.content - 生成提示词
 * @param {string} params.author - 0:文字，1:图片
 * @param {string} params.created_at - 0:文字，1:图片
 * @returns {Promise<any>}
 */
export const postSaveBlog = async (params: {
  title: string
  content: string
  abstract: string
  author?: string
  created_at?: string
}) => {
  const response = await request.post<ResponseType<any>>('/blogs/', params)
  return response
}
export interface BlogDeatil {
  author: string
  content: string
  created_at: string
  id: string
  title: string
  update_at: string
}
/**
 * 根据id获取博客内容
 * @param {string} id - 博客id
 * @returns {Promise<any>}
 */
export const getBlogById = async (id: string) => {
  const response = await request.get<BlogDeatil>('/blogs/' + id)
  return response
}
/**
 * 分页获取博客列表
 * @param {number | string} page - 页数
 * @param {number | string} pageSize - 分页大小
 * @returns {Promise<any>}
 */
export const getBlogByPage = async (
  page: number | string,
  pageSize: number | string
) => {
  const response = await request.get<{
    list: any[]
    page: number
    page_size: number
    total: number
  }>('/blogs', {
    page,
    pageSize,
  })
  return response
}

export const getBaseInfo = async () => {
  const response = await request.get('/base')
  return response
}
