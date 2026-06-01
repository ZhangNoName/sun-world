/**
 * Canvas 编辑器的通用接口定义
 * 支持：初始化、销毁、渲染、导入导出、历史记录、工具系统等
 */
export interface CanvasEditor {
  /**
   * 初始化编辑器
   * @param canvas 传入要绑定的 <canvas> 元素
   */
  init(canvas: HTMLCanvasElement): void

  /**
   * 销毁编辑器，释放内存资源
   */
  destroy(): void

  /**
   * 渲染当前场景（每次更新对象后应调用）
   */
  render(): void

  /**
   * 向画布中添加对象（图形、文本、图片等）
   * @param obj 对象实例（自定义结构）
   */
  addObject(obj: any): void

  /**
   * 根据对象 id 移除画布中的元素
   */
  removeObject(id: string): void

  /**
   * 根据 id 选中指定元素
   */
  selectById(id: string): void

  /**
   * 将当前画布内容序列化为 JSON
   * （用于保存、复制、导出）
   */
  toJSON(): any

  /**
   * 从 JSON 数据恢复画布内容
   * @param data 画布数据（通常来自 toJSON）
   */
  fromJSON(data: any): void

  /**
   * 手动保存当前编辑状态（通常会快照当前数据）
   */
  save(): void

  /**
   * 从存储中加载上一次保存的内容
   */
  load(): void

  /**
   * 清空当前画布内容
   */
  clear(): void

  /**
   * 导出画布（可导出为图片、JSON 或其他格式）
   */
  export(): void

  /**
   * 导入外部数据（与 export 对应）
   * @param data 数据对象
   */
  import(data: any): void

  /**
   * 工具系统，用于切换和管理绘图工具（如移动、选择、矩形、文本等）
   */
  tools: ToolsManager

  /**
   * 历史系统，管理撤销、重做、快照等
   */
  his: HisManager

  /**
   * 当前编辑器的数据状态，可用于外部同步或持久化
   */
  data: any
}

/**
 * 工具管理系统接口
 * 用于管理不同类型的操作工具
 */
export interface ToolsManager {
  /**
   * 当前激活的工具类型
   */
  activeTool: string

  /**
   * 注册新工具
   * @param name 工具名称（唯一）
   * @param handler 工具实例
   */
  registerTool(name: string, handler: any): void

  /**
   * 激活指定工具
   * @param name 工具名称
   */
  activateTool(name: string): void

  /**
   * 获取当前工具实例
   */
  getCurrentTool(): any

  /**
   * 获取所有工具
   */
  getAllTools(): Record<string, any>

  /**
   * 销毁工具系统（清理事件）
   */
  destroy(): void
}

/**
 * 操作历史管理系统接口
 * 用于记录编辑操作，实现撤销与重做
 */
export interface HisManager {
  /**
   * 添加一条历史记录
   * @param data 任意可以序列化的操作快照
   */
  add(data: any): void

  /**
   * 撤销上一步操作
   */
  back(): void

  /**
   * 重做下一步操作
   */
  next(): void

  /**
   * 清空历史记录
   */
  clear(): void

  /**
   * 是否可以撤销
   */
  canBack(): boolean

  /**
   * 是否可以重做
   */
  canNext(): boolean

  /**
   * 获取全部历史记录
   */
  getHistory(): any[]

  /**
   * 获取当前历史索引位置
   */
  getCurrentIndex(): number

  /**
   * 获取历史总长度
   */
  getHistoryLength(): number

  /**
   * 获取指定历史快照
   */
  getHistoryData(index: number): any
}
