/**
 * EventEmitter
 *
 * 订阅者-发布者模式
 */

class EventEmitter<T extends Record<string | symbol, any>> {
  private eventMap: Record<keyof T, Array<(...args: any[]) => void>> = {} as any

  on<K extends keyof T>(eventName: K, listener: T[K]) {
    if (!this.eventMap[eventName]) {
      this.eventMap[eventName] = []
    }
    this.eventMap[eventName].push(listener)
    return this
  }

  emit<K extends keyof T>(eventName: K, ...args: Parameters<T[K]>) {
    const listeners = this.eventMap[eventName]

    if (!listeners || listeners.length === 0) return false
    // console.log('emit', eventName, listeners.length);
    listeners.forEach((listener) => {
      listener(...args)
    })
    return true
  }

  off<K extends keyof T>(eventName: K, listener: T[K]) {
    if (this.eventMap[eventName]) {
      this.eventMap[eventName] = this.eventMap[eventName].filter(
        (item) => item !== listener
      )
    }
    return this
  }
  clear<K extends keyof T>(eventName: K) {
    if (this.eventMap[eventName]) {
      this.eventMap[eventName] = []
    }
    return this
  }
}

export default EventEmitter
