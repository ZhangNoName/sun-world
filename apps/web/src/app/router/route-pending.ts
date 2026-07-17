import { createElement } from 'react'

export function createPendingRouteComponent(label: string) {
  return function PendingRoute() {
    return createElement(
      'main',
      { className: 'route-pending', 'aria-label': label },
      createElement('h1', null, label)
    )
  }
}
