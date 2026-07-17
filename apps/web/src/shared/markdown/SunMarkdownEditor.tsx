import { lazy, Suspense } from 'react'
import type { MDEditorProps } from '@uiw/react-md-editor'

const MarkdownEditor = lazy(() =>
  import('@uiw/react-md-editor').then((module) => ({ default: module.default }))
)

export function SunMarkdownEditor(
  props: Pick<MDEditorProps, 'value' | 'onChange'>
) {
  return (
    <div className="sun-markdown-editor" data-color-mode="light">
      <Suspense fallback={<p>编辑器加载中…</p>}>
        <MarkdownEditor {...props} height="100%" preview="edit" />
      </Suspense>
    </div>
  )
}

export default SunMarkdownEditor
