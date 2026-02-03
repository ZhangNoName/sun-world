export enum MsgRole {
  USER = 'user',
  AI = 'ai',
  SYSTEM = 'system',
  TOOL = 'tool',
}
export interface ISession {
  id: string
  name: string
  description: string
  createdAt?: string
  updatedAt?: string
}
export interface IMsg {
  id: string
  role: MsgRole
  content: string
  createdAt?: string
  updatedAt?: string
}
