import { ChatOpenAI } from '@langchain/openai'
import { StringOutputParser } from '@langchain/core/output_parsers'
import { AIGCClass, AIGCClassOptions } from './AIGC.class'
import { BaseMessage } from '@langchain/core/messages'

export interface OpenAiLangChainOptions extends AIGCClassOptions {
  needParser?: boolean
}
export class OpenAiLangChian extends AIGCClass {
  private needParser: boolean
  model: ChatOpenAI
  parser?: StringOutputParser
  constructor({
    apiKey,
    modelType,
    needParser = true,
    baseUrl = 'https://api.openai.com/v1',
    userTemplate = '',
    needpromptTemplate = true,
    systemTemplate = 'You are a great assistant,',
  }: OpenAiLangChainOptions) {
    super({
      apiKey,
      modelType,
      baseUrl,
      userTemplate,
      needpromptTemplate,
      systemTemplate,
    })
    this.needParser = needParser
    this.model = new ChatOpenAI({
      openAIApiKey: apiKey,
      modelName: modelType,
      configuration: {
        // 自己买的apikey的地址
        baseURL: baseUrl,
      },
    })

    if (needpromptTemplate) {
      this.chain = this.promptTemplate.pipe(this.model)
    } else {
      this.chain = this.model
    }
    if (this.needParser) {
      this.parser = new StringOutputParser()
      // 直接在之后添加pipe不会改变原来的chain
      this.chain = this.chain.pipe(this.parser)
    }
  }

  async sendMsg(msg: any): Promise<any> {
    const response = await this.chain.invoke(msg)
    return response
  }
}
