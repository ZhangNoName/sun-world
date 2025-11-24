import { ChatPromptTemplate } from '@langchain/core/prompts'
export interface AIGCClassOptions {
  apiKey: string
  modelType: string
  baseUrl: string
  systemTemplate?: string
  userTemplate?: string
  needpromptTemplate?: boolean
}
export abstract class AIGCClass {
  private apiKey: string
  private modelType: string
  private baseUrl: string
  private _systemTemplate: string
  private _userTemplate: string
  promptTemplate: ChatPromptTemplate
  chain: any
  model: any
  needpromptTemplate: boolean
  constructor({
    apiKey,
    modelType,
    baseUrl,
    userTemplate = '{prompt}',
    needpromptTemplate = true,
    systemTemplate = 'You are a great assistant,',
  }: AIGCClassOptions) {
    this.apiKey = apiKey
    this.modelType = modelType
    this.baseUrl = baseUrl
    this._systemTemplate = systemTemplate
    this._userTemplate = userTemplate
    this.needpromptTemplate = needpromptTemplate
    this.promptTemplate = ChatPromptTemplate.fromMessages([
      ['system', this._systemTemplate],
      ['user', this._userTemplate],
    ])
  }
  /**
   *
   * @param msg 发送消息的格式需要和promptTemplate的格式一致
   *  needpromptTemplate为true的时候需要传入对象，否则需要传入数组
   *  [
  new SystemMessage("Translate the following from English into Italian"),
  new HumanMessage("hi!"),
]; 
   * @returns
   */
  abstract sendMsg(msg: any): any

  initChatPromptTemplate(): void {
    this.promptTemplate = ChatPromptTemplate.fromMessages([
      ['system', this._systemTemplate],
      ['user', this._userTemplate],
    ])
  }

  get systemTemplate(): string {
    return this._systemTemplate
  }

  set systemTemplate(value: string) {
    this._systemTemplate = value
    this.initChatPromptTemplate()
  }
  get userTemplate(): string {
    return this._userTemplate
  }

  set userTemplate(value: string) {
    this._userTemplate = value
    this.initChatPromptTemplate()
  }
}
