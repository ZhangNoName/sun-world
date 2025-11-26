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
}
