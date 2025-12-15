import { InputBindingConfig, MODIFIERS, MouseButton } from './keybinding.type'
import { SWEditor } from '../editor'

/**
 * 按键绑定使用示例
 *
 * 新的IKey格式优势：
 * 1. 直观的布尔值表示修饰键状态
 * 2. 支持通配符'*'匹配任意按键
 * 3. 更简洁的配置语法
 */

// 示例1: 使用默认配置
const editor1 = new SWEditor({
  containerElement: document.getElementById('editor') as HTMLDivElement,
  // 使用默认按键绑定配置
})

// 示例2: 自定义输入绑定配置
const customInputBindings: Partial<InputBindingConfig> = {
  enabled: true,
  // 添加全局条件检查，只有在非拖拽状态下才允许热键
  condition: (editor: SWEditor) => {
    // 检查编辑器状态，比如是否在拖拽中
    return !editor.isDragging?.() // 假设editor有isDragging方法
  },
  bindings: {
    // 自定义保存快捷键
    save: {
      id: 'save',
      inputs: {
        mac: {
          input: {
            metaKey: true,
            keyCode: 's', // Cmd+S on Mac
          },
          eventType: 'keydown',
        },
        win: {
          input: {
            ctrlKey: true,
            keyCode: 's', // Ctrl+S on Windows/Linux
          },
          eventType: 'keydown',
        },
      },
      preventDefault: true,
      description: '保存文档',
      // 直接定义action回调
      action: (event, binding) => {
        console.log('保存文档')
        // editor.save()
      },
    },

    // 自定义撤销快捷键
    undo: {
      id: 'undo',
      inputs: {
        common: {
          input: {
            ctrlKey: true,
            keyCode: 'z',
          },
          eventType: 'keydown',
        },
      },
      preventDefault: true,
      description: '撤销操作',
    },

    // Ctrl+Shift+鼠标左键 - 多选
    'multi-select': {
      id: 'multi-select',
      inputs: {
        common: {
          input: {
            ctrlKey: true,
            shiftKey: true,
            leftMouse: true,
          },
          eventType: 'mousedown',
        },
      },
      preventDefault: true,
      description: '多选模式',
      action: (event, binding) => {
        console.log('进入多选模式')
        // editor.setMultiSelectMode(true)
      },
    },

    // 滚轮缩放（支持Ctrl修饰键调整灵敏度）
    'wheel-zoom': {
      id: 'wheel-zoom',
      inputs: {
        common: {
          input: {}, // 空对象表示匹配所有滚轮事件
          eventType: 'wheel',
        },
      },
      preventDefault: true,
      description: '滚轮缩放',
      action: (event, binding) => {
        const wheelEvent = event as WheelEvent
        const delta = wheelEvent.deltaY
        const ctrlPressed = binding.inputs.common?.input.ctrlKey

        if (ctrlPressed) {
          console.log('精确缩放:', delta * 0.1)
        } else {
          console.log('普通缩放:', delta)
        }
        // editor.zoom(delta, ctrlPressed)
      },
    },

    // 右键拖拽 - 平移视图
    'pan-view': {
      id: 'pan-view',
      inputs: {
        common: {
          input: {
            rightMouse: true,
          },
          eventType: 'mousedown',
        },
      },
      preventDefault: true,
      description: '右键拖拽平移',
      action: (event, binding) => {
        console.log('开始右键平移')
        // editor.startPanning(event as MouseEvent)
      },
    },

    // 通配符示例：Ctrl+任意按键时执行操作
    'wildcard-example': {
      id: 'wildcard-example',
      keys: {
        common: {
          key: {
            ctrlKey: true,
            keyCode: '*', // 匹配任意按键
          },
        },
      },
      preventDefault: false, // 不阻止默认行为，只监听
      description: 'Ctrl+任意按键监听',
      action: (event, binding) => {
        console.log('检测到Ctrl+', event.key)
        // 可以在这里添加统计或其他逻辑
      },
    },

    // 禁用某些默认快捷键
    copy: undefined, // 设置为undefined来禁用
  },
}

const editor2 = new SWEditor({
  containerElement: document.getElementById('editor2') as HTMLDivElement,
  inputBindingConfig: customInputBindings,
})

// 示例3: 运行时动态添加按键绑定
const editor3 = new SWEditor({
  containerElement: document.getElementById('editor3') as HTMLDivElement,
})

// 动态添加绑定
editor3.addKeyBinding('my-custom-action', {
  id: 'my-custom-action',
  inputs: {
    common: {
      input: {
        ctrlKey: true,
        shiftKey: true,
        keyCode: 'm',
      },
      eventType: 'keydown',
    },
  },
  preventDefault: true,
  description: '我的自定义操作',
})

// 注册处理器
editor3.registerKeyHandler('my-custom-action', (binding, event) => {
  console.log('执行自定义操作')
  // 执行自定义逻辑
})

// 示例4: 条件控制输入绑定生效
const conditionalInputBindings: Partial<InputBindingConfig> = {
  // 只有在画布有选中元素时才允许删除
  condition: (editor: SWEditor) => {
    return editor.hasSelection?.() // 假设有选中状态检查方法
  },
  bindings: {
    delete: {
      id: 'delete',
      inputs: {
        common: {
          input: {
            keyCode: 'Delete',
          },
          eventType: 'keydown',
        },
      },
      preventDefault: true,
      description: '删除选中元素',
      action: (event, binding) => {
        console.log('删除选中元素')
        // editor.deleteSelection()
      },
    },
  },
}

const editor4 = new SWEditor({
  containerElement: document.getElementById('editor4') as HTMLDivElement,
  inputBindingConfig: conditionalInputBindings,
})

// 示例5: 获取和管理输入绑定
const inputBindingManager = editor1.getKeyBindingManager()

// 获取所有绑定
const allBindings = inputBindingManager.getBindings()
console.log('所有输入绑定:', allBindings)

// 获取特定绑定
const saveBinding = inputBindingManager.getBinding('save')
console.log('保存绑定:', saveBinding)

// 获取当前输入状态
console.log('当前输入状态:', inputBindingManager.inputState)

// 启用/禁用输入绑定
inputBindingManager.disable() // 禁用所有绑定
inputBindingManager.enable() // 重新启用

// 更新配置
inputBindingManager.updateConfig({
  enabled: false, // 禁用所有绑定
})
