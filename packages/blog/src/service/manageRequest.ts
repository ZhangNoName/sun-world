import { request } from './http'
/**
 * 获取表格数据
 * @returns {Promise<CategoryResponse[]>}
 */
export const getDataByPage = async (
  url: string,
  params: {
    page: number
    page_size: number
    [key: string]: any
  }
) => {
  const response = await request.get<{
    list: any[]
    page: number
    page_size: number
    total: number
  }>(url, params)
  return response
}
