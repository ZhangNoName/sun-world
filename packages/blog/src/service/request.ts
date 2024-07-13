import { request } from './http'

/**
 * 获取page数据。
 * @param {Object} config - 请求的配置参数。
 * @param {string | number} config.page - 请求的页码。
 * @param {string | number} config.limit - 每页的记录数限制。
 * @returns {Promise<any>}
 */
export const getTagRecordByPage = async (config: {
  page: string | number
  limit: string | number
}) => {
  const response: any = await request.get('/record/tagger_record', config)
  return response
}

/**
 * 保存生成结果
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

/**
 * 根据Id删除prompt记录
 * @param id 参数
 * @returns
 */
export const deletePromptRecordById = async (id: string) => {
  const response: any = await request.delete('/record/tagger_record', {
    record_id: id,
  })
  return response
}
