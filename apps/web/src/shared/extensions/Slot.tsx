import {
  Component,
  Suspense,
  useEffect,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react'
import type { ContributionRegistry } from './registry'
import type {
  CapabilityState,
  Contribution,
  ContributionProps,
  ContributionScope,
} from './types'

function Pending() {
  return <span role="status">正在加载功能…</span>
}
function Failure({ retry }: { retry: () => void }) {
  return (
    <div role="alert">
      此功能暂时无法显示。
      <button type="button" onClick={retry}>
        重试
      </button>
    </div>
  )
}
class ContributionBoundary extends Component<
  { children: ReactNode; retry: () => void; abort: () => void },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch() {
    this.props.abort()
  }
  render() {
    return this.state.failed ? (
      <Failure retry={this.props.retry} />
    ) : (
      this.props.children
    )
  }
}
function Mount<Context>({
  contribution,
  context,
  scope,
  retry,
}: {
  contribution: Readonly<Contribution<Context>>
  context: Readonly<Context>
  scope: Readonly<ContributionScope>
  retry: () => void
}) {
  const [state, setState] = useState<
    | {
        component: ComponentType<ContributionProps<Context>>
        controller: AbortController
      }
    | 'error'
    | null
  >(null)
  useEffect(() => {
    const abort = new AbortController()
    let active = true
    void Promise.resolve()
      .then(() => {
        if (!active) return
        return contribution.load()
      })
      .then((module) => {
        if (!active) return
        const component: unknown = module?.default
        const exotic =
          component &&
          typeof component === 'object' &&
          '$$typeof' in component &&
          [
            Symbol.for('react.memo'),
            Symbol.for('react.forward_ref'),
            Symbol.for('react.lazy'),
          ].includes(component.$$typeof as symbol)
        if (!module || (typeof component !== 'function' && !exotic))
          throw new Error('invalid component')
        setState({ component: module.default, controller: abort })
      })
      .catch(() => {
        if (active) {
          abort.abort()
          setState('error')
        }
      })
    return () => {
      active = false
      abort.abort()
    }
  }, [contribution])
  if (state === 'error') return <Failure retry={retry} />
  if (!state) return <Pending />
  const Loaded = state.component
  return (
    <ContributionBoundary retry={retry} abort={() => state.controller.abort()}>
      <Suspense fallback={<Pending />}>
        <Loaded
          context={context}
          scope={scope}
          signal={state.controller.signal}
        />
      </Suspense>
    </ContributionBoundary>
  )
}
function ContributionMount<Context>(
  props: Omit<Parameters<typeof Mount<Context>>[0], 'retry'>
) {
  const [attempt, setAttempt] = useState(0)
  return (
    <Mount
      key={attempt}
      {...props}
      retry={() => setAttempt((value) => value + 1)}
    />
  )
}
export function Slot<Context>({
  registry,
  slotId,
  context,
  scope,
  enabledModuleIds,
  capabilities,
}: {
  registry: ContributionRegistry<Context>
  slotId: string
  context: Context
  scope: ContributionScope
  enabledModuleIds: readonly string[]
  capabilities: CapabilityState
}) {
  const selected = registry.select({
    slotId,
    context,
    scope,
    enabledModuleIds,
    capabilities,
  })
  if (!selected) return null
  return (
    <>
      {selected.contributions.map((contribution) => (
        <ContributionMount
          key={JSON.stringify([slotId, contribution.id, selected.key])}
          contribution={contribution}
          context={selected.context}
          scope={selected.scope}
        />
      ))}
    </>
  )
}
