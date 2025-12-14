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
 * 按键条件接口
 */
export interface IKey {
  ctrlKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
  metaKey?: boolean
  /**
   * KeyboardEvent['code'] or '*'(match any key)
   */
  keyCode: string
}

/**
 * 按键条件组合
 */
export interface KeyCondition {
  /** 按键条件 */
  key: IKey
  /** 是否在按键按下时触发（默认true），false表示按键释放时触发 */
  onKeyDown?: boolean
}

/**
 * 平台特定的按键绑定
 */
export interface PlatformKeyBindings {
  /** macOS平台按键条件 */
  mac?: KeyCondition
  /** Windows/Linux平台按键条件 */
  win?: KeyCondition
  /** 通用按键条件（所有平台） */
  common?: KeyCondition
}

/**
 * 按键绑定配置项
 */
export interface KeyBinding {
  /** 绑定ID，用于标识唯一的按键绑定 */
  id: string
  /** 平台特定的按键条件 */
  keys: PlatformKeyBindings
  /** 是否阻止默认行为 */
  preventDefault?: boolean
  /** 是否阻止事件冒泡 */
  stopPropagation?: boolean
  /** 描述信息 */
  description?: string
  /** 执行回调函数 */
  action?: (event: KeyboardEvent, binding: KeyBinding) => void
}

/**
 * 按键绑定配置
 */
export interface KeyBindingConfig {
  /** 绑定对象 */
  bindings: Record<string, KeyBinding>
  /** 是否启用按键绑定功能 */
  enabled?: boolean
  /** 条件检查函数，返回true表示允许执行热键 */
  condition?: (editor: any) => boolean
}

/**
 * 按键绑定事件处理器
 */
export interface KeyBindingHandler {
  (binding: KeyBinding, event: KeyboardEvent): void | boolean
}

/**
 * 默认的按键绑定配置
 */
export const DEFAULT_KEY_BINDINGS: KeyBindingConfig = {
  enabled: true,
  bindings: {
    // 复制
    copy: {
      id: 'copy',
      keys: {
        common: {
          key: {
            ctrlKey: true,
            keyCode: 'c',
          },
        },
      },
      preventDefault: true,
      description: '复制',
    },
    // 粘贴
    paste: {
      id: 'paste',
      keys: {
        common: {
          key: {
            ctrlKey: true,
            keyCode: 'v',
          },
        },
      },
      preventDefault: true,
      description: '粘贴',
    },
    // 剪切
    cut: {
      id: 'cut',
      keys: {
        common: {
          key: {
            ctrlKey: true,
            keyCode: 'x',
          },
        },
      },
      preventDefault: true,
      description: '剪切',
    },
    // 撤销
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
      description: '撤销',
    },
    // 重做
    redo: {
      id: 'redo',
      keys: {
        mac: {
          key: {
            shiftKey: true,
            metaKey: true,
            keyCode: 'z',
          },
        },
        win: {
          key: {
            ctrlKey: true,
            keyCode: 'y',
          },
        },
      },
      preventDefault: true,
      description: '重做',
    },
    // 保存
    save: {
      id: 'save',
      keys: {
        mac: {
          key: {
            metaKey: true,
            keyCode: 's',
          },
        },
        win: {
          key: {
            ctrlKey: true,
            keyCode: 's',
          },
        },
      },
      preventDefault: true,
      description: '保存',
    },
    // 全选
    'select-all': {
      id: 'select-all',
      keys: {
        common: {
          key: {
            ctrlKey: true,
            keyCode: 'a',
          },
        },
      },
      preventDefault: true,
      description: '全选',
    },
    // 删除
    delete: {
      id: 'delete',
      keys: {
        common: {
          key: {
            keyCode: 'Delete',
          },
        },
      },
      preventDefault: false,
      description: '删除',
    },
    // 退格删除
    backspace: {
      id: 'backspace',
      keys: {
        common: {
          key: {
            keyCode: 'Backspace',
          },
        },
      },
      preventDefault: false,
      description: '删除',
    },
  },
}
