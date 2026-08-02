import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@sun-world/base-ui/button'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[app] uncaught render error', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <main role="alert" className="app-error-boundary">
          <h1>页面暂时无法显示</h1>
          <p>请刷新页面后重试。</p>
          <Button type="button" onClick={() => window.location.reload()}>
            刷新页面
          </Button>
        </main>
      )
    }
    return this.props.children
  }
}
