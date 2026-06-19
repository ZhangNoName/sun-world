import {
  InputBinding,
  InputBindingConfig,
  InputBindingHandler,
  InputCondition,
  MouseButton,
  IInput,
  DEFAULT_INPUT_BINDINGS,
} from '../types/keybinding.type'
import { SWEditor } from '../editor'

/**
 * 🟧 InputBindingManager（输入绑定管理器）
 *
 * 负责：
 * 1. 统一管理键盘和鼠标输入绑定配置
 * 2. 匹配输入事件与绑定条件
 * 3. 执行绑定的处理函数或action回调
 * 4. 支持动态添加/移除绑定
 * 5. 支持平台特定的输入绑定
 * 6. 支持条件检查
 * 7. 维护输入状态（键盘修饰键+鼠标按键状态）
 */
export class InputBindingManager {
  private bindings: Map<string, InputBinding[]> = new Map<
    string,
    InputBinding[]
  >()
  private handlers: Map<string, InputBindingHandler> = new Map<
    string,
    InputBindingHandler
  >()
  private enabled = true
  private platform: 'mac' | 'win' = this.detectPlatform()

  // 输入状态管理 - 实时反映当前输入设备状态
  public inputState = {
    // 键盘修饰键状态
    shift: false,
    alt: false,
    ctrl: false,
    meta: false,
    space: false,

    // 鼠标按键状态
    leftMouse: false,
    rightMouse: false,
    middleMouse: false,

    // 鼠标位置（可选，用于某些高级功能）
    mouseX: 0,
    mouseY: 0,
  }

  constructor(editor: SWEditor, config?: Partial<InputBindingConfig>) {
    const mergedConfig = this.mergeConfig(DEFAULT_INPUT_BINDINGS, config)
    this.enabled = mergedConfig.enabled ?? true
    Object.values(mergedConfig.bindings).forEach((binding) =>
      this.addBinding(binding)
    )

    console.log('InputBindingManager 初始化完成，平台:', this.platform)
  }

  /**
   * 检测当前平台
   */
  private detectPlatform(): 'mac' | 'win' {
    return navigator.platform.toLowerCase().includes('mac') ? 'mac' : 'win'
  }

  /**
   * 合并配置
   */
  private mergeConfig(
    defaultConfig: InputBindingConfig,
    userConfig?: Partial<InputBindingConfig>
  ): InputBindingConfig {
    const merged = { ...defaultConfig, ...userConfig }

    // 深度合并bindings
    if (userConfig?.bindings) {
      merged.bindings = { ...defaultConfig.bindings, ...userConfig.bindings }
    }

    return merged
  }

  /**
   * 处理输入事件（键盘、鼠标、滚轮）
   * @param event 输入事件
   * @returns 是否匹配并处理了绑定
   */
  handleInputEvent(event: Event): boolean {
    if (!this.enabled) return false

    // 先更新输入状态，再检查绑定（确保状态是最新的）
    this.updateInputState(event)

    const binding = this.matchBinding(event)
    if (!binding) return false

    // 执行action回调或处理器
    let result = true
    if (binding.action) {
      binding.action(event, binding)
    } else {
      const handler = this.handlers.get(binding.id)
      if (handler) {
        result = handler(binding, event) !== false
      }
    }

    // 处理默认行为和冒泡
    if (binding.preventDefault) {
      event.preventDefault()
    }
    if (binding.stopPropagation) {
      event.stopPropagation()
    }

    return result
  }

  /**
   * 注册输入绑定处理器
   * @param bindingId 绑定ID
   * @param handler 处理函数
   */
  registerHandler(bindingId: string, handler: InputBindingHandler): void {
    this.handlers.set(bindingId, handler)
  }

  /**
   * 移除输入绑定处理器
   * @param bindingId 绑定ID
   */
  unregisterHandler(bindingId: string): void {
    this.handlers.delete(bindingId)
  }

  /**
   * 更新输入状态 - 统一管理键盘和鼠标状态
   */
  private updateInputState(event: Event): void {
    // 所有事件都可能包含键盘修饰键信息
    if ('shiftKey' in event) {
      this.inputState.shift = (
        event as KeyboardEvent | MouseEvent | WheelEvent
      ).shiftKey
    }
    if ('altKey' in event) {
      this.inputState.alt = (
        event as KeyboardEvent | MouseEvent | WheelEvent
      ).altKey
    }
    if ('ctrlKey' in event) {
      this.inputState.ctrl = (
        event as KeyboardEvent | MouseEvent | WheelEvent
      ).ctrlKey
    }
    if ('metaKey' in event) {
      this.inputState.meta = (
        event as KeyboardEvent | MouseEvent | WheelEvent
      ).metaKey
    }

    if (event instanceof KeyboardEvent) {
      // 处理键盘特定状态
      if (event.code === 'Space') {
        this.inputState.space = event.type === 'keydown'
      }
    } else if (event instanceof MouseEvent) {
      // 更新鼠标按键状态
      this.updateMouseButtonState(event)

      // 更新鼠标位置
      this.inputState.mouseX = event.clientX
      this.inputState.mouseY = event.clientY
    }
  }

