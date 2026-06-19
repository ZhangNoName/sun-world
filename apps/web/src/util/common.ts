import { v4 } from 'uuid'
/**
 * 获取 uuid
 * @returns {string} uuid
 */
export const getUUID = (): string => {
  return v4()
}