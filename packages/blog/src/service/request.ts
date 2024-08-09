import { postSavePrompt } from './request'
import { request } from './http'

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
  author?: string
  created_at?: string
}) => {
  const response: any = await request.post('/blogs/', params)
  return response
}
/**
 * 根据id获取博客内容
 * @param {string} id - 博客id
 * @returns {Promise<any>}
 */
export const getBlogById = async (id: string) => {
  const response: any = await request.post('/blogs/' + id)
  return response
}
