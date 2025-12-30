import { v4 as uuidv4 } from 'uuid'
export const getDeviceId = (): string => {
  return localStorage.getItem('device_id') || uuidv4()
}
