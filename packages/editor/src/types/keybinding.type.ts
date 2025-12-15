/**
 * 按键绑定配置类型定义
 */

/**
 * 修饰键枚举
 */
export enum ModifierKey {
  CTRL = 'ctrl',
  ALT = 'alt',
  SHIFT = 'shift',
  META = 'meta',
}

/**
 * 修饰键常量，方便使用
 */
export const MODIFIERS = {
  CTRL: ModifierKey.CTRL,
  ALT: ModifierKey.ALT,
  SHIFT: ModifierKey.SHIFT,
  META: ModifierKey.META,
} as const

/**
 * 鼠标按键枚举
 */
export enum MouseButton {
  LEFT = 0,
  MIDDLE = 1,
  RIGHT = 2,
}

/**
 * 输入条件接口（键盘+鼠标统一）
 */
export interface IInput {
  // 键盘修饰键
  ctrlKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
  metaKey?: boolean

  // 鼠标按键
  leftMouse?: boolean
  rightMouse?: boolean
  middleMouse?: boolean

  // 按键代码（键盘）或鼠标按钮
  keyCode?: string // KeyboardEvent['code'] or '*'(match any key)
  mouseButton?: MouseButton
}

/**
 * 输入条件组合（键盘+鼠标）
 */
export interface InputCondition {
  /** 输入条件 */
  input: IInput
  /** 事件类型：'keydown' | 'keyup' | 'mousedown' | 'mouseup' | 'wheel' */
  eventType: 'keydown' | 'keyup' | 'mousedown' | 'mouseup' | 'wheel'
}

/**
 * 平台特定的输入绑定
 */
export interface PlatformInputBindings {
  /** macOS平台输入条件 */
  mac?: InputCondition
  /** Windows/Linux平台输入条件 */
  win?: InputCondition
  /** 通用输入条件（所有平台） */
  common?: InputCondition
}

/**
 * 输入绑定配置项（键盘+鼠标统一）
 */
export interface InputBinding {
  /** 绑定ID，用于标识唯一的输入绑定 */
  id: string
  /** 平台特定的输入条件 */
  inputs: PlatformInputBindings
  /** 是否阻止默认行为 */
  preventDefault?: boolean
  /** 是否阻止事件冒泡 */
  stopPropagation?: boolean
  /** 描述信息 */
  description?: string
  /** 执行回调函数 */
  action?: (event: Event, binding: InputBinding) => void
}

/**
 * 输入绑定配置（键盘+鼠标统一）
 */
export interface InputBindingConfig {
  /** 绑定对象 */
  bindings: Record<string, InputBinding>
  /** 是否启用输入绑定功能 */
  enabled?: boolean
  /** 条件检查函数，返回true表示允许执行绑定 */
  condition?: (editor: any) => boolean
}

/**
 * 输入绑定事件处理器
 */
export interface InputBindingHandler {
  (binding: InputBinding, event: Event): void | boolean
}

/**
 * 默认的输入绑定配置
 */
export const DEFAULT_INPUT_BINDINGS: InputBindingConfig = {
  enabled: true,
  bindings: {
    // 键盘绑定
    // 复制
    copy: {
      id: 'copy',
      inputs: {
        common: {
          input: {
            ctrlKey: true,
            keyCode: 'c',
          },
          eventType: 'keydown',
        },
      },
      preventDefault: true,
      description: '复制',
    },
    // 粘贴
    paste: {
      id: 'paste',
      inputs: {
        common: {
          input: {
            ctrlKey: true,
            keyCode: 'v',
          },
          eventType: 'keydown',
        },
      },
      preventDefault: true,
      description: '粘贴',
    },
    // 剪切
    cut: {
      id: 'cut',
      inputs: {
        common: {
          input: {
            ctrlKey: true,
            keyCode: 'x',
          },
          eventType: 'keydown',
        },
      },
      preventDefault: true,
      description: '剪切',
    },
    // 撤销
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
      description: '撤销',
    },
    // 重做
    redo: {
      id: 'redo',
      inputs: {
        mac: {
          input: {
            shiftKey: true,
            metaKey: true,
            keyCode: 'z',
          },
          eventType: 'keydown',
        },
        win: {
          input: {
            ctrlKey: true,
            keyCode: 'y',
          },
          eventType: 'keydown',
        },
      },
      preventDefault: true,
      description: '重做',
    },
    // 保存
    save: {
      id: 'save',
      inputs: {
        mac: {
          input: {
            metaKey: true,
            keyCode: 's',
          },
          eventType: 'keydown',
        },
        win: {
          input: {
            ctrlKey: true,
            keyCode: 's',
          },
          eventType: 'keydown',
        },
      },
      preventDefault: true,
      description: '保存',
    },
    // 全选
    'select-all': {
      id: 'select-all',
      inputs: {
        common: {
          input: {
            ctrlKey: true,
            keyCode: 'a',
          },
          eventType: 'keydown',
        },
      },
      preventDefault: true,
      description: '全选',
    },
    // 删除
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
      preventDefault: false,
      description: '删除',
    },
    // 退格删除
    backspace: {
      id: 'backspace',
      inputs: {
        common: {
          input: {
            keyCode: 'Backspace',
          },
          eventType: 'keydown',
        },
      },
      preventDefault: false,
      description: '删除',
    },

    // 鼠标绑定
    // 右键菜单
    'context-menu': {
      id: 'context-menu',
      inputs: {
        common: {
          input: {
            rightMouse: true,
          },
          eventType: 'mousedown',
        },
      },
      preventDefault: true,
      description: '右键菜单',
    },

    // Ctrl+鼠标左键拖拽
    'ctrl-drag': {
      id: 'ctrl-drag',
      inputs: {
        common: {
          input: {
            ctrlKey: true,
            leftMouse: true,
          },
          eventType: 'mousedown',
        },
      },
      preventDefault: false,
      description: 'Ctrl+拖拽',
    },

    // 鼠标滚轮缩放
    'wheel-zoom': {
      id: 'wheel-zoom',
      inputs: {
        common: {
          input: {},
          eventType: 'wheel',
        },
      },
      preventDefault: true,
      description: '滚轮缩放',
    },
  },
}
