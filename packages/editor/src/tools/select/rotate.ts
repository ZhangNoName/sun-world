import { BaseTool, ToolContext, ToolName } from "../../types/tools.type"
import ViewportState from "../../viewport/viewport"

export class RotateTool extends BaseTool {
  name: ToolName = 'resize'
  private isPanning = false
  private lastX = 0
  private lastY = 0
  private viewport: ViewportState
  constructor(ctx: ToolContext) {
    super(ctx)
    this.viewport = ctx.viewport
  }
}