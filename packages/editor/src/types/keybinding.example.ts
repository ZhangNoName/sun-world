import { KeyBindingConfig, MODIFIERS } from './keybinding.type'
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

// 示例2: 自定义按键绑定配置
const customKeyBindings: Partial<KeyBindingConfig> = {
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
      keys: {
        mac: {
          key: {
            metaKey: true,
            keyCode: 's', // Cmd+S on Mac
          },
        },
        win: {
          key: {
            ctrlKey: true,
            keyCode: 's', // Ctrl+S on Windows/Linux
          },
        },
      },
      preventDefault: true,
      description: '保存文档',
      // 直接定义action回调
      action: (event, binding) => {
        console.log('保存文档')
        // 执行保存逻辑
        // editor.save()
      },
    },

    // 自定义撤销快捷键
    undo: {
      id: 'undo',
      keys: {
        common: {
          key: {
            ctrlKey: true,
            keyCode: 'z',
          },
        },
      },
      preventDefault: true,
      description: '撤销操作',
    },

    // 添加自定义快捷键
    'custom-zoom-in': {
      id: 'custom-zoom-in',
      keys: {
        mac: {
          key: {
            metaKey: true,
            keyCode: '=', // Cmd+=
          },
        },
        win: {
          key: {
            ctrlKey: true,
            keyCode: '=', // Ctrl+=
          },
        },
      },
      preventDefault: true,
      description: '放大',
      action: (event, binding) => {
        console.log('放大视图')
        // editor.zoomIn()
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
  keyBindingConfig: customKeyBindings,
})

// 示例3: 运行时动态添加按键绑定
const editor3 = new SWEditor({
  containerElement: document.getElementById('editor3') as HTMLDivElement,
})

// 动态添加绑定
editor3.addKeyBinding('my-custom-action', {
  id: 'my-custom-action',
  keys: {
    common: {
      key: {
        ctrlKey: true,
        shiftKey: true,
        keyCode: 'm',
      },
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

// 示例4: 条件控制热键生效
const conditionalKeyBindings: Partial<KeyBindingConfig> = {
  // 只有在画布有选中元素时才允许删除
  condition: (editor: SWEditor) => {
    return editor.hasSelection?.() // 假设有选中状态检查方法
  },
  bindings: {
    delete: {
      id: 'delete',
      keys: {
        common: {
          key: {
            keyCode: 'Delete',
          },
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
  keyBindingConfig: conditionalKeyBindings,
})

// 示例5: 获取和管理按键绑定
const keyBindingManager = editor1.getKeyBindingManager()

// 获取所有绑定
const allBindings = keyBindingManager.getBindings()
console.log('所有按键绑定:', allBindings)

// 获取特定绑定
const saveBinding = keyBindingManager.getBinding('save')
console.log('保存绑定:', saveBinding)

// 启用/禁用按键绑定
keyBindingManager.disable() // 禁用所有热键
keyBindingManager.enable() // 重新启用

// 更新配置
keyBindingManager.updateConfig({
  enabled: false, // 禁用所有热键
})
