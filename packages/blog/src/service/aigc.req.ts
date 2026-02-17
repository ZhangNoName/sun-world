import { request } from './http'
export const getSessionList = async () => {
  const response = await request.get('/aigc/session')
  return response
}

export const createSession = async (data: { name: string }) => {
  const response = await request.post('/aigc/session', data)
  return response
}

export const updateSession = async (id: string, data: { name: string }) => {
  const response = await request.put(`/aigc/session/${id}`, data)
  return response
}
