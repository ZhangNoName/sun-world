import EventEmitter from '@/util/event_emitter'

interface Events {
  update(attrs: BlogConfigType): void
}

export class BlogConfig {
  private eventEmitter = new EventEmitter<Events>()
  private value = {}

  set<K extends keyof BlogConfig['value']>(
    key: K,
    value: BlogConfig['value'][K]
  ) {
    this.value[key] = value
    this.eventEmitter.emit('update', this.getAttrs())
  }
  get<K extends keyof BlogConfig['value']>(key: K) {
    return this.value[key]
  }
  getAttrs() {
    return { ...this.value }
  }

  on(eventName: 'update', handler: (value: BlogConfig['value']) => void) {
    this.eventEmitter.on(eventName, handler)
  }
  off(eventName: 'update', handler: (value: BlogConfig['value']) => void) {
    this.eventEmitter.off(eventName, handler)
  }
}

export type BlogConfigType = BlogConfig['value']
