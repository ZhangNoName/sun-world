import type { BaseTool, ToolName } from '../types/tools.type'

export class ToolManager {
  private tools = new Map<ToolName, BaseTool>()
  private activeTool: BaseTool | null = null

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
}
