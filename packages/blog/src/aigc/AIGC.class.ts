export interface AIGCClassOptions {
  apiKey: string;
  modelType: string;
  baseUrl: string;
}
export abstract class AIGCClass {
  private apiKey: string;
  private modelType: string;
  private baseUrl: string;
  chain: any;
  model: any;
  constructor({ apiKey, modelType, baseUrl }: AIGCClassOptions) {
    this.apiKey = apiKey;
    this.modelType = modelType;
    this.baseUrl = baseUrl
  }

  abstract sendMsg(msg: any): any


}