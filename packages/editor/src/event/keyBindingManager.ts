import {
  KeyBinding,
  KeyBindingConfig,
  KeyBindingHandler,
  ModifierKey,
  KeyCondition,
  DEFAULT_KEY_BINDINGS,
} from '../types/keybinding.type'
import { SWEditor } from '../editor'

/**
 * 🟧 KeyBindingManager（按键绑定管理器）
 *
 * 负责：
 * 1. 管理按键绑定配置
 * 2. 匹配键盘事件与按键绑定
 * 3. 执行绑定的处理函数或action回调
 * 4. 支持动态添加/移除绑定
 * 5. 支持平台特定的按键绑定
 * 6. 支持条件检查
 */
export class KeyBindingManager {
  private config: KeyBindingConfig
  private handlers: Map<string, KeyBindingHandler> = new Map()
  private enabled = true
  private editor: SWEditor
  private platform: 'mac' | 'win' = this.detectPlatform()

  constructor(editor: SWEditor, config?: Partial<KeyBindingConfig>) {
    this.editor = editor
    this.config = this.mergeConfig(DEFAULT_KEY_BINDINGS, config)
    this.enabled = this.config.enabled ?? true

    console.log('KeyBindingManager 初始化完成，平台:', this.platform)
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
    defaultConfig: KeyBindingConfig,
    userConfig?: Partial<KeyBindingConfig>
  ): KeyBindingConfig {
    const merged = { ...defaultConfig, ...userConfig }

    // 深度合并bindings
    if (userConfig?.bindings) {
      merged.bindings = { ...defaultConfig.bindings, ...userConfig.bindings }
    }

    return merged
  }

