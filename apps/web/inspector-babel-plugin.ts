import { InspectorBabelPlugin as inspectorBabelPlugin } from '@react-dev-inspector/babel-plugin'

type BabelPlugin = ReturnType<typeof inspectorBabelPlugin>
type OpeningElementVisitor = NonNullable<
  BabelPlugin['visitor']['JSXOpeningElement']
>

/**
 * react-dev-inspector's injector adds duplicate attributes when a JSX module is
 * transformed more than once. Vite can do that for source-aliased workspace
 * packages, so guard the upstream visitor to keep the transform idempotent.
 */
export default function idempotentInspectorBabelPlugin(
  ...args: Parameters<typeof inspectorBabelPlugin>
): BabelPlugin {
  const plugin = inspectorBabelPlugin(...args)
  const openingElementVisitor = plugin.visitor
    .JSXOpeningElement as OpeningElementVisitor

  if (typeof openingElementVisitor !== 'object') return plugin

  const upstreamEnter = openingElementVisitor.enter

  return {
    ...plugin,
    name: 'sun-world-react-source-inspector',
    visitor: {
      ...plugin.visitor,
      JSXOpeningElement: {
        ...openingElementVisitor,
        enter(path, state) {
          const alreadyInjected = path.node.attributes.some(
            (attribute) =>
              attribute.type === 'JSXAttribute' &&
              attribute.name.type === 'JSXIdentifier' &&
              attribute.name.name === 'data-inspector-line'
          )

          if (!alreadyInjected && typeof upstreamEnter === 'function') {
            upstreamEnter.call(this, path, state)
          }
        },
      },
    },
  }
}
