import type { BaseTool, ToolContext, ToolName } from '../types/tools.type'
import CommentTool from './commentTool'
import DragTool from './dragTool'
import { RectTool } from './reactTools'
import SelectTool from './select'
type ToolsListener = () => void
export class ToolManager {
  private tools = new Map<ToolName, BaseTool>()
  private activeTool: BaseTool | null = null
  private listeners: Set<ToolsListener> = new Set()
  private ctx: ToolContext

  constructor(ctx: ToolContext) {
    this.ctx = ctx
    this.registerTool(new RectTool(ctx))
    this.registerTool(new SelectTool(ctx))
    this.registerTool(new DragTool(ctx))
    this.registerTool(new CommentTool(ctx))
  }
  registerTool(tool: BaseTool) {
    this.tools.set(tool.name, tool)
  }

  activateTool(name: ToolName) {
    console.log('Activating tool:', name)
    const tool = this.tools.get(name)
    if (!tool) return

    // 关闭旧工具
    this.activeTool?.deactivate?.()

    // 激活新工具
    this.activeTool = tool
    tool.activate?.()
    this.emit()
  }

  getActiveTool(): BaseTool | null {
    return this.activeTool
  }
  /**
   * 获取工具列表
   * @returns 返回所有工具的键名数组
   */
  getTools() {
    return [...this.tools.keys()]
  }
  /**
   * 获取当前激活的工具名称
   * @returns 返回当前激活的工具名称
   */
  getActiveToolName(): ToolName | null {
    return this.activeTool?.name || null
  }

  public on(listener: ToolsListener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener) // 取消订阅
  }

  private emit() {
    this.listeners.forEach((fn) => fn())
  }
}
