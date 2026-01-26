import { normalizeDegree } from '../utils/geo';
import './cursor.css'
import { getIconSvgDataUrl } from './dynamicCursor'
// 1. 定义原生光标枚举
export enum SystemCursor {
  Default = 'default',
  Move = 'move',
  Grab = 'grab',
  Pointer = 'pointer'
}

// 2. 定义动态光标的参数接口
export interface DynamicCursor {
  type: 'resize' | 'rotation';
  degree: number; // 动态传入角度
}
export type ICursor = SystemCursor | DynamicCursor
const AllCursor = [...Object.values(SystemCursor)]
export class CursorManager {
  private _cursor: ICursor = SystemCursor.Default
  private cursorChangeListeners: Set<(cursor: ICursor) => void> = new Set()
  private _canvas: HTMLCanvasElement
  constructor(canvas: HTMLCanvasElement) {
    this._canvas = canvas
    this._cursor = SystemCursor.Default
  }
  private normalizeCursor(cursor: ICursor): ICursor {
    if (typeof cursor === 'string') {
      return cursor;
    }

    if (cursor.type === 'resize') {
      return {
        type: cursor.type,
        // degree: 0 ~ 179. e.g 0 is from top to bottom , 90 is from left to right
        degree: normalizeDegree(cursor.degree) % 180,
      };
    }

    if (cursor.type === 'rotation') {
      return {
        type: cursor.type,
        degree: normalizeDegree(Math.round(cursor.degree)),
      };
    }

    return cursor;
  }
  setCursor(nc: ICursor) {
    nc = this.normalizeCursor(nc);
    if (isEqual(nc, this._cursor)) {
      return;
    }

    this._cursor = nc;

    // custom class cursor
    const clsPrefix = 'sw-cursor-';


    this._canvas.classList.forEach((className) => {
      if (className.startsWith(clsPrefix)) {
        this._canvas.classList.remove(className);
      }
    });
    this._canvas.style.cursor = '';

    if (AllCursor.includes(nc as SystemCursor)) {
      const className = `${clsPrefix}${nc}`;
      this._canvas.classList.add(className);
    } else if (typeof nc == 'string') {
      this._canvas.style.cursor = nc;
    } else if (IsDynamicCursor(nc)) {
      this._canvas.style.cursor = getIconSvgDataUrl(
        nc.type,
        nc.degree,
      );
    }
  }

  get cursor(): ICursor {
    return this._cursor
  }
}
const IsDynamicCursor = (cursor: ICursor): cursor is DynamicCursor => {
  if (typeof cursor === 'object' && ('type' in cursor) && (cursor.type === 'resize' || cursor.type === 'rotation')) {
    return true
  }
  return false
}
/**
 * 判断两个光标状态是否相等
 */
export function isEqual(a: ICursor, b: ICursor): boolean {
  // 1. 如果引用相同，或者是相同的字符串，直接返回 true
  if (a === b) return true;

  // 2. 如果其中一个是字符串，另一个是对象，或者类型不一致，直接返回 false
  if (typeof a !== typeof b || typeof a === 'string' || typeof b === 'string') {
    return false;
  }

  // 3. 此时 a, b 肯定都是对象，比较其内部属性
  // 注意：这里需要类型断言或确保类型安全
  const objA = a as DynamicCursor;
  const objB = b as DynamicCursor;

  return objA.type === objB.type && objA.degree === objB.degree;
}