  /**
   * 处理键盘事件
   * @param event 键盘事件
   * @returns 是否匹配并处理了绑定
   */
  handleKeyEvent(event: KeyboardEvent): boolean {
    if (!this.enabled) return false

    // 检查全局条件
    if (this.config.condition && !this.config.condition(this.editor)) {
      return false
    }

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
   * 注册按键绑定处理器
   * @param bindingId 绑定ID
   * @param handler 处理函数
   */
  registerHandler(bindingId: string, handler: KeyBindingHandler): void {
    this.handlers.set(bindingId, handler)
  }

  /**
   * 移除按键绑定处理器
   * @param bindingId 绑定ID
   */
  unregisterHandler(bindingId: string): void {
    this.handlers.delete(bindingId)
  }

  /**
   * 添加新的按键绑定
   * @param binding 绑定配置
   */
  addBinding(binding: KeyBinding): void {
    // 检查是否已存在相同ID的绑定
    const existingIndex = this.config.bindings.findIndex(
      (b) => b.id === binding.id
    )
    if (existingIndex >= 0) {
      this.config.bindings[existingIndex] = binding
    } else {
      this.config.bindings.push(binding)
    }
  }

  /**
   * 移除按键绑定
   * @param bindingId 绑定ID
   */
  removeBinding(bindingId: string): void {
    this.config.bindings = this.config.bindings.filter(
      (b) => b.id !== bindingId
    )
  }

  /**
   * 更新按键绑定配置
   * @param config 新的配置
   */
  updateConfig(config: Partial<KeyBindingConfig>): void {
    this.config = { ...this.config, ...config }
    this.enabled = this.config.enabled ?? true
  }

  /**
   * 获取当前配置
   */
  getConfig(): KeyBindingConfig {
    return { ...this.config }
  }

  /**
   * 启用按键绑定
   */
  enable(): void {
    this.enabled = true
    this.config.enabled = true
  }

  /**
   * 禁用按键绑定
   */
  disable(): void {
    this.enabled = false
    this.config.enabled = false
  }

  /**
   * 匹配键盘事件与按键绑定
   * @param event 键盘事件
   * @returns 匹配的绑定或null
   */
  private matchBinding(event: KeyboardEvent): KeyBinding | null {
    for (const binding of Object.values(this.config.bindings)) {
      const condition = this.getPlatformCondition(binding)
      if (condition && this.matchesCondition(condition, event)) {
        console.log('匹配到绑定: ', binding)
        return binding
      }
    }
    return null
  }

  /**
   * 获取当前平台的按键条件
   */
  private getPlatformCondition(binding: KeyBinding): KeyCondition | null {
    // 优先使用平台特定的条件
    const platformCondition = binding.keys[this.platform]
    if (platformCondition) {
      return platformCondition
    }

    // 回退到通用条件
    return binding.keys.common || null
  }

  /**
   * 匹配按键条件
   */
  private matchesCondition(
    condition: KeyCondition,
    event: KeyboardEvent
  ): boolean {
    // 检查按键条件
    if (!this.matchesKeyCondition(condition.key, event)) {
      return false
    }

    // 检查触发时机
    const shouldTrigger =
      condition.onKeyDown !== false
        ? event.type === 'keydown'
        : event.type === 'keyup'

    return shouldTrigger
  }

  /**
   * 检查按键条件是否匹配
   */
  private matchesKeyCondition(
    keyCondition: IKey,
    event: KeyboardEvent
  ): boolean {
    // 检查按键代码（支持通配符'*'）
    if (
      keyCondition.keyCode !== '*' &&
      !this.matchesKey(keyCondition.keyCode, event.key)
    ) {
      return false
    }

    // 检查修饰键（只检查明确定义的修饰键，未定义的表示不关心该修饰键状态）
    if (
      keyCondition.ctrlKey !== undefined &&
      keyCondition.ctrlKey !== event.ctrlKey
    ) {
      return false
    }
    if (
      keyCondition.shiftKey !== undefined &&
      keyCondition.shiftKey !== event.shiftKey
    ) {
      return false
    }
    if (
      keyCondition.altKey !== undefined &&
      keyCondition.altKey !== event.altKey
    ) {
      return false
    }
    if (
      keyCondition.metaKey !== undefined &&
      keyCondition.metaKey !== event.metaKey
    ) {
      return false
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
   * 检查修饰键是否匹配（保留旧方法以兼容性）
   */
  private matchesModifiers(
    requiredModifiers: ModifierKey[],
    event: KeyboardEvent
  ): boolean {
    // 检查所有必需的修饰键是否都按下了
    for (const modifier of requiredModifiers) {
      if (!this.isModifierPressed(modifier, event)) {
        return false
      }
    }

    // 检查是否有多余的修饰键（严格匹配）
    const pressedModifiers = this.getPressedModifiers(event)
    if (pressedModifiers.length !== requiredModifiers.length) {
      return false
    }

    return true
  }

  /**
   * 检查指定的修饰键是否按下
   */
  private isModifierPressed(
    modifier: ModifierKey,
    event: KeyboardEvent
  ): boolean {
    switch (modifier) {
      case ModifierKey.CTRL:
        return event.ctrlKey
      case ModifierKey.ALT:
        return event.altKey
      case ModifierKey.SHIFT:
        return event.shiftKey
      case ModifierKey.META:
        return event.metaKey
      default:
        return false
    }
  }

  /**
   * 获取当前按下的修饰键列表
   */
  private getPressedModifiers(event: KeyboardEvent): ModifierKey[] {
    const modifiers: ModifierKey[] = []
    if (event.ctrlKey) modifiers.push(ModifierKey.CTRL)
    if (event.altKey) modifiers.push(ModifierKey.ALT)
    if (event.shiftKey) modifiers.push(ModifierKey.SHIFT)
    if (event.metaKey) modifiers.push(ModifierKey.META)
    return modifiers
  }

  /**
   * 获取所有绑定
   */
  getBindings(): KeyBinding[] {
    return Object.values(this.config.bindings)
  }

  /**
   * 根据ID查找绑定
   */
  getBinding(bindingId: string): KeyBinding | undefined {
    return this.config.bindings[bindingId]
  }

  /**
   * 销毁管理器
   */
  destroy(): void {
    this.handlers.clear()
  }
}
