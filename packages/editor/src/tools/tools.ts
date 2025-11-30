import type { BaseTool } from '../types/tools.type'

export class ToolManager {
  private tools = new Map<string, BaseTool>()
  private activeTool: BaseTool | null = null

  registerTool(tool: BaseTool) {
    this.tools.set(tool.name, tool)
  }

  activateTool(name: string) {
    const tool = this.tools.get(name)
    if (!tool) return

    // 关闭旧工具
    this.activeTool?.deactivate?.()

    // 激活新工具
    this.activeTool = tool
    tool.activate?.()
  }

  getActiveTool() {
    return this.activeTool
  }
  /**
   * 获取工具列表
   * @returns 返回所有工具的键名数组
   */
  getTools() {
    return [...this.tools.keys()]
  }
}
