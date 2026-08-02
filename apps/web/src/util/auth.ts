import { v4 as uuidv4 } from 'uuid'
export const getDeviceId = (): string => {
  const existing = localStorage.getItem('device_id')
  if (existing) return existing
  const deviceId = uuidv4()
  localStorage.setItem('device_id', deviceId)
  return deviceId
}