  /**
   * 更新鼠标按键状态
   */
  private updateMouseButtonState(event: MouseEvent): void {
    switch (event.type) {
      case 'mousedown':
        switch (event.button) {
          case MouseButton.LEFT:
            this.inputState.leftMouse = true
            break
          case MouseButton.RIGHT:
            this.inputState.rightMouse = true
            break
          case MouseButton.MIDDLE:
            this.inputState.middleMouse = true
            break
        }
        break
      case 'mouseup':
        switch (event.button) {
          case MouseButton.LEFT:
            this.inputState.leftMouse = false
            break
          case MouseButton.RIGHT:
            this.inputState.rightMouse = false
            break
          case MouseButton.MIDDLE:
            this.inputState.middleMouse = false
            break
        }
        break
    }
  }

  /**
   * 添加新的输入绑定
   * @param binding 绑定配置
   */
  addBinding(binding: InputBinding): void {
    // 同 ID 的 binding 以“后注册优先”保存，避免旧默认绑定在事件匹配时被优先命中。
    this.bindings.set(binding.id, [binding])
  }

  /**
   * 移除输入绑定
   * @param bindingId 绑定ID
   */
  removeBinding(bindingId: string): void {
    this.handlers.delete(bindingId)
    this.bindings.delete(bindingId)
  }

  /**
   * 启用按键绑定
   */
  enable(): void {
    this.enabled = true
  }

  /**
   * 禁用按键绑定
   */
  disable(): void {
    this.enabled = false
  }

  /**
   * 匹配输入事件与绑定
   * @param event 输入事件
   * @returns 匹配的绑定或null
   */
  private matchBinding(event: Event): InputBinding | null {
    for (const bindings of this.bindings.values()) {
      for (const binding of bindings) {
        const condition = this.getPlatformCondition(binding)
        if (condition && this.matchesCondition(condition, event)) {
          console.log('匹配到绑定: ', binding)
          return binding
        }
      }
    }
    return null
  }

  /**
   * 获取当前平台的输入条件
   */
  private getPlatformCondition(binding: InputBinding): InputCondition | null {
    // 优先使用平台特定的条件
    const platformCondition = binding.inputs[this.platform]
    if (platformCondition) {
      return platformCondition
    }

    // 回退到通用条件
    return binding.inputs.common || null
  }

  /**
   * 匹配输入条件
   */
  private matchesCondition(condition: InputCondition, event: Event): boolean {
    // 检查事件类型
    if (condition.eventType !== event.type) {
      return false
    }

    // 检查输入条件
    return this.matchesInputCondition(condition.input, event)
  }

  /**
   * 检查输入条件是否匹配
   */
  private matchesInputCondition(inputCondition: IInput, event: Event): boolean {
    // 检查键盘修饰键
    if (
      inputCondition.ctrlKey !== undefined &&
      inputCondition.ctrlKey !== this.inputState.ctrl
    ) {
      return false
    }
    if (
      inputCondition.shiftKey !== undefined &&
      inputCondition.shiftKey !== this.inputState.shift
    ) {
      return false
    }
    if (
      inputCondition.altKey !== undefined &&
      inputCondition.altKey !== this.inputState.alt
    ) {
      return false
    }
    if (
      inputCondition.metaKey !== undefined &&
      inputCondition.metaKey !== this.inputState.meta
    ) {
      return false
    }

    // 检查鼠标按键
    if (
      inputCondition.leftMouse !== undefined &&
      inputCondition.leftMouse !== this.inputState.leftMouse
    ) {
      return false
    }
    if (
      inputCondition.rightMouse !== undefined &&
      inputCondition.rightMouse !== this.inputState.rightMouse
    ) {
      return false
    }
    if (
      inputCondition.middleMouse !== undefined &&
      inputCondition.middleMouse !== this.inputState.middleMouse
    ) {
      return false
    }

    // 检查键盘按键（仅对键盘事件有效）
    if (inputCondition.keyCode !== undefined) {
      if (event instanceof KeyboardEvent) {
        if (
          inputCondition.keyCode !== '*' &&
          !this.matchesKey(inputCondition.keyCode, event.key)
        ) {
          return false
        }
      } else {
        // 非键盘事件不能匹配键盘按键条件
        return false
      }
    }

    // 检查鼠标按钮（仅对鼠标事件有效）
    if (inputCondition.mouseButton !== undefined) {
      if (event instanceof MouseEvent) {
        if (inputCondition.mouseButton !== event.button) {
          return false
        }
      } else {
        // 非鼠标事件不能匹配鼠标按钮条件
        return false
      }
    }

    return true
  }

  /**
   * 检查按键是否匹配
   */
  private matchesKey(bindingKey: string, eventKey: string): boolean {
    // 支持多种按键表示方式
    const key = bindingKey.toLowerCase()
    const eKey = eventKey.toLowerCase()

    return key === eKey
  }

  /**
   * 获取所有绑定
   */
  getBindings(): InputBinding[] {
    return Array.from(this.bindings.values()).flat()
  }

  /**
   * 根据ID查找绑定
   */
  getBinding(bindingId: string): InputBinding | undefined {
    const bindings = this.bindings.get(bindingId)
    return bindings?.[0]
  }

  /**
   * 销毁管理器
   */
  destroy(): void {
    this.handlers.clear()
    this.bindings.clear()
  }
}
