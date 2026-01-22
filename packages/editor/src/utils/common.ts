import { IBox, IPoint } from '@/types/common.type'
import { v4 as uuidv4 } from 'uuid'

/**
 * 获取 uuid
 * @returns {string} uuid
 */
export const getUUID = () => {
  return uuidv4()
}
/**
 * 节流函数，限制函数执行的频率
 * @param fn 需要节流的函数
 * @param wait 节流等待时间，单位毫秒，默认100ms
 * @returns 返回节流后的函数
 */
export function throttle(fn: Function, wait = 100) {
  let lastTime = 0

  // 返回包装后的函数，控制原函数的执行频率
  return function (...args: any[]) {
    const now = Date.now()

    // 判断距离上次执行时间是否超过等待时间，如果超过则执行函数
    if (now - lastTime >= wait) {
      lastTime = now
      fn(...args)
    }
  }
}

/**
 * 防抖函数，用于限制函数的执行频率
 * @param fn 需要进行防抖处理的函数
 * @param wait 延迟执行的毫秒数，默认为200ms
 * @returns 返回一个经过防抖处理的函数
 */
export function debounce(fn: Function, wait = 200) {
  let timer: number | null = null

  // 返回包装后的函数，确保在指定时间内只执行最后一次调用
  return function (...args: any[]) {
    // 如果已有定时器，则清除之前的定时器
    if (timer) clearTimeout(timer)

    // 设置新的定时器，在指定延迟后执行原函数
    timer = window.setTimeout(() => {
      fn(...args)
    }, wait)
  }
}

export function intersectBox(a: IBox, b: IBox): boolean {
  const startX = Math.max(a.minX, b.minX)
  const startY = Math.max(a.minY, b.minY)
  const endX = Math.min(a.maxX, b.maxX)
  const endY = Math.min(a.maxY, b.maxY)
  return startX <= endX && startY <= endY
}
export function isPointInBox(box: IBox, point: IPoint): boolean {
  return point.x >= box.minX && point.x <= box.maxX && point.y >= box.minY && point.y <= box.maxY
}