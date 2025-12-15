/**
 * 统一输入绑定系统演示
 *
 * 这个演示展示了如何使用新的 InputBindingManager 来统一管理
 * 键盘和鼠标事件，以及在操作过程中检查修饰键状态。
 */

import { InputBindingConfig, MODIFIERS, MouseButton } from './keybinding.type'
import { SWEditor } from '../editor'

// 创建一个自定义的输入绑定配置
export const createDemoInputBindings = (): Partial<InputBindingConfig> => {
  return {
    enabled: true,

    // 全局条件：只有在编辑器准备就绪时才允许输入绑定
    condition: (editor: SWEditor) => {
      return true // 在实际应用中可以检查编辑器状态
    },

    bindings: {
      // === 键盘操作 ===

      // 保存 - Cmd+S (Mac) 或 Ctrl+S (Win)
      save: {
        id: 'save',
        inputs: {
          mac: {
            input: { metaKey: true, keyCode: 's' },
            eventType: 'keydown',
          },
          win: {
            input: { ctrlKey: true, keyCode: 's' },
            eventType: 'keydown',
          },
        },
        preventDefault: true,
        description: '保存文档',
        action: (event, binding) => {
          console.log('💾 保存文档')
          // 检查是否同时按了Shift键
          const inputState = binding.inputs.common?.input
          if (inputState?.shiftKey) {
            console.log('   另存为...')
          }
        },
      },

      // 全选 - Ctrl+A
      'select-all': {
        id: 'select-all',
        inputs: {
          common: {
            input: { ctrlKey: true, keyCode: 'a' },
            eventType: 'keydown',
          },
        },
        preventDefault: true,
        description: '全选',
        action: () => console.log('🎯 全选所有元素'),
      },

      // === 鼠标操作 ===

      // 右键菜单
      'context-menu': {
        id: 'context-menu',
        inputs: {
          common: {
            input: { rightMouse: true },
            eventType: 'mousedown',
          },
        },
        preventDefault: true,
        description: '右键菜单',
        action: (event) => {
          const mouseEvent = event as MouseEvent
          console.log(
            `📋 右键菜单 at (${mouseEvent.clientX}, ${mouseEvent.clientY})`
          )
        },
      },

      // Ctrl+左键 - 添加到选择
      'ctrl-select': {
        id: 'ctrl-select',
        inputs: {
          common: {
            input: { ctrlKey: true, leftMouse: true },
            eventType: 'mousedown',
          },
        },
        preventDefault: false, // 不阻止默认行为，允许正常选择
        description: 'Ctrl+选择',
        action: () => console.log('➕ 添加到选择'),
      },

      // Shift+左键 - 范围选择
      'shift-select': {
        id: 'shift-select',
        inputs: {
          common: {
            input: { shiftKey: true, leftMouse: true },
            eventType: 'mousedown',
          },
        },
        preventDefault: false,
        description: 'Shift+范围选择',
        action: () => console.log('📦 范围选择'),
      },

      // Ctrl+Shift+左键 - 反向选择
      'ctrl-shift-select': {
        id: 'ctrl-shift-select',
        inputs: {
          common: {
            input: { ctrlKey: true, shiftKey: true, leftMouse: true },
            eventType: 'mousedown',
          },
        },
        preventDefault: false,
        description: 'Ctrl+Shift+反向选择',
        action: () => console.log('🔄 反向选择'),
      },

      // 中键拖拽 - 平移视图
      'middle-drag': {
        id: 'middle-drag',
        inputs: {
          common: {
            input: { middleMouse: true },
            eventType: 'mousedown',
          },
        },
        preventDefault: true,
        description: '中键平移',
        action: () => console.log('🏗️ 开始中键平移'),
      },

      // 滚轮缩放
      'wheel-zoom': {
        id: 'wheel-zoom',
        inputs: {
          common: {
            input: {}, // 空条件匹配所有滚轮事件
            eventType: 'wheel',
          },
        },
        preventDefault: true,
        description: '滚轮缩放',
        action: (event) => {
          const wheelEvent = event as WheelEvent
          const delta = wheelEvent.deltaY
          const direction = delta > 0 ? '缩小' : '放大'
          console.log(`🔍 ${direction} (delta: ${delta})`)
        },
      },

      // Ctrl+滚轮 - 精确缩放
      'ctrl-wheel-zoom': {
        id: 'ctrl-wheel-zoom',
        inputs: {
          common: {
            input: { ctrlKey: true }, // 只有Ctrl键按下时
            eventType: 'wheel',
          },
        },
        preventDefault: true,
        description: 'Ctrl+滚轮精确缩放',
        action: (event) => {
          const wheelEvent = event as WheelEvent
          const delta = wheelEvent.deltaY * 0.1 // 更精确的缩放
          const direction = delta > 0 ? '微缩' : '微放'
          console.log(`🎯 ${direction} (精确模式, delta: ${delta})`)
        },
      },

      // === 高级组合 ===

      // 空格键按下 - 临时平移模式
      'space-pan-mode': {
        id: 'space-pan-mode',
        inputs: {
          common: {
            input: { keyCode: ' ' }, // 空格键
            eventType: 'keydown',
          },
        },
        preventDefault: true,
        description: '空格键平移模式',
        action: () => console.log('🖱️ 进入空格平移模式'),
      },

      // 通配符示例：Ctrl+任意键监听
      'ctrl-any-key': {
        id: 'ctrl-any-key',
        inputs: {
          common: {
            input: { ctrlKey: true, keyCode: '*' },
            eventType: 'keydown',
          },
        },
        preventDefault: false, // 不阻止，让其他处理器处理
        description: 'Ctrl+任意键监听',
        action: (event) => {
          const keyboardEvent = event as KeyboardEvent
          console.log(`🎹 Ctrl+${keyboardEvent.key} 被按下`)
        },
      },
    },
  }
}

// 使用示例
export const demoUsage = () => {
  // 创建编辑器实例
  const editor = new SWEditor({
    containerElement: document.getElementById('editor') as HTMLDivElement,
    inputBindingConfig: createDemoInputBindings(),
  })

  // 获取输入绑定管理器
  const inputManager = editor.getKeyBindingManager()

  // 监听输入状态变化
  console.log('当前输入状态:', inputManager.inputState)

  // 动态添加新的绑定
  inputManager.addBinding({
    id: 'custom-action',
    inputs: {
      common: {
        input: { altKey: true, keyCode: 'x' },
        eventType: 'keydown',
      },
    },
    preventDefault: true,
    description: '自定义操作',
    action: () => console.log('🎨 执行自定义操作'),
  })

  // 注册处理器（如果不使用action回调）
  inputManager.registerHandler('custom-action', (binding, event) => {
    console.log('处理器模式：自定义操作被触发')
  })

  console.log('🎮 统一输入绑定系统已就绪！')
  console.log('试试这些操作：')
  console.log('- Ctrl+S 保存')
  console.log('- 右键显示菜单')
  console.log('- Ctrl+左键添加选择')
  console.log('- Shift+左键范围选择')
  console.log('- 滚轮缩放')
  console.log('- Ctrl+滚轮精确缩放')
  console.log('- 空格键进入平移模式')
}
