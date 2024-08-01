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
 * 测试接口
 * @param {Object} params - 请求的配置参数。
 * @param {string} params.input_data - 输入信息
 * @param {string } params.output_data - 生成提示词
 * @param {0 | 1 } params.input_type - 0:文字，1:图片
 * @returns {Promise<any>}
 */
export const postSavePrompt = async (params: {
  input_data: string
  output_data: string
  input_type: number
}) => {
  const response: any = await request.post('/record/tagger_record', params)
  return response
}

