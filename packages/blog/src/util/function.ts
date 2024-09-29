import moment from 'moment'

/**
 * 格式化日期字符串
 *
 * @param {string} s - 需要格式化的日期字符串
 * @param {string} format - 目标日期格式，默认为 yyyy-MM-dd
 * @returns {string} 格式化后的日期字符串
 *
 * @example
 * FormatDate('2023-11-25T12:00:00Z', 'YYYY年MM月DD日') // 返回 '2023年11月25日'
 */
export const formatDate = (s: string, format: string = 'yyyy-MM-DD HH:mm') => {
  return moment(s).format(format)
}